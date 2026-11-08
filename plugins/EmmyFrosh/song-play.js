const yts = require("youtube-yts");
const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { execFile } = require("child_process");

// Explicit ffmpeg path (falls back to system ffmpeg if the package is missing)
let FFMPEG_PATH = "ffmpeg";
try { FFMPEG_PATH = require("@ffmpeg-installer/ffmpeg").path; } catch (e) {}

// ==========================================
// .play — v2 (speed-focused)
// ==========================================
// What's faster than before:
//  1. Candidates are tried with a STAGGER instead of one-by-one with a 30s
//     wait each. A slow or dead result no longer blocks the next one, and
//     once one wins the others are cancelled.
//  2. Link lookup + download happen together per candidate, so a 403 on the
//     download also falls through to the next result (before, it didn't).
//  3. ffmpeg is skipped when the file is already mp3/m4a (sniffed from the
//     file header). When it IS needed, it uses a faster mp3 setting and
//     skips resampling.
//  4. Only real videos under 15 min are tried (before, channels/playlists
//     from search.all were wasting attempts).
//  5. Keep-alive connections, async file I/O, temp files in the OS temp dir.
//  6. Repeat requests for the same song are served from a small cache.
//  7. The "clear reaction" delay no longer holds the command open.
// ==========================================

const API_BASE = "https://media.cypherxbot.space/download/youtube/audio";
const MAX_SECONDS = 15 * 60;   // skip mixes / hour-long videos
const MAX_CANDIDATES = 4;      // how many search results can be tried
const STAGGER_MS = 5000;       // start the next candidate if the current one is still busy after this
const API_TIMEOUT = 20000;
const DOWNLOAD_TIMEOUT = 90000;
const CACHE_TTL = 30 * 60 * 1000;
const CACHE_MAX = 8;           // keeps at most ~8 songs in memory
const TMP = os.tmpdir();

const fast = axios.create({
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 20 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 20 }),
});

const log = (...a) => (typeof global.log === "function" ? global.log(...a) : console.log(...a));

// ---------- tiny caches ----------
const searchCache = new Map(); // query -> { candidates, ts }
const audioCache = new Map();  // videoId -> { buffer, mimetype, title, ts }

function cacheGet(map, key) {
  const e = map.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { map.delete(key); return null; }
  return e;
}
function cacheSet(map, key, value, max) {
  map.set(key, { ...value, ts: Date.now() });
  while (map.size > max) map.delete(map.keys().next().value); // drop oldest
}

// ---------- helpers ----------

/**
 * Runs `worker` on items with a stagger. Resolves with the first success and
 * aborts the rest. A failure starts the next item immediately.
 * Rejects (with the last error) only when every item failed.
 */
function firstSuccess(items, worker, staggerMs) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let next = 0, running = 0, done = false, lastErr = null, timer = null;

    const schedule = () => {
      clearTimeout(timer);
      if (!done && next < items.length) timer = setTimeout(launch, staggerMs);
    };

    const launch = () => {
      if (done || next >= items.length) return;
      const item = items[next++];
      running++;
      worker(item, controller.signal)
        .then((result) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          controller.abort(); // cancel the others
          resolve(result);
        })
        .catch((err) => {
          if (!done) {
            lastErr = err;
            log("ERROR", `Play attempt failed for "${item.title}": ${err.message}`);
          }
        })
        .finally(() => {
          running--;
          if (done) return;
          if (next < items.length) launch();
          else if (running === 0) reject(lastErr || new Error("all attempts failed"));
        });
      schedule();
    };

    launch();
  });
}

