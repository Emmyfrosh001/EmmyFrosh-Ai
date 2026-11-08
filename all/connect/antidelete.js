/**
 * Antidelete Handler — Emmy Frosh AI
 * Place in: ./all/connect/antidelete.js
 */

const fs   = require("fs");
const path = require("path");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const moment = require("moment-timezone");

const LOG_FILE  = path.join(__dirname, "../../deleted_messages.log");
const MAX_CACHE = 100;      // per chat
const MAX_TOTAL = 800;     // all chats together (this was unlimited before = memory leak)

const msgCache  = new Map();
const chatCount = new Map();

// ── Cache helpers ─────────────────────────────────────────────────────────

function cacheMsg(msg) {
  const jid = msg.key?.remoteJid;
  const id  = msg.key?.id;
  if (!jid || !id) return;
  const count = chatCount.get(jid) || 0;
  if (count >= MAX_CACHE) {
    for (const [key, cached] of msgCache) {
      if (cached.key?.remoteJid === jid) {
        msgCache.delete(key);
        chatCount.set(jid, Math.max(0, (chatCount.get(jid) || 1) - 1));
        break;
      }
    }
  }
  msgCache.set(id, msg);
  chatCount.set(jid, (chatCount.get(jid) || 0) + 1);

  // global cap: drop the oldest cached messages first
  while (msgCache.size > MAX_TOTAL) {
    const oldKey = msgCache.keys().next().value;
    const old = msgCache.get(oldKey);
    msgCache.delete(oldKey);
    const oj = old?.key?.remoteJid;
    if (oj) chatCount.set(oj, Math.max(0, (chatCount.get(oj) || 1) - 1));
  }
}

// lets store.js clear this cache if memory gets too high
global.__trimAntidelete = () => { msgCache.clear(); chatCount.clear(); };

function uncacheMsg(id, jid) {
  if (msgCache.has(id)) {
    msgCache.delete(id);
    chatCount.set(jid, Math.max(0, (chatCount.get(jid) || 1) - 1));
  }
}

// ── Unwrap view once / ephemeral ──────────────────────────────────────────

function unwrapMsg(msg) {
  const m = msg?.message;
  if (!m) return msg;
  const inner =
    m.viewOnceMessage?.message ||
    m.viewOnceMessageV2?.message ||
    m.viewOnceMessageV2Extension?.message ||
    m.ephemeralMessage?.message ||
    null;
  if (!inner) return msg;
  return { ...msg, message: inner };
}

// ── Content extractors ────────────────────────────────────────────────────

function getContent(msg) {
  const m = unwrapMsg(msg)?.message;
  if (!m) return null;
  return (
    m.conversation              ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption     ||
    m.videoMessage?.caption     ||
    m.documentMessage?.caption  ||
    null
  );
}

function getMediaType(msg) {
  const raw = msg?.message;
  if (!raw) return "text";
  const isViewOnce = !!(
    raw.viewOnceMessage ||
    raw.viewOnceMessageV2 ||
    raw.viewOnceMessageV2Extension
  );
  const m = unwrapMsg(msg)?.message;
  if (!m) return "text";
  if (m.imageMessage)    return isViewOnce ? "viewonce_image" : "image";
  if (m.videoMessage)    return isViewOnce ? "viewonce_video" : "video";
  if (m.audioMessage)    return m.audioMessage.ptt ? "voicenote" : "audio";
  if (m.stickerMessage)  return "sticker";
  if (m.documentMessage) return "document";
  if (m.contactMessage)  return "contact";
  if (m.locationMessage) return "location";
  return "text";
}

// ── Download media ────────────────────────────────────────────────────────

async function downloadMedia(sock, msg) {
  try {
    const unwrapped = unwrapMsg(msg);
    return await downloadMediaMessage(unwrapped, "buffer", {}, {
      logger: console,
      reuploadRequest: sock.updateMediaMessage
    });
  } catch (err) {
    console.warn(`[antidelete] Download failed: ${err.message}`);
    return null;
  }
}

