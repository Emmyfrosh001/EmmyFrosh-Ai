const axios = require("axios");
const fs = require("fs");
const path = require("path");
const Crypto = require("crypto");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

ffmpeg.setFfmpegPath(ffmpegPath);

// -------------------- Configuration --------------------
const TMP_DIR = path.resolve(__dirname, "../../tmp/store");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ✅ Source 1: OtakuGIFs — free, no API key required
const OTAKU_BASE = "https://api.otakugifs.xyz/gif";

// ✅ Source 2: nekos.best — free, no API key required
// Has categories OtakuGIFs lacks (kick, punch, bonk, yeet, tickle, handhold)
const NEKOSBEST_BASE = "https://nekos.best/api/v2";

// ✅ Source 3 (fallback only): NexOracle — kept in case both above fail
const NEX_APIKEY = process.env.NEXORACLE_APIKEY || "d0634e61e8789b051e";

// Each action maps to ONE primary source + the exact category name on that source.
const ACTION_SOURCE_MAP = {
  bite:     { source: "otaku", category: "bite" },
  bully:    { source: "nekosbest", category: "bonk" },     // closest equivalent
  blush:    { source: "otaku", category: "blush" },
  cringe:   { source: "nekosbest", category: "confused" }, // closest equivalent
  cry:      { source: "otaku", category: "cry" },
  cuddle:   { source: "otaku", category: "cuddle" },
  dance:    { source: "otaku", category: "dance" },
  handhold: { source: "nekosbest", category: "handhold" },
  hug:      { source: "otaku", category: "hug" },
  happy:    { source: "otaku", category: "happy" },
  highfive: { source: "otaku", category: "thumbsup" },     // closest equivalent
  kill:     { source: "nekosbest", category: "punch" },    // closest non-graphic equivalent
  kick:     { source: "nekosbest", category: "kick" },
  kiss:     { source: "otaku", category: "kiss" },
  lick:     { source: "otaku", category: "lick" },
  poke:     { source: "otaku", category: "poke" },
  pat:      { source: "otaku", category: "pat" },
  smug:     { source: "otaku", category: "smug" },
  slap:     { source: "otaku", category: "slap" },
  smile:    { source: "otaku", category: "smile" },
  tickle:   { source: "nekosbest", category: "tickle" },
  wink:     { source: "otaku", category: "wink" },
  wave:     { source: "otaku", category: "wave" },
};

// -------------------- Helpers --------------------
async function fetchGifBufferFromUrl(url) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
  return Buffer.from(res.data);
}

async function fetchFromOtaku(category) {
  const url = `${OTAKU_BASE}?reaction=${category}`;
  const res = await axios.get(url, { responseType: "json", timeout: 10000 });
  if (!res.data?.url) throw new Error(`OtakuGIFs returned no url: ${JSON.stringify(res.data).slice(0, 150)}`);
  return await fetchGifBufferFromUrl(res.data.url);
}

async function fetchFromNekosBest(category) {
  const url = `${NEKOSBEST_BASE}/${category}`;
  const res = await axios.get(url, { responseType: "json", timeout: 10000 });
  const gifUrl = res.data?.results?.[0]?.url;
  if (!gifUrl) throw new Error(`nekos.best returned no url: ${JSON.stringify(res.data).slice(0, 150)}`);
  return await fetchGifBufferFromUrl(gifUrl);
}

async function fetchFromNexoracle(action) {
  if (!NEX_APIKEY) throw new Error("No NexOracle API key configured");
  const apiUrl = `https://api.nexoracle.com/reactions-pack/${action}?apikey=${NEX_APIKEY}`;
  const resJson = await axios.get(apiUrl, { responseType: "json", timeout: 10000 });
  if (resJson?.data) {
    if (resJson.data.status === false || resJson.data.error) {
      throw new Error(`NexOracle error: ${resJson.data.error || resJson.data.message || JSON.stringify(resJson.data)}`);
    }
    if (resJson.data.url) return await fetchGifBufferFromUrl(resJson.data.url);
    if (resJson.data.result) return await fetchGifBufferFromUrl(resJson.data.result);
  }
  throw new Error("NexOracle returned unexpected response format");
}

// ✅ Uses the action's designated primary source, falls back to the other
// free source, and only tries NexOracle as a last resort.
async function fetchReactionGif(action) {
  const mapping = ACTION_SOURCE_MAP[action];
  if (!mapping) throw new Error(`No source mapping configured for action "${action}"`);

  const { source, category } = mapping;
  const errors = [];

  try {
    if (source === "otaku") return await fetchFromOtaku(category);
    if (source === "nekosbest") return await fetchFromNekosBest(category);
  } catch (err) {
    errors.push(`${source}: ${err.message}`);
  }

  try {
    if (source === "otaku") return await fetchFromNekosBest(category);
    if (source === "nekosbest") return await fetchFromOtaku(category);
  } catch (err) {
    errors.push(`secondary: ${err.message}`);
  }

  try {
    return await fetchFromNexoracle(action);
  } catch (err) {
    errors.push(`NexOracle: ${err.message}`);
  }

  throw new Error(`All sources failed. ${errors.join(" | ")}`);
}

