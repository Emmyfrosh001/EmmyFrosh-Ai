const protectedCommands = ["disable", "enable", "listdisabled", "menu"];

function loadDisabled() {
  return Array.isArray(global.db?.disabled) ? global.db.disabled : [];
}

function saveDisabled(data) {
  if (global.db) global.db.disabled = data;
}

module.exports = [
  {
    command: ["disable"],
    description: "Disable a command (by name or alias)",
    category: "External",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { args, allCommands, reply }) => {
      const cmd = args[0]?.toLowerCase();
      if (!cmd) return reply("Please specify a command to disable.");

      if (protectedCommands.includes(cmd)) {
        return reply(`The *${cmd}* command is protected and cannot be disabled.`);
      }

      const commandList = allCommands.flatMap(c =>
        Array.isArray(c.command) ? c.command : [c.command]
      ).concat(
        allCommands.flatMap(c =>
          Array.isArray(c.alias) ? c.alias : (c.alias ? [c.alias] : [])
        )
      ).map(c => c.toLowerCase());

      if (!commandList.includes(cmd)) {
        return reply(`Command *${cmd}* not found in the command list.`);
      }

      const disabled = loadDisabled();
      if (disabled.includes(cmd)) {
        return reply(`Command *${cmd}* is already disabled.`);
      }

      disabled.push(cmd);
      saveDisabled(disabled);
      reply(`Command *${cmd}* has been disabled.`);
    }
  },
  {
    command: ["enable"],
    description: "Enable a previously disabled command",
    category: "External",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { args, reply }) => {
      const cmd = args[0]?.toLowerCase();
      if (!cmd) return reply("Please specify a command to enable.");

      let disabled = loadDisabled();
      if (!disabled.includes(cmd)) {
        return reply(`Command *${cmd}* is not currently disabled.`);
      }

      disabled = disabled.filter(c => c !== cmd);
      saveDisabled(disabled);
      reply(`Command *${cmd}* has been enabled.`);
    }
  },
  {
    command: ["listdisabled"],
    description: "List all disabled commands",
    category: "External",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m) => {
      const disabled = loadDisabled();
      if (disabled.length === 0) {
        return m.reply("No commands are currently disabled.");
      }
      m.reply("*Disabled commands:*\n" + disabled.map(cmd => `- ${cmd}`).join("\n"));
    }
  }
];