// ── Owner JID ─────────────────────────────────────────────────────────────

function getOwnerJid() {
  const num = Array.isArray(global.ownerNumber)
    ? global.ownerNumber[0]
    : global.ownerNumber || global.owner;
  if (!num) return null;
  return String(num).replace(/[^0-9]/g, "") + "@s.whatsapp.net";
}

function writeLog(entry) {
  fs.appendFile(LOG_FILE, JSON.stringify(entry) + "\n", () => {});
}

function getTime() { return moment().tz("Africa/Lagos").format("HH:mm:ss"); }
function getDate() { return moment().tz("Africa/Lagos").format("DD/MM/YYYY"); }

// ── Caption builders ──────────────────────────────────────────────────────

function buildTextCaption(sender, deletedBy, groupName, mediaType) {
  return (
    `✝️ ᴅᴇʟᴇᴛᴇᴅ ᴍᴇꜱꜱᴀɢᴇ\n \n` +
    `┃ 👤 ꜱᴇɴᴅᴇʀ: @${sender.split("@")[0]}\n` +
    `┃ 🗑️ ᴅᴇʟᴇᴛᴇᴅ ʙʏ: @${deletedBy.split("@")[0]}\n` +
    `┃ 🏘️ ɢʀᴏᴜᴘ ɴᴀᴍᴇ: ${groupName}\n` +
    `┃ 📂 ᴛʏᴘᴇ: ${mediaType}\n` +
    `┃ ⏰ ${getTime()} • 📅 ${getDate()}\n` +
    `╰━━━━━━━━━━━━━━━━━`
  );
}

function buildMediaCaption(sender, deletedBy, groupName, mediaType) {
  return (
    `✝️ ᴅᴇʟᴇᴛᴇᴅ ᴍᴇᴅɪᴀ\n \n` +
    `┃ 👤 ꜱᴇɴᴅᴇʀ: @${sender.split("@")[0]}\n` +
    `┃ 🗑️ ᴅᴇʟᴇᴛᴇᴅ ʙʏ: @${deletedBy.split("@")[0]}\n` +
    `┃ 🏘️ ɢʀᴏᴜᴘ ɴᴀᴍᴇ: ${groupName}\n` +
    `┃ 📂 ᴛʏᴘᴇ: ${mediaType}\n` +
    `┃ ⏰ ${getTime()} • 📅 ${getDate()}\n` +
    `╰━━━━━━━━━━━━━━━━━`
  );
}

function buildStatusCaption(sender) {
  return (
    `✝️ ᴅᴇʟᴇᴛᴇᴅ ꜱᴛᴀᴛᴜꜱ\n \n` +
    `┃ 👤 ᴀᴜᴛʜᴏʀ: @${sender.split("@")[0]}\n` +
    `┃ ⏰ ${getTime()} • 📅 ${getDate()}\n` +
    `╰━━━━━━━━━━━━━━━━━`
  );
}

// ── Forward deleted message ───────────────────────────────────────────────