async function gifToVideoBuffer(gifBuffer) {
  const filename = Crypto.randomBytes(6).toString("hex");
  const gifPath = path.join(TMP_DIR, `${filename}.gif`);
  const mp4Path = path.join(TMP_DIR, `${filename}.mp4`);

  try {
    fs.writeFileSync(gifPath, gifBuffer);

    await new Promise((resolve, reject) => {
      ffmpeg(gifPath)
        .outputOptions([
          "-movflags faststart",
          "-pix_fmt yuv420p",
          "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2",
        ])
        .on("error", (err) => reject(new Error(`ffmpeg conversion failed: ${err.message || err}`)))
        .on("end", () => resolve())
        .save(mp4Path);
    });

    const videoBuffer = fs.readFileSync(mp4Path);
    return videoBuffer;
  } finally {
    try { if (fs.existsSync(gifPath)) fs.unlinkSync(gifPath); } catch (_) {}
    try { if (fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path); } catch (_) {}
  }
}

/**
 * Core reaction sender used by each command.
 */
async function sendReaction(m, opts, action, displayText, emoji = "") {
  const { ednut, reply } = opts;
  try {
    const senderTag = `@${m.sender.split("@")[0]}`;
    const target = m.quoted ? m.quoted.sender : null;
    const targetTag = target ? `@${target.split("@")[0]}` : null;

    const caption = targetTag
      ? `${senderTag} ${displayText} ${targetTag} ${emoji}`.trim()
      : `${senderTag} is ${displayText.replace(/ed$|ing$/,"")} the air ${emoji}`.trim();

    const gifBuffer = await fetchReactionGif(action);
    const videoBuffer = await gifToVideoBuffer(gifBuffer);

    await ednut.sendMessage(
      m.chat,
      {
        video: videoBuffer,
        caption,
        gifPlayback: true,
        mentions: targetTag ? [m.sender, target] : [m.sender],
      },
      { quoted: m }
    );
  } catch (err) {
    const reason = err.message || String(err);

    if (typeof global.log === "function") {
      global.log("ERROR", `[${action}] reaction failed: ${reason}`);
    } else {
      console.error(`[${action}] reaction failed:`, reason);
    }

    try {
      reply(`❌ Failed to send reaction.\nReason: ${reason.slice(0, 200)}`);
    } catch (_) {}
  }
}

// -------------------- Commands Export --------------------
module.exports = [
  { command: ["bite"], description: "Bite someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "bite", "bit", "🦈"); } },

  { command: ["bully"], description: "Bully someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "bully", "bullied", "😈"); } },

  { command: ["blush"], description: "Blush", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "blush", "blushed", "😊"); } },

  { command: ["cringe"], description: "Cringe reaction", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "cringe", "cringed", "😬"); } },

  { command: ["cry"], description: "Cry reaction", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "cry", "is crying over", "😭"); } },

  { command: ["cuddle"], description: "Cuddle someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "cuddle", "cuddled", "🤗"); } },

  { command: ["dance"], description: "Dance reaction", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "dance", "danced", "💃"); } },

  { command: ["handhold"], alias: ["holdhands"], description: "Hold hands with someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "handhold", "is holding hands with", "🤝"); } },

  { command: ["hug"], description: "Hug someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "hug", "hugged", "🫂"); } },

  { command: ["happy"], description: "Happy reaction", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "happy", "is happy with", "😄"); } },

  { command: ["highfive"], description: "Highfive someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "highfive", "highfived", "✋"); } },

  { command: ["kill"], description: "Kill someone (reaction)", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "kill", "killed", "💀"); } },

  { command: ["kick"], description: "Kick someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "kick", "kicked", "🦵"); } },

  { command: ["kiss"], description: "Kiss someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "kiss", "kissed", "💋"); } },

  { command: ["lick"], description: "Lick someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "lick", "licked", "👅"); } },

  { command: ["poke"], description: "Poke someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "poke", "poked", "👉"); } },

  { command: ["pat"], description: "Pat someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "pat", "patted", "🤝"); } },

  { command: ["smug"], description: "Smug reaction", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "smug", "is smug at", "😏"); } },

  { command: ["slap"], description: "Slap someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "slap", "slapped", "👋"); } },

  { command: ["smile"], description: "Smile reaction", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "smile", "smiled at", "🙂"); } },

  { command: ["tickle"], description: "Tickle someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "tickle", "tickled", "🤣"); } },

  { command: ["wink"], description: "Wink at someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "wink", "winked at", "😉"); } },

  { command: ["wave"], description: "Wave at someone", category: "Fun", ban: true, gcban: true,
    async execute(m, opts) { await sendReaction(m, opts, "wave", "waved at", "👋"); } },
];