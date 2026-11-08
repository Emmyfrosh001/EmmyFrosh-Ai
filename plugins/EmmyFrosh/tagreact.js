// ==========================================
// TAG REACTION COMMANDS  (owner and moderators only)
//
//   tagreact on                 switch YOUR tag reaction on
//   tagreact off                switch it off (your emoji is kept)
//   tagreact 🔥                 set your emoji (and switch it on)
//   tagreact                    show your status
//   settagemoji 🔥              same as: tagreact 🔥
//   settagname emmyfrosh        add a name/username to watch for
//   settagname list             show your names
//   settagname remove <name>    remove one name
//   settagname clear            remove all your names
//
// The reacting itself is done by emmyfrosh.js (tagReact).
// ==========================================
const core = require("./emmyfrosh");

const NOT_STAFF = "Only the owner and moderators can use this.";

module.exports = [
  {
    command: ["tagreact"],
    alias: ["tagreaction"],
    description: "Turn your tag reaction on or off, or set its emoji",
    category: "group",
    use: "tagreact on  |  tagreact off  |  tagreact 🔥  |  tagreact",
    owner: true,
    execute: async (m, { tagSelfKey, text, q, pushname }) => {
      if (!tagSelfKey) return m.reply(NOT_STAFF);
      const arg = typeof text === "string" ? text : Array.isArray(q) ? q.join(" ") : String(q || "");
      return m.reply(core.handleEmoji(tagSelfKey, arg, m.pushName || pushname));
    }
  },
  {
    command: ["settagemoji"],
    alias: ["tagemoji"],
    description: "Set the emoji the bot reacts with when someone tags you",
    category: "group",
    use: "settagemoji 🔥  |  settagemoji off",
    owner: true, // owner + moderators (same rule as your other owner commands)
    execute: async (m, { tagSelfKey, text, q, pushname }) => {
      if (!tagSelfKey) return m.reply(NOT_STAFF);
      const arg = typeof text === "string" ? text : Array.isArray(q) ? q.join(" ") : String(q || "");
      return m.reply(core.handleEmoji(tagSelfKey, arg, m.pushName || pushname));
    }
  },
  {
    command: ["settagname"],
    alias: ["tagname"],
    description: "Add or remove the names that make the bot react to you",
    category: "group",
    use: "settagname <name>  |  settagname list  |  settagname remove <name>  |  settagname clear",
    owner: true,
    execute: async (m, { tagSelfKey, text, q }) => {
      if (!tagSelfKey) return m.reply(NOT_STAFF);
      const arg = typeof text === "string" ? text : Array.isArray(q) ? q.join(" ") : String(q || "");
      return m.reply(core.handleName(tagSelfKey, arg));
    }
  }
];