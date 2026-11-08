const { smsg } = require("../myfunc");
const QuickLRU = require("quick-lru").default;
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");

const handledMessages = new QuickLRU({ maxSize: 1000 });

// ✅ FIX: track message IDs the bot itself sends, so we can reliably
// detect "this fromMe message is the bot's own auto-reply looping back"
// vs "this fromMe message is the owner typing in their own DM with the bot".
// JID-based detection can't tell these apart in a private chat since the
// sender JID is identical in both cases.
const botSentIds = new QuickLRU({ maxSize: 1000 });
// Exposed globally so handler.js's AFK system (and anything else outside
// this module) can also tell "this fromMe message is the bot's own echo"
// apart from "this fromMe message is the owner genuinely typing from the
// bot's own linked number" — same distinction this file already needed
// for the chatbot loop-prevention below.
global._botSentIds = botSentIds;

// ✅ RESTART-REPLAY FIX: the moment this module loads (i.e. right when the
// bot connects/reconnects), record "now" as the startup boundary. Below,
// any message older than this — or any event Baileys tags as history
// sync rather than a live delivery — gets dropped before it reaches any
// command logic. Without this, a WhatsApp history-sync backlog delivered
// right after (re)connecting was being treated identically to brand-new
// live messages, so an old ".afk" command sent before a restart would get
// silently replayed and re-trigger AFK the moment the panel came back up.
// `handledMessages` alone doesn't protect against this because it's an
// in-memory cache that's empty again after every restart — the "old"
// message looks brand new to it.
const startupTimestampSec = Math.floor(Date.now() / 1000) - 3; // 3s grace for clock skew

// Load chatbot handler once at module level
const { handleChatbot, isChatbotEnabled } = require("../../plugins/EmmyFrosh/chatbot");

// ==========================================
// GROQ WHISPER TRANSCRIPTION (for VN -> text)
// Reuses the same GROQ_API_KEY your chatbot already uses —
// no separate OpenAI key needed.
// ==========================================
async function transcribeAudio(buffer) {
  if (!process.env.GROQ_API_KEY) {
    console.log("TRANSCRIBE ERROR: GROQ_API_KEY not set in env");
    return { text: null, error: "GROQ_API_KEY is not set in your .env file" };
  }
  try {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: "audio/ogg" }), "audio.ogg");
    form.append("model", "whisper-large-v3");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: form
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.log("TRANSCRIBE ERROR:", res.status, errText);
      return { text: null, error: `Groq transcription failed (status ${res.status})` };
    }

    const data = await res.json();
    const text = data.text?.trim() || null;
    return { text, error: text ? null : "Groq returned an empty transcript" };
  } catch (e) {
    console.log("TRANSCRIBE ERROR:", e.message);
    return { text: null, error: e.message };
  }
}

// ==========================================
// STICKER MAKER
// ==========================================
async function makeSticker(ednut, jid, mek, imgMsgNode, isPremium) {
  try {
    const buffer = await downloadMediaMessage(
      { message: { imageMessage: imgMsgNode } },
      "buffer",
      {},
      { logger: console, reuploadRequest: ednut.updateMediaMessage }
    );

    const sticker = new Sticker(buffer, {
      pack: isPremium ? "Premium Pack" : "Sticker",
      author: isPremium ? "Premium Bot" : "Bot",
      type: StickerTypes.FULL,
      quality: isPremium ? 100 : 70
    });

    const stickerBuffer = await sticker.toBuffer();
    await ednut.sendMessage(jid, { sticker: stickerBuffer }, { quoted: mek });
  } catch (e) {
    console.log("STICKER ERROR:", e.message);
    await ednut.sendMessage(
      jid,
      { text: "❌ Couldn't make that sticker. Try replying directly to an image with 'sticker'." },
      { quoted: mek }
    );
  }
}

