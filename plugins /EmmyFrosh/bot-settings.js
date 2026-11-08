module.exports = [
  {
    command: ["read", "recording", "typing", "online", "status"],
    description: "Change bot fake settings",
    category: "Settings",
    owner: true,

    execute: async (m, { text, command, isHighStaff, reply }) => {
      // Only bot number (owner) or mod can use this — no sudo
      if (!isHighStaff)
        return reply("⛔ Only Owner or Mod can use cmd.");

      if (!global.db.settings) global.db.settings = {};

      const settingsMap = {
        read:      { key: "autoread",      name: "Read"      },
        recording: { key: "autorecording", name: "Recording" },
        typing:    { key: "autotyping",    name: "Typing"    },
        online:    { key: "available",     name: "Online"    },
        status:    { key: "readsw",        name: "Status"    },
      };

      const setting      = settingsMap[command];
      const settingKey   = setting.key;
      const currentValue = global.db.settings[settingKey] ?? (process.env[settingKey] === "true");

      if (text === "on") {
        if (currentValue === true)
          return reply(`_${setting.name} is already ON_`);
        global.db.settings[settingKey] = true;
        return reply(`✅ _${setting.name} has been turned *ON*_`);
      }

      if (text === "off") {
        if (currentValue === false)
          return reply(`_${setting.name} is already OFF_`);
        global.db.settings[settingKey] = false;
        return reply(`❌ _${setting.name} has been turned *OFF*_`);
      }

      return reply(`_Usage: .${command} on/off_`);
    },
  },
];