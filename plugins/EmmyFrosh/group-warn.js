module.exports = [
  {
    command: ["warn"],
    description: "Warn a user (auto kick after limit)",
    category: "Group",
    group: true,

    execute: async (m, { ednut, isBotAdmins, isAdmins, text, sleep, reply }) => {
      try {
        // 1. Check if bot is admin
        if (!isBotAdmins) return reply("❌ I need admin rights to perform this command.");

        // 2. Check if sender is admin (uses handler's LID-aware isAdmins)
        if (!isAdmins) return reply("You need to be an admin to use this command.");

        const chat = m.chat;
        const who = m.mentionedJid?.[0] || m.quoted?.sender;
        if (!who) return reply("❌ Tag or reply to someone to warn.");

        global.db = global.db || {};
        global.db.warn = global.db.warn || {};
        global.db.warnLimit = global.db.warnLimit || {};

        if (!global.db.warn[chat]) global.db.warn[chat] = {};
        if (!global.db.warnLimit[chat]) global.db.warnLimit[chat] = 3;

        const limit = global.db.warnLimit[chat];

        if (!global.db.warn[chat][who]) global.db.warn[chat][who] = 0;
        const reason = text?.replace(/@\d+/g, "").trim() || "No reason specified";

        global.db.warn[chat][who] += 1;
        const count = global.db.warn[chat][who];

        let targetName = m.quoted?.pushName || who.split("@")[0];

        if (m.quoted) {
          try {
            await ednut.sendMessage(chat, {
              delete: {
                remoteJid: chat,
                fromMe: m.quoted.fromMe,
                id: m.quoted.id || m.quoted.key.id,
                participant: m.quoted.sender || m.quoted.key.participant
              }
            });
          } catch (err) {
            console.log("Delete failed:", err.message);
          }
        }

        const warnMsg = `╭─❏ ⚠️ WARNED 〙━━━❒

👤 User: @⁨${targetName}⁩
📝 Reason: ${reason}
📊 Warnings: ${count}/${limit}

╰───────────╯
⚠️ ${count >= limit ? "Removal in progress..." : "Next warn may lead to removal!"}`;

        await ednut.sendMessage(chat, {
          text: warnMsg,
          mentions: [who],
        }, { quoted: m });

        if (count >= limit) {
          await sleep(2000);
          await ednut.groupParticipantsUpdate(chat, [who], "remove");
          delete global.db.warn[chat][who];
        }
      } catch (e) {
        console.log("warn error:", e);
        reply("❌ Error occurred");
      }
    },
  },

  {
    command: ["resetwarn"],
    description: "Reset specific user or use '.resetwarn all' to clear group",
    category: "Group",
    group: true,

    execute: async (m, { text, reply, ednut, isAdmins }) => {
      try {
        if (!isAdmins) return reply("You need to be an admin to use this command.");

        const chat = m.chat;
        const who = m.mentionedJid?.[0] || m.quoted?.sender;

        if (text && text.toLowerCase().trim() === "all") {
          if (global.db.warn?.[chat]) {
            global.db.warn[chat] = {};
            return reply("🧹 *Reset All:* Every warning in this group has been cleared.");
          }
          return reply("ℹ️ No warnings to reset.");
        }

        if (!who) return reply("❌ Tag/reply to a user or type *.resetwarn all*");
        
        if (global.db.warn?.[chat]) delete global.db.warn[chat][who];

        let targetName = m.quoted?.pushName || who.split("@")[0];

        return ednut.sendMessage(chat, {
          text: `🧹 ᴡᴀʀɴɪɴɢꜱ ʀᴇꜱᴇᴛ ꜰᴏʀ @⁨${targetName}⁩`,
          mentions: [who]
        }, { quoted: m });

      } catch (e) {
        reply("❌ Error occurred");
      }
    },
  },

  {
    command: ["setwarn"],
    description: "Set warn limit (1-10)",
    category: "Group",
    group: true,

    execute: async (m, { text, reply, ednut, isAdmins }) => {
      try {
        if (!isAdmins) return reply("You need to be an admin to use this command.");

        const num = parseInt(text);

        if (!num || num < 1 || num > 10) {
          return reply("⚠️ Please provide a number between *1 and 10*.");
        }

        global.db.warnLimit = global.db.warnLimit || {};
        global.db.warnLimit[m.chat] = num;
        return reply(`⚙️ Warn limit set to *${num}*`);
      } catch (e) {
        reply("❌ Error occurred");
      }
    },
  },
];