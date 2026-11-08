module.exports = [
  {
    command: ["autoreply"],
    alias: ["dmreply", "autorespond"],
    description: "Control automatic replies to DMs",
    category: "Owner",
    async execute(m, { text, isOwner, reply }) {
      try {
        if (!isOwner) return reply("🔴 This command is restricted to owners only.");

        if (!global.db.settings.autoreply) {
          global.db.settings.autoreply = { enabled: false, message: "" };
        }

        const args = text?.trim();
        if (!args) {
          return reply(
            "Usage:\n" +
            ".autoreply on\n" +
            ".autoreply off\n" +
            ".autoreply set <your message>\n\n" +
            `Current status: ${global.db.settings.autoreply.enabled ? "🟢 ON" : "🔴 OFF"}\n` +
            `Current message: ${global.db.settings.autoreply.message || "_(none set)_"}`
          );
        }

        const [action, ...rest] = args.split(" ");
        const value = rest.join(" ").trim();

        if (action.toLowerCase() === "on") {
          if (!global.db.settings.autoreply.message) {
            return reply("⚠️ Set a message first: .autoreply set <your message>");
          }
          if (global.db.settings.autoreply.enabled) return reply("_AutoReply is already enabled._");
          global.db.settings.autoreply.enabled = true;
          return reply("_🟢 AutoReply has been enabled. DMs will now get an automatic reply._");
        }

        if (action.toLowerCase() === "off") {
          if (!global.db.settings.autoreply.enabled) return reply("_AutoReply is already turned off._");
          global.db.settings.autoreply.enabled = false;
          return reply("_🔴 AutoReply has been disabled._");
        }

        if (action.toLowerCase() === "set") {
          if (!value) return reply("Usage: .autoreply set <your message>");
          global.db.settings.autoreply.message = value;
          return reply(`_✅ AutoReply message set to:_\n\n${value}`);
        }

        return reply("Invalid action. Use: on / off / set <message>");
      } catch (e) {
        console.error("Error in autoreply command:", e);
        return reply("🔴 An error occurred while processing your command.");
      }
    },
  },
];