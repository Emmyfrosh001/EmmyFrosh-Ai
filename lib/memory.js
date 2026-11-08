const fs = require('fs');
const path = require('path');

const trackedFiles = ['warn', 'setsudo', 'disabled', 'ban'];
const watching = new Set();

function syncJsonToMemory(database) {
  // Skip if using MongoDB or PostgreSQL
  const isDbRemote = !!process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.startsWith('mongodb') || process.env.DATABASE_URL.startsWith('postgres'));
  if (isDbRemote) return;

  for (let key of trackedFiles) {
    const filePath = path.join(__dirname, '../all/database', `${key}.json`);

    // Ensure initial fallback value
    if (!fs.existsSync(filePath)) {
      global.db[key] = Array.isArray(global.db[key]) ? [] : {};
      continue;
    }

    // Load the file content
    try {
      const data = JSON.parse(fs.readFileSync(filePath));
      global.db[key] = data;
    } catch (err) {
      global.log("ERROR", `Failed to load ${key}.json: ${err.message || err}`);
      global.db[key] = Array.isArray(global.db[key]) ? [] : {};
    }

    // Setup file watcher to auto-sync
    if (!watching.has(filePath)) {
      watching.add(filePath);
      fs.watchFile(filePath, { interval: 1000 }, () => {
        try {
          const updated = JSON.parse(fs.readFileSync(filePath));
          global.db[key] = updated;
          if (typeof database?.write === 'function') database.write(global.db);
        } catch (err) {
          global.log("ERROR", `Error watching ${key}.json: ${err.message || err}`);
        }
      });
    }
  }
}

module.exports = syncJsonToMemory;
