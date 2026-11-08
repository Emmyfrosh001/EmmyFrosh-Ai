module.exports = [
  {
    command: ["mediafire"],
    alias: ["mf"],
    description: "Download MediaFire file from a link",
    category: "Downloader",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, fetch, text, reply }) => {
      try {
        if (!text) return reply("📎 Please input a MediaFire link.");
        if (!text.startsWith("https://")) return reply("🔗 Please input a valid MediaFire link.");

        const res = await fetch(`https://archive.lick.eu.org/api/download/mediafire?url=${encodeURIComponent(text)}`);
        const json = await res.json();

        if (!json || !json.status || !json.result?.download_link) {
          return reply("❌ Failed to retrieve MediaFire content.");
        }

        const file = json.result;
        const fileName = file.title || "file";
        const mimetype = file.mime_type?.includes("/")
  ? file.mime_type
  : `application/${file.mime_type || "zip"}`;
        const caption = `*📦 MediaFire Downloader*\n\n*Title:* ${file.title}\n*Size:* ${file.size}\n*Type:* ${file.mime_type}\n*Uploaded:* ${file.upload_date}`;

        await ednut.sendMessage(m.chat, {
          document: { url: file.download_link },
          fileName,
          mimetype,
          caption: caption + `\n\n${global.footer}`
        }, { quoted: m });
      } catch (err) {
        reply("❌ Failed to download MediaFire file.");
        if (global.log) global.log("ERROR", `MediaFire Plugin: ${err.message}`);
      }
    }
  },
  {
    command: ["gitclone"],
    description: "Clone a GitHub repository from URL",
    category: "Downloader",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, args, reply }) => {
      try {
        if (!args[0]) return reply("Input a GitHub repository URL.");
        const regex = /(?:https|git)(?::\/\/|@)github\.com[\/:]([^\/:]+)\/(.+)/i;
        if (!regex.test(args[0])) return reply("Invalid GitHub URL.");

        const fetch = require("node-fetch");

        let [, user, repo] = args[0].match(regex);
        repo = repo.replace(/.git$/, "");
        let url = `https://api.github.com/repos/${user}/${repo}/zipball`;

        let head = await fetch(url, { method: "HEAD" });
        if (!head.ok) throw "Repository not found or inaccessible";

        let filenameMatch = head.headers.get("content-disposition")?.match(/attachment; filename=(.*)/);
        if (!filenameMatch) throw "Could not determine filename";
        let filename = filenameMatch[1];

        await ednut.sendMessage(
          m.chat,
          {
            document: { url },
            mimetype: "application/zip",
            fileName: filename
          },
          { quoted: m }
        );
      } catch (error) {
        global.log("ERROR", `gitclone command failed: ${error.message || error}`);
        reply("Failed to clone GitHub repository.");
      }
    }
  }
];