async function forwardDeleted(sock, targetJid, cached, sender, chat, deletedBy, groupName, isStatus = false) {
  const content   = getContent(cached);
  const mediaType = getMediaType(cached);
  const mentions  = [sender, deletedBy].filter(Boolean);

  const typeLabelMap = {
    "viewonce_image": "ɪᴍᴀɢᴇ 👁",
    "viewonce_video": "ᴠɪᴅᴇᴏ 👁",
    "voicenote":      "ᴠᴏɪᴄᴇ ɴᴏᴛᴇ 🎤",
    "audio":          "ᴀᴜᴅɪᴏ 🎵",
    "image":          "ɪᴍᴀɢᴇ 🖼️",
    "video":          "ᴠɪᴅᴇᴏ 🎥",
    "sticker":        "ꜱᴛɪᴄᴋᴇʀ 🎭",
    "document":       "ᴅᴏᴄᴜᴍᴇɴᴛ 📄",
    "text":           "ᴛᴇxᴛ 💬",
    "contact":        "ᴄᴏɴᴛᴀᴄᴛ 👤",
    "location":       "ʟᴏᴄᴀᴛɪᴏɴ 📍",
  };
  const typeLabel = typeLabelMap[mediaType] || mediaType;

  const textCap  = isStatus ? buildStatusCaption(sender) : buildTextCaption(sender, deletedBy, groupName, typeLabel);
  const mediaCap = isStatus ? buildStatusCaption(sender) : buildMediaCaption(sender, deletedBy, groupName, typeLabel);

  const unwrapped = unwrapMsg(cached);
  const m = unwrapped?.message;

  try {
    // ── Text ─────────────────────────────────────────────────────────────
    if (mediaType === "text") {
      await sock.sendMessage(targetJid, {
        text: `${textCap}${content ? `\n\n📝 ${content}` : ""}`,
        mentions
      });

    // ── Image / View Once Image ───────────────────────────────────────────
    } else if (mediaType === "image" || mediaType === "viewonce_image") {
      const buffer = await downloadMedia(sock, cached);
      if (buffer) {
        await sock.sendMessage(targetJid, {
          image: buffer,
          caption: `${mediaCap}${content ? `\n\n📝 ${content}` : ""}`.trim(),
          mentions
        });
      } else {
        await sock.sendMessage(targetJid, { text: `${mediaCap}\n\n⚠️ Image expired.`, mentions });
      }

    // ── Video / View Once Video ───────────────────────────────────────────
    } else if (mediaType === "video" || mediaType === "viewonce_video") {
      const buffer = await downloadMedia(sock, cached);
      if (buffer) {
        await sock.sendMessage(targetJid, {
          video: buffer,
          caption: `${mediaCap}${content ? `\n\n📝 ${content}` : ""}`.trim(),
          mentions
        });
      } else {
        await sock.sendMessage(targetJid, { text: `${mediaCap}\n\n⚠️ Video expired.`, mentions });
      }

    // ── Voice Note ────────────────────────────────────────────────────────
    } else if (mediaType === "voicenote") {
      const buffer = await downloadMedia(sock, cached);
      if (buffer) {
        await sock.sendMessage(targetJid, { audio: buffer, mimetype: "audio/ogg; codecs=opus", ptt: true });
        await sock.sendMessage(targetJid, { text: mediaCap, mentions });
      } else {
        await sock.sendMessage(targetJid, { text: `${mediaCap}\n\n⚠️ Voice note expired.`, mentions });
      }

    // ── Audio ─────────────────────────────────────────────────────────────
    } else if (mediaType === "audio") {
      const buffer = await downloadMedia(sock, cached);
      if (buffer) {
        await sock.sendMessage(targetJid, {
          audio: buffer,
          mimetype: m?.audioMessage?.mimetype || "audio/mp4",
          ptt: false
        });
        await sock.sendMessage(targetJid, { text: mediaCap, mentions });
      } else {
        await sock.sendMessage(targetJid, { text: `${mediaCap}\n\n⚠️ Audio expired.`, mentions });
      }

    // ── Sticker — reply to sticker then send caption ───────────────────────
    } else if (mediaType === "sticker") {
      const buffer = await downloadMedia(sock, cached);
      if (buffer) {
        // Send sticker first
        const sent = await sock.sendMessage(targetJid, { sticker: buffer });
        // Reply to the sticker with the caption
        await sock.sendMessage(targetJid, {
          text: mediaCap,
          mentions
        }, { quoted: sent });
      } else {
        await sock.sendMessage(targetJid, { text: `${mediaCap}\n\n⚠️ Sticker expired.`, mentions });
      }

    // ── Document ──────────────────────────────────────────────────────────
    } else if (mediaType === "document") {
      const buffer = await downloadMedia(sock, cached);
      if (buffer) {
        await sock.sendMessage(targetJid, {
          document: buffer,
          mimetype: m?.documentMessage?.mimetype || "application/octet-stream",
          fileName: m?.documentMessage?.fileName || "file",
          caption: `${mediaCap}${content ? `\n\n📝 ${content}` : ""}`.trim(),
          mentions
        });
      } else {
        await sock.sendMessage(targetJid, { text: `${mediaCap}\n\n⚠️ Document expired.`, mentions });
      }

    // ── Fallback ───────────────────────────────────────────────────────────
    } else {
      await sock.sendMessage(targetJid, {
        text: `${textCap}\n\n⚠️ Unsupported type: ${mediaType}`,
        mentions
      });
    }

  } catch (err) {
    console.warn(`[antidelete] Forward error: ${err.message}`);
  }
}

