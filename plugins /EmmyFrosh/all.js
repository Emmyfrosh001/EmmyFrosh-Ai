const { proto, generateWAMessageFromContent } = require("@whiskeysockets/baileys");

// ==========================================
// .all <message>  —  native @everyone group mention
// GROUP ADMINS ONLY (groups only). Nobody else can use it —
// not members, not bot moderators, not sudo, not the owner —
// unless they are an admin of that group.
// Everyone else gets: "You need to be admin to use this command."
//
//   .all                      -> mentions everyone with "📢 Attention everyone!"
//   .all Meeting at 8pm       -> mentions everyone, the message is "Meeting at 8pm"
// ==========================================
module.exports = [
  {
    command: ["all"],
    alias: ["everyone", "mentionall"],
    description: "Mention everyone in the group (group admins only)",
    category: "group",
    use: "<message>",
    group: true, // the handler already blocks this command outside groups
    filename: __filename,

    async execute(m, { ednut, q, text, isAdmins }) {
      try {
        // only group admins
        if (!isAdmins) {
          return await ednut.sendMessage(
            m.chat,
            { text: "❌ You need to be admin to use this command." },
            { quoted: m }
          );
        }

        const meta = await ednut.groupMetadata(m.chat);
        const participants = meta.participants || [];
        if (!participants.length) {
          return await ednut.sendMessage(
            m.chat,
            { text: "⚠️ No participants found in this group." },
            { quoted: m }
          );
        }

        // the text you type after the command (same as getCommandArgs before)
        const raw = typeof text === "string" && text.trim()
          ? text
          : Array.isArray(q) ? q.join(" ") : String(q || "");
        const message = raw.trim() || "📢 Attention everyone!";

        // The raw text must be only the group JID. WhatsApp renders the
        // groupSubject value after the @, producing @<the full message>.
        const payload = proto.Message.fromObject({
          extendedTextMessage: {
            text: `@${m.chat}`,
            previewType: 0, // NONE
            contextInfo: {
              mentionedJid: participants.map((p) => p.id),
              groupMentions: [
                {
                  groupJid: m.chat,
                  groupSubject: message,
                },
              ],
            },
            inviteLinkGroupTypeV2: 0, // DEFAULT
          },
        });

        const waMessage = generateWAMessageFromContent(m.chat, payload, {
          userJid: ednut.user?.id,
        });

        await ednut.relayMessage(m.chat, waMessage.message, {
          messageId: waMessage.key.id,
        });
      } catch (e) {
        console.error("[all]", e.message);
        await ednut.sendMessage(
          m.chat,
          { text: "❌ Failed to mention everyone." },
          { quoted: m }
        );
      }
    },
  },
];