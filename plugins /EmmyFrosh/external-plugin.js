const fs = require("fs");
const path = require("path");
const axios = require("axios");
const DataBase = require("../../lib/database.js");

global.database = global.database || new DataBase(process.env.DATABASE_URL);

// Trusted hosts your reviewed raw plugin URLs are served from.
// Add any other domain you ever deploy the plugin hub to.
const ALLOWED_HOSTS = [
  "raw.githubusercontent.com",
  "plugin-emmyfrosh.onrender.com",
  "emmyfrosh.name.ng",
];

function isAllowedUrl(str) {
  try {
    const u = new URL(str);
    return ALLOWED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

module.exports = [
  {
    command: ["install"],
    alias: [""],
    description: "Install a plugin from a trusted raw URL — live immediately, no restart.",
    category: "owner",
    owner: true, // IMPORTANT: keep this true. This command runs arbitrary code
                 // on your server — it must stay owner-only, whether or not
                 // your dispatcher already gates on category "owner".

    execute: async (m, { text, reply }) => {
      if (!text || !isAllowedUrl(text)) {
        return reply(
          "Please provide a valid raw plugin URL from a trusted source.\n\n" +
          "Example:\naddplugin http://plugin-emmyfrosh.onrender.com/raw/<id>.js"
        );
      }

      if (!text.split("?")[0].endsWith(".js")) {
        return reply("Invalid file type. Only `.js` plugins are allowed.");
      }

      try {
        const response = await axios.get(text, { timeout: 15000 });
        const pluginCode = response.data;

        if (typeof pluginCode !== "string" || !pluginCode.trim()) {
          return reply("That URL didn't return any plugin code.");
        }

        const filename = text.split("/").pop().split("?")[0];
        const pluginDir = path.resolve(__dirname, "../../plugins/EmmyFrosh");
        if (!fs.existsSync(pluginDir)) fs.mkdirSync(pluginDir, { recursive: true });
        const pluginPath = path.join(pluginDir, filename);

        // Save to disk — this is what lets it also load on a real restart.
        fs.writeFileSync(pluginPath, pluginCode, "utf8");

        // Save to the DB too — this is what survives a redeploy where the disk
        // gets wiped (e.g. most free hosts reset the filesystem on each deploy).
        global.db.plugins = global.db.plugins || {};
        global.db.plugins[filename] = pluginCode;
        global.db.pluginUrls = global.db.pluginUrls || {};
        global.db.pluginUrls[filename] = text;
        if (typeof global.database?.write === "function") {
          await global.database.write(global.db);
        }

        // Load it fresh...
        delete require.cache[require.resolve(pluginPath)];
        let loaded;
        try {
          loaded = require(pluginPath);
        } catch (loadErr) {
          return reply(`⚠️ Plugin *${filename}* saved, but failed to parse:\n${loadErr.message}`);
        }

        const newPlugins = Array.isArray(loaded) ? loaded : [loaded];
        const invalid = newPlugins.find(p => !p || typeof p.execute !== "function" || !p.command);
        if (invalid) {
          return reply(`⚠️ Plugin *${filename}* saved, but isn't a valid plugin (missing command/execute).`);
        }
        newPlugins.forEach(p => { p.__sourceFile = filename; });

        // ...and hand it straight to the running command dispatcher. THIS is
        // the part that makes the command work with no restart.
        global.allPlugins = global.allPlugins || [];

        const newCommandNames = newPlugins.flatMap(p =>
          (Array.isArray(p.command) ? p.command : [p.command]).map(c => String(c).toLowerCase())
        );

        // Replace any earlier version of these same commands so re-installing
        // an updated plugin doesn't leave two handlers answering it.
        global.allPlugins = global.allPlugins.filter(p => {
          const existingNames = (Array.isArray(p.command) ? p.command : [p.command])
            .filter(Boolean).map(c => String(c).toLowerCase());
          return !existingNames.some(c => newCommandNames.includes(c));
        });

        global.allPlugins.push(...newPlugins);

        reply(`Plugin installed: ${newCommandNames[0]}`);
        global.log?.("INFO", `Plugin installed live: ${filename} (${newCommandNames.join(", ")})`);
      } catch (err) {
        global.log?.("ERROR", `Plugin install failed: ${err.message}`);
        reply("❌ Failed to install plugin. Check the URL and try again.");
      }
    },
  },

  {
    command: ["plugins"],
    alias: [""],
    description: "Lists plugins you've added with .addplugin",
    category: "owner",
    owner: true,

    execute: async (m, { reply }) => {
      const installed = global.db?.plugins || {};
      const filenames = Object.keys(installed);

      if (!filenames.length) {
        return reply("No plugins added yet. Use .addplugin <url> to install one.");
      }

      const urls = global.db?.pluginUrls || {};

      // Resolve command/alias names straight from the plugin file rather
      // than matching global.allPlugins by __sourceFile. That in-memory tag
      // is only set inside this file's own execute() call, so it doesn't
      // survive a process restart — even though the plugin itself is still
      // loaded and working. Reading from require.cache (or, failing that, a
      // one-off require) reflects reality regardless of how it got loaded.
      function describePlugin(filename) {
        const pluginPath = path.resolve(__dirname, "../../plugins/EmmyFrosh", filename);
        let resolvedPath;
        try {
          resolvedPath = require.resolve(pluginPath);
        } catch {
          return { names: [], isEvent: false };
        }

        let loaded;
        let hadCacheEntry = Boolean(require.cache[resolvedPath]);
        try {
          loaded = hadCacheEntry ? require.cache[resolvedPath].exports : require(pluginPath);
        } catch {
          return { names: [], isEvent: false };
        } finally {
          // If we had to require it fresh just to read its metadata, drop it
          // from the cache again so we don't leave a second, untracked copy
          // sitting alongside whatever the bot's real loader already has.
          if (!hadCacheEntry) delete require.cache[resolvedPath];
        }

        const arr = Array.isArray(loaded) ? loaded : [loaded];
        const names = [];
        let isEvent = false;
        arr.forEach(p => {
          if (!p) return;
          const cmds = Array.isArray(p.command) ? p.command : (p.command ? [p.command] : []);
          const aliases = p.alias ? (Array.isArray(p.alias) ? p.alias : [p.alias]) : [];
          names.push(...cmds, ...aliases);
          if (p.event || p.on) isEvent = true;
        });
        return { names: names.filter(Boolean), isEvent };
      }

      const lines = filenames.map((filename, i) => {
        const { names, isEvent } = describePlugin(filename);
        const nameText = names.length ? names.join("|") : "(not currently loaded)";
        const suffix = isEvent ? " (event)" : "";
        const url = urls[filename] || filename;
        // Keep the numbering/name/suffix as-is; wrap the url in a code block.
        return `${i + 1}. ${nameText}${suffix} → \`\`\`${url}\`\`\``;
      });

      reply(lines.join("\n"));
    },
  },

  {
    command: ["delplugin"],
    alias: ["deleplugin", "deleteplugin", "delplugins"],
    description: "Deletes a plugin previously added with .addplugin/.install",
    category: "owner",
    owner: true,

    execute: async (m, { text, reply }) => {
      if (!text) {
        return reply(
          "Please provide the plugin's filename or command name to delete.\n\nExample:\ndelplugin apk"
        );
      }

      const query = text.trim();

      // NOTE: `installed` is sourced ONLY from global.db.plugins — the record
      // that .addplugin/.install writes to. Any plugin that ships with the
      // bot (built-in plugins never added through .addplugin/.install) will
      // never appear here, so this command can only ever delete plugins that
      // were installed through .addplugin or .install.
      const installed = global.db?.plugins || {};
      let filename = Object.keys(installed).find(f => f === query || f === `${query}.js`);

      if (!filename) {
        const plugins = global.allPlugins || [];
        const match = plugins.find(p => {
          // __sourceFile is only ever set on plugins loaded via
          // .addplugin/.install (see above), so this lookup can't resolve to
          // a built-in plugin even when the command/alias name matches.
          if (!p.__sourceFile) return false;
          if (!installed[p.__sourceFile]) return false;

          const names = [
            ...(Array.isArray(p.command) ? p.command : [p.command]),
            ...(p.alias ? (Array.isArray(p.alias) ? p.alias : [p.alias]) : []),
          ].filter(Boolean).map(c => String(c).toLowerCase());
          return names.includes(query.toLowerCase());
        });
        if (match) filename = match.__sourceFile;
      }

      if (!filename || !installed[filename]) {
        return reply(`No installed plugin found matching "${query}".`);
      }

      // Remove from disk.
      const pluginPath = path.resolve(__dirname, "../../plugins/EmmyFrosh", filename);
      try {
        if (fs.existsSync(pluginPath)) fs.unlinkSync(pluginPath);
        delete require.cache[require.resolve(pluginPath)];
      } catch (e) {
        global.log?.("ERROR", `Failed to remove plugin file ${filename}: ${e.message}`);
      }

      // Remove from the DB so it doesn't come back on the next restart.
      delete global.db.plugins[filename];
      if (global.db.pluginUrls) delete global.db.pluginUrls[filename];
      if (typeof global.database?.write === "function") {
        await global.database.write(global.db);
      }

      // Remove from the live running dispatcher — no restart needed.
      global.allPlugins = (global.allPlugins || []).filter(p => p.__sourceFile !== filename);

      reply(`Plugin deleted: ${filename}`);
    },
  },
];