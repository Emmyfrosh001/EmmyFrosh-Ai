const fetch = require("node-fetch");
const fs = require("fs");
const { writeFileSync, unlinkSync } = require("fs");
const { join } = require("path");
const sharp = require("sharp");

// ─────────────────────────────────────────────
// 🧠 AI INTENT ENGINE
// ─────────────────────────────────────────────
const normalize = (t) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const intentMap = [
  { keywords: ["free fire max", "ff max"], query: "free fire max" },
  { keywords: ["codm", "call of duty"], query: "call of duty mobile" },
  { keywords: ["pubg", "bgmi"], query: "pubg mobile" },
  { keywords: ["car race", "racing game", "drift car"], query: "asphalt 9" },
  { keywords: ["gta", "open world"], query: "gta san andreas" }
];

const detectIntent = (text) => {
  const clean = normalize(text);
  for (const item of intentMap) {
    if (item.keywords.some(k => clean.includes(k))) return item.query;
  }
  return text;
};

// ─────────────────────────────────────────────
// 📁 TMP DIR HELPER
// ✅ FIX: previously only checked fs.existsSync(tmpDir) before deciding
// whether to mkdir — but a stray FILE at that path also satisfies
// existsSync, so it would skip creating the real directory and then
// fail with ENOTDIR when trying to write a file "inside" it. This now
// verifies it's actually a directory, and replaces it if it's not.
// ─────────────────────────────────────────────
function ensureDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      fs.unlinkSync(dirPath); // remove the stray file occupying this path
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } else {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ─────────────────────────────────────────────
// 🌐 SEARCH ENGINE (APTOIDE)
// ─────────────────────────────────────────────
const searchAPK = async (text) => {
  try {
    const res = await fetch(
      `https://ws75.aptoide.com/api/7/apps/search?query=${encodeURIComponent(text)}&limit=10`
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (
      json?.datalist?.list?.map(v => ({
        name: v.name,
        id: v.package,
        size: v.size,
        icon: v.icon,
        dev: v.store?.name || "Unknown"
      })) || []
    );
  } catch {
    return [];
  }
};

// ─────────────────────────────────────────────
// ⬇️ DOWNLOAD ENGINE
// ─────────────────────────────────────────────
const downloadFile = async (url) => {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 60000
  });
  if (!res.ok) throw new Error("Download failed");
  return Buffer.from(await res.arrayBuffer());
};

// ─────────────────────────────────────────────
// 🚀 PLUGIN
// ─────────────────────────────────────────────
module.exports = [
  {
    command: ["apk"],
    category: "Downloader",
    async execute(m, { ednut, text, reply }) {
      ednut.apk = ednut.apk || {};
      const pfx = global.prefix || ".";

      if (!text) {
        return reply(`Usage:\n${pfx}apk free fire max`);
      }

      // ───────── NUMBER SELECT ─────────
      const index = Number(text.trim());
      if (!isNaN(index) && ednut.apk[m.sender]) {
        const session = ednut.apk[m.sender];
        const i = index - 1;
        if (!session.data?.[i]) return reply("❌ Invalid selection");
        if (session.download) return reply("⏳ Download in progress...");

        let filePath = "";
        try {
          session.download = true;
          const selected = session.data[i];
          await reply(`🔍 Loading *${selected.name}*...`);

          const res = await fetch(
            `https://ws75.aptoide.com/api/7/apps/search?query=${encodeURIComponent(selected.id)}&limit=1`
          );
          const json = await res.json();
          const app = json?.datalist?.list?.[0];
          const link = app?.file?.path || app?.file?.path_alt;
          if (!link) throw new Error("No download link found");

          const dl = await downloadFile(link);

          const tmpDir = join(__dirname, "tmp");
          ensureDir(tmpDir);

          const safe = (app.name || "app").replace(/[^a-z0-9]/gi, "_");
          filePath = join(tmpDir, `${safe}_${Date.now()}.apk`);
          writeFileSync(filePath, dl);

          // ─────────────────────────────────────────────
          // 📸 HD IMAGE FIX (THIS IS THE KEY UPGRADE)
          // ─────────────────────────────────────────────
          const iconBuffer = await (await fetch(app.icon)).buffer();
          const thumbnail = await sharp(iconBuffer)
            .resize(300, 300) // HD resize
            .jpeg({ quality: 95 }) // high quality
            .toBuffer();

          // ─────────────────────────────────────────────
          // 📦 SINGLE MESSAGE OUTPUT
          // ─────────────────────────────────────────────
          const caption =
            `📱 *${app.name}*\n` +
            `📦 Size: ${(app.size / (1024 * 1024)).toFixed(2)} MB\n` +
            `🏷️ Dev: ${app.store?.name || "Unknown"}\n\n` +
            `_Download ready ✔️_`;

          await ednut.sendMessage(m.chat, {
            document: { url: filePath },
            fileName: `${app.name}.apk`,
            mimetype: "application/vnd.android.package-archive",
            // 🔥 HD IMAGE FIX HERE
            jpegThumbnail: thumbnail,
            caption
          }, { quoted: m });

          delete ednut.apk[m.sender];
        } catch (e) {
          reply(`❌ Failed:\n_${e.message}_`);
          console.error("APK Engine HD Error:", e);
        } finally {
          session.download = false;
          if (filePath && fs.existsSync(filePath)) {
            try {
              unlinkSync(filePath);
            } catch {}
          }
        }
        return;
      }

      // ───────── AI SEARCH ─────────
      const aiQuery = detectIntent(text);
      const queries = [
        text,
        aiQuery,
        text.replace(/ff max/i, "free fire max"),
        text.replace(/car race/i, "asphalt 9"),
        text.replace(/codm/i, "call of duty mobile")
      ];

      let results = [];
      for (const q of queries) {
        results = await searchAPK(q);
        if (results.length) break;
      }

      if (!results.length) return reply("❌ No apps found");

      ednut.apk[m.sender] = {
        data: results,
        download: false,
        time: setTimeout(() => {
          delete ednut.apk[m.sender];
        }, 5 * 60 * 1000)
      };

      const list = results
        .map((v, i) => {
          const size = v.size
            ? `${(v.size / (1024 * 1024)).toFixed(1)} MB`
            : "Unknown";
          return `*${i + 1}.* ${v.name}\n📦 ${size}\n📥 ${v.id}`;
        })
        .join("\n\n");

      reply(`🧠 AI Results:\n\nReply number to download:\n\n${list}`);
    }
  }
];