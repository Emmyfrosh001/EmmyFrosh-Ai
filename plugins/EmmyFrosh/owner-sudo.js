const protectedKey = 'setsudo';

function loadSudoList() {
  return Array.isArray(global.db?.[protectedKey]) ? global.db[protectedKey] : [];
}

function saveSudoList(data) {
  global.db[protectedKey] = data;
  global.flushDB?.()?.catch?.(() => {}); // save now, survive restart/redeploy
}

module.exports = [
  {
    command: "setsudo",
    alias: ["addsudo"],
    description: "Add a number as sudo",
    category: "Owner",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { text, ednut }) => {
      const setsudo = loadSudoList();
      const target = m.mentionedJid?.[0]
        || (text ? text.replace(/[^0-9]/g, "") + "@s.whatsapp.net" : "")
        || m.quoted?.sender;

      if (!target) return m.reply("Provide a number with @tag, reply, or 234XXXXXXXXXX format.");

      if (setsudo.includes(target)) {
        return await ednut.sendMessage(m.chat, {
          text: `User @${target.split("@")[0]} is already a sudo.`,
          mentions: [target],
        });
      }

      setsudo.push(target);
      saveSudoList(setsudo);

      await ednut.sendMessage(m.chat, {
        text: `Added @${target.split("@")[0]} as sudo.`,
        mentions: [target],
      });
    },
  },
  {
    command: "delsudo",
    alias: ["removesudo"],
    description: "Remove a sudo number",
    category: "Owner",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { text, ednut }) => {
      const setsudo = loadSudoList();
      const target = m.mentionedJid?.[0]
        || (text ? text.replace(/[^0-9]/g, "") + "@s.whatsapp.net" : "")
        || m.quoted?.sender;

      if (!target) return m.reply("Provide a number with @tag, reply, or 234XXXXXXXXXX format.");

      if (!setsudo.includes(target)) {
        return await ednut.sendMessage(m.chat, {
          text: `User @${target.split("@")[0]} is not a sudo.`,
          mentions: [target],
        });
      }

      setsudo.splice(setsudo.indexOf(target), 1);
      saveSudoList(setsudo);

      await ednut.sendMessage(m.chat, {
        text: `Removed @${target.split("@")[0]} from sudo.`,
        mentions: [target],
      });
    },
  },
  {
    command: "getsudo",
    alias: ["listsudo"],
    description: "List all sudo numbers",
    category: "Owner",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { ednut }) => {
      const setsudo = loadSudoList();
      if (!setsudo || setsudo.length === 0) {
        return await ednut.sendMessage(m.chat, {
          text: "No sudo numbers configured.",
        }, { quoted: m });
      }

      const list = `*Current Sudo Numbers:*\n\n${setsudo.map(jid => `• @${jid.split("@")[0]}`).join("\n")}`;

      await ednut.sendMessage(m.chat, {
        text: list,
        mentions: setsudo,
      }, { quoted: m });
    },
  },
];