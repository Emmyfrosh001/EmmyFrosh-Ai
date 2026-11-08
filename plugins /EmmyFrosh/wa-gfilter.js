module.exports = [
  {
    command: ["gfilter"],
    alias: ["addgfilter"],
    description: "Add a global filter",
    category: "Wa",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { ednut, text, isOwner, example, LoadDataBase, isGroup }) => {
      const args = text.split('"');
      if (args.length < 4) return m.reply(example('"trigger" "response"'));
      const trigger = args[1].toLowerCase();
      const response = args[3];
      if (!global.db.gfilters) global.db.gfilters = {};
      global.db.gfilters[trigger] = response;
      m.reply(`_Gfilter added: ${trigger} -> ${response}_`);
    }
  },
  {
    command: ["listgfilter"],
    alias: ["gfilters"],
    description: "List all global filters",
    category: "Wa",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { ednut, text, isOwner, example, LoadDataBase, isGroup }) => {
      if (!global.db.gfilters || !Object.keys(global.db.gfilters).length) return m.reply('_No gfilters set_');
      const filters = Object.keys(global.db.gfilters).map((trigger) => `${trigger} -> ${global.db.gfilters[trigger]}`).join('\n');
      m.reply(`_Gfilters_:\n${filters}`);
    }
  },
  {
    command: ["delgfilter"],
    alias: ["removegfilter", "deletegfilter"],
    description: "Delete a global filter",
    category: "Wa",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { ednut, text, isOwner, example, LoadDataBase, isGroup }) => {
      const args = text.split('"');
      if (args.length < 2) return m.reply(example('"trigger"'));
      const trigger = args[1].toLowerCase();
      if (!global.db.gfilters || !global.db.gfilters[trigger]) return m.reply('_Gfilter not found_');
      delete global.db.gfilters[trigger];
      m.reply(`_Gfilter removed: ${trigger}_`);
    }
  }
]