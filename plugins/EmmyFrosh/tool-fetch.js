const { fetchJson } = require('../../lib/myfunc.js');

module.exports = [
  {
    command: ["fetch"],
    alias: ["api"],
    description: "Fetch data from a provided URL or API",
    category: "Tool",
    filename: __filename,
    async execute(m, { ednut, from, quoted, body, args, reply }) {
      try {
        // React to the message
        await ednut.sendMessage(m.key.remoteJid, {
          react: { text: "🌐", key: m.key }
        });

        const q = args.join(' ').trim(); // Extract the URL or API query
        if (!q) return reply('❌ Please provide a valid URL or query.');

        if (!/^https?:\/\//.test(q)) {
          return reply('❌ URL must start with http:// or https://.');
        }

        // Fetch JSON data
        const data = await fetchJson(q);
        const content = JSON.stringify(data, null, 2);

        // Send fetched data
        await ednut.sendMessage(from, {
          text: `🔍 *Fetched Data*:\n\`\`\`${content.slice(0, 2048)}\`\`\``,
          contextInfo: {
            mentionedJid: [m.sender],
            forwardingScore: 2,
            isForwarded: true,
            forwardingSourceMessage: 'Your Data Request',
          }
        }, { quoted: m });

      } catch (e) {
        console.error("Error in fetch command:", e);
        reply(`❌ An error occurred:\n${e.message}`);
      }
    }
  }
];