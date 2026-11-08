const yts = require('youtube-yts');

module.exports = [
  {
    command: "ytsearch",
    alias: ["yts"],
    description: "Search YouTube and return the top 5 results",
    category: "Downloader",
    filename: __filename,
    async execute(m, { text, reply }) {
      try {
        if (!text) return reply("❌ Please provide a search query.\n\nExample: .ytsearch lo-fi beats");

        // Search YouTube
        const results = await yts(text);

        if (!results || !results.videos || results.videos.length === 0) {
          return reply("⚠️ No results found.");
        }

        // Take top 5 results
        const top5 = results.videos.slice(0, 5);

        // Format reply
        let message = `🎵 Top 5 results for "${text}":\n\n`;
        top5.forEach((video, index) => {
          message += `${index + 1}. ${video.title}\n`;
          message += `⏱ Duration: ${video.timestamp}\n`;
          message += `👀 Views: ${video.views.toLocaleString()}\n`;
          message += `🔗 Link: ${video.url}\n\n`;
        });

        m.reply(message);
      } catch (error) {
        console.error(error);
        reply("❌ An error occurred while searching YouTube.");
      }
    },
  },
];