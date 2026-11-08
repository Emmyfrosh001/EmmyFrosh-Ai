module.exports = [
  {
    command: ["gdesc"],
    alias: ["upgdesc", "updategdescg"],
    description: "Change the group description",
    category: "Group",
    group: true,
    execute: async (m, { ednut, from, isGroup, isAdmins, isBotAdmins, q, reply }) => {
      try {
        if (!isGroup) return reply("❌ This command can only be used in groups.");
        if (!isAdmins) return reply("❌ Only group admins can use this command.");
        if (!isBotAdmins) return reply("❌ I need to be an admin to update the group description.");
        if (!q) return reply("❌ Please provide a new group description.");

        await ednut.groupUpdateDescription(from, q);
        return reply("✅ Group description has been updated.");
      } catch (e) {
        console.error("Error updating group description:", e);
        return reply("❌ Failed to update the group description. Please try again.");
      }
    }
  }
];
