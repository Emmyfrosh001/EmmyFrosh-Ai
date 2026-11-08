const { generateWAMessageFromContent } = require("@whiskeysockets/baileys");

// ==========================================
// .quoted — bring back a message even if the sender deleted it
//
// How it works
//   A sends a message, B replies to it. WhatsApp puts a COPY of A's message
//   inside B's reply. The bot keeps that copy (record() below, called by the
//   handler for every message). Later, even if A deletes the message, you
//   reply to B's message with  .quoted  and the bot sends A's message back
//   (just the message, without any heading).
//
// Notes
//   - The bot must have been in the chat (online) when B replied.
//   - Saved copies are kept for 2 days, then deleted (last 2000 replies).
//   - Text always comes back. Photos/videos/stickers come back if WhatsApp
//     still has the file; if not, the small preview picture is sent instead.
// ==========================================

const fs = require("fs");
const path = require("path");

const MAX_SAVED = 2000;
const KEEP_MS = 2 * 24 * 60 * 60 * 1000; // saved copies are deleted after 2 days
// kept on `global` so every copy of this file (the plugin loader, the
// handler, the recorder) shares ONE list even if the file gets re-loaded
const saved = (global.__quotedSaved = global.__quotedSaved || new Map()); // B's message id -> { quoted, author, stanzaId, ts }

// ---- keep the copies on disk, so a restart / redeploy does not wipe them ----
const CACHE_DIR = path.join(process.cwd(), "database");
const CACHE_FILE = path.join(CACHE_DIR, "quoted-cache.json");

// Buffers / Uint8Arrays (media keys, thumbnails) survive JSON this way
const replacer = (_k, v) => {
  if (v && v.type === "Buffer" && Array.isArray(v.data)) return { __b64: Buffer.from(v.data).toString("base64") };
  if (v instanceof Uint8Array) return { __b64: Buffer.from(v).toString("base64") };
  return v;
};
const reviver = (_k, v) => (v && typeof v === "object" && typeof v.__b64 === "string" ? Buffer.from(v.__b64, "base64") : v);
const serialize = (x) => JSON.stringify(x, replacer);
const revive = (str) => JSON.parse(str, reviver);

let dirty = false;
let saveTimer = null;
function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty) return;
    dirty = false;
    try {
      if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(CACHE_FILE, serialize([...saved.entries()]));
    } catch (_) {}
  }, 15000);
  if (saveTimer.unref) saveTimer.unref();
}

// delete every copy older than KEEP_MS (runs on start, and while recording)
let lastPurge = 0;
function purge(force = false) {
  const now = Date.now();
  if (!force && now - lastPurge < 10 * 60 * 1000) return; // at most every 10 min
  lastPurge = now;
  let removed = false;
  for (const [id, v] of saved) {
    if (!v?.ts || now - v.ts > KEEP_MS) { saved.delete(id); removed = true; }
  }
  if (removed) scheduleSave();
}

// load what was saved before the last restart
try {
  if (!global.__quotedLoaded && fs.existsSync(CACHE_FILE)) {
    for (const [k, v] of revive(fs.readFileSync(CACHE_FILE, "utf8"))) saved.set(k, v);
  }
} catch (_) {}
global.__quotedLoaded = true;
purge(true);
// also clean up on a timer, so old copies go even when the chat is quiet
if (!global.__quotedTimer) global.__quotedTimer = setInterval(() => purge(true), 30 * 60 * 1000).unref?.() || true;

// unwrap ephemeral / view-once wrappers and return the inner message content
function unwrap(message) {
  let msg = message;
  for (let i = 0; i < 4 && msg; i++) {
    const inner =
      msg.ephemeralMessage?.message ||
      msg.viewOnceMessage?.message ||
      msg.viewOnceMessageV2?.message ||
      msg.viewOnceMessageV2Extension?.message ||
      msg.documentWithCaptionMessage?.message ||
      msg.editedMessage?.message;
    if (!inner) break;
    msg = inner;
  }
  return msg || {};
}

// the contextInfo (it holds the quoted copy) of whatever type the message is
function getContextInfo(message) {
  const msg = unwrap(message);
  for (const type of Object.keys(msg)) {
    const ci = msg[type] && typeof msg[type] === "object" ? msg[type].contextInfo : null;
    if (ci) return ci;
  }
  return null;
}

// ---- remember the copy inside a reply ----
function record(m) {
  try {
    const id = m?.key?.id;
    const ci = getContextInfo(m?.message);
    if (!id || !ci || !ci.quotedMessage) return;
    purge();
    if (saved.has(id)) return;
    saved.set(id, {
      quoted: ci.quotedMessage,
      author: ci.participant || null,
      stanzaId: ci.stanzaId || null,
      chat: m.key.remoteJid || null,
      ts: Date.now(),
    });
    // CHAIN: C replied to B, and B's copy may itself still carry the message
    // B replied to (e.g. the photo). Walk down the chain and save every link,
    // so replying to B later can still bring the original back.
    let q = ci.quotedMessage;
    let qid = ci.stanzaId;
    for (let i = 0; i < 6 && q && qid; i++) {
      const inner = getContextInfo(q);
      if (!inner || !inner.quotedMessage) break;
      if (!saved.has(qid)) {
        saved.set(qid, {
          quoted: inner.quotedMessage,
          author: inner.participant || null,
          stanzaId: inner.stanzaId || null,
          chat: m.key.remoteJid || null,
          ts: Date.now(),
        });
      }
      q = inner.quotedMessage;
      qid = inner.stanzaId;
    }
    while (saved.size > MAX_SAVED) saved.delete(saved.keys().next().value); // forget the oldest
    scheduleSave();
  } catch (_) {}
}

