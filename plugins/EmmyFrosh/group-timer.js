module.exports = [
  {
    command: ["opentime"],
    alias: ["gopen"],
    description: "Schedule group to open after specific time",
    category: "Group",
    filename: __filename,
    async execute(m, { ednut, q, from, isGroup, isOwner, isAdmins, isBotAdmins, reply }) {
      if (!isGroup) return reply("❌ This command can only be used in groups.");
      if (!isAdmins) return reply("❌ Only admins can use this command.");
      if (!isBotAdmins) return reply("❌ I need to be admin to manage group settings.");
      if (!q) return reply("⏳ Usage: .opentime 2 mins | .opentime 1 hour");

      const match = q.match(/(\d+)\s*(min|mins|minute|minutes|hour|hours)/i);
      if (!match) return reply("❌ Invalid format. Example: `.opentime 2 mins` or `.opentime 1 hour`");

      const value = parseInt(match[1]);
      const unit = match[2].toLowerCase();

      let ms = 0;
      if (unit.startsWith("min")) ms = value * 60 * 1000;
      if (unit.startsWith("hour")) ms = value * 60 * 60 * 1000;

      // 🔒 12 hours = 43,200,000 ms
      if (ms > 43200000) return reply("❌ Maximum allowed time is 12 hours.");

      reply(`✅ Group will be *opened* in ${value} ${unit}...`);

      setTimeout(async () => {
        try {
          await ednut.groupSettingUpdate(from, "not_announcement"); // open group
          await ednut.sendMessage(from, { text: "🔓 The group is now *open* for all members to chat!" });
        } catch (e) {
          console.error(e);
          reply("❌ Failed to open group.");
        }
      }, ms);
    }
  },

  {
    command: ["closetime"],
    alias: ["gclose"],
    description: "Schedule group to close after specific time",
    category: "Group",
    filename: __filename,
    async execute(m, { ednut, q, from, isGroup, isOwner, isAdmins, isBotAdmins, reply }) {
      if (!isGroup) return reply("❌ This command can only be used in groups.");
      if (!isAdmins) return reply("❌ Only admins can use this command.");
      if (!isBotAdmins) return reply("❌ I need to be admin to manage group settings.");
      if (!q) return reply("⏳ Usage: .closetime 2 mins | .closetime 1 hour");

      const match = q.match(/(\d+)\s*(min|mins|minute|minutes|hour|hours)/i);
      if (!match) return reply("❌ Invalid format. Example: `.closetime 2 mins` or `.closetime 1 hour`");

      const value = parseInt(match[1]);
      const unit = match[2].toLowerCase();

      let ms = 0;
      if (unit.startsWith("min")) ms = value * 60 * 1000;
      if (unit.startsWith("hour")) ms = value * 60 * 60 * 1000;

      // 🔒 12 hours = 43,200,000 ms
      if (ms > 43200000) return reply("❌ Maximum allowed time is 12 hours.");

      reply(`✅ Group will be *closed* in ${value} ${unit}...`);

      setTimeout(async () => {
        try {
          await ednut.groupSettingUpdate(from, "announcement"); // close group
          await ednut.sendMessage(from, { text: "🔒 The group is now *closed* (only admins can send messages)." });
        } catch (e) {
          console.error(e);
          reply("❌ Failed to close group.");
        }
      }, ms);
    }
  }
];