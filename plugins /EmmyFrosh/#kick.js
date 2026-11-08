module.exports = [
  {
    command: ["#kick"],
    description: "Kicks only users tagged inside a replied message",
    category: "Group",
    group: true,

    execute: async (m, { ednut, isAdmins, isOwner, isBotAdmins, reply }) => {
      try {
        if (!(isAdmins || isOwner)) return reply("❌ Admin only command.");
        if (!isBotAdmins) return reply("❌ I need admin rights to kick users.");

        if (!m.quoted) return reply("❌ Please reply to a message with tagged users.");

        const chat = m.chat;

        // 🔥 FIX: correct way to extract mentions
        const context =
          m.quoted.msg?.contextInfo ||
          m.quoted.contextInfo ||
          m.quoted.message?.extendedTextMessage?.contextInfo;

        let targets = context?.mentionedJid || [];

        if (!targets.length) {
          return reply("❌ No tagged users found in the replied message.");
        }

        targets = [...new Set(targets)];

        const groupMetadata = await ednut.groupMetadata(chat);
        const participants = groupMetadata.participants;

        let kicked = 0;

        for (let user of targets) {
          const participant = participants.find(p => p.id === user);

          if (!participant) continue;
          if (user === ednut.user.id) continue;
          if (user === m.quoted.sender) continue;
          if (participant.admin) continue;

          try {
            await ednut.groupParticipantsUpdate(chat, [user], "remove");
            kicked++;
          } catch (err) {
            console.log("Kick error:", err);
          }
        }

        if (kicked > 0) {
          return reply(`✅ Kicked ${kicked} tagged user(s).`);
        } else {
          return reply("❌ No valid tagged users to kick.");
        }

      } catch (e) {
        console.log("Kick Error:", e);
        reply("❌ Error occurred during execution.");
      }
    },
  }
];