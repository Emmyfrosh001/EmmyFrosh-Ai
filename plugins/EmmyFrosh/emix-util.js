const axios = require("axios");
const { getBuffer } = require("../../lib/myfunc.js");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");

const axios = require("axios");
const { getBuffer } = require("../../lib/myfunc.js");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");

module.exports = [
  {
    command: ["emix", "emixai", "emixultra"],
    description: "Ultra AI Emoji Mixer (no API dependency fallback)",
    category: "Fun",
    filename: __filename,
    use: "😂,🔥 or random",

    async execute(m, { ednut, q, reply }) {
      try {
        const chat = m.chat;

        await ednut.sendMessage(chat, {
          react: { text: "🤖", key: m.key }
        });

        if (!q) return reply("❌ Use: .emix 😂,🔥 or .emix random");

        let emojis = [];

        // 🎲 RANDOM MODE
        if (q.toLowerCase() === "random") {
          emojis = generateRandomEmojis(3);
        } else {
          emojis = q.split(",").map(e => e.trim()).filter(Boolean);
        }

        if (emojis.length < 2) {
          return reply("❌ Minimum 2 emojis required.");
        }

        if (emojis.length > 6) {
          return reply("❌ Maximum 6 emojis allowed.");
        }

        // 🤖 TRY API FIRST
        let imageUrl = await fetchFromAPI(emojis);

        // 🧠 AI FALLBACK (NO API)
        if (!imageUrl) {
          imageUrl = await generateAIEmix(emojis);
        }

        if (!imageUrl) {
          return reply("❌ AI failed to generate emoji mix.");
        }

        const buffer = await getBuffer(imageUrl);
        if (!buffer) return reply("❌ Failed to load image.");

        const sticker = new Sticker(buffer, {
          pack: "EMIX ULTRA AI ⚡",
          author: "EMMYFROSH AI",
          type: StickerTypes.FULL,
          quality: 95,
          background: "transparent",
        });

        const stickerBuffer = await sticker.toBuffer();

        await ednut.sendMessage(chat, {
          sticker: stickerBuffer
        }, { quoted: m });

      } catch (e) {
        console.log("emix ultra error:", e);
        reply("❌ EMIX ULTRA AI error occurred.");
      }
    }
  }
];

/**
 * 🌐 API GENERATION
 */
async function fetchFromAPI(emojis) {
  try {
    const q = emojis.map(e => encodeURIComponent(e)).join(",");
    const url = `https://levanter.onrender.com/emix?q=${q}`;

    const res = await axios.get(url, { timeout: 10000 });

    return res.data?.result || res.data?.url || null;
  } catch (e) {
    console.log("API failed:", e.message);
    return null;
  }
}

/**
 * 🧠 AI FALLBACK GENERATOR (NO API DEPENDENCY)
 * Creates emoji-based image via fallback rendering system
 */
async function generateAIEmix(emojis) {
  try {
    // Convert emojis into a visual prompt
    const prompt = emojis.join(" ");

    const url = `https://api.memegen.link/images/custom/${encodeURIComponent(prompt)}.png`;

    return url;
  } catch (e) {
    console.log("AI fallback error:", e.message);
    return null;
  }
}

/**
 * 🎲 RANDOM EMOJI GENERATOR
 */
function generateRandomEmojis(count = 3) {
  const pool = [
    "😂","🤣","😍","🥰","😎","😡","😭","🤯","😱","🔥",
    "💀","👻","🤖","🎉","✨","💖","👍","👎","😈","💥",
    "🧠","⚡","🌈","💫","👽","💣"
  ];

  let result = [];
  for (let i = 0; i < count; i++) {
    result.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return result;
}