module.exports = function handleMessages(ednut, store) {
  ednut.ev.removeAllListeners("messages.upsert");

  // .quoted recorder: saves the copy inside EVERY reply the bot receives
  // (including old / offline ones the main handler skips below)
  try { require("../../plugins/EmmyFrosh/quoted").attach(ednut); } catch (e) { console.log("[QUOTED ATTACH]", e.message); }

  // ✅ FIX: monkey-patch sendMessage ONCE per ednut instance so every
  // message ID the bot sends gets recorded in botSentIds. This lets us
  // distinguish "bot's own auto-reply looping back" from "owner typing".
  if (!ednut.__sendMessagePatchedForOwnerFix) {
    const _origSendMessage = ednut.sendMessage.bind(ednut);
    ednut.sendMessage = async (...args) => {
      const result = await _origSendMessage(...args);
      if (result?.key?.id) botSentIds.set(result.key.id, true);
      return result;
    };
    ednut.__sendMessagePatchedForOwnerFix = true;
  }

  ednut.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      // ✅ RESTART-REPLAY FIX: only checking the message's own timestamp
      // against when this process started — NOT chatUpdate.type. An
      // earlier version also rejected anything not tagged "notify", but
      // for a self-bot setup (chatting from the bot's own linked number)
      // your own genuinely-new messages after a reconnect are often
      // tagged "append" by Baileys, not "notify" — that filter was
      // silently dropping your real messages too, not just backlog.
      // Timestamp alone still correctly blocks true history-sync replay
      // (e.g. an old ".afk" from before a restart) without that
      // collateral damage.
      const mek = chatUpdate.messages?.[0];
      if (!mek?.message) return;

      const msgTimestampSec = Number(mek.messageTimestamp) || 0;
      if (msgTimestampSec && msgTimestampSec < startupTimestampSec) {
        // sent while the bot was off: not processed, but if it came from someone who is AFK
        // it proves they came back, so end their AFK quietly
        try { require("../../plugins/EmmyFrosh/afk").silentBack?.(mek); } catch {}
        return;
      }

      const jid = mek.key.remoteJid;
      if (!jid) return;

      const msgId = mek.key.id;
      if (!msgId || handledMessages.has(msgId)) return;
      handledMessages.set(msgId, true);

      // ==========================================
      // 1. UNWRAP EPHEMERAL & MEDIA MESSAGES
      // ==========================================
      const msg = mek.message?.ephemeralMessage?.message || mek.message;
      mek.message = msg;

      const sender =
        mek.key.participant ||
        mek.participant ||
        mek.sender ||
        jid;

      const fromBot = mek.key.fromMe;
      const isGroup = jid.endsWith("@g.us");

      // ==========================================
      // 2. DATABASE INITIALIZATION
      // ==========================================
      if (!global.db.groups) global.db.groups = {};
      if (!global.db.groups[jid]) global.db.groups[jid] = {};
      if (!global.db.groups[jid].mutedUsers)    global.db.groups[jid].mutedUsers    = {};
      if (!global.db.groups[jid].mutedStickers) global.db.groups[jid].mutedStickers = {};
      if (!global.db.groups[jid].mutedEmojis)   global.db.groups[jid].mutedEmojis   = {};

      const mutedUsers = global.db.groups[jid].mutedUsers;

      // ==========================================
      // 3. VIEW ONCE DETECTION
      // ==========================================
      const isViewOnce =
        msg?.imageMessage?.viewOnce === true ||
        msg?.videoMessage?.viewOnce === true ||
        msg?.viewOnceMessage ||
        msg?.viewOnceMessageV2 ||
        msg?.viewOnceMessageV2Extension;

      const deleteMsg = async () => {
        try {
          await ednut.sendMessage(jid, {
            delete: {
              remoteJid:   jid,
              fromMe:      false,
              id:          mek.key.id,
              participant: mek.key.participant || sender
            }
          });
        } catch (e) { console.log("DELETE ERROR:", e); }
      };

      if (isViewOnce) {
        await deleteMsg();
        setTimeout(deleteMsg, 800);
        return;
      }

      if (mutedUsers[sender] && !fromBot) {
        await deleteMsg();
        setTimeout(deleteMsg, 500);
        return;
      }

      // ==========================================
      // 🚀 SETCMD INTERCEPTOR
      // ==========================================
      const isStickerMsg = msg?.stickerMessage || mek.message?.stickerMessage;

      if (isStickerMsg) {
        const stickerNode = msg?.stickerMessage || mek.message?.stickerMessage;
        const rawHash = stickerNode?.fileSha256;
        if (rawHash) {
          const hash = Buffer.isBuffer(rawHash)
            ? rawHash.toString("hex")
            : Buffer.from(rawHash, "base64").toString("hex");

          const cmdData = global.db?.sticker?.[hash];

          if (cmdData && cmdData.text) {
            console.log(`🎯 [SETCMD MATCHED]: "${cmdData.text}"`);

            // ✅ FIX: the sticker's own contextInfo — which is where "this
            // sticker was sent as a REPLY to some other message" lives —
            // was being thrown away along with stickerMessage below. That
            // meant a sticker mapped to e.g. ".vv" and sent as a reply to
            // a view-once message lost all record of that reply: the
            // triggered command saw a bare text message with nothing
            // quoted, so .vv (which checks
            // msg.extendedTextMessage.contextInfo.quotedMessage) reported
            // "reply to an image/video/audio" even though you DID reply
            // to one — via the sticker. Grab it before deleting the
            // sticker node so it survives the swap.
            const originalContextInfo = stickerNode?.contextInfo
              ? { ...stickerNode.contextInfo }
              : {};

            delete msg.stickerMessage;
            if (mek.message?.stickerMessage) delete mek.message.stickerMessage;
            delete msg.conversation;

            // Rebuild as an extendedTextMessage (not a bare conversation)
            // so the preserved contextInfo — and therefore any quoted
            // message the sticker was replying to — is exactly where
            // every command in this bot expects to find it.
            msg.extendedTextMessage = {
              text: cmdData.text,
              contextInfo: originalContextInfo
            };

            if (Array.isArray(cmdData.mentionedJid) && cmdData.mentionedJid.length) {
              msg.extendedTextMessage.contextInfo.mentionedJid = cmdData.mentionedJid;
            }
          }
        }
      }

      // ==========================================
      // 4. MESSAGE TYPE DETECTION
      // ==========================================
      let text =
        msg?.conversation ||
        msg?.extendedTextMessage?.text ||
        msg?.imageMessage?.caption ||
        msg?.videoMessage?.caption ||
        "";

      const isReply = !!(
        msg?.extendedTextMessage?.contextInfo?.quotedMessage ||
        msg?.extendedTextMessage?.contextInfo?.participant
      );

      const hasMention = !!(
        msg?.extendedTextMessage?.contextInfo?.mentionedJid?.length
      );

      const isAudioMsg = !!(msg?.audioMessage);

      const hasMedia = !!(
        msg?.imageMessage  ||
        msg?.videoMessage  ||
        msg?.audioMessage  ||
        msg?.documentMessage ||
        msg?.stickerMessage
      );

      // ==========================================
      // ✅ WCG BYPASS
      // ==========================================
      const isWcgActive = !!(global.wcgGames && global.wcgGames[jid]);

      // ==========================================
      // ✅ AFK REACTION BYPASS
      // An emoji reaction has no text / reply / mention / media, so the filter
      // below used to throw it away in groups and the AFK system never saw it.
      // While anybody is AFK, let (non-removed) reactions through so the AFK
      // person reacting to a message counts as "I'm back".
      // ==========================================
      const isAfkReaction = !!(
        msg?.reactionMessage?.text &&
        global.db?.afk &&
        Object.keys(global.db.afk).length > 0
      );

      if (
        !text       &&
        !isStickerMsg &&
        !isReply    &&
        !hasMention &&
        !hasMedia   &&
        !msg?.extendedTextMessage &&
        isGroup     &&
        !isWcgActive &&
        !isAfkReaction
      ) return;

      // ==========================================
      // 5. SERIALIZE MESSAGE OBJECT
      // ==========================================
      const m = smsg(ednut, mek, store);
      m.text = text || m.text || "";
      m.body = text || m.body || "";

      // ✅ FIX: smsg() wasn't carrying this through, so m.senderAlt always
      //    came back undefined for LID senders. Since Baileys 6.8.0, the raw
      //    message key exposes an "Alt" JID — key.participantAlt for groups,
      //    key.remoteJidAlt for DMs — which holds the real phone-number JID
      //    whenever the participant is reported as a LID. Pulling it in here
      //    is what lets chatbot.js's getSenderCandidates() actually resolve
      //    a LID sender back to their real number (e.g. the master number
      //    check for +2349160224621).
      m.senderAlt = mek.key?.participantAlt || mek.key?.remoteJidAlt || m.senderAlt || null;

      // ==========================================
      // 6. AUTO READ & STATUS SYSTEM
      // ==========================================
      if (jid === "status@broadcast") {
        if (
          process.env.STATUS === "true" ||
          global.db.settings?.readsw === true
        ) {
          await ednut.readMessages([mek.key]).catch(() => {});
        }
        return;
      }

      if (
        process.env.READ === "true" ||
        global.db.settings?.autoread === true
      ) {
        ednut.readMessages([mek.key]).catch(() => {});
      }

      // ==========================================
      // 7. CHAT PRESENCE UPDATES
      // ==========================================
      if (!fromBot && global.db.settings?.autotyping) {
        ednut.sendPresenceUpdate("composing", jid).catch(() => {});
      }
      if (!fromBot && global.db.settings?.autorecording) {
        ednut.sendPresenceUpdate("recording", jid).catch(() => {});
      }
      if (!fromBot) {
        const online =
          process.env.ONLINE === "true" ||
          global.db.settings?.available === true;
        ednut.sendPresenceUpdate(
          online ? "available" : "unavailable",
          jid
        ).catch(() => {});
      }

      // ==========================================
      // 🖼️ STICKER COMMAND ("sticker" / "premium sticker")
      // Works either replying to an image, or sending an
      // image with "sticker" / "premium sticker" as the caption.
      // ==========================================
      const trigger = text.trim().toLowerCase();
      if (!fromBot && (trigger === "sticker" || trigger === "premium sticker")) {
        const isPremium = trigger === "premium sticker";
        const quoted = msg?.extendedTextMessage?.contextInfo?.quotedMessage;
        const targetImg = msg?.imageMessage || quoted?.imageMessage;

        if (targetImg) {
          await makeSticker(ednut, jid, mek, targetImg, isPremium);
        } else {
          await ednut.sendMessage(
            jid,
            { text: "📸 Send an image with the caption 'sticker' (or 'premium sticker'), or reply to one with that text." },
            { quoted: mek }
          );
        }
        return; // don't fall through to chatbot/handler for this one
      }

      // ==========================================
      // 8. CHATBOT
      // ✅ FIX: previously used JID-number matching to guess whether a
      //    fromMe message was the bot looping back on itself. That's
      //    unreliable in private chats — the owner's own DM to the bot
      //    also has fromMe=true and the same sender JID as the bot's
      //    replies, so it was wrongly blocked as if it were a loop.
      //
      //    Now we instead track the exact message IDs the bot sends
      //    (via the sendMessage patch above) and only treat a fromMe
      //    message as "the bot's own reply" if its ID is one we sent.
      //    Anything else fromMe (e.g. the owner typing) passes through.
      //
      // ✅ VN FIX: voice notes have no caption, so `text` used to be empty
      //    and handleChatbot was never called. We now transcribe the audio
      //    with Whisper first and treat the transcript as the message text,
      //    so voice-note questions reach the chatbot exactly like typed ones.
      //
      // ✅ CHATBOT-OFF FIX: previously VN transcription ran regardless of
      //    whether chatbot was on for this chat, so a dropped VN in an
      //    "off" chat would still try to transcribe and — if GROQ_API_KEY
      //    was missing — blast a debug error into the chat. Transcription
      //    (and any related error message) now only runs when chatbot is
      //    actually enabled for this chat, via the same isChatbotEnabled()
      //    check handleChatbot() itself uses. If chatbot is off, a dropped
      //    VN is now silently ignored — no transcription attempt, no reply.
      // ==========================================
      const _isBotReply = fromBot && botSentIds.has(msgId);
      const _chatbotOn  = isChatbotEnabled(jid);

      if (!_isBotReply && !isWcgActive && _chatbotOn) {
        if (isAudioMsg && !text) {
          try {
            const audioBuffer = await downloadMediaMessage(
              mek,
              "buffer",
              {},
              { logger: console, reuploadRequest: ednut.updateMediaMessage }
            );
            const { text: transcript, error: transcribeErr } = await transcribeAudio(audioBuffer);
            if (transcript) {
              text = transcript;
              m.text = transcript;
              m.body = transcript;
              console.log(`🎙️ [VN TRANSCRIBED]: "${transcript}"`);
            } else if (transcribeErr) {
              // ✅ SILENT DROP: if GROQ_API_KEY just isn't configured, that's
              // a setup issue, not something users dropping VNs need to see —
              // log it to the console for you and drop the VN quietly instead
              // of spamming the chat with a debug message.
              if (transcribeErr === "GROQ_API_KEY is not set in your .env file") {
                console.log("VN TRANSCRIBE SKIPPED (silent): GROQ_API_KEY not set");
              } else {
                // TEMP DEBUG: show the real reason in chat so it's visible
                // without needing log/terminal access. Remove once confirmed working.
                await ednut.sendMessage(
                  jid,
                  { text: `⚠️ VN transcription error (debug): ${transcribeErr}` },
                  { quoted: mek }
                ).catch(() => {});
              }
            }
          } catch (e) {
            console.log("VN DOWNLOAD ERROR:", e.message);
            await ednut.sendMessage(
              jid,
              { text: `⚠️ VN download error (debug): ${e.message}` },
              { quoted: mek }
            ).catch(() => {});
          }
        }

        if (text) {
          handleChatbot(ednut, m).catch(e =>
            console.log("CHATBOT ERROR:", e.message)
          );
        }
      }

// ==========================================
      // 9. ROUTE TO MAIN COMMAND HANDLER (WITH LID & MODERATOR RESOLUTION)
      // ==========================================
      
      // Extract raw numeric phone digits from the incoming sender
      const rawSender = mek.key?.participant || mek.participant || mek.sender || jid;
      const cleanSenderNum = String(rawSender).replace(/[^0-9]/g, "");

      // Ensure global database and moderator array exist
      if (!global.db) global.db = {};
      if (!Array.isArray(global.db.setmod)) global.db.setmod = [];

      // Extract raw numeric phone digits for saved moderators
      const modNumbers = global.db.setmod.map(v => String(v).replace(/[^0-9]/g, "")).filter(Boolean);

      // Check if sender matches any saved moderator number
      m.isModerator = modNumbers.includes(cleanSenderNum);
      m.isHighStaff = m.isModerator || m.isOwner;

      // Pass control to main handler file
      require("../../handler")(ednut, m, chatUpdate, mek, store);

    } catch (err) {
      console.log("HANDLER ERROR:", err);
    }
  });
};
