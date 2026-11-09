const axios = require('axios');
const fs = require('fs');
const path = require("path");
const AdmZip = require("adm-zip");
const { Sequelize, DataTypes } = require('sequelize');

module.exports = {
  command: "update",
  alias: ["upgrade", "sync"],
  description: "Check for an update, or apply it with '.update now'.",
  category: "Owner",
  filename: __filename,

  async execute(m, { ednut, args, reply, isOwner }) {
    if (!isOwner) return reply("*📛 This command is restricted to owners only.*");

    const react = (emoji) => ednut.sendMessage(m.chat, { react: { text: emoji, key: m.key } });
    const clearReaction = () => react(""); // empty text removes the reaction

    await react("🔎");

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // "now" is required to actually apply an update. Plain ".update" only
    // checks and reports — it never downloads or restarts anything.
    const shouldApply = (args[0] || "").toLowerCase() === "now";

    // Initialize SQLite DB for commit hash
    const DATABASE = new Sequelize({
      dialect: 'sqlite',
      storage: path.join(__dirname, 'update.db'),
      logging: false
    });

    const UpdateDB = DATABASE.define('UpdateInfo', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: false, defaultValue: 1 },
      commitHash: { type: DataTypes.STRING, allowNull: false },
    }, { tableName: 'update_info', timestamps: false });

    await UpdateDB.sync();

    async function getCommitHash() {
      const record = await UpdateDB.findByPk(1);
      return record ? record.commitHash : 'unknown';
    }

    async function setCommitHash(hash) {
      let record = await UpdateDB.findByPk(1);
      if (!record) record = await UpdateDB.create({ id: 1, commitHash: hash });
      else record.commitHash = hash;
      await record.save();
    }

    try {
      const { data: commitData } = await axios.get(
        "https://api.github.com/repos/Emmyfrosh001/EmmyFrosh-Ai/commits/main"
      );

      const currentHash = await getCommitHash();
      const newHash = commitData.sha;
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
        return reply("✔️ *Bot is up to date!*");
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
        // Report-only path: tell them what's new, but stop here.
        await clearReaction();
        return reply(updateCard);
      }

      // shouldApply === true: skip the "Update Available" card (they
      // already know — that's why they typed "now") and go straight
      // into download, extract, copy, restart.
      await clearReaction();

      // Set zip and temp paths to one directory up (project root)
      const projectRoot = path.resolve(__dirname, '..', '..');
      const zipPath = path.join(projectRoot, "update_temp.zip");
      const tempUpdatePath = path.join(projectRoot, 'temp_update');

      fs.writeFileSync(
        zipPath,
        (await axios.get("https://github.com/Emmyfrosh001/EmmyFrosh-Ai/archive/main.zip", {
          responseType: "arraybuffer"
        })).data
      );

      new AdmZip(zipPath).extractAllTo(tempUpdatePath, true);

      // GitHub names the extracted folder after the repo's *actual* casing
      // (e.g. "EmmyFrosh-Ai-main"), not a guessed/hardcoded name. Detect it
      // instead of assuming — a hardcoded name that doesn't match silently
      // skips the whole copy (copyFolderSync just returns if the source
      // folder isn't found), so ".update now" would report success and
      // restart without actually changing a single file.
      const extractedEntries = fs.readdirSync(tempUpdatePath, { withFileTypes: true });
      const extractedFolder = extractedEntries.find(e => e.isDirectory());

      if (!extractedFolder) {
        throw new Error("Update archive did not contain the expected folder.");
      }

      copyFolderSync(
        path.join(tempUpdatePath, extractedFolder.name),
        projectRoot
      );

      await setCommitHash(newHash);

      fs.unlinkSync(zipPath);
      fs.rmSync(tempUpdatePath, { recursive: true });

      await reply("✅ *Updated! Restarting now...*");
      await sleep(1000);
      process.exit(42); // MANUAL_RESTART_CODE — tells index.js this restart was intentional

    } catch (error) {
      console.error("Update error:", error);
      await clearReaction();
      reply(`❌ *Update failed*\n\n_${error.message}_`);
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
