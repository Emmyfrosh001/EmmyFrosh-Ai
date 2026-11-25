const axios = require('axios');
const fs = require('fs');
const path = require("path");
const AdmZip = require("adm-zip");

// The commit hash is kept in a tiny JSON file instead of SQLite. The sqlite3
// native module has no compiled binding for this host's Node version, which
// crashed the command before it could reply. A .json file is also never
// overwritten by updates (copyFolderSync skips *.json), so it persists.
const HASH_FILE = path.join(__dirname, 'update_hash.json');

// Returns the saved commit hash, or null if no baseline has ever been set
// (fresh deploy, or an older deploy from before this file existed).
function getCommitHash() {
  try {
    const saved = JSON.parse(fs.readFileSync(HASH_FILE, 'utf8')).commitHash;
    return saved || null;
  } catch {
    return null;
  }
}

function setCommitHash(hash) {
  fs.writeFileSync(HASH_FILE, JSON.stringify({ commitHash: hash }, null, 2));
}

module.exports = {
  command: "update",
  alias: ["upgrade", "sync"],
  description: "Check for an update, or apply it with '.update now'.",
  category: "Owner",
  filename: __filename,

  async execute(m, { ednut, args, reply, isOwner }) {
    if (!isOwner) return reply("*📛 This command is restricted to owners only.*");

    const react = (emoji) =>
      ednut.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {});
    const clearReaction = () => react(""); // empty text removes the reaction

    // Always send a visible message; fall back to sendMessage if reply fails.
    const say = async (text) => {
      try {
        return await reply(text);
      } catch (e) {
        console.error("reply failed, falling back to sendMessage:", e);
        return ednut.sendMessage(m.chat, { text }, { quoted: m });
      }
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // "now" is required to actually apply an update. Plain ".update" only
    // checks and reports — it never downloads or restarts anything.
    const shouldApply = (args[0] || "").toLowerCase() === "now";

    try {
      await react("🔎");

      const { data: commitData } = await axios.get(
        "https://api.github.com/repos/Emmyfrosh001/EmmyFrosh-Ai/commits/main",
        { headers: { "User-Agent": "EmmyFrosh-Ai-Updater" }, timeout: 20000 }
      );

      const currentHash = getCommitHash();
      const newHash = commitData.sha;

      // ✅ FIX: no baseline yet (fresh/older deploy with no update_hash.json).
      // Previously this fell back to the string "unknown", which could never
      // equal a real commit SHA, so the very first .update after any deploy
      // ALWAYS reported "Update Available" — even when the running code was
      // already current. There's no reliable way to compare what's actually
      // running against GitHub without a baseline, so instead of guessing
      // "out of date" we adopt GitHub's current commit AS the baseline and
      // report up to date. This also means plain ".update" never silently
      // downloads/overwrites anything — only ".update now" ever does that.
      if (!currentHash) {
        setCommitHash(newHash);
        await clearReaction();
        return await say("✔️ *Bot is up to date!* (baseline saved)");
      }

      const commitAuthor = commitData.commit?.author?.name || "unknown";
      const commitDateObj = commitData.commit?.author?.date ? new Date(commitData.commit.author.date) : null;
      const commitDateStr = commitDateObj
        ? commitDateObj.toLocaleDateString("en-GB", { timeZone: "Africa/Lagos" })
        : "unknown";
      const commitTimeStr = commitDateObj
        ? commitDateObj.toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour12: false })
        : "unknown";

      if (currentHash === newHash) {
        await clearReaction();
        return await say("✔️ *Bot is up to date!*");
      }

      // There IS an update.
      const updateCard =
`*⬆️ 卄 Update Available 卄 ⬆️*

👤 Developer: ${commitAuthor}
🗓️ Date: ${commitDateStr}
🕒 Time: ${commitTimeStr}

⚡ New updates are available!

📥 To install: *.update now*
━━━━━━━━━━━━━━━━━━━━`;

      if (!shouldApply) {
        await clearReaction();
        return await say(updateCard);
      }

      // shouldApply === true: download, extract, copy, restart.
      await react("⬇️");

      // Zip and temp paths go in the project root (two directories up)
      const projectRoot = path.resolve(__dirname, '..', '..');
      const zipPath = path.join(projectRoot, "update_temp.zip");
      const tempUpdatePath = path.join(projectRoot, 'temp_update');

      const zipRes = await axios.get(
        "https://github.com/Emmyfrosh001/EmmyFrosh-Ai/archive/main.zip",
        { responseType: "arraybuffer", timeout: 120000, headers: { "User-Agent": "EmmyFrosh-Ai-Updater" } }
      );
      fs.writeFileSync(zipPath, zipRes.data);

      new AdmZip(zipPath).extractAllTo(tempUpdatePath, true);

      // GitHub names the extracted folder after the repo's actual casing
      // (e.g. "EmmyFrosh-Ai-main"), so detect it instead of hardcoding.
      const extractedFolder = fs
        .readdirSync(tempUpdatePath, { withFileTypes: true })
        .find(e => e.isDirectory());

      if (!extractedFolder) {
        throw new Error("Update archive did not contain the expected folder.");
      }

      copyFolderSync(path.join(tempUpdatePath, extractedFolder.name), projectRoot);

      setCommitHash(newHash);

      fs.unlinkSync(zipPath);
      fs.rmSync(tempUpdatePath, { recursive: true, force: true });

      await clearReaction();
      await say("✅ *Updated! Restarting now...*");
      await sleep(1000);
      process.exit(42); // MANUAL_RESTART_CODE — tells index.js this restart was intentional

    } catch (error) {
      console.error("Update error:", error);
      await clearReaction();
      await say(`❌ *Update failed*\n\n_${error.message}_`);
    }
  }
};

function copyFolderSync(source, target) {
  if (!fs.existsSync(source)) return;
  fs.existsSync(target) || fs.mkdirSync(target, { recursive: true });

  fs.readdirSync(source).forEach(item => {
    const src = path.join(source, item);
    const dest = path.join(target, item);

    const skipFiles = ['config.js', 'app.json', '.env'];
    const isJsonFile = item.endsWith('.json');

    if (skipFiles.includes(item) || isJsonFile) return;

    fs.lstatSync(src).isDirectory()
      ? copyFolderSync(src, dest)
      : fs.copyFileSync(src, dest);
  });
}
