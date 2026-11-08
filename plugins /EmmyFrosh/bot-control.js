module.exports = [
  {
    command: ["antidelete"],
    alias: ["delete", "anti-delete"],
    description: "Enable or disable message deletion protection",
    category: "Settings",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { args, isOwner, msg, isGroup, reply }) => {
      const input = args[0]?.toLowerCase();
      const isEnabled = global.db.settings.antidelete ?? false;

      if (input === "on") {
        if (isEnabled) return reply("_Antidelete is already enabled._");
        global.db.settings.antidelete = true;
        return reply("_Antidelete has been enabled._");
      }

      if (input === "off") {
        if (!isEnabled) return reply("_Antidelete is already disabled._");
        global.db.settings.antidelete = false;
        return reply("_Antidelete has been disabled._");
      }

      return reply("Usage: antidelete on/off");
    }
  },

{
    command: ["anticall"],
    alias: ["call", "anti-delete"],
    description: "Control how the bot handles incoming calls",
    category: "Settings",
    ban: true,
    gcban: true,
    async execute(m, { text, isOwner, reply }) {
      try {
        if (!isOwner) return reply("🔴 This command is restricted to owners only.");

        const action = text?.toLowerCase()?.trim();
        if (!action) return reply("Usage: .anticall <reject/block/off>");

        const { anticall, anticall2 } = global.db.settings;

        if (action === "reject") {
          if (anticall) return reply("_Call rejection is already enabled._");
          global.db.settings.anticall = true;
          global.db.settings.anticall2 = false;
          return reply("_🟢 Call rejection has been enabled._");
        }

        if (action === "block") {
          if (anticall2) return reply("_Call blocking is already enabled._");
          global.db.settings.anticall2 = true;
          global.db.settings.anticall = false;
          return reply("_🟢 Call blocking has been enabled._");
        }

        if (action === "off") {
          if (!anticall && !anticall2) return reply("_Anticall is already turned off._");
          global.db.settings.anticall = false;
          global.db.settings.anticall2 = false;
          return reply("_🔴 Anticall has been turned off._");
        }

        return reply("Invalid action. Use: reject, block, or off.");
      } catch (e) {
        console.error("Error in anticall command:", e);
        return reply("🔴 An error occurred while processing your command.");
      }
    },
  }
];