// ---- listens to EVERY message the bot receives (new, offline, history) ----
// Unlike the main handler, this does not skip old messages or filtered
// groups, so replies that arrived while the bot was offline are saved too.
function attach(sock) {
  if (!sock?.ev) return;
  sock.ev.on("messages.upsert", ({ messages }) => {
    for (const msg of messages || []) record(msg);
  });
  if (!sock.__quotedHistory) {
    sock.__quotedHistory = true;
    sock.ev.on("messaging-history.set", ({ messages }) => {
      for (const msg of messages || []) record(msg);
    });
  }
}

// remove the reply info from the copy, so it is sent as a clean message
function clean(content) {
  const copy = revive(serialize(content));
  const msg = unwrap(copy);
  for (const type of Object.keys(msg)) {
    const ci = msg[type] && typeof msg[type] === "object" ? msg[type].contextInfo : null;
    if (ci) {
      delete ci.quotedMessage;
      delete ci.stanzaId;
      delete ci.participant;
      delete ci.remoteJid;
    }
  }
  return copy;
}

// look for a "quotedMessage" anywhere inside an object (B's message as
// WhatsApp handed it to us when you replied to it)
function deepFindQuoted(obj, depth = 0, skipFirst = false) {
  if (!obj || typeof obj !== "object" || depth > 8) return null;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (key === "quotedMessage" && val && typeof val === "object" && !skipFirst) {
      return { quoted: val, author: obj.participant || null, stanzaId: obj.stanzaId || null };
    }
    const hit = deepFindQuoted(val, depth + 1, false);
    if (hit) return hit;
  }
  return null;
}

// find A's message that is saved inside B's message
function findOriginal(m, store) {
  // id of B's message (the one you replied to with .quoted)
  const ctx = getContextInfo(m.message) || {};
  const bId = m.quoted?.id || m.quoted?.key?.id || ctx.stanzaId;

  // 1) copy saved when B replied (also survives restarts / offline time)
  if (bId && saved.has(bId)) {
    const hit = saved.get(bId);
    if (hit?.ts && Date.now() - hit.ts <= KEEP_MS) return hit;
    saved.delete(bId); // older than 2 days: gone
  }

  // 2) B's message as WhatsApp gave it to us inside YOUR reply — it can
  //    still carry the copy of A's message even if the bot never saw B reply
  const bContent = ctx.quotedMessage || m.quoted?.message || m.quoted?.fakeObj?.message || null;
  const nested =
    (bContent && getContextInfo(bContent)?.quotedMessage
      ? { quoted: getContextInfo(bContent).quotedMessage, author: getContextInfo(bContent).participant || null, stanzaId: getContextInfo(bContent).stanzaId || null }
      : null) ||
    (m.quoted?.msg?.contextInfo?.quotedMessage
      ? { quoted: m.quoted.msg.contextInfo.quotedMessage, author: m.quoted.msg.contextInfo.participant || null, stanzaId: m.quoted.msg.contextInfo.stanzaId || null }
      : null) ||
    deepFindQuoted(bContent) ||
    deepFindQuoted(m.quoted?.fakeObj?.message);
  if (nested) return nested;

  // 3) B's message itself may be in the bot's message store
  try {
    const bMsg = bId ? store?.messages?.get(m.chat)?.get(bId) : null;
    const ci = bMsg ? getContextInfo(bMsg.message) : null;
    if (ci?.quotedMessage) return { quoted: ci.quotedMessage, author: ci.participant || null, stanzaId: ci.stanzaId || null };
  } catch (_) {}

  return null;
}

const NOT_FOUND =
  "❌ I can't find the message.\n\nReply to the person who REPLIED to the deleted message (B) with .quoted.\n" +
  "I can only bring it back if the bot's account received B's reply at some point " +
  "(online, or delivered when it came back online). If the bot's account was never in the chat, " +
  "WhatsApp never sent it the message.";

module.exports = [
  {
    command: ["quoted"],
    alias: ["recover", "undelete"],
    description: "Reply to someone's reply to get back the message they replied to (even if it was deleted)",
    category: "group",
    use: "(reply to B's reply)",
    owner: true, // owner + moderators only (it shows deleted messages)
    filename: __filename,

    async execute(m, { ednut, reply, store }) {
      try {
        if (!m.quoted) {
          return await reply("Reply to the message of the person who replied to the deleted message, then send .quoted");
        }

        const found = findOriginal(m, store);
        if (!found) {
          const newest = [...saved.keys()].slice(-1)[0] || "none";
          console.log(`[quoted] not found | looking for: ${m.quoted?.id || "?"} | saved copies: ${saved.size} | newest saved id: ${newest}`);
          return await reply(NOT_FOUND);
        }

        const content = clean(found.quoted);

        // send the message again (no heading, just the message)
        try {
          const wa = generateWAMessageFromContent(m.chat, content, { userJid: ednut.user?.id });
          await ednut.relayMessage(m.chat, wa.message, { messageId: wa.key.id });
        } catch (err) {
          // media that WhatsApp no longer has: send the small preview instead
          const msg = unwrap(content);
          const type = Object.keys(msg).find((k) => msg[k] && msg[k].jpegThumbnail);
          if (type) {
            const thumb = Buffer.from(msg[type].jpegThumbnail.data || msg[type].jpegThumbnail);
            await ednut.sendMessage(
              m.chat,
              { image: thumb, caption: (msg[type].caption || "") + "\n\n(only the preview is left)" },
              { quoted: m }
            );
          } else {
            throw err;
          }
        }
      } catch (e) {
        console.error("[quoted]", e.message);
        await reply("❌ Could not bring that message back.");
      }
    },
  },
];

// the handler calls this for every message
module.exports.record = record;
module.exports.attach = attach;