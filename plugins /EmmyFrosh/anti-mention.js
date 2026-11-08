module.exports = [
  {
    command: ["anti-tag"],
    alias: ["antitag", "antimention"],
    description: "Manage anti-mention feature in a group (kick, delete, warn, off)",
    category: "Group",
    owner: false,
    group: true,
    botadmin: true,
    admin: true,
    ban: true,
    gcban: true,
    async execute(m, { ednut, from, isGroup, groupMetadata, groupAdmins, isBotAdmins, reply, sender, text, example }) {
      try {
        if (!isGroup) return reply("🔴 This command can only be used in groups.");
        if (!isBotAdmins) return reply("🔴 I need to be an admin to execute this command.");

        if (!text) return reply(example("<kick/delete/warn/off>"));

        const action = text.trim().toLowerCase();
        const groupData = global.db.groups[from] || (global.db.groups[from] = {});

        switch (action) {
          case "kick":
            if (groupData.antimention) return reply("Already activated in this group");
            groupData.antimention = true;
            groupData.antimention2 = false;
            groupData.antimention3 = false;
            await reply("🟢 Successfully activated anti-mention to *kick* offenders.");
            break;

          case "delete":
            if (groupData.antimention2) return reply("Already activated in this group");
            groupData.antimention2 = true;
            groupData.antimention = false;
            groupData.antimention3 = false;
            await reply("🟢 Successfully activated anti-mention to *delete* messages.");
            break;

          case "warn":
            if (groupData.antimention3) return reply("Already activated in this group");
            groupData.antimention3 = true;
            groupData.antimention = false;
            groupData.antimention2 = false;
            await reply("🟢 Successfully activated anti-mention to *warn + delete* offenders.");
            break;

          case "off":
            groupData.antimention = false;
            groupData.antimention2 = false;
            groupData.antimention3 = false;
            await reply("🟢 Successfully deactivated anti-mention feature.");
            break;

          default:
            reply("🔴 Invalid action. Use: kick / delete / warn / off.");
        }
      } catch (e) {
        console.error("Anti-tag command error:", e);
        reply("🔴 An error occurred while executing the command.");
      }
    }
  },
];
