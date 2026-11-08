 module.exports = [
  {
    command: ["newgc"],
    alias: ["creategc"],
    description: "Create a new group with only the bot and the owner added.",
    category: "Group",
    group: false,
    owner: true,
    ban: true,
    gcban: true,
    async execute(m, { ednut, args, isGroup, isOwner }) {
      // Local reply function
      const reply = async (text) => {
        await ednut.sendMessage(m.chat, { text }, { quoted: m });
      };

      // Local sleep function
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      try {
        if (isGroup) return reply("🔴 This command can only be used in private chat with the bot.");
        if (!isOwner) return reply("🔴 Only the bot owner can use this command.");

        const groupName = args.join(" ").trim();
        if (!groupName) {
          return reply("⚠️ Usage: .newgc <group_name>\n🔴 Error: Group name cannot be empty.");
        }
        if (groupName.length > 25) {
          return reply("🔴 Group name too long. Use less than 25 characters.");
        }

        // Create the group with bot + owner
        const group = await ednut.groupCreate(groupName, [m.sender]);

        await sleep(3000); // give WhatsApp time to finalize

        const inviteCode = await ednut.groupInviteCode(group.id).catch((e) => {
          console.error("Error getting invite code:", e);
          return null;
        });

        reply(
          `🟢 Group created successfully!\n\n` +
          `🆔 Group name: ${groupName}\n` +
          `👑 Owner added: @${m.sender.split("@")[0]}\n` +
          (inviteCode ? `🔗 Invite link: https://chat.whatsapp.com/${inviteCode}` : "⚠️ Could not generate invite link.")
        );
      } catch (e) {
        console.error("Error in newgc:", e);
        if (e.message?.includes("Connection Closed") || e.message?.includes("Timed Out")) {
          reply("🔴 Connection error. Please try again after a few seconds.");
        } else {
          reply("🔴 Failed to create group. Please try again.");
        }
      }
    },
  },
];