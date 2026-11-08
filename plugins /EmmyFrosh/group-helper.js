module.exports = [
{
  command: ["hidetag"],
  alias: ["ht"],
  description: "Mention all group members with quoted text or media only",
  category: "Group",
  ban: true,
  gcban: true,
  group: true,
  execute: async (m, { ednut, isGroup, isOwner, isHighStaff, reply }) => {
    try {
      if (!isGroup) return reply("❌ This command can only be used in groups.");
      if (!isHighStaff) return reply("❌ This command is restricted to *Owner* and *Mod* only.");

      const metadata = await ednut.groupMetadata(m.chat);
      const members = metadata.participants.map(p => p.id);
      const quoted = m.msg?.contextInfo?.quotedMessage;

      if (!quoted) return reply("*Reply to a message to tag everyone.*");

      let sendOpts = { quoted: m, mentions: members };

      if (quoted.conversation) {
        return ednut.sendMessage(m.chat, {
          text: quoted.conversation,
          ...sendOpts
        });
      }

      if (quoted.imageMessage) {
        const caption = quoted.imageMessage.caption || "";
        const imageUrl = await ednut.downloadAndSaveMediaMessage(quoted.imageMessage);
        return ednut.sendMessage(m.chat, {
          image: { url: imageUrl },
          caption,
          ...sendOpts
        });
      }

      if (quoted.audioMessage) {
        const audioUrl = await ednut.downloadAndSaveMediaMessage(quoted.audioMessage);
        return ednut.sendMessage(m.chat, {
          audio: { url: audioUrl },
          mimetype: "audio/mpeg",
          ...sendOpts
        });
      }

      if (quoted.videoMessage) {
        const caption = quoted.videoMessage.caption || "";
        const videoUrl = await ednut.downloadAndSaveMediaMessage(quoted.videoMessage);
        return ednut.sendMessage(m.chat, {
          video: { url: videoUrl },
          caption,
          ...sendOpts
        });
      }

      if (quoted.stickerMessage) {
        const stickerUrl = await ednut.downloadAndSaveMediaMessage(quoted.stickerMessage);
        return ednut.sendMessage(m.chat, {
          sticker: { url: stickerUrl },
          ...sendOpts
        });
      }

      if (quoted.documentMessage) {
        const docUrl = await ednut.downloadAndSaveMediaMessage(quoted.documentMessage);
        const fileName = quoted.documentMessage.fileName || "file";
        return ednut.sendMessage(m.chat, {
          document: { url: docUrl },
          mimetype: quoted.documentMessage.mimetype || 'application/octet-stream',
          fileName,
          ...sendOpts
        });
      }

      return reply("Unsupported message type.");
    } catch (err) {
      reply("Failed to tag everyone.");
      global.log?.("ERROR", `hidetag error: ${err.message || err}`);
    }
  }
},

{
  command: ["tagadmin"],
  alias: ["listadmin", "admin"],
  description: "Mention all group admins",
  category: "Group",
  ban: true,
  gcban: true,
  group: true,
  execute: async (m, { ednut, isGroup, isOwner, isHighStaff, reply }) => {
    try {
      if (!isGroup) return reply("❌ This command can only be used in groups.");
      if (!isHighStaff) return reply("❌ This command is restricted to *Owner* and *Mod* only.");

      const metadata = await ednut.groupMetadata(m.chat);
      const admins = metadata.participants.filter(p => p.admin);
      const mentions = admins.map(a => a.id);
      const list = admins.map((a, i) => `${i + 1}. @${a.id.split('@')[0]}`).join('\n');

      await ednut.sendMessage(
        m.chat,
        {
          text: `Group Admins:\n${list}`,
          mentions
        },
        { quoted: m }
      );
    } catch (err) {
      reply("Failed to tag admins.");
      global.log?.("ERROR", `tagadmin error: ${err.message || err}`);
    }
  }
},

  {
    command: ["revoke"],
    alias: ["resetlink"],
    description: "Reset the group invite link",
    category: "Group",
    ban: true,
    gcban: true,
    group: true,
    execute: async (m, { ednut, isAdmins, isBotAdmins, reply }) => {
      try {
        if (!isAdmins) return reply("You need to be an admin to use this command.");
        if (!isBotAdmins) return reply("I need to be an admin to use this command.");

        await ednut.groupRevokeInvite(m.chat);
        reply("Group link has been reset.");
      } catch (err) {
        reply("Failed to reset link.");
        global.log?.("ERROR", `revoke error: ${err.message || err}`);
      }
    }
  },

  {
    command: ["invite"],
    alias: ["grouplink", "gclink"],
    description: "Get current group invite link",
    category: "Group",
    ban: true,
    gcban: true,
    group: true,
    execute: async (m, { ednut, isAdmins, isBotAdmins, reply }) => {
      try {
        if (!isAdmins) return reply("You need to be an admin to use this command.");
        if (!isBotAdmins) return reply("I need to be an admin to use this command.");

        const code = await ednut.groupInviteCode(m.chat);
        await ednut.sendMessage(m.chat, { text: `https://chat.whatsapp.com/${code}` }, { quoted: m });
      } catch (err) {
        reply("Failed to fetch invite link.");
        global.log?.("ERROR", `invite error: ${err.message || err}`);
      }
    }
  },

  {command: ["tag"],
description: "Tag all members with message or media",
category: "Group",
filename: __filename,
async execute(m, { ednut, q, from, isGroup, isAdmins, reply }) {
  try {
    // React first
    await ednut.sendMessage(from, {
      react: { text: "🔊", key: m.key }
    });

    // Delete the command message after reacting
    await ednut.sendMessage(from, { delete: m.key }).catch(() => {});

    const isUrl = (url) => {
      return /https?:\/\/(www\.)?[\w\-@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([\w\-@:%_\+.~#?&//=]*)/.test(url);
    };

    if (!isGroup) return reply("❌ This command can only be used in groups.");

    // Only allow group admins to use the command
    if (!isAdmins) {
      return reply("You need to be an admin to use this command.");
    }

    // ✅ Fetch group metadata and build mentions list
    const groupMetadata = await ednut.groupMetadata(from);
    const participants = groupMetadata.participants || [];
    const mentionAll = { mentions: participants.map(p => p.jid || p.id) };

    // If no text or quoted message
    if (!q && !m.quoted) {
      return reply("❌ Please provide a message or reply to a message to tag all members.");
    }

    // Handle quoted message
    if (m.quoted) {
      const type = m.quoted.mtype || "";

      if (type === "extendedTextMessage") {
        return await ednut.sendMessage(from, {
          text: m.quoted.text || "No message content found.",
          ...mentionAll
        }, { quoted: m });
      }

      if (["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage"].includes(type)) {
        try {
          const buffer = await m.quoted.download?.();
          if (!buffer) return reply("❌ Failed to download the quoted media.");

          let content;
          switch (type) {
            case "imageMessage":
              content = { image: buffer, caption: m.quoted.text || "📷 Image", ...mentionAll };
              break;
            case "videoMessage":
              content = {
                video: buffer,
                caption: m.quoted.text || "🎥 Video",
                gifPlayback: m.quoted.message?.videoMessage?.gifPlayback || false,
                ...mentionAll
              };
              break;
            case "audioMessage":
              content = {
                audio: buffer,
                mimetype: "audio/mp4",
                ptt: m.quoted.message?.audioMessage?.ptt || false,
                ...mentionAll
              };
              break;
            case "stickerMessage":
              content = { sticker: buffer, ...mentionAll };
              break;
            case "documentMessage":
              content = {
                document: buffer,
                mimetype: m.quoted.message?.documentMessage?.mimetype || "application/octet-stream",
                fileName: m.quoted.message?.documentMessage?.fileName || "file",
                caption: m.quoted.text || "",
                ...mentionAll
              };
              break;
          }

          if (content) {
            return await ednut.sendMessage(from, content, { quoted: m });
          }
        } catch (e) {
          console.error("Media download/send error:", e);
          return reply("❌ Failed to process the media. Sending as text instead.");
        }
      }

      return await ednut.sendMessage(from, {
        text: m.quoted.text || "📨 Message",
        ...mentionAll
      }, { quoted: m });
    }

    // Handle direct text
    if (q) {
      if (isUrl(q)) {
        return await ednut.sendMessage(from, { text: q, ...mentionAll }, { quoted: m });
      }
      await ednut.sendMessage(from, { text: q, ...mentionAll }, { quoted: m });
    }

  } catch (e) {
    console.error(e);
    reply(`❌ *Error Occurred !!*\n\n${e.message}`);
    }
  }
},

{
  command: ["tagall"],
  description: "Mention everyone with optional message",
  category: "Group",
  ban: true,
  gcban: true,
  group: true,
  execute: async (m, { ednut, isAdmins, reply }) => {
    try {
      if (!isAdmins) return reply("You need to be an admin to use this command.");

      const metadata = await ednut.groupMetadata(m.chat);
      const participants = metadata.participants;
      const members = participants.map(p => p.id);
      const text = m.text.replace(/^[.,]?(tagall)/i, '').trim();

      let message = `📢 ᴛᴀɢ ᴀʟʟ\n\n`;
      if (text) message += `📝 ᴍᴇꜱꜱᴀɢᴇ: ${text}\n\n`;
      for (const mem of participants) {
        message += `\`\`\`@${mem.id.split('@')[0]}\`\`\`\n`;
      }

      await ednut.sendMessage(m.chat, { text: message, mentions: members });
      await ednut.sendMessage(m.chat, { delete: m.key });
    } catch (err) {
      reply("Failed to tag all.");
      global.log?.("ERROR", `tagall error: ${err.message || err}`);
    }
  }
}
];