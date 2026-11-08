module.exports = [
  {
    command: ["list"],
    description: "List all available commands",
    category: "Info",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, commands, fontx }) => {
      let list = [];

      commands.forEach((cmd) => {
        if (cmd.command && cmd.description) {
          const mainCmd = `${global.prefix}${cmd.command[0]}`;
          const aliases = cmd.alias
            ? `(Aliases: ${cmd.alias.map(a => `${global.prefix}${a}`).join(", ")})`
            : '';

          list.push(
            `─────────────────\n` +
            `🎯 *${mainCmd.toUpperCase()}* ${aliases}\n` +
            `📂 Category: ${cmd.category}\n` +
            `📝 Description: ${cmd.description}\n` +
            (cmd.use ? `💡 Usage: ${global.prefix}${cmd.command[0]} ${cmd.use}\n` : '')
          );
        }
      });

      const text = `🛠️ *Bot Commands List* 🛠️\n\n${list.join("\n")}\n─────────────────`;
      ednut.sendMessage(m.chat, { text: fontx(text) }, { quoted: m });
    }
  },
  {
    command: ["help"],
    description: "Show info about a specific command",
    category: "Info",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, commands, fontx, text, reply }) => {
      const from = m.chat;

      // Show all commands if no specific command is requested
      if (!text || text.toLowerCase() === "menu") {
        let list = [];
        commands.forEach(cmd => {
          if (cmd.command && cmd.description) {
            const mainCmd = `${global.prefix}${cmd.command[0]}`;
            const aliases = cmd.alias
              ? `(Aliases: ${cmd.alias.map(a => `${global.prefix}${a}`).join(", ")})`
              : '';

            list.push(
              `─────────────────\n` +
              `🎯 *${mainCmd.toUpperCase()}* ${aliases}\n` +
              `📂 Category: ${cmd.category}\n` +
              `📝 Description: ${cmd.description}\n` +
              (cmd.use ? `💡 Usage: ${global.prefix}${cmd.command[0]} ${cmd.use}\n` : '')
            );
          }
        });
        const info = `🛠️ *Bot Commands List* 🛠️\n\n${list.join("\n")}\n─────────────────`;
        return ednut.sendMessage(from, { text: fontx(info) }, { quoted: m });
      }

      // Show specific command info
      const cmd = commands.find(c =>
        c.command.includes(text.toLowerCase()) ||
        (c.alias && c.alias.includes(text.toLowerCase()))
      );
      if (!cmd) return reply(`❌ Command "${text}" not found`);

      const mainCmd = `${global.prefix}${cmd.command[0]}`;
      const aliases = cmd.alias
        ? `(Aliases: ${cmd.alias.map(a => `${global.prefix}${a}`).join(", ")})`
        : '';

      const info = `─────────────────\n` +
                   `🎯 *${mainCmd.toUpperCase()}* ${aliases}\n` +
                   `📂 Category: ${cmd.category}\n` +
                   `📝 Description: ${cmd.description}\n` +
                   (cmd.use ? `💡 Usage: ${global.prefix}${cmd.command[0]} ${cmd.use}\n` : '') +
                   `─────────────────`;

      return ednut.sendMessage(from, { text: fontx(info) }, { quoted: m });
    }
  }
];