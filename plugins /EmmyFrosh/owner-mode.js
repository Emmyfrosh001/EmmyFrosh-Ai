module.exports = [
  {
    command: ["mode"],
    description: "Change bot mode: public/private",
    category: "Owner",
    owner: true,

    execute: async (m, { prefix, isOwner, isModerator, isHighStaff }) => {
      // Only strict owner or mod can use this — no sudo
      if (!isHighStaff)
        return m.reply("⛔ Only *Owner* or *Mod* can change the bot mode.");

      const option = m.text.trim().split(/\s+/)[1]?.toLowerCase();
      if (!option)
        return m.reply(`❓ *Usage:* ${prefix}mode public/private`);

      if (!global.db.settings) global.db.settings = {};

      switch (option) {
        case "public":
          if (!global.db.settings.mode)
            return m.reply("_Bot mode is already Public!_");
          global.db.settings.mode = false;
          return m.reply("✅ _Bot mode changed to *Public*!_");

        case "private":
          if (global.db.settings.mode)
            return m.reply("_Bot mode is already Private!_");
          global.db.settings.mode = true;
          return m.reply("🔒 _Bot mode changed to *Private*!_");

        default:
          return m.reply("❌ Invalid option! Use: *public* or *private*");
      }
    },
  },

  {
    command: ["autoreact"],
    alias: ["areact"],
    description: "Auto react mode: cmd/all/off",
    category: "Owner",
    owner: true,

    execute: async (m, { prefix, isHighStaff }) => {
      // Only strict owner or mod can use this — no sudo
      if (!isHighStaff)
        return m.reply("⛔ Only *Owner* or *Mod* can use this cmd.");

      const action = m.text.trim().split(/\s+/)[1]?.toLowerCase();
      if (!action)
        return m.reply(`❓ *Usage:* ${prefix}autoreact all/cmd/off`);

      if (!global.db.settings) global.db.settings = {};

      switch (action) {
        case "cmd":
          if (global.db.settings.areact)
            return m.reply("Auto react for bot commands is already enabled.");
          global.db.settings.areact  = true;
          global.db.settings.areact2 = false;
          return m.reply("✅ Auto react to *bot commands* enabled.");

        case "all":
          if (global.db.settings.areact2)
            return m.reply("Auto react for all messages is already enabled.");
          global.db.settings.areact2 = true;
          global.db.settings.areact  = false;
          return m.reply("✅ Auto react to *all messages* enabled.");

        case "off":
          global.db.settings.areact  = false;
          global.db.settings.areact2 = false;
          return m.reply("❌ Auto react *disabled*.");

        default:
          return m.reply("❌ Invalid option! Use: *all*, *cmd*, or *off*");
      }
    },
  },
];