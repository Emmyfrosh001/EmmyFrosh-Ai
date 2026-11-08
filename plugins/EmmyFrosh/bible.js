const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

// ─────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────
const MAX_SPEECH_CHARS = 25000; // safety cap for huge passages (about 25-30 min of audio)
const TTS_CHUNK_SIZE = 180;     // Google TTS accepts max 200 chars per request
const TTS_CONCURRENCY = 4;      // parallel TTS requests (Google fallback voice)
const EDGE_CHUNK_SIZE = 1200;   // Microsoft neural voice: characters per request
const EDGE_CONCURRENCY = 2;     // Microsoft neural voice: parallel requests

// Natural neural voice used for the voice note. Change it with BIBLE_VOICE in your .env
// or `global.bibleVoice = "..."`. Good Bible-reading voices:
//   en-US-ChristopherNeural (deep, calm)   en-GB-RyanNeural (British, warm)
//   en-US-GuyNeural (strong)               en-US-AndrewNeural (friendly)
//   en-US-EricNeural | en-US-AriaNeural / en-US-JennyNeural (female)
const DEFAULT_VOICE = "en-US-ChristopherNeural";

// Voices people can pick with .biblevoice  (number or name)
const VOICES = [
  { id: "en-US-ChristopherNeural", name: "Christopher", desc: "US male, deep & calm" },
  { id: "en-US-GuyNeural",         name: "Guy",         desc: "US male, strong" },
  { id: "en-US-AndrewNeural",      name: "Andrew",      desc: "US male, friendly" },
  { id: "en-US-BrianNeural",       name: "Brian",       desc: "US male, smooth" },
  { id: "en-US-EricNeural",        name: "Eric",        desc: "US male, clear" },
  { id: "en-GB-RyanNeural",        name: "Ryan",        desc: "UK male, warm" },
  { id: "en-GB-ThomasNeural",      name: "Thomas",      desc: "UK male, gentle" },
  { id: "en-NG-AbeoNeural",        name: "Abeo",        desc: "Nigerian male" },
  { id: "en-ZA-LukeNeural",        name: "Luke",        desc: "South African male" },
  { id: "en-AU-WilliamNeural",     name: "William",     desc: "Australian male" },
  { id: "en-US-AriaNeural",        name: "Aria",        desc: "US female, expressive" },
  { id: "en-US-JennyNeural",       name: "Jenny",       desc: "US female, friendly" },
  { id: "en-US-MichelleNeural",    name: "Michelle",    desc: "US female, warm" },
  { id: "en-GB-SoniaNeural",       name: "Sonia",       desc: "UK female" },
  { id: "en-GB-LibbyNeural",       name: "Libby",       desc: "UK female, bright" },
  { id: "en-NG-EzinneNeural",      name: "Ezinne",      desc: "Nigerian female" },
  { id: "en-ZA-LeahNeural",        name: "Leah",        desc: "South African female" },
  { id: "en-AU-NatashaNeural",     name: "Natasha",     desc: "Australian female" }
];

const PREVIEW_TEXT = "The LORD is my shepherd; I shall not want.";

// ─────────────────────────────────────────────────────────────
// REFERENCE PARSER
// Understands (book names can start with a number, e.g. "1 John"):
//   John 3:16        John 3-16        John 3.16        John 3 16
//   John 3:16-20     John 3-16-20     John 3-16-any number
//   Psalm 23         (whole chapter)
// ─────────────────────────────────────────────────────────────
function parseRef(input) {
  const raw = String(input || "").replace(/\s+/g, " ").trim();
  const match = raw.match(/^(.*[A-Za-z])\.?\s*([\d\s:.\-–—,]+)$/);
  if (!match) return null;

  const book = match[1].trim();
  const nums = (match[2].match(/\d+/g) || []).map(Number);
  if (!book || !nums.length) return null;

  const chapter = nums[0];
  if (!chapter) return null;

  // chapter only -> whole chapter
  if (nums.length === 1) {
    return { book, chapter, start: null, end: null, query: `${book} ${chapter}` };
  }

  let start = nums[1];
  let end = nums.length >= 3 ? nums[2] : nums[1];
  if (!start) return null;
  if (end < start) [start, end] = [end, start];

  const range = start === end ? `${start}` : `${start}-${end}`;
  return { book, chapter, start, end, query: `${book} ${chapter}:${range}` };
}

