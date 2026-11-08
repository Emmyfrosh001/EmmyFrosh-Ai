const fs = require("fs");
const { downloadContentFromMessage, jidNormalizedUser } = require("@whiskeysockets/baileys");

// ── unwrap ephemeral / view-once / caption wrappers ──
const unwrap = (msg) => {
  let cur = msg;
  for (let i = 0; i < 5; i++) {
    const next =
      cur?.ephemeralMessage?.message ||
      cur?.viewOnceMessage?.message ||
      cur?.viewOnceMessageV2?.message ||
      cur?.viewOnceMessageV2Extension?.message ||
      cur?.documentWithCaptionMessage?.message ||
      cur?.groupStatusMessageV2?.message ||
      cur?.groupStatusMessage?.message ||
      cur?.associatedChildMessage?.message;
    if (!next) break;
    cur = next;
  }
  return cur;
};

module.exports = [
  {
    command: ["save"],
    alias: ["sv", "send"],
    description: "Download and forward a quoted message or someone's status to your DM",
    category: "Info",
    ban: false,
    gcban: false,

    execute: async (m, { ednut, reply, isOwner }) => {
      try {
        if (!isOwner) return;

        const ctx = m.msg?.contextInfo;
        if (!ctx?.quotedMessage) return reply("Reply to a message, media or status to save it.");

        // Replying to a status? (the chat is the poster's DM, so we must NOT
        // send anything back into this chat or they would see it)
        const isStatus =
          ctx.remoteJid === "status@broadcast" ||
          ctx.participant === "status@broadcast" ||
          m.chat === "status@broadcast";

        // ── YOUR DM ──
        // fromMe  -> the bot is your own account -> your own number
        // otherwise -> whoever ran the command (the owner)
        const rawMe = ednut.user?.id || ednut.user?.lid || "";
        const meJid = jidNormalizedUser(rawMe);
        const dm = m.key?.fromMe ? meJid : jidNormalizedUser(m.sender || meJid);

        // confirmation goes to your DM for statuses, to the chat otherwise
        const say = (text) =>
          isStatus ? ednut.sendMessage(dm, { text }) : reply(text);

        // quietly remove your ".save" message from the poster's chat
        const cleanup = async () => {
          if (!isStatus) return;
          try { await ednut.sendMessage(m.chat, { delete: m.key }); } catch {}
        };

        const quoted = unwrap(ctx.quotedMessage);
        const mediaTypes = {
          imageMessage: "image",
          videoMessage: "video",
          ptvMessage: "ptv",
          audioMessage: "audio",
          stickerMessage: "sticker",
          documentMessage: "document",
        };

        // MEDIA FIRST: if the status has a video/photo, always save that
        // (a status can also carry text/emoji — that goes in the caption).
        const mediaType = Object.keys(mediaTypes).find((k) => quoted?.[k]);
        const kind = mediaType ? mediaTypes[mediaType] : null;

        const extraText =
          quoted?.conversation ||
          quoted?.extendedTextMessage?.text ||
          "";

        // ── TEXT ONLY (plain chat text or text status) ──
        if (!mediaType) {
          if (!extraText) { await cleanup(); return say("Unsupported message type."); }
          await ednut.sendMessage(dm, { text: extraText });
          await cleanup();
          return say("✅ Saved successfully");
        }

        const type = mediaType;

        const stream = await downloadContentFromMessage(quoted[type], kind);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        if (!buffer.length) { await cleanup(); return say("❌ Failed to download media."); }

        const node = quoted[type];
        // caption + any separate text/emoji of the status, together
        const caption = [node.caption, extraText]
          .map((t) => (t || "").trim())
          .filter((t, i, arr) => t && arr.indexOf(t) === i)
          .join("\n");

        if (kind === "image") {
          await ednut.sendMessage(dm, { image: buffer, caption });
        } else if (kind === "video" || kind === "ptv") {
          await ednut.sendMessage(dm, { video: buffer, caption, gifPlayback: !!node.gifPlayback });
        } else if (kind === "audio") {
          await ednut.sendMessage(dm, {
            audio: buffer,
            mimetype: node.mimetype || "audio/mpeg",
            ptt: !!node.ptt,
          });
        } else if (kind === "sticker") {
          await ednut.sendMessage(dm, { sticker: buffer });
        } else if (kind === "document") {
          await ednut.sendMessage(dm, {
            document: buffer,
            mimetype: node.mimetype || "application/octet-stream",
            fileName: node.fileName || "file",
          });
        }

        await cleanup();
        return say("✅ Saved successfully");

      } catch (err) {
        console.error(err);
        reply("❌ Error saving message.");
      }
    },
  },

  {
    command: ["setpp"],
    description: "Set bot profile picture (reply to image)",
    category: "Owner",
    owner: true,

    execute: async (m, { ednut, reply, mime, quoted, prefix, command }) => {
      try {
        if (!quoted) return reply("Reply to an image.");
        if (!/image/.test(mime)) return reply(`Send image with ${prefix + command}`);
        if (/webp/.test(mime)) return reply("Sticker not allowed.");

        const media = await ednut.downloadAndSaveMediaMessage(quoted);
        await ednut.updateProfilePicture(ednut.user.id, { url: media });

        fs.unlinkSync(media);

        return reply("✅ Profile picture set successfully");

      } catch (err) {
        console.error(err);
        reply("❌ Failed to update profile picture.");
      }
    },
  },

  {
    command: ["delpp"],
    description: "Remove bot profile picture",
    category: "Owner",
    owner: true,

    execute: async (m, { ednut, reply }) => {
      try {
        await ednut.removeProfilePicture(ednut.user.id);

        return reply("🗑️ Profile picture deleted successfully");

      } catch (err) {
        console.error(err);
        reply("❌ Failed to remove profile picture.");
      }
    },
  },
];