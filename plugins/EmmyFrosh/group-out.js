module.exports = [
  {
    command: ["out"],
    alias: ["ck", "🦶"],
    description: "Removes all members with specific country code from the group",
    category: "admin",
    filename: __filename,
    async execute(m, { ednut, from, q, isGroup, isBotAdmins, reply, groupMetadata, isOwner }) {
      const sleep = ms => new Promise(res => setTimeout(res, ms));

      try {
        // ✅ Group only
        if (!isGroup) return reply("❌ This command can only be used *in groups*.");

        // ✅ Only bot owner
        if (!isOwner) return reply("❌ Only the *bot owner* can use this command.");

        // ✅ Bot must be admin
        if (!isBotAdmins) return reply("❌ I need to be an *admin* to use this command.");

        // ✅ Require a code
        if (!q) return reply("❌ Please provide a country code. Example: .out 234");

        const countryCode = q.trim();
        if (!/^\d+$/.test(countryCode)) {
          return reply("❌ Invalid country code. Please provide only numbers (e.g., 234 for +234 numbers).");
        }

        // ✅ Get participants
        const participants = groupMetadata?.participants || [];
        if (!participants.length) return reply("❌ Couldn't fetch group participants.");

        // ✅ Find target members
        const targets = participants.filter(p =>
          (p.jid || p.id)?.split("@")[0].startsWith(countryCode) && !p.admin
        );

        if (!targets.length) {
          return reply(`❌ No members found with country code +${countryCode}`);
        }

        // ✅ Remove targets safely
        for (const target of targets) {
          await ednut.groupParticipantsUpdate(from, [target.jid || target.id], "remove");
          await sleep(1500);
        }

        reply(`✅ Successfully removed ${targets.length} member(s) with country code +${countryCode}`);
      } catch (error) {
        console.error("Out command error:", error);
        reply("❌ Failed to remove members. Error: " + error.message);
      }
    }
  }
];