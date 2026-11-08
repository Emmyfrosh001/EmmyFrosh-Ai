
const chalk = require('chalk');

async function LoadDataBase(conn, m) {
  try {
    if (!m?.sender) return;

    global.db ??= {};
    global.db.settings ??= {};
    global.db.groups ??= {};
    global.db.database ??= {};
    global.db.sticker ??= {};
    global.db.warns ??= {};
    global.db.plugins ??= {};
    global.db.setsudo ??= [];
    global.db.disabled ??= [];
    global.db.ban ??= [];
    global.db.gcban ??= [];
    global.db.reconnect ??= 0;
    global.db.loadedPlugins ??= false;

    // ✅ Default settings only once
    const defaults = {
      settings: {
        anticall: false,
        available: false,
        autoread: false,
        autorecording: false,
        autotyping: false,
        unavailable: false,
        readsw: false,
        mode: false,
        send: false

      },
      group: {
        antilink: false,
        antilink2: false,
        welcome: false,
        goodbye: false,
        antitag: false,
        banned: false
      }
    };

    // 🧠 Initialize global.db.settings
    for (const key in defaults.settings) {
      if (!(key in global.db.settings)) {
        global.db.settings[key] = defaults.settings[key];
      }
    }

    // 🧠 Initialize global.db.groups[chat]
    if (m.isGroup) {
      if (!global.db.groups[m.chat]) global.db.groups[m.chat] = {};
      for (const key in defaults.group) {
        if (!(key in global.db.groups[m.chat])) {
          global.db.groups[m.chat][key] = defaults.group[key];
        }
      }
    }

  } catch (e) {
    global.log("ERROR", `LoadDataBase error: ${e.message || e}`);
  }
}

module.exports = { LoadDataBase };
