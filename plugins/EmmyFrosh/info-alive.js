module.exports = [
  {
    command: ["alive"],
    description: "Check if the bot is alive",
    category: "Info",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, runtime, getQuote, reply }) => {
      try {
        const settings = global.db.settings;
        if (!settings.aliveTemplate) {
          return reply('❌ No alive message set!\nUse *setalive* to set one.');
        }

        const aliveMsg = settings.aliveTemplate
          .replace(/#alive/g, runtime(process.uptime()))
          .replace(/#quote/g, await getQuote());

        const urls = settings.aliveUrls || [];

        if (urls.length > 0) {
          const randomUrl = urls[Math.floor(Math.random() * urls.length)];
          const mediaType = randomUrl.toLowerCase().endsWith(".mp4") ? "video" : "image";

          await ednut.sendMessage(m.chat, {
            [mediaType]: { url: randomUrl },
            caption: aliveMsg.trim()
          }, { quoted: m });
        } else {
          await reply(aliveMsg.trim());
        }
      } catch (err) {
        global.log?.("ERROR", `alive command error: ${err.message || err}`);
        reply("❌ Failed to send alive message.");
      }
    }
  },

  {
    command: ["setalive"],
    description: "Set custom alive message with optional image or video URLs",
    category: "Owner",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { text, prefix, reply }) => {
      try {
        const args = text.trim();
        if (!args) {
          return reply(`Usage:\n${prefix}setalive <message with optional URLs>\n\nTags:\n#alive = bot uptime\n#quote = random quote`);
        }

        // Extract media URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = args.match(urlRegex) || [];

        global.db.settings.aliveTemplate = args.replace(urlRegex, "").trim();

        if (urls.length > 0) {
          global.db.settings.aliveUrls = urls;
        } else {
          delete global.db.settings.aliveUrls;
        }

        reply(`✅ Alive message saved.\nMedia links: ${urls.length}`);
      } catch (err) {
        global.log?.("ERROR", `setalive error: ${err.message || err}`);
        reply("❌ Failed to set alive message.");
      }
    }
  }
];