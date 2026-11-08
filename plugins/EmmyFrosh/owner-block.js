module.exports = [
  {
    command: ["block"],
    alias: ["blk"],
    description: "Block a user (reply/tag/number)",
    category: "Owner",
    ban: false,
    gcban: false,
    execute: async (m, { ednut, text, isOwner, isGroup, reply }) => {
    if (m.isGroup) return reply(msg.baileys);
    if (!isOwner) return reply(msg.owner)
      const mem = !m.isGroup
        ? m.chat
        : m.mentionedJid?.[0]
        ? m.mentionedJid[0]
        : m.quoted
        ? m.quoted.sender
        : text
        ? text.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
        : null;

      if (!mem) return reply("Please reply, tag, or input a valid number to block.");

      await ednut.updateBlockStatus(mem, "block");
      const successMsg  = `Successfully blocked @${mem.split("@")[0]}`;
      if (m.isGroup) {
        await ednut.sendMessage(m.chat, { text: successMsg , mentions: [mem] }, { quoted: m });
      } else {
        reply(successMsg );
      }
    }
  },
  {
    command: ["unblock"],
    alias: ["ublk"],
    description: "Unblock a user (reply/tag/number)",
    category: "Owner",
    ban: false,
    gcban: false,
    execute: async (m, { ednut, text, isOwner, isGroup, reply}) => {
    if (m.isGroup) return reply(msg.baileys);
    if (!isOwner) return reply(msg.owner)
      const mem = !m.isGroup
        ? m.chat
        : m.mentionedJid?.[0]
        ? m.mentionedJid[0]
        : m.quoted
        ? m.quoted.sender
        : text
        ? text.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
        : null;

      if (!mem) return reply("Please reply, tag, or input a valid number to unblock.");

      await ednut.updateBlockStatus(mem, "unblock");
      const successMsg  = `Successfully unblocked @${mem.split("@")[0]}`;
      if (m.isGroup) {
        await ednut.sendMessage(m.chat, { text: successMsg , mentions: [mem] }, { quoted: m });
      } else {
        reply(successMsg );
      }
    }
  },
{
  command: ["listblock"],
  alias: ["blocklist"],
  description: "List all blocked contacts",
  category: "Privacy",
  ban: true,
  gcban: true,

  async execute(m, { ednut, isOwner, reply }) {
    try {
      if (!isOwner) return reply("*Only the owner can use this command.*");

      const listblok = await ednut.fetchBlocklist();
      if (!listblok || listblok.length === 0) {
        return reply("No blocked users found.");
      }

      // Filter valid JIDs
      const validJids = listblok.filter(jid => typeof jid === "string" && jid.includes("@"));

      // Format blocked contacts nicely
      const blockedList = validJids
        .map((jid, i) => `📵 ${i + 1}. +${jid.split("@")[0]}`)
        .join("\n");

      const message = `
🛑 *Blocked Contacts List* 🛑

*Total Blocked:* ${validJids.length}

─────────────
${blockedList}
─────────────
      `.trim();

      await reply(message);
    } catch (error) {
      return reply("❌ Failed to fetch blocked contacts.");
    }
  }
},
  {
    command: ["listgroup"],
    alias: ["listgc"],
    description: "List all joined group chats",
    category: "Owner",
    ban: false,
    gcban: false,
    execute: async (m, { ednut, isOwner, isGroup, reply }) => {
    if (m.isGroup) return reply(msg.baileys);
    if (!isOwner) return reply(msg.owner)
      const allGroups = await ednut.groupFetchAllParticipating();
      const groupList = Object.values(allGroups);

      let teks = `List of all groups:\n\nTotal: ${groupList.length}\n`;

      for (const u of groupList) {
        teks += `\n-----------------------------\nID: ${u.id}\nName: ${u.subject}\nMembers: ${u.participants.length}\nStatus: ${u.announce ? "Closed" : "Open"}\nOwner: ${u.subjectOwner ? u.subjectOwner.split("@")[0] : "Unknown"}`;
      }

      return reply(teks);
    }
  }
];