// ─────────────────────────────────────────────────────────────
// BIBLE API (KJV)
// ─────────────────────────────────────────────────────────────
async function fetchKJV(query) {
  const url = `https://bible-api.com/${encodeURIComponent(query)}?translation=kjv`;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.get(url, { timeout: 30000 });
      return res.data;
    } catch (err) {
      lastErr = err;
      if (err.response && err.response.status === 404) throw err; // verse really not found
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────────────────────
// TEXT -> SPEECH HELPERS
// ─────────────────────────────────────────────────────────────
function cleanForSpeech(t) {
  return String(t || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[\[\]{}<>*_~`^|\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Builds the spoken text: "John chapter 3, verse 16." + the verse(s)
function buildSpeech(data) {
  const verses = data.verses || [];
  const first = verses[0];
  const last = verses[verses.length - 1];

  let intro = `${cleanForSpeech(first.book_name)} chapter ${first.chapter}`;
  intro += verses.length === 1
    ? `, verse ${first.verse}.`
    : `, verses ${first.verse} to ${last.verse}.`;

  let speech = intro;
  let spokenCount = 0;
  let truncated = false;

  for (const v of verses) {
    const body = cleanForSpeech(v.text);
    const piece = verses.length === 1 ? body : `Verse ${v.verse}. ${body}`;
    if ((speech.length + piece.length + 1) > MAX_SPEECH_CHARS && spokenCount > 0) {
      truncated = true;
      break;
    }
    speech += " " + piece;
    spokenCount++;
  }

  return { speech, truncated, spokenCount, total: verses.length, lastSpoken: verses[Math.max(spokenCount - 1, 0)].verse };
}

// Splits long text into <=180 char pieces, preferring sentence/comma breaks
function splitChunks(text, size = TTS_CHUNK_SIZE) {
  const sentences = text.split(/(?<=[.!?;:])\s+/);
  const pieces = [];

  for (const s of sentences) {
    if (s.length <= size) { pieces.push(s); continue; }
    // too long: break on commas, then on spaces
    const parts = s.split(/(?<=,)\s+/);
    for (const p of parts) {
      if (p.length <= size) { pieces.push(p); continue; }
      let cur = "";
      for (const w of p.split(" ")) {
        if ((cur + " " + w).trim().length > size) { pieces.push(cur.trim()); cur = w; }
        else cur = (cur + " " + w).trim();
      }
      if (cur) pieces.push(cur.trim());
    }
  }

  // merge small neighbours so we make fewer requests
  const merged = [];
  let buf = "";
  for (const p of pieces) {
    if (!p) continue;
    if ((buf + " " + p).trim().length <= size) buf = (buf + " " + p).trim();
    else { if (buf) merged.push(buf); buf = p; }
  }
  if (buf) merged.push(buf);
  return merged;
}

async function ttsChunk(googleTTS, piece) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const b64 = await googleTTS.getAudioBase64(piece, {
        lang: "en",
        slow: false,
        host: "https://translate.google.com",
        timeout: 20000
      });
      return Buffer.from(b64, "base64");
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 700 * attempt));
    }
  }
  throw lastErr;
}

// Runs TTS for every chunk (a few at a time) and keeps the original order
async function speechToMp3(googleTTS, text) {
  const chunks = splitChunks(text);
  const results = new Array(chunks.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= chunks.length) return;
      results[i] = await ttsChunk(googleTTS, chunks[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(TTS_CONCURRENCY, chunks.length) }, worker));
  return Buffer.concat(results);
}

// ── Natural (Microsoft neural) voice ─────────────────────────
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const parts = [];
    stream.on("data", d => parts.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
    stream.on("end", () => resolve(Buffer.concat(parts)));
    stream.on("close", () => resolve(Buffer.concat(parts)));
    stream.on("error", reject);
  });
}

// One request to the neural voice. Works with msedge-tts v1 and v2.
async function edgeChunk(lib, voice, piece) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = lib;
  const tts = new MsEdgeTTS();
  try {
    const format = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3 || OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;
    await tts.setMetadata(voice, format);
    const res = await tts.toStream(piece);
    const stream = res && res.audioStream ? res.audioStream : res; // v2 returns { audioStream }, v1 returns the stream
    const buf = await withTimeout(collectStream(stream), 60000, "neural voice");
    if (!buf.length) throw new Error("empty audio");
    return buf;
  } finally {
    try { if (typeof tts.close === "function") tts.close(); } catch {}
  }
}

async function edgeSpeechToMp3(text, voice) {
  let lib;
  try { lib = require("msedge-tts"); } catch { throw new Error("msedge-tts is not installed"); }

  const chunks = splitChunks(text, EDGE_CHUNK_SIZE);
  const results = new Array(chunks.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= chunks.length) return;
      let lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try { results[i] = await edgeChunk(lib, voice, chunks[i]); lastErr = null; break; }
        catch (err) { lastErr = err; await new Promise(r => setTimeout(r, 800 * attempt)); }
      }
      if (lastErr) throw lastErr;
    }
  }

  await Promise.all(Array.from({ length: Math.min(EDGE_CONCURRENCY, chunks.length) }, worker));
  return Buffer.concat(results);
}

// Chosen voice first, then the default neural voice, then Google as a last resort (so it never fails)
async function makeVoice(googleTTS, text, voice) {
  const chosen = voice || global.bibleVoice || process.env.BIBLE_VOICE || DEFAULT_VOICE;
  const tries = [chosen];
  if (chosen !== DEFAULT_VOICE) tries.push(DEFAULT_VOICE);

  for (const v of tries) {
    try {
      return await edgeSpeechToMp3(text, v);
    } catch (err) {
      console.log(`BIBLE VN: neural voice "${v}" failed:`, err.message);
      if (/not installed/i.test(err.message)) break; // no point retrying other voices
    }
  }
  console.log("BIBLE VN: using Google voice instead");
  return await speechToMp3(googleTTS, text);
}

// ffmpeg binaries to try, in order: the ones from your package.json first, then a system ffmpeg
function ffmpegCandidates() {
  const list = [];
  try { const p = require("@ffmpeg-installer/ffmpeg").path; if (p && fs.existsSync(p)) list.push(p); } catch {}
  try { const p = require("ffmpeg-static"); if (p && fs.existsSync(p)) list.push(p); } catch {}
  list.push("ffmpeg");
  return list;
}

function runFfmpeg(bin, inFile, outFile) {
  return new Promise((resolve) => {
    execFile(
      bin,
      ["-y", "-i", inFile, "-vn", "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", "-f", "ogg", outFile],
      { timeout: 180000 },
      (err) => resolve(!err)
    );
  });
}

// mp3 -> ogg/opus so WhatsApp shows it as a real voice note. Returns null if no ffmpeg works.
async function mp3ToOpus(mp3Buffer) {
  const id = `biblevn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inFile = path.join(os.tmpdir(), `${id}.mp3`);
  const outFile = path.join(os.tmpdir(), `${id}.ogg`);

  const cleanup = () => {
    try { fs.unlinkSync(inFile); } catch {}
    try { fs.unlinkSync(outFile); } catch {}
  };

  try { fs.writeFileSync(inFile, mp3Buffer); } catch { return null; }

  for (const bin of ffmpegCandidates()) {
    const ok = await runFfmpeg(bin, inFile, outFile);
    if (ok) {
      try {
        const out = fs.readFileSync(outFile);
        if (out.length) { cleanup(); return out; }
      } catch {}
    }
  }

  cleanup();
  return null;
}

// ─────────────────────────────────────────────────────────────
// VOICE CHANGER (saved per user)
// ─────────────────────────────────────────────────────────────
function senderKey(m) {
  return String(m.sender || m.key?.participant || m.chat || "anon");
}

function getUserVoice(m) {
  try {
    const saved = global.db?.bibleVoices?.[senderKey(m)];
    if (saved && VOICES.some(v => v.id === saved)) return saved;
  } catch {}
  return global.bibleVoice || process.env.BIBLE_VOICE || DEFAULT_VOICE;
}

function saveUserVoice(m, id) {
  if (!global.db) global.db = {};
  if (!global.db.bibleVoices) global.db.bibleVoices = {};
  if (id) global.db.bibleVoices[senderKey(m)] = id;
  else delete global.db.bibleVoices[senderKey(m)];
}

function findVoice(input) {
  const t = String(input || "").trim().toLowerCase();
  if (!t) return null;
  if (/^\d+$/.test(t)) return VOICES[Number(t) - 1] || null;
  return (
    VOICES.find(v => v.name.toLowerCase() === t || v.id.toLowerCase() === t) ||
    VOICES.find(v => v.name.toLowerCase().startsWith(t)) ||
    null
  );
}

function voiceLabel(id) {
  const v = VOICES.find(x => x.id === id);
  return v ? `${v.name} (${v.desc})` : id;
}

async function sendVoiceNote(ednut, chatId, m, mp3) {
  const opus = await mp3ToOpus(mp3);
  if (opus) {
    return ednut.sendMessage(chatId, { audio: opus, mimetype: "audio/ogg; codecs=opus", ptt: true }, { quoted: m });
  }
  return ednut.sendMessage(chatId, { audio: mp3, mimetype: "audio/mpeg", ptt: true }, { quoted: m });
}

// .biblevoice  /  .bible voice
async function voiceChanger(m, { ednut, from, reply, googleTTS }, arg) {
  const chatId = from || m.chat || m.key?.remoteJid;
  const input = String(arg || "").trim();
  const current = getUserVoice(m);

  // no argument -> show the list
  if (!input) {
    const list = VOICES.map((v, i) => `${i + 1}. ${v.name} - ${v.desc}${v.id === current ? "  ✅" : ""}`).join("\n");
    const out =
      `🎙️ *BIBLE VOICE CHANGER*\n` +
      `════════════════════\n\n` +
      `Current voice: *${voiceLabel(current)}*\n\n` +
      `${list}`;
    return ednut.sendMessage(chatId, { text: out }, { quoted: m });
  }

  // reset
  if (/^(reset|default)$/i.test(input)) {
    saveUserVoice(m, null);
    return reply(`✅ Voice reset to default: ${voiceLabel(getUserVoice(m))}`);
  }

  const picked = findVoice(input);
  if (!picked) {
    return reply("❌ Voice not found. Send .biblevoice to see the list, then pick a number or a name.");
  }

  saveUserVoice(m, picked.id);
  await ednut.sendMessage(chatId, { text: `✅ Bible voice changed to *${picked.name}* (${picked.desc})\n🎧 _Sending a short preview..._` }, { quoted: m });

  // short preview so you can hear the new voice straight away
  try {
    const mp3 = await makeVoice(googleTTS || require("google-tts-api"), PREVIEW_TEXT, picked.id);
    await sendVoiceNote(ednut, chatId, m, mp3);
  } catch (err) {
    console.log("BIBLE VOICE PREVIEW ERROR:", err.message);
    await ednut.sendMessage(chatId, { text: "ℹ️ Voice saved, but I couldn't make the preview. It will be used on your next .biblev." }, { quoted: m });
  }
}

// .biblev  /  .vnbible  /  .bible vn
async function sendBibleVoice(m, { ednut, from, reply, googleTTS }, refText) {
  const chatId = from || m.chat || m.key?.remoteJid;

  try {
    if (!refText) {
      return reply(
        "🎙️ Example:\n.biblev John 3:16\n.biblev John 3-16\n.biblev John 3-16-20\n.vnbible Genesis 1:1-5\n.vnbible Psalm 23"
      );
    }

    const parsed = parseRef(refText);
    if (!parsed) {
      return reply(
        "❌ I couldn't understand that.\n\nTry:\n.biblev John 3-16\n.biblev John 3-16-20\n.biblev 1 John 4:7-12\n.vnbible Psalm 23"
      );
    }

    const tts = googleTTS || require("google-tts-api");
    const voice = getUserVoice(m);

    await ednut.sendMessage(chatId, { text: "🎙️ _Preparing your Bible voice note..._" }, { quoted: m });

    // 1) get the verses
    let data;
    try {
      data = await fetchKJV(parsed.query);
    } catch (err) {
      if (err.response && err.response.status === 404) {
        return reply("❌ Verse not found in KJV Bible. Check the book name, chapter and verse numbers.");
      }
      throw err;
    }

    if (!data || !Array.isArray(data.verses) || !data.verses.length) {
      return reply("❌ Verse not found in KJV Bible. Check the book name, chapter and verse numbers.");
    }

    // 2) build what will be spoken, 3) text -> speech, 4) send as a voice note
    const { speech, truncated, spokenCount, total, lastSpoken } = buildSpeech(data);

    const mp3 = await makeVoice(tts, speech, voice);
    if (!mp3 || !mp3.length) return reply("❌ Could not create the voice note. Try again.");

    await sendVoiceNote(ednut, chatId, m, mp3);

    let note = `📖 *${data.reference}* (KJV)`;
    if (truncated) {
      note += `\n\n⚠️ Passage was very long, so I read ${spokenCount} of ${total} verses (up to verse ${lastSpoken}).`;
    }
    await ednut.sendMessage(chatId, { text: note }, { quoted: m });
  } catch (err) {
    console.log("BIBLE VN ERROR:", err.message);
    reply("❌ Failed to make the Bible voice note. Try again later.");
  }
}

// ─────────────────────────────────────────────────────────────
// COMMANDS
// ─────────────────────────────────────────────────────────────
module.exports = [
  // 📖 TEXT VERSION  (also: .bible vn <verse>  and  .bible voice)
  {
    command: ["bible"],
    description: "KJV Bible verse (.bible vn <verse> for a voice note, .bible voice to change the voice)",
    category: "Info",

    async execute(m, ctx) {
      const { ednut, from, text, reply } = ctx;
      try {
        const chatId = from || m.chat || m.key?.remoteJid;
        const full = String(text || "").trim();

        if (!full) {
          return reply(
            "📖 Example:\n.bible John 3:16\n.bible John 3-16\n.bible Genesis 1:1-5\n.bible John 3-16-20\n\n🎙️ Voice note: .bible vn John 3-16 or .biblev John 3-16"
          );
        }

        // sub-commands: .bible vn ...   .bible voice ...
        const first = full.split(/\s+/)[0].toLowerCase();
        const rest = full.slice(first.length).trim();
        if (first === "vn" || first === "audio") return sendBibleVoice(m, ctx, rest);
        if (first === "voice" || first === "voices") return voiceChanger(m, ctx, rest);

        await ednut.sendMessage(chatId, { text: "📖 _Fetching KJV Bible..._" });

        const parsed = parseRef(full);
        const data = await fetchKJV(parsed ? parsed.query : full);

        if (!data || !data.verses || !data.verses.length) {
          return reply("❌ Verse not found in KJV Bible.");
        }

        const versesText = data.verses
          .map(v => `${v.verse}. ${v.text.trim()}`)
          .join("\n");

        const output =
          `📖 *HOLY BIBLE (KJV)*\n` +
          `════════════════════\n\n` +
          `📌 ${data.reference}\n\n` +
          `${versesText}\n\n` +
          `════════════════════\n🙏 KING JAMES VERSION`;

        await ednut.sendMessage(chatId, { text: output });
      } catch (err) {
        console.log("KJV BIBLE ERROR:", err.message);
        if (err.response && err.response.status === 404) {
          return reply("❌ Verse not found in KJV Bible.");
        }
        reply("❌ Failed to fetch KJV Bible. Try again later.");
      }
    }
  },

  // 🎙️ VOICE NOTE VERSION
  {
    command: ["biblev", "vnbible"],
    alias: ["biblevn", "bibleaudio"],
    description: "Read a KJV Bible verse/passage as a voice note",
    category: "Info",
    use: ".biblev John 3-16 | .biblev John 3-16-20 | .vnbible Psalm 23",

    async execute(m, ctx) {
      return sendBibleVoice(m, ctx, ctx.text);
    }
  },

  // 🔁 VOICE CHANGER
  {
    command: ["biblevoice"],
    alias: ["biblevoices", "vnvoice", "bvoice"],
    description: "Change the voice used for Bible voice notes",
    category: "Info",
    use: ".biblevoice | .biblevoice 6 | .biblevoice ryan | .biblevoice reset",

    async execute(m, ctx) {
      return voiceChanger(m, ctx, ctx.text);
    }
  }
];

// exposed only so the parser can be tested; harmless for the plugin loader
Object.defineProperty(module.exports, "parseRef", { value: parseRef, enumerable: false });