function sniffAudio(b) {
  if (b.length > 12 && b.toString("ascii", 4, 8) === "ftyp") {
    return b.toString("ascii", 8, 12) === "M4A " ? "m4a" : "mp4other";
  }
  if (b.toString("ascii", 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "mp3";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  if (b.toString("ascii", 0, 4) === "OggS") return "ogg";
  return "other";
}

async function transcodeToMp3(buf, ext) {
  const id = crypto.randomBytes(6).toString("hex");
  const inFile = path.join(TMP, `play_${id}.${ext}`);
  const outFile = path.join(TMP, `play_${id}.mp3`);
  await fs.promises.writeFile(inFile, buf);
  try {
    await new Promise((resolve, reject) => {
      execFile(
        FFMPEG_PATH,
        [
          "-y", "-hide_banner", "-loglevel", "error",
          "-i", inFile,
          "-vn", "-map_metadata", "-1",
          "-c:a", "libmp3lame", "-b:a", "128k", "-compression_level", "7",
          outFile,
        ],
        { timeout: 60000 },
        (err, _stdout, stderr) => (err ? reject(new Error((stderr || err.message).toString().slice(0, 200))) : resolve())
      );
    });
    return await fs.promises.readFile(outFile);
  } finally {
    fs.promises.unlink(inFile).catch(() => {});
    fs.promises.unlink(outFile).catch(() => {});
  }
}

function apiErrorMessage(err) {
  return (
    err.response?.data?.message ||
    (typeof err.response?.data === "string" ? err.response.data.slice(0, 150) : null) ||
    err.message
  );
}

/** Resolves the download link AND downloads the audio for one search result. */
async function fetchAudio(candidate, signal) {
  let dl;
  try {
    const res = await fast.get(API_BASE, { params: { url: candidate.url }, timeout: API_TIMEOUT, signal });
    dl = res.data?.result?.download_url;
    if (!res.data?.status || !dl) {
      throw new Error(`API returned no download_url: ${JSON.stringify(res.data).slice(0, 120)}`);
    }
  } catch (e) {
    throw new Error(apiErrorMessage(e));
  }

  let data;
  try {
    const audioRes = await fast.get(dl, {
      responseType: "arraybuffer",
      timeout: DOWNLOAD_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    data = audioRes.data;
  } catch (e) {
    throw new Error("download: " + apiErrorMessage(e));
  }

  const buffer = Buffer.from(data);
  if (buffer.length < 1000) throw new Error("invalid audio file received");
  return { candidate, buffer };
}

// ---------- command ----------

module.exports = [
  {
    command: ["play"],
    alias: ["ytplay", "song", "music"],
    description: "Search and play a song from YouTube",
    category: "Downloader",
    filename: __filename,
    async execute(m, { ednut, text, reply }) {
      // reactions are cosmetic: never wait on them
      const react = (emoji) => ednut.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {});
      const clearReactionLater = () => setTimeout(() => react(""), 3000);

      try {
        if (!text) return reply("❌ Please provide a song name.");
        react("🔍");

        // ---- 1) search (cached for repeat requests) ----
        const query = text.trim();
        const qKey = query.toLowerCase();
        let searchEntry = cacheGet(searchCache, qKey);
        let candidates = searchEntry?.candidates;

        if (!candidates) {
          const search = await yts(query);
          const videos = (search.videos || []).filter((v) => v.url);
          let ok = videos.filter((v) => typeof v.seconds === "number" && v.seconds > 0 && v.seconds <= MAX_SECONDS);
          if (!ok.length) ok = videos.slice(0, 2);
          candidates = ok.slice(0, MAX_CANDIDATES);
          if (candidates.length) {
            cacheSet(searchCache, qKey, { candidates }, 50);
            searchEntry = searchCache.get(qKey);
          }
        }

        if (!candidates.length) {
          react("❌");
          clearReactionLater();
          return reply("❌ No song found.");
        }

        // ---- 2) instant path: top result already cached ----
        const cached =
          (searchEntry?.winner && cacheGet(audioCache, searchEntry.winner)) ||
          cacheGet(audioCache, candidates[0].videoId);
        if (cached) {
          await ednut.sendMessage(
            m.chat,
            { audio: cached.buffer, mimetype: cached.mimetype, fileName: `${cached.title}.mp3`, ptt: false },
            { quoted: m }
          );
          react("🎧");
          clearReactionLater();
          return;
        }

        // ---- 3) resolve + download, staggered across candidates ----
        react("📥");
        let result;
        try {
          result = await firstSuccess(candidates, fetchAudio, STAGGER_MS);
        } catch (lastErr) {
          react("❌");
          clearReactionLater();
          return reply(
            `❌ Tried ${candidates.length} results, all failed.\n\nLast error: ${lastErr.message}\n\n` +
            `This is the external audio service / YouTube currently blocking downloads — try again later, or try a different song.`
          );
        }

        const { candidate, buffer } = result;

        // ---- 4) convert only if WhatsApp can't play it as-is ----
        const kind = sniffAudio(buffer);
        let out = buffer;
        let mimetype = "audio/mpeg";
        if (kind === "mp3") {
          // already fine
        } else if (kind === "m4a") {
          mimetype = "audio/mp4";
        } else {
          out = await transcodeToMp3(buffer, kind === "other" ? "bin" : kind);
        }

        // ---- 5) send ----
        const safeTitle = (candidate.title || "song").replace(/[\\/:*?"<>|]/g, "").slice(0, 100);
        await ednut.sendMessage(
          m.chat,
          { audio: out, mimetype, fileName: `${safeTitle}.${mimetype === "audio/mp4" ? "m4a" : "mp3"}`, ptt: false },
          { quoted: m }
        );

        cacheSet(audioCache, candidate.videoId, { buffer: out, mimetype, title: safeTitle }, CACHE_MAX);
        if (searchEntry) searchEntry.winner = candidate.videoId;
        react("🎧");
        clearReactionLater();
      } catch (err) {
        console.log(err);
        react("❌");
        clearReactionLater();
        reply(`❌ Error: ${err.message || err}`);
      }
    },
  },
];