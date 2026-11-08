module.exports = [
  {
    command: ["pfilter"],
    alias: ["addpfilter"],
    description: "Add a private chat filter",
    category: "Wa",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { ednut, text, isOwner, example, LoadDataBase, isGroup }) => {
      const args = text.split('"');
      if (args.length < 4) return m.reply(example('"trigger" "response"'));
      const trigger = args[1].toLowerCase();
      const response = args[3];
      if (!global.db.pfilters) global.db.pfilters = {};
      global.db.pfilters[trigger] = response;
      m.reply(`_pFilter added: ${trigger} -> ${response}_`);
    }
  },
  {
    command: ["listpfilter"],
    alias: ["pfilters"],
    description: "List all private chat filters",
    category: "Wa",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { ednut, isOwner, example, LoadDataBase, isGroup}) => {
      if (!global.db.pfilters || !Object.keys(global.db.pfilters).length) return m.reply('No filters set');
      const filters = Object.keys(global.db.pfilters).map((trigger) => `${trigger} -> ${global.db.pfilters[trigger]}`).join('\n');
      m.reply(`_pFilters_:\n${filters}`);
    }
  },
  {
    command: ["delpfilter"],
    alias: ["removepfilter", "deletepfilter"],
    description: "Delete a private chat filter",
    category: "Wa",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { ednut, text, isOwner, example, LoadDataBase, isGroup }) => {
      const args = text.split('"');
      if (args.length < 2) return m.reply(example('"trigger"'));
      const trigger = args[1].toLowerCase();
      if (!global.db.pfilters || !global.db.pfilters[trigger]) return m.reply('_pFilter not found_');
      delete global.db.pfilters[trigger];
      m.reply(`_pFilter removed: ${trigger}_`);
    }
  }
]