// ── Main export ───────────────────────────────────────────────────────────

module.exports = (sock, store) => {

  // Cache all messages
  sock.ev.on("messages.upsert", ({ messages }) => {
    for (const msg of messages) {
      if (!msg?.message) continue;
      if (msg.message.reactionMessage) continue;
      cacheMsg(msg); // caches everything including status
    }
  });

  // Handle deletions
  sock.ev.on("messages.upsert", ({ messages }) => {
    for (const msg of messages) {
      if (!msg?.message) continue;

      const jid   = msg.key?.remoteJid;
      const proto =
        msg.message?.protocolMessage ||
        msg.message?.ephemeralMessage?.message?.protocolMessage;

      if (!proto || proto.type !== 0) continue;

      const deletedId = proto.key?.id;
      const chat      = jid;
      const deletedBy = msg.key?.participant || msg.key?.remoteJid;

      if (!deletedId || !chat) continue;

      const isStatus = chat === "status@broadcast";
      const isGroup  = chat.endsWith("@g.us");

      // ── Status deletion ──────────────────────────────────────────────
      if (isStatus) {
        const statusEnabled = global.db?.settings?.antideletestatus === true;
        if (!statusEnabled) { uncacheMsg(deletedId, chat); continue; }
        const cached = msgCache.get(deletedId);
        if (!cached) continue;
        const sender = cached.key?.participant || cached.key?.remoteJid || deletedBy;
        const ownerJid = getOwnerJid();
        if (ownerJid) forwardDeleted(sock, ownerJid, cached, sender, chat, deletedBy, "Status", true);
        uncacheMsg(deletedId, chat);
        continue;
      }

      // ── Group / DM deletion ──────────────────────────────────────────
      const groupMode = global.db?.settings?.antidelete === "group";
      const dmMode    = global.db?.settings?.antidelete === "dm";

      if (!groupMode && !dmMode) { uncacheMsg(deletedId, chat); continue; }

      const cached = msgCache.get(deletedId);
      if (!cached) {
        writeLog({ event: "DELETE_UNCACHED", time: new Date().toISOString(), chat, deletedBy, msgId: deletedId });
        continue;
      }

      const sender    = cached.key?.participant || cached.key?.remoteJid;
      const mediaType = getMediaType(cached);
      const content   = getContent(cached);

      writeLog({ event: "DELETE", time: new Date().toISOString(), chat, deletedBy, sender, mediaType, content });

      // Get group/chat name
      let groupName = isGroup ? chat.split("@")[0] : "Private";
      try {
        const meta = store?.groupMetadata?.[chat];
        if (meta?.subject) groupName = meta.subject;
      } catch {}

      if (groupMode && isGroup) {
        forwardDeleted(sock, chat, cached, sender, chat, deletedBy, groupName, false);
      }

      if (dmMode) {
        const ownerJid = getOwnerJid();
        if (ownerJid) forwardDeleted(sock, ownerJid, cached, sender, chat, deletedBy, groupName, false);
      }

      uncacheMsg(deletedId, chat);
    }
  });

  console.log("[antidelete] ✅ Handler registered (group, dm, status).");
};
