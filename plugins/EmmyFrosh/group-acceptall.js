module.exports = [
  // List pending group join requests
  {
    command: ["requestlist"],
    description: "Shows pending group join requests",
    category: "Group",
    group: true,
    execute: async (m, { ednut, isGroup, isAdmins, isBotAdmins, reply }) => {
      try {
        if (!isGroup) return reply("❌ This command can only be used in groups.");
        if (!isAdmins) return reply("❌ Only group admins can use this command.");
        if (!isBotAdmins) return reply("❌ I need to be an admin to view join requests.");

        const requests = await ednut.groupRequestParticipantsList(m.chat);

        if (!requests || requests.length === 0) {
          return reply("ℹ️ No pending join requests.");
        }

        let text = `📋 *Pending Join Requests (${requests.length})*\n\n`;
        requests.forEach((user, i) => {
          text += `${i + 1}. +${user.jid.split('@')[0]}\n`;
        });

        return reply(text, { mentions: requests.map(u => u.jid) });
      } catch (error) {
        console.error("Request list error:", error);
        return reply("❌ Failed to fetch join requests.");
      }
    }
  },

  // Accept all join requests
  {
    command: ["acceptall"],
    alias: ["approve"],
    description: "Accepts all pending group join requests",
    category: "Group",
    group: true,
    execute: async (m, { ednut, isGroup, isAdmins, isBotAdmins, reply }) => {
      try {
        if (!isGroup) return reply("❌ This command can only be used in groups.");
        if (!isAdmins) return reply("❌ Only group admins can use this command.");
        if (!isBotAdmins) return reply("❌ I need to be an admin to accept join requests.");

        if (typeof ednut.groupRequestParticipantsList !== "function") {
          return reply("❌ Your Baileys version does not support join request listing. Please update the bot.");
        }

        const requests = await ednut.groupRequestParticipantsList(m.chat);
        if (!requests || requests.length === 0) {
          return reply("ℹ️ No pending join requests to approve.");
        }

        const jids = requests.map(u => u.jid).filter(jid => typeof jid === 'string' && jid.includes('@'));

        for (const jid of jids) {
          try {
            await ednut.groupRequestParticipantsUpdate(m.chat, [jid], "approve");
            await new Promise(r => setTimeout(r, 500)); // Prevent rate limit
          } catch (e) {
            console.error(`[❌ ERROR] Failed to approve ${jid}:`, e.message);
          }
        }

        return reply(`✅ Approved ${jids.length} join request(s):\n\n${jids.map(j => '+' + j.split('@')[0]).join("\n")}`);
      } catch (error) {
        console.error("[❌ ERROR] AcceptAll failed:", error);
        return reply("❌ Failed to accept join requests.\n\nError: ```" + (error?.message || error.stack) + "```");
      }
    }
  },

  // Reject all join requests
  {
    command: ["rejectall"],
    alias: ["reject", "unapprove"],
    description: "Rejects all pending group join requests",
    category: "Group",
    group: true,
    execute: async (m, { ednut, isGroup, isAdmins, isBotAdmins, reply }) => {
      try {
        if (!isGroup) return reply("❌ This command can only be used in groups.");
        if (!isAdmins) return reply("❌ Only group admins can use this command.");
        if (!isBotAdmins) return reply("❌ I need to be an admin to reject join requests.");

        if (typeof ednut.groupRequestParticipantsList !== "function") {
          return reply("❌ Your Baileys version does not support join request listing. Please update the bot.");
        }

        const requests = await ednut.groupRequestParticipantsList(m.chat);
        if (!requests || requests.length === 0) {
          return reply("ℹ️ No pending join requests to reject.");
        }

        const jids = requests.map(u => u.jid).filter(jid => typeof jid === 'string' && jid.includes('@'));

        for (const jid of jids) {
          try {
            await ednut.groupRequestParticipantsUpdate(m.chat, [jid], "reject");
            await new Promise(r => setTimeout(r, 500)); // Prevent rate limit
          } catch (e) {
            console.error(`[❌ ERROR] Failed to reject ${jid}:`, e.message);
          }
        }

        return reply(`✅ Rejected ${jids.length} join request(s):\n\n${jids.map(j => '+' + j.split('@')[0]).join("\n")}`);
      } catch (error) {
        console.error("[❌ ERROR] RejectAll failed:", error);
        return reply("❌ Failed to reject join requests.\n\nError: ```" + (error?.message || error.stack) + "```");
      }
    }
  }
];
