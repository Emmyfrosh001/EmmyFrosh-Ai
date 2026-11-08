const fetch = require('node-fetch');

module.exports = [
  {
    command: ["ttsearch"],
    alias: ["tiktoksearch"],
    description: "Search or download TikTok video",
    category: "Downloader",
    use: "<query or TikTok link>",
    filename: __filename,
    ban: true,
    gcban: true,
    execute: async (m, { ednut, q, reply }) => {
      const from = m.chat;

      if (!q) return reply("❌ Please provide a keyword or TikTok link.\nExample: .ttsearch black clover OR .ttsearch https://vm.tiktok.com/ZSSt82qWA/");

      try {
        const api = `https://delirius-apiofc.vercel.app/search/tiktoksearch?query=${encodeURIComponent(q)}`;
        const res = await fetch(api);
        const json = await res.json();

        if (!json.meta || !json.meta.length) {
          return reply("⚠️ No TikTok videos found.");
        }

        const video = json.meta[0]; // first result

        const caption = `
🎬 *${video.title || "No Title"}*
👤 Author: @${video.author.username} (${video.author.nickname})
🎵 Music: ${video.music.title} - ${video.music.author}
❤️ Likes: ${video.like}
▶️ Views: ${video.play}
💬 Comments: ${video.coment}
🔗 ${video.url}

*Ozeba-Xd*
        `.trim();

        await ednut.sendMessage(from, {
          video: { url: video.hd },
          caption,
          mimetype: "video/mp4"
        }, { quoted: m });

      } catch (err) {
        console.error("TikTok API error:", err);
        reply("❌ Failed to fetch TikTok video. Try again later.");
      }
    }
  }
];