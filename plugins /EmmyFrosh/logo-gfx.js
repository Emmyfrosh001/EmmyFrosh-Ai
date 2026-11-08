module.exports = [
  {
    command: [
      "gfx", "gfx2", "gfx3", "gfx4", "gfx5",
      "gfx6", "gfx7", "gfx8", "gfx9", "gfx10",
      "gfx11", "gfx12"
    ],
    description: "Generate stylish GFX logos",
    category: "Logo",
    ban: true,
    gcban: true,
    execute: async (m, { text, command, ednut, prefix, reply }) => {
      const [text1, text2] = text.split('|').map(v => v.trim());
      if (!text1 || !text2) return reply(`Please use the correct format. Example: ${prefix + command} Patron | md`);
      try {
        const apiUrl = `https://api.nexoracle.com/image-creating/${command}?apikey=d0634e61e8789b051e&text1=${encodeURIComponent(text1)}&text2=${encodeURIComponent(text2)}`;
        await ednut.sendMessage(m.chat, { image: { url: apiUrl }, caption: `${global.footer}` }, { quoted: m });
      } catch (err) {
        global.log("ERROR", `Failed to generate ${command.toUpperCase()} image: ${err.message}`);
        reply(`Failed to generate ${command.toUpperCase()} image.`);
      }
    }
  },

  {
    command: ["warningsign"],
    description: "Generate Warning Sign design",
    category: "Logo",
    ban: true,
    gcban: true,
    execute: async (m, { text, ednut, reply }) => {
      if (!text) return reply('Please provide a name. Example: warningsign patron');
      try {
        const url = `https://api.nexoracle.com/ephoto360/warning-sign?apikey=d0634e61e8789b051e&text=${encodeURIComponent(text)}`;
        await ednut.sendMessage(m.chat, { image: { url }, caption: `${global.footer}` }, { quoted: m });
      } catch (err) {
        global.log("ERROR", `warningsign error: ${err.message}`);
        reply("Failed to generate Warning Sign.");
      }
    }
  },

  {
    command: ["pubg"],
    description: "Generate PUBG Mascot 2 design",
    category: "Logo",
    ban: true,
    gcban: true,
    execute: async (m, { text, ednut, reply }) => {
      if (!text) return reply('Please provide a name or phrase. Example: pubg patron');
      try {
        const url = `https://api.nexoracle.com/ephoto360/pubg-moscot2?apikey=d0634e61e8789b051e&text=${encodeURIComponent(text)}`;
        await ednut.sendMessage(m.chat, { image: { url }, caption: `${global.footer}` }, { quoted: m });
      } catch (err) {
        global.log("ERROR", `pubg error: ${err.message}`);
        reply("Failed to generate PUBG logo.");
      }
    }
  },

  {
    command: ["avengers"],
    description: "Generate Avengers style design",
    category: "Logo",
    ban: true,
    gcban: true,
    execute: async (m, { text, ednut, reply }) => {
      if (!text.includes('|')) return reply('Please provide two words separated by "|". Example: avengers Patron|Md');
      try {
        const [text1, text2] = text.split('|').map(t => t.trim());
        const url = `https://api.nexoracle.com/ephoto360/avengers?apikey=d0634e61e8789b051e&text1=${encodeURIComponent(text1)}&text2=${encodeURIComponent(text2)}`;
        await ednut.sendMessage(m.chat, { image: { url }, caption: `${global.footer}` }, { quoted: m });
      } catch (err) {
        global.log("ERROR", `avengers error: ${err.message}`);
        reply("Failed to generate Avengers logo.");
      }
    }
  },

  {
    command: ["graffiti"],
    description: "Create graffiti-style artwork",
    category: "Logo",
    ban: true,
    gcban: true,
    execute: async (m, { text, ednut, reply }) => {
      if (!text.includes('|')) return reply('Use format: graffiti text1|text2. Example: graffiti patron|md');
      try {
        const [text1, text2] = text.split('|');
        const url = `https://api.nexoracle.com/ephoto360/girl-painting-graffiti?apikey=d0634e61e8789b051e&text1=${encodeURIComponent(text1)}&text2=${encodeURIComponent(text2)}`;
        await ednut.sendMessage(m.chat, { image: { url }, caption: `${global.footer}` }, { quoted: m });
      } catch (err) {
        global.log("ERROR", `graffiti error: ${err.message}`);
        reply("Failed to generate graffiti.");
      }
    }
  },

  {
    command: ["matrix"],
    description: "Generate Matrix-style logo",
    category: "Logo",
    ban: true,
    gcban: true,
    execute: async (m, { text, ednut, reply }) => {
      if (!text) return reply('Please provide text. Example: matrix Patron');
      try {
        const url = `https://api.nexoracle.com/ephoto360/matrix?apikey=d0634e61e8789b051e&text=${encodeURIComponent(text)}`;
        await ednut.sendMessage(m.chat, { image: { url }, caption: `${global.footer}` }, { quoted: m });
      } catch (err) {
        global.log("ERROR", `matrix error: ${err.message}`);
        reply("Failed to generate Matrix logo.");
      }
    }
  },
  {
    command: ["pixabay"],
    description: "Search for free stock images via Pixabay",
    category: "Downloader",
    ban: true,
    gcban: true,
    execute: async (m, { text, ednut, sleep, fetch, reply }) => {
      if (!text) return reply(`Enter keywords to search. Example: pixabay mountain sunset`);
      const url = `https://api.nexoracle.com/search/pixabay-images?apikey=63b406007be3e32b53&q=${encodeURIComponent(text)}`;
      try {
        const res = await fetch(url);
        const data = await res.json();

        if (!data?.result?.length) {
          return reply(`No images found for: *${text}* Try different keywords or use English.`);
        }

        for (let i = 0; i < Math.min(data.result.length, 5); i++) {
          await ednut.sendMessage(m.chat, { image: { url: data.result[i] }, caption: `${global.footer}` }, { quoted: m });
          if (i < 4) await sleep(1000);
        }
      } catch (err) {
        global.log("ERROR", `pixabay error: ${err.message}`);
        reply("Failed to fetch images. Please try again later.");
      }
    }
  },
  {
    command: ["onepiece"],
    description: "Generate One Piece style logo",
    category: "Logo",
    ban: true,
    gcban: true,
    execute: async (m, { text, ednut, reply }) => {
      if (!text) return reply('Please provide text. Example: onepiece Patron');
      try {
        const url = `https://api.nexoracle.com/ephoto360/one-piece?apikey=d0634e61e8789b051e&text=${encodeURIComponent(text)}`;
        await ednut.sendMessage(m.chat, { image: { url }, caption: `${global.footer}` }, { quoted: m });
      } catch (err) {
        global.log("ERROR", `onepiece error: ${err.message}`);
        reply("Failed to generate One Piece logo.");
      }
    }
  }
];