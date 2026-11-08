module.exports = [
  {
    command: ["leave"],
    alias: ["left", "leftgc", "leavegc"],
    description: "Leave the group",
    category: "Owner",
    filename: __filename,
    async execute(m, { ednut, from, isGroup, isOwner, reply }) {
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

      try {
        // ✅ Must be in group
        if (!isGroup) return reply("❌ This command can only be used *in groups*.");

        // ✅ Only owner can use
        if (!isOwner) return reply("❌ Only the *bot owner* can use this command.");

        // ✅ Bot number reference
        const botNumber = await ednut.decodeJid(ednut.user.id);

        await reply("👋 Leaving group...");

        // wait a bit
        await sleep(1500);

        // ✅ Leave group safely
        await ednut.groupLeave(from).catch(e => {
          if (
            e.message === "item-not-found" ||
            e.message === "forbidden" ||
            e.data === 403 ||
            e.data === 404
          ) {
            return;
          }
          console.error("Leave error:", e);
          throw e;
        });
      } catch (e) {
        console.error("Leave error:", e);
        reply(`❌ Error: ${e.message}`);
      }
    }
  }
];