const { ytmp3: vredenYtmp3, ytmp4: vredenYtmp4 } = require("@vreden/youtube_scraper");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { spawnSync, execFile } = require("child_process");
const { youtube: btchYoutube } = require("btch-downloader");
const yts = require("youtube-yts");

// ==========================================
// SPOTIFY + SHAZAM DOWNLOADER — v8 (no fake matches: audio checks, spread-out clips, video-title hint)
// ==========================================
// INSTALL ONCE:  npm i node-shazam
//
// ONE shared download engine now powers .spotify AND the Shazam 1/2 reply:
//
//  FAST
//   - Three download providers (cypherx, btch, vreden) are started with a
//     stagger; the first one that delivers a PLAYABLE file wins and the
//     rest are cancelled. A dead provider no longer costs 30s.
//   - Up to 3 YouTube results are tried, so a blocked video falls through.
//   - Shazam starts downloading the mp3 in the BACKGROUND the moment the
//     song is identified, so when you reply "1" it is usually instant.
//   - Repeat requests come from a small in-memory cache.
//   - ffmpeg is skipped when the file is already mp3/m4a.
//   - Keep-alive connections, async ffmpeg (no more event-loop blocking).
//
//  "NOT PLAYING" FIX
//   - The old code labelled whatever it downloaded as audio/mpeg. If the
//     service returned webm/opus/aac, WhatsApp showed an unplayable file.
//     Now the file header is checked: mp3/m4a are sent as-is, everything
//     else is converted to a real mp3, and anything that isn't audio at
//     all (an HTML/JSON error page) counts as a failed attempt so the next
//     provider is tried.
//
//  Shazam reply matching (from v4): pending songs live on `global`, and a
//  "1"/"2" is matched by the card you replied to OR by chat+sender.
//  Every step logs as [SHAZAM] / [DL] so you can see where it stops.
// ==========================================

// ---------- settings ----------
const CYPHER_API = "https://media.cypherxbot.space/download/youtube/audio";
const MAX_SECONDS = 15 * 60;        // skip mixes / hour-long videos
const MAX_CANDIDATES = 3;           // YouTube results that can be tried
const STAGGER_MS = 4000;            // start the next attempt if the current one is still busy after this
const API_TIMEOUT = 20000;
const PROVIDER_TIMEOUT = 25000;
const DOWNLOAD_TIMEOUT = 90000;
const CACHE_TTL = 30 * 60 * 1000;
const CACHE_MAX = 8;                // songs kept in memory
const SHAZAM_PREFETCH = true;       // start downloading the mp3 right after identification

// Optional backup only. Set AUDD_API_KEY in your host's environment variables.
const AUDD_API_KEY = process.env.AUDD_API_KEY || "";
const AUDD_ENDPOINT = "https://api.audd.io/";
// Optional: Spotify search. Create a free app at developer.spotify.com/dashboard and set
// SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your host's environment variables.
// Apple Music search needs NO key. APPLE_COUNTRY picks the store (default "us"; try "ng").
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";
const APPLE_COUNTRY = (process.env.APPLE_COUNTRY || "us").toLowerCase();
const CATALOG_TIMEOUT = 8000;
const SILENCE_DB = -40;               // a clip whose loudest peak is below this is treated as silent
const SHAZAM_PENDING_TTL = 5 * 60 * 1000; // 5 minutes
const SHAZAM_CLIP_SECONDS = 15;

const TMP = os.tmpdir();

// ---------- shared state (on global so duplicate module instances share it) ----------
const SHAZAM_STORE = (global.__shazamStore = global.__shazamStore || {
  bySender: new Map(), // "chat:senderDigits" -> entry
  byMsgId: new Map(),  // id of the "Found it" card -> entry
});
const shazamPending = SHAZAM_STORE.bySender;
const shazamByMsgId = SHAZAM_STORE.byMsgId;

const DL_STORE = (global.__dlStore = global.__dlStore || {
  search: new Map(), // query -> { candidates, winner, ts }
  audio: new Map(),  // videoId -> { buffer, mimetype, title, videoId, ts }
});
DL_STORE.catalog = DL_STORE.catalog || new Map(); // Apple Music / Spotify lookups

// Shared keep-alive axios instance
const fast = axios.create({
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 30 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 30 }),
  timeout: 45000,
});

// ---------- small helpers ----------

const log = (...a) => console.log(...a);

function react(ednut, m, emoji) {
  // cosmetic: never awaited, never allowed to break a command
  return ednut.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {});
}

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out`)), ms); }),
  ]).finally(() => clearTimeout(t));
}

function cacheGet(map, key) {
  const e = map.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { map.delete(key); return null; }
  return e;
}

function cacheSet(map, key, value, max) {
  value.ts = Date.now();
  map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value); // drop oldest
  return value;
}

function safeName(s, fallback = "song") {
  return String(s || fallback).replace(/[\\/:*?"<>|]/g, "").slice(0, 100) || fallback;
}

function errMessage(err) {
  return (
    err?.response?.data?.message ||
    (typeof err?.response?.data === "string" ? err.response.data.slice(0, 150) : null) ||
    err?.message ||
    String(err)
  );
}

// ==========================================
// FAST DOWNLOAD ENGINE (shared)
// ==========================================

/**
 * Runs `worker` over items with a stagger. Resolves with the first success
 * and aborts the rest. A failure starts the next item immediately.
 * Rejects only when every item failed (message lists the last errors).
 */
function firstSuccess(items, worker, staggerMs) {
  return new Promise((resolve, reject) => {
    if (!items.length) return reject(new Error("nothing to try"));

    const controller = new AbortController();
    const errs = [];
    let next = 0, running = 0, done = false, timer = null;

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
          log(`[DL] success via ${item.title}`);
          resolve(result);
        })
        .catch((err) => {
          if (!done) {
            errs.push(`${item.title}: ${errMessage(err)}`);
            log(`[DL] attempt failed — ${item.title}: ${errMessage(err)}`);
          }
        })
        .finally(() => {
          running--;
          if (done) return;
          if (next < items.length) launch();
          else if (running === 0) reject(new Error(errs.slice(-3).join(" | ") || "all attempts failed"));
        });
      schedule();
    };

    launch();
  });
}

/** Looks at the file header to see what we really downloaded. */
function sniffMedia(b) {
  if (b.length < 12) return "other";
  const first = b[0];
  if (first === 0x3c || first === 0x7b) return "text"; // "<" html or "{" json: an error page, not media
  if (b.toString("ascii", 4, 8) === "ftyp") return b.toString("ascii", 8, 12) === "M4A " ? "m4a" : "mp4other";
  // MP3: ID3 tag, or an MPEG audio frame whose layer bits are not 00 (00 would be AAC/ADTS)
  if (b.toString("ascii", 0, 3) === "ID3" || (first === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0)) return "mp3";
  if (first === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  if (b.toString("ascii", 0, 4) === "OggS") return "ogg";
  return "other";
}

let ffmpegBin = null; // null = not checked yet, "" = none found
function getFfmpeg() {
  if (ffmpegBin !== null) return ffmpegBin;
  const candidates = [];
  try { candidates.push(require("@ffmpeg-installer/ffmpeg").path); } catch (e) {} // bundled with node-shazam
  candidates.push("ffmpeg"); // system ffmpeg
  ffmpegBin = "";
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ["-version"], { timeout: 8000 });
      if (r.status === 0) { ffmpegBin = c; break; }
    } catch (e) {}
  }
  if (!ffmpegBin) log("[DL] No ffmpeg found. Run: npm i node-shazam (it bundles ffmpeg).");
  else log("[DL] Using ffmpeg:", ffmpegBin);
  return ffmpegBin;
}

/** Converts anything ffmpeg can read into a real mp3 (async, non-blocking). */
async function transcodeToMp3(buf) {
  const bin = getFfmpeg();
  if (!bin) throw new Error("ffmpeg not available to convert the audio");
  const id = crypto.randomBytes(6).toString("hex");
  const inFile = path.join(TMP, `dl_${id}.bin`);
  const outFile = path.join(TMP, `dl_${id}.mp3`);
  await fs.promises.writeFile(inFile, buf);
  try {
    await new Promise((resolve, reject) => {
      execFile(
        bin,
        [
          "-y", "-hide_banner", "-loglevel", "error",
          "-i", inFile,
          "-vn", "-map_metadata", "-1",
          "-c:a", "libmp3lame", "-b:a", "128k", "-compression_level", "7",
          outFile,
        ],
        { timeout: 60000 },
        (err, _so, stderr) => (err ? reject(new Error("ffmpeg: " + (stderr || err.message).toString().slice(0, 160))) : resolve())
      );
    });
    const out = await fs.promises.readFile(outFile);
    if (out.length < 2000) throw new Error("ffmpeg produced an empty file");
    return out;
  } finally {
    fs.promises.unlink(inFile).catch(() => {});
    fs.promises.unlink(outFile).catch(() => {});
  }
}

/**
 * Makes sure what we got is something WhatsApp can actually play.
 * kind "mp3": returns { buffer, mimetype } as mp3 or m4a (converting if needed).
 * kind "mp4": must be a real mp4 video.
 * Throws if it isn't media, so the engine moves on to the next attempt.
 */
async function makePlayable(raw, kind) {
  if (!raw || raw.length < 5000) throw new Error(`file too small (${raw ? raw.length : 0} bytes)`);
  const t = sniffMedia(raw);
  if (t === "text") throw new Error("service returned a web page / JSON instead of a file");

  if (kind === "mp4") {
    if (t === "m4a" || t === "mp4other") return { buffer: raw, mimetype: "video/mp4" };
    throw new Error(`not an mp4 video (looks like ${t})`);
  }

  if (t === "mp3") return { buffer: raw, mimetype: "audio/mpeg" };
  if (t === "m4a") return { buffer: raw, mimetype: "audio/mp4" };
  // webm / ogg / aac / mp4 video / unknown → real mp3, so it always plays
  log(`[DL] converting ${t} → mp3`);
  return { buffer: await transcodeToMp3(raw), mimetype: "audio/mpeg" };
}

// ---------- providers: each returns a direct download URL ----------

const PROVIDERS = {
  cypherx: {
    kinds: ["mp3"],
    async resolve(url, kind, signal) {
      const res = await fast.get(CYPHER_API, { params: { url }, timeout: API_TIMEOUT, signal });
      const dl = res.data?.result?.download_url;
      if (!res.data?.status || !dl) throw new Error(`no download_url: ${JSON.stringify(res.data).slice(0, 100)}`);
      return dl;
    },
  },
  btch: {
    kinds: ["mp3", "mp4"],
    async resolve(url, kind) {
      const r = await withTimeout(btchYoutube(url), PROVIDER_TIMEOUT, "btch");
      const link = r && r.status !== false ? r[kind] : null;
      if (!link) throw new Error(`no ${kind} link`);
      return link;
    },
  },
  vreden: {
    kinds: ["mp3", "mp4"],
    async resolve(url, kind) {
      const call = kind === "mp4" ? vredenYtmp4(url, 360) : vredenYtmp3(url, 128);
      const r = await withTimeout(call, PROVIDER_TIMEOUT, "vreden");
      if (r?.status && r.download?.url) return r.download.url;
      throw new Error(r?.message || `no ${kind} link`);
    },
  },
};

/**
 * Attempt order: every provider on the best result first, then the main
 * provider on the next results. Launched with a stagger, first winner wins.
 */
function buildTasks(candidates, kind) {
  const provs = Object.entries(PROVIDERS).filter(([, p]) => p.kinds.includes(kind));
  const tasks = [];
  const [first, ...rest] = candidates.slice(0, MAX_CANDIDATES);
  if (first) for (const [name, p] of provs) tasks.push({ video: first, provider: p, title: `${name} / ${first.title}` });
  const [primaryName, primary] = provs[0] || [];
  if (primary) for (const c of rest) tasks.push({ video: c, provider: primary, title: `${primaryName} / ${c.title}` });
  return tasks;
}

async function downloadBuffer(url, signal) {
  const res = await fast.get(url, {
    responseType: "arraybuffer",
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    maxRedirects: 5,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: DOWNLOAD_TIMEOUT,
    signal,
  });
  return Buffer.from(res.data);
}

async function runTask(task, signal, kind) {
  const url = await task.provider.resolve(task.video.url, kind, signal);
  if (signal.aborted) throw new Error("cancelled");
  const raw = await downloadBuffer(url, signal);
  if (signal.aborted) throw new Error("cancelled");
  const media = await makePlayable(raw, kind);
  return { ...media, video: task.video };
}

// ==========================================
// PICKING THE *RIGHT* SONG ON YOUTUBE
// ==========================================
// The old code downloaded the first YouTube result for "artist - title", which is
// often a cover, remix, slowed version or a different song. Now every result is
// scored against what Shazam identified, and only real matches are used.

const BAD_WORDS = [
  "cover", "remix", "live", "karaoke", "instrumental", "slowed", "sped up", "speed up",
  "nightcore", "reverb", "8d", "tribute", "mashup", "reaction", "tutorial", "lesson",
  "bass boosted", "type beat", "male version", "female version", "piano version",
  "acoustic", "remake", "parody", "full album", "playlist", "compilation",
  "1 hour", "10 hours", "loop",
];

function plain(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Essence (feat. Tems) - Remastered 2020" -> "essence" */
function coreTitle(t) {
  return plain(
    String(t || "")
      .replace(/[\(\[][^\)\]]*[\)\]]/g, " ")
      .replace(/\s[-–—]\s.*(remaster|version|edit|mix|radio|single|mono|stereo|from\s).*$/i, " ")
      .replace(/\b(feat|ft|featuring)\.?\s.*$/i, " ")
  );
}

/** "Wizkid, Tems" / "A & B" / "A feat. B" -> ["wizkid","tems"] */
function artistNames(artist) {
  return String(artist || "")
    .split(/,|&|;|\/|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\sx\s|\sand\s/i)
    .map(plain)
    .filter(Boolean);
}

function hasPhrase(haystack, phrase) {
  return !!phrase && (" " + haystack + " ").includes(" " + phrase + " ");
}

function scoreVideo(v, track) {
  const vt = plain(v.title);
  const va = plain(v.author?.name || (typeof v.author === "string" ? v.author : ""));
  const title = coreTitle(track.title);
  const wantRaw = plain(`${track.title} ${track.artist}`);
  const artists = artistNames(track.artist);

  let score = 0;

  // 1) title
  const tTokens = title.split(" ").filter(Boolean);
  const vTokens = new Set(vt.split(" "));
  const hit = tTokens.filter((t) => vTokens.has(t)).length;
  const ratio = tTokens.length ? hit / tTokens.length : 0;
  const phrase = hasPhrase(vt, title);
  score += phrase ? 50 : ratio * 35;

  // 2) artist (in the video title, or the channel name)
  const channel = va.replace(/ (topic|official|vevo|music|tv|records)$/, "");
  const artistOk = artists.some(
    (a) => hasPhrase(vt, a) || channel === a || (a.length >= 3 && va.startsWith(a))
  );
  if (artistOk) score += 25;

  // 3) "official" signals
  if (/ topic$/.test(va)) score += 20;           // auto-generated artist channel = the original audio
  if (/vevo$/.test(va)) score += 8;
  if (/official (audio|music video|video)/.test(vt)) score += 8;

  // 3b) length: Apple Music / Spotify know the real length of the song
  if (Array.isArray(track.durations) && track.durations.length && typeof v.seconds === "number") {
    const diff = Math.min(...track.durations.map((d) => Math.abs(d - v.seconds)));
    if (diff <= 4) score += 25;        // same version
    else if (diff <= 10) score += 10;
    else if (diff > 30) score -= 30;   // extended / mix / different song
  }

  // 4) covers / remixes / slowed / live ... (unless the real song title has that word)
  for (const w of BAD_WORDS) {
    const re = new RegExp(`(^| )${w}( |$)`);
    if (re.test(vt) && !re.test(wantRaw)) score -= 40;
  }

  return { v, score, ratio, phrase, artistOk, titleOk: phrase || ratio >= 0.6 };
}

/** Keeps only videos that really are this song, best first. */
function pickMatches(videos, track) {
  const scored = videos.map((v) => scoreVideo(v, track)).sort((a, b) => b.score - a.score);
  log(
    "[MATCH] wanted:", `${track.artist} - ${track.title}`, "| top:",
    scored.slice(0, 3).map((x) => `${Math.round(x.score)} "${x.v.title}"`).join("  ||  ") || "(none)"
  );
  return scored.filter((x) => x.titleOk && x.score >= 45).map((x) => x.v);
}

// ==========================================
// APPLE MUSIC + SPOTIFY SEARCH
// ==========================================

function fromApple(r) {
  return {
    source: "apple", title: r.trackName, artist: r.artistName, album: r.collectionName,
    durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : 0,
    url: r.trackViewUrl, image: r.artworkUrl100,
  };
}

function fromSpotify(r) {
  return {
    source: "spotify", title: r.name, artist: (r.artists || []).map((a) => a.name).join(", "),
    album: r.album?.name, durationSec: r.duration_ms ? Math.round(r.duration_ms / 1000) : 0,
    url: r.external_urls?.spotify, image: r.album?.images?.[0]?.url,
  };
}

/** Apple Music search through the public iTunes Search API (no key needed). */
async function appleSearch(term, limit = 10) {
  const res = await fast.get("https://itunes.apple.com/search", {
    params: { term, media: "music", entity: "song", limit, country: APPLE_COUNTRY },
    timeout: CATALOG_TIMEOUT,
  });
  let data = res.data;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { data = null; } }
  return Array.isArray(data?.results) ? data.results.filter((r) => r.trackName) : [];
}

let spotifyToken = { value: "", exp: 0 };
async function spotifyAuth() {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return "";
  if (spotifyToken.value && Date.now() < spotifyToken.exp) return spotifyToken.value;
  const res = await fast.post("https://accounts.spotify.com/api/token", "grant_type=client_credentials", {
    headers: {
      Authorization: "Basic " + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: CATALOG_TIMEOUT,
  });
  spotifyToken = { value: res.data.access_token, exp: Date.now() + (res.data.expires_in - 60) * 1000 };
  return spotifyToken.value;
}

/** Spotify search. Returns [] when no Spotify keys are set. */
async function spotifySearch(term, limit = 10) {
  const token = await spotifyAuth();
  if (!token) return [];
  const res = await fast.get("https://api.spotify.com/v1/search", {
    params: { q: term, type: "track", limit },
    headers: { Authorization: `Bearer ${token}` },
    timeout: CATALOG_TIMEOUT,
  });
  return res.data?.tracks?.items || [];
}

/** How well a catalog item matches the song Shazam identified. */
function metaScore(item, want) {
  const it = coreTitle(item.title);
  const wt = coreTitle(want.title);
  let sc = 0;
  if (it && it === wt) sc += 60;
  else if (it && wt && (hasPhrase(it, wt) || hasPhrase(wt, it))) sc += 35;
  const ia = plain(item.artist);
  if (artistNames(want.artist).some((a) => hasPhrase(ia, a) || a === ia)) sc += 30;
  return sc;
}

function pickBestMeta(items, want) {
  let best = null;
  for (const item of items) {
    const sc = metaScore(item, want);
    if (!best || sc > best.sc) best = { item, sc };
  }
  return best && best.sc >= 65 ? best.item : null;
}

/** Looks the identified song up on Apple Music + Spotify. Returns { apple, spotify, durations, album } | null. */
async function lookupCatalog(want) {
  const key = "cat:" + plain(`${want.artist} ${want.title}`);
  const hit = cacheGet(DL_STORE.catalog, key);
  if (hit) return hit.result;

  const term = `${want.artist} ${want.title}`.trim();
  const [a, sp] = await Promise.allSettled([
    withTimeout(appleSearch(term), CATALOG_TIMEOUT + 2000, "Apple Music"),
    withTimeout(spotifySearch(term), CATALOG_TIMEOUT + 2000, "Spotify"),
  ]);
  if (a.status === "rejected") log("[CATALOG] Apple Music:", errMessage(a.reason));
  if (sp.status === "rejected") log("[CATALOG] Spotify:", errMessage(sp.reason));

  const apple = a.status === "fulfilled" ? pickBestMeta(a.value.map(fromApple), want) : null;
  const spotify = sp.status === "fulfilled" ? pickBestMeta(sp.value.map(fromSpotify), want) : null;
  if (!apple && !spotify) return null;

  const durations = [apple, spotify].filter((x) => x && x.durationSec).map((x) => x.durationSec);
  const result = { apple, spotify, durations, album: (apple || spotify).album };
  cacheSet(DL_STORE.catalog, key, { result }, 50);
  log(`[CATALOG] ${want.artist} - ${want.title} → apple:${apple ? "yes" : "no"} spotify:${spotify ? "yes" : "no"} length:${durations.join("/")}s`);
  return result;
}

const QUERY_NOISE = new Set(["official", "audio", "video", "lyrics", "lyric", "song", "music", "mp3", "download", "hd", "full", "feat", "ft", "featuring"]);

/** For typed searches (.spotify song name): find the real song on Spotify / Apple Music first. */
async function lookupCatalogByQuery(text, minTokens = 1) {
  const tokens = plain(text).split(" ").filter((t) => t && !QUERY_NOISE.has(t));
  if (!tokens.length || tokens.length < minTokens) return null;
  const term = tokens.join(" ");

  const [a, sp] = await Promise.allSettled([
    withTimeout(appleSearch(term, 5), CATALOG_TIMEOUT + 2000, "Apple Music"),
    withTimeout(spotifySearch(term, 5), CATALOG_TIMEOUT + 2000, "Spotify"),
  ]);
  const items = [
    ...(sp.status === "fulfilled" ? sp.value.map(fromSpotify) : []),
    ...(a.status === "fulfilled" ? a.value.map(fromApple) : []),
  ].filter((x) => x.title && x.artist);
  if (!items.length) return null;

  let best = null;
  for (const item of items) {
    const have = new Set(plain(`${item.title} ${item.artist}`).split(" "));
    const ratio = tokens.filter((t) => have.has(t)).length / tokens.length;
    if (!best || ratio > best.ratio) best = { item, ratio };
  }
  if (!best || best.ratio < 0.75) return null;

  const want = { title: best.item.title, artist: best.item.artist };
  const same = items.filter((x) => metaScore(x, want) >= 65);
  return {
    title: best.item.title,
    artist: best.item.artist,
    album: best.item.album,
    durations: same.map((x) => x.durationSec).filter(Boolean),
  };
}

/** .spotify <text>: use the real song from Spotify/Apple Music, else a plain YouTube search. */
async function findBestForQuery(text) {
  try {
    const cat = await lookupCatalogByQuery(text);
    if (cat) {
      const track = { title: cat.title, artist: cat.artist, album: cat.album, durations: cat.durations };
      const entry = await findSongCandidates(track);
      if (entry.candidates.length) {
        log(`[SONG] "${text}" → ${track.artist} - ${track.title}`);
        entry.track = track;
        return entry;
      }
    }
  } catch (e) {
    log("[SONG] catalog lookup failed, using plain search:", e.message);
  }
  return findCandidates(text);
}

/** Search YouTube for the identified song and return only real matches. */
async function findSongCandidates(track) {
  const key = `song:${plain(track.artist)}|${plain(track.title)}`;
  const hit = cacheGet(DL_STORE.search, key);
  if (hit) return hit;

  const queries = [
    `${track.artist} ${track.title} official audio`,
    `${track.artist} - ${track.title}`,
    `${track.title} ${track.artist} topic`,
  ];
  const settled = await Promise.allSettled(queries.map((q) => yts(q)));
  if (settled.every((r) => r.status !== "fulfilled")) {
    throw new Error(settled[0].reason?.message || "YouTube search failed");
  }

  const seen = new Set();
  const videos = [];
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const v of r.value.videos || []) {
      const id = v.videoId || v.url;
      if (!v.url || seen.has(id)) continue;
      seen.add(id);
      videos.push(v);
    }
  }

  const usable = videos.filter((v) => typeof v.seconds === "number" && v.seconds >= 40 && v.seconds <= MAX_SECONDS);
  const entry = { candidates: pickMatches(usable, track).slice(0, MAX_CANDIDATES), winner: null };
  if (entry.candidates.length) cacheSet(DL_STORE.search, key, entry, 50);
  return entry;
}

/** Search YouTube (cached). Returns { candidates, winner }.
 *  Pass `track` (from Shazam) to get only videos that match that exact song. */
async function findCandidates(query, track = null) {
  if (track && track.title) return findSongCandidates(track);

  const key = query.trim().toLowerCase();
  const hit = cacheGet(DL_STORE.search, key);
  if (hit) return hit;

  const res = await yts(query);
  const videos = (res.videos || []).filter((v) => v.url);
  let ok = videos.filter((v) => typeof v.seconds === "number" && v.seconds > 0 && v.seconds <= MAX_SECONDS);
  if (!ok.length) ok = videos.slice(0, 2);

  const entry = { candidates: ok.slice(0, MAX_CANDIDATES), winner: null };
  if (entry.candidates.length) cacheSet(DL_STORE.search, key, entry, 50);
  return entry;
}

/** Fast, playable audio for a list of YouTube results (cache → race). */
async function getPlayableAudio(candidates, searchEntry) {
  if (!candidates?.length) throw new Error("no YouTube match found");

  const hit =
    (searchEntry?.winner && cacheGet(DL_STORE.audio, searchEntry.winner)) ||
    cacheGet(DL_STORE.audio, candidates[0].videoId);
  if (hit) { log("[DL] audio served from cache:", hit.title); return hit; }

  const res = await firstSuccess(buildTasks(candidates, "mp3"), (t, s) => runTask(t, s, "mp3"), STAGGER_MS);
  const media = {
    buffer: res.buffer,
    mimetype: res.mimetype,
    title: res.video.title,
    videoId: res.video.videoId,
  };
  cacheSet(DL_STORE.audio, media.videoId, media, CACHE_MAX);
  if (searchEntry) searchEntry.winner = media.videoId;
  log(`[DL] audio ready: ${media.title} (${(media.buffer.length / 1048576).toFixed(1)} MB, ${media.mimetype})`);
  return media;
}

async function sendAudio(ednut, m, media) {
  const ext = media.mimetype === "audio/mp4" ? "m4a" : "mp3";
  await ednut.sendMessage(
    m.chat,
    { audio: media.buffer, mimetype: media.mimetype, fileName: `${safeName(media.title)}.${ext}`, ptt: false },
    { quoted: m }
  );
}

// ==========================================
// SHAZAM — session helpers
// ==========================================

function shazamDigits(x) {
  return String(x || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

function shazamNormalizeSender(m) {
  return (m.sender || m.key?.participant || m.key?.remoteJid || "").toString();
}

function shazamSessionKey(chat, sender) {
  return `${chat}:${shazamDigits(sender)}`;
}

/** Id of the message that this message is replying to (if any). */
function shazamQuotedId(m) {
  return (
    m.quoted?.id ||
    m.quoted?.key?.id ||
    m.msg?.contextInfo?.stanzaId ||
    m.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    null
  );
}

function shazamStorePending(key, track) {
  const entry = { ...track, key, msgId: null, prefetch: null, expires: Date.now() + SHAZAM_PENDING_TTL };
  shazamPending.set(key, entry);
  setTimeout(() => {
    const e = shazamPending.get(key);
    if (e && e.expires <= Date.now()) shazamPending.delete(key);
  }, SHAZAM_PENDING_TTL + 1000);
  return entry;
}

function shazamAttachMsgId(entry, msgId) {
  if (!msgId) return;
  entry.msgId = msgId;
  shazamByMsgId.set(msgId, entry);
  setTimeout(() => {
    if (shazamByMsgId.get(msgId) === entry) shazamByMsgId.delete(msgId);
  }, SHAZAM_PENDING_TTL + 1000);
}

function shazamClear(entry) {
  if (entry.key && shazamPending.get(entry.key) === entry) shazamPending.delete(entry.key);
  if (entry.msgId && shazamByMsgId.get(entry.msgId) === entry) shazamByMsgId.delete(entry.msgId);
}

function shazamRestore(entry) {
  entry.expires = Date.now() + SHAZAM_PENDING_TTL;
  if (entry.key) shazamPending.set(entry.key, entry);
  if (entry.msgId) shazamByMsgId.set(entry.msgId, entry);
}

/** Finds the pending song for this reply. Returns { entry, how } | null */
function shazamFindPending(m) {
  const now = Date.now();

  const qid = shazamQuotedId(m);
  if (qid) {
    const e = shazamByMsgId.get(qid);
    if (e && e.expires > now) return { entry: e, how: "quoted card" };
  }

  const key = shazamSessionKey(m.chat, shazamNormalizeSender(m));
  const e = shazamPending.get(key);
  if (e && e.expires > now) return { entry: e, how: "sender" };

  return null;
}

// ==========================================
// SHAZAM — identification
// ==========================================

/**
 * Downloads the quoted media. Tries the wrapper's own .download()
 * first; falls back to Baileys' downloadContentFromMessage.
 */
async function downloadQuoted(quoted) {
  if (typeof quoted.download === "function") {
    return await quoted.download();
  }
  const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
  const msg = quoted.msg || quoted;
  const type = /audio/.test(msg.mimetype) ? "audio" : "video";
  const stream = await downloadContentFromMessage(msg, type);
  let buffer = Buffer.from([]);
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
  return buffer;
}

function shazamExtFromMime(mime = "") {
  if (/ogg|opus/.test(mime)) return ".ogg";
  if (/mpeg|mp3/.test(mime)) return ".mp3";
  if (/mp4|m4a|aac/.test(mime)) return /video/.test(mime) ? ".mp4" : ".m4a";
  if (/webm/.test(mime)) return ".webm";
  if (/wav/.test(mime)) return ".wav";
  if (/video/.test(mime)) return ".mp4";
  return ".ogg"; // WhatsApp voice notes are ogg/opus
}

/** Cuts a short mono mp3 clip (async). Resolves true on success. */
function shazamMakeClip(inPath, outPath, startSec) {
  return new Promise((resolve) => {
    const bin = getFfmpeg();
    if (!bin) return resolve(false);
    execFile(
      bin,
      ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(startSec), "-i", inPath, "-t", String(SHAZAM_CLIP_SECONDS), "-vn", "-ac", "1", "-ar", "44100", "-b:a", "128k", outPath],
      { timeout: 40000 },
      (err) => {
        if (err) { log("[SHAZAM] ffmpeg clip failed:", err.message); return resolve(false); }
        try { resolve(fs.existsSync(outPath) && fs.statSync(outPath).size > 2000); } catch (e) { resolve(false); }
      }
    );
  });
}

let shazamClient = null;
function getShazam() {
  if (!shazamClient) {
    const { Shazam } = require("node-shazam"); // lazy: a missing package won't break the other commands
    shazamClient = new Shazam();
  }
  return shazamClient;
}

/** One upload to AudD. Returns track | null. Throws on real API errors. */
async function shazamAuddRequest(filePath, fileName) {
  const form = new FormData();
  form.append("api_token", AUDD_API_KEY);
  form.append("return", "apple_music,spotify");
  form.append("file", fs.createReadStream(filePath), { filename: fileName });

  const { data } = await fast.post(AUDD_ENDPOINT, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  log("[SHAZAM] AudD response:", JSON.stringify(data).slice(0, 400));

  if (data?.status === "error") {
    const code = data.error?.error_code;
    const msg = data.error?.error_message || "unknown AudD error";
    throw new Error(`AudD error ${code ?? ""}: ${msg}`.trim());
  }

  if (data?.status === "success" && data.result) {
    return { title: data.result.title, artist: data.result.artist, album: data.result.album };
  }
  return null; // genuinely no match
}

function trackKey(t) {
  return `${coreTitle(t.title)}|${artistNames(t.artist)[0] || ""}`;
}

function noAudioError(why) {
  return Object.assign(new Error(`no audible audio (${why})`), { code: "NO_AUDIO", why });
}

/** Reads length / audio track / loudness with ffmpeg. Returns null when ffmpeg is not available. */
function probeAudio(filePath) {
  return new Promise((resolve) => {
    const bin = getFfmpeg();
    if (!bin) return resolve(null);
    execFile(
      bin,
      ["-hide_banner", "-nostats", "-t", "180", "-i", filePath, "-vn", "-af", "volumedetect", "-f", "null", "-"],
      { timeout: 60000, maxBuffer: 16 * 1024 * 1024 },
      (err, _so, stderr) => {
        const t = String(stderr || "");
        const d = t.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        const seconds = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + parseFloat(d[3]) : 0;
        const hasAudio = /Stream #[^\n]*Audio:/.test(t);
        const mx = t.match(/max_volume:\s*(-?inf|-?[\d.]+)\s*dB/i);
        const maxDb = mx ? (/inf/i.test(mx[1]) ? -Infinity : parseFloat(mx[1])) : null;
        resolve({ seconds, hasAudio, maxDb, unreadable: !!err && !d && !hasAudio });
      }
    );
  });
}

/**
 * Where to listen. Short voice notes: three overlapping slices. Videos / songs: skip the
 * intro (skits, talking) and sample the middle, where the music really is.
 */
function clipPositions(D) {
  if (!D || D <= 0) return [0, 12, 24];
  const raw = D <= 30 ? [0, D * 0.35, D * 0.6] : [Math.min(10, D * 0.15), D * 0.4, D * 0.65];
  const out = [];
  for (const p of raw) {
    const st = Math.max(0, Math.min(Math.round(p), Math.max(0, Math.floor(D - 6)))); // keep ≥6s to listen to
    if (!out.some((x) => Math.abs(x - st) < 3)) out.push(st);
  }
  return out;
}

/**
 * Identify a track. Listens to up to three clips; for each clip:
 *   1) Shazam (node-shazam)   2) AudD (only if AUDD_API_KEY is set)
 * Two clips that give the SAME song confirm it ({ confident: true }). A result nothing
 * else confirms is returned with { confident: false } so it is never shown as fact.
 * Throws a NO_AUDIO error when the file has no audible sound (so no fake match).
 * Returns { title, artist, album, confident } | null (genuinely no match).
 */
async function shazamIdentify(buffer, mime = "") {
  const stamp = Date.now() + "_" + crypto.randomBytes(3).toString("hex");
  const ext = shazamExtFromMime(mime);
  const inPath = path.join(TMP, `shazam_${stamp}${ext}`);
  const created = [inPath];
  await fs.promises.writeFile(inPath, buffer);

  const errors = [];
  let completedCalls = 0;
  const found = []; // every identification, in order

  const agreed = () => {
    for (let i = 0; i < found.length; i++)
      for (let j = i + 1; j < found.length; j++)
        if (trackKey(found[i]) === trackKey(found[j])) return found[i];
    return null;
  };

  try {
    // 1) is there anything to listen to?
    let duration = 0;
    const info = await probeAudio(inPath);
    if (info) {
      duration = info.seconds;
      log(`[SHAZAM] media: ${duration.toFixed(1)}s | audio track: ${info.hasAudio ? "yes" : "NO"} | loudest: ${info.maxDb} dB`);
      if (info.unreadable) throw noAudioError("the file could not be read");
      if (!info.hasAudio) throw noAudioError("it has no audio track");
      if (info.maxDb !== null && info.maxDb < SILENCE_DB) throw noAudioError("it is silent");
      if (duration > 0 && duration < 1.5) throw noAudioError("it is too short");
    }

    // 2) listen to clips spread through the file
    const bin = getFfmpeg();
    for (const start of clipPositions(duration)) {
      const clipPath = path.join(TMP, `shazam_${stamp}_${start}.mp3`);
      created.push(clipPath);

      let usePath = null;
      let useName = `shazam_${start}.mp3`;
      if (bin) {
        if (!(await shazamMakeClip(inPath, clipPath, start))) {
          log(`[SHAZAM] no usable clip at ${start}s`);
          continue; // NEVER hand the raw file to Shazam when ffmpeg ran: that gave random matches
        }
        const ci = await probeAudio(clipPath);
        if (ci && ci.maxDb !== null && ci.maxDb < SILENCE_DB) {
          log(`[SHAZAM] clip @${start}s is silent, skipped`);
          continue;
        }
        usePath = clipPath;
      } else if (start === 0) {
        usePath = inPath; // no ffmpeg at all: try the original once
        useName = `shazam${ext}`;
      } else {
        break;
      }

      const before = found.length;

      // Provider 1: Shazam
      try {
        const r = await withTimeout(getShazam().recognise(usePath, "en-US", true), 40000, "Shazam");
        completedCalls++;
        log(`[SHAZAM] Shazam @${start}s:`, r ? `${r.title} - ${r.artist}` : "no match");
        if (r?.title) found.push({ title: r.title, artist: r.artist, album: r.album });
      } catch (e) {
        errors.push("Shazam: " + e.message);
        log(`[SHAZAM] Shazam @${start}s error:`, e.message);
      }

      // Provider 2: AudD backup (optional), only if Shazam found nothing here
      if (AUDD_API_KEY && found.length === before) {
        try {
          const t = await shazamAuddRequest(usePath, useName);
          completedCalls++;
          if (t) found.push(t);
        } catch (e) {
          errors.push(e.message);
          log(`[SHAZAM] AudD @${start}s error:`, e.message);
        }
      }

      const sure = agreed();
      if (sure) {
        log(`[SHAZAM] two clips agree → ${sure.title} - ${sure.artist}`);
        return { ...sure, confident: true };
      }
    }

    if (found.length) {
      log(`[SHAZAM] NOT confirmed (${found.length} clip result${found.length > 1 ? "s that disagree" : ", no second clip agrees"}) → low confidence`);
      return { ...found[0], confident: false };
    }
    if (completedCalls === 0 && errors.length) throw new Error(errors.join(" | "));
    return null;
  } finally {
    for (const p of created) fs.promises.unlink(p).catch(() => {});
  }
}

/** The video's own title (its caption) is a strong hint when the audio is not clear. */
async function captionHint(quoted) {
  const raw = String(quoted?.text || quoted?.caption || quoted?.msg?.caption || quoted?.body || "");
  const line = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[^\p{L}\p{N}]+/u, "").trim())
    .find((l) => /\p{L}/u.test(l));
  if (!line || /^(shazam|findsong|whatsong)\b/i.test(line)) return null;
  try {
    const cat = await lookupCatalogByQuery(line, 3);
    if (!cat) return null;
    log(`[SHAZAM] video title "${line}" → ${cat.artist} - ${cat.title}`);
    return { title: cat.title, artist: cat.artist, album: cat.album, durations: cat.durations };
  } catch (e) {
    log("[SHAZAM] title hint failed:", e.message);
    return null;
  }
}

function shazamFormatCaption(track) {
  const v = track.video || {};
  const duration = v.duration?.timestamp || v.timestamp || "";
  const views = typeof v.views === "number" ? v.views.toLocaleString() : (v.views || "");
  const uploaded = v.ago || v.uploadDate || "";

  return (
    `🎧 ꜰᴏᴜɴᴅ ɪᴛ!\n` +
    `➟ 🎵 ᴛɪᴛʟᴇ: ${track.title}\n` +
    `➟ 🎤 ᴀʀᴛɪꜱᴛ: ${track.artist}\n` +
    (track.album ? `➟ 💿 ᴀʟʙᴜᴍ: ${track.album}\n` : "") +
    (track.catalog?.apple?.url ? `➟ 🍎 ᴀᴘᴘʟᴇ ᴍᴜꜱɪᴄ: ${track.catalog.apple.url}\n` : "") +
    (track.catalog?.spotify?.url ? `➟ 🟢 ꜱᴘᴏᴛɪꜰʏ: ${track.catalog.spotify.url}\n` : "") +
    (track.fromTitle
      ? `➟ ℹ️ ꜰʀᴏᴍ ᴛʜᴇ ᴠɪᴅᴇᴏ ᴛɪᴛʟᴇ (ᴀᴜᴅɪᴏ ᴡᴀꜱ ɴᴏᴛ ᴄʟᴇᴀʀ)\n`
      : track.confident === false
        ? `➟ ⚠️ ʟᴏᴡ ᴄᴏɴꜰɪᴅᴇɴᴄᴇ - ᴏɴʟʏ ᴏɴᴇ ᴘᴀʀᴛ ᴏꜰ ᴛʜᴇ ᴀᴜᴅɪᴏ ᴍᴀᴛᴄʜᴇᴅ\n`
        : "") +
    `➟ ⏱️ ᴅᴜʀᴀᴛɪᴏɴ: ${duration}\n` +
    `➟ ᴠɪᴇᴡꜱ: ${views}\n` +
    `➟ ᴅᴀᴛᴇ ᴜᴘʟᴏᴀᴅᴇᴅ: ${uploaded}\n` +
    `📥 ᴅᴏᴡɴʟᴏᴀᴅ ᴏᴘᴛɪᴏɴꜱ\n` +
    `➊ ➜ 🎵 ᴀᴜᴅɪᴏ (ᴍᴘ3)\n` +
    `➋ ➜ 🎬 ᴠɪᴅᴇᴏ (ᴍᴘ4)\n` +
    `💬 ʀᴇᴘʟʏ ᴡɪᴛʜ 1 ᴏʀ 2 ᴛᴏ ᴄᴏɴᴛɪɴᴜᴇ.`
  );
}

// ==========================================
// SHAZAM — "1" (audio) / "2" (video) reply
// ==========================================

async function shazamSendChoice(ednut, m, reply, track, choice) {
  const kind = choice === "2" ? "mp4" : "mp3";
  react(ednut, m, "⏳");

  try {
    if (!track.candidates?.length) {
      react(ednut, m, "⚠️");
      await reply(`⚠️ I identified "${track.artist} - ${track.title}" but couldn't find the exact song on YouTube (I won't send a different song).\n\nTry: .spotify ${track.artist} ${track.title}`);
      return false;
    }

    if (kind === "mp3") {
      // Usually already downloaded in the background while you read the card.
      let media = null;
      if (track.prefetch) {
        log("[SHAZAM] using background download");
        media = await track.prefetch;
        track.prefetch = null; // a retry must start fresh
      }
      if (!media) media = await getPlayableAudio(track.candidates, track.searchEntry);
      await sendAudio(ednut, m, { ...media, title: `${track.artist} - ${track.title}` });
    } else {
      const res = await firstSuccess(buildTasks(track.candidates, "mp4"), (t, s) => runTask(t, s, "mp4"), STAGGER_MS);
      const buffer = res.buffer;
      log(`[SHAZAM] mp4 downloaded: ${(buffer.length / 1048576).toFixed(1)} MB`);

      const tooBig = buffer.length > 60 * 1024 * 1024; // very large videos go as a document
      const caption = `🎬 ${track.title} — ${track.artist}`;
      const name = safeName(`${track.title} - ${track.artist}`);
      await ednut.sendMessage(
        m.chat,
        tooBig
          ? { document: buffer, mimetype: "video/mp4", fileName: `${name}.mp4`, caption }
          : { video: buffer, caption, mimetype: "video/mp4" },
        { quoted: m }
      );
    }

    react(ednut, m, "✅");
    return true;
  } catch (e) {
    log(`[SHAZAM] ${kind} send failed:`, e.message);
    react(ednut, m, "⚠️");
    await reply(`⚠️ ${kind === "mp4" ? "Video" : "Audio"} failed: ${e.message}\n\nReply with ${choice} again to retry.`);
    return false;
  }
}

/**
 * Raw intercept: catches a bare "1" or "2" reply after a .shazam
 * identification, without needing a command prefix.
 *
 * handler.js block (already in place):
 *
 *   try {
 *     const sz = require('./plugins/EmmyFrosh/download-new');
 *     if (!m.text && body) m.text = body;
 *     if (sz.rawHandler && (!m.key.fromMe || isHighStaff) && (!isPrivateMode || isHighStaff)) {
 *       const handled = await sz.rawHandler(m, ednut);
 *       if (handled) return;
 *     }
 *   } catch (e) {
 *     console.log('[SHAZAM REPLY ERROR]', e.message);
 *   }
 */
async function shazamRawHandler(m, ednut, opts = {}) {
  const bodyText = (m.text || m.body || m.message?.conversation || m.message?.extendedTextMessage?.text || "").toString().trim();
  if (bodyText !== "1" && bodyText !== "2") return false;

  const found = shazamFindPending(m);
  if (!found) {
    if (!opts.quiet) {
      log(
        "[SHAZAM] reply", bodyText, "ignored — nothing pending. key =",
        shazamSessionKey(m.chat, shazamNormalizeSender(m)),
        "| quotedId =", shazamQuotedId(m),
        "| pending keys =", [...shazamPending.keys()].join(", ") || "(none)"
      );
    }
    return false;
  }

  const entry = found.entry;
  log(`[SHAZAM] reply ${bodyText} matched (${found.how}) → ${entry.artist} - ${entry.title}`);

  const reply = async (text) => ednut.sendMessage(m.chat, { text }, { quoted: m });

  // Remove the pending entry while working (stops double-triggers), but put it
  // back if the fetch failed so the user can just reply again.
  shazamClear(entry);
  const ok = await shazamSendChoice(ednut, m, reply, entry, bodyText);
  if (!ok) shazamRestore(entry);
  return true;
}

// ==========================================
// COMMANDS
// ==========================================

const plugins = [
  {
    command: ["spotify"],
    alias: ["spot", "spplay"],
    description: "Search and download a song (plays in WhatsApp)",
    category: "Downloader",
    filename: __filename,
    async execute(m, { ednut, text, reply }) {
      if (!text) return reply("❌ Please provide a song name to search.");

      react(ednut, m, "🔎"); // searching

      let entry;
      try {
        entry = await findBestForQuery(text);
      } catch (e) {
        log("[SONG] search error:", e.message);
        react(ednut, m, "❌");
        return reply(`❌ Search failed: ${e.message}`);
      }

      if (!entry.candidates.length) {
        react(ednut, m, "❌");
        return reply("❌ No results found for that search.");
      }

      react(ednut, m, "⬇️"); // found, downloading

      let media;
      try {
        media = await getPlayableAudio(entry.candidates, entry);
      } catch (e) {
        log("[SONG] download error:", e.message);
        react(ednut, m, "❌");
        return reply(`❌ Download failed: ${e.message}\n\nThe download services may be blocked right now. Try again in a moment, or try a different song.`);
      }

      try {
        await sendAudio(ednut, m, entry.track ? { ...media, title: `${entry.track.artist} - ${entry.track.title}` } : media);
      } catch (e) {
        log("[SONG] send error:", e.message);
        react(ednut, m, "❌");
        return reply(`❌ Could not send the audio: ${e.message}`);
      }

      react(ednut, m, "✅");
    },
  },

  // ==========================================
  // CAPCUT DOWNLOADER
  // ==========================================
  {
    command: ["capcut"],
    description: "🎬 Download Capcut video by URL",
    category: "Downloader",
    ban: false,
    gcban: false,
    async execute(m, { ednut, text, reply }) {
      if (!text || !/^https?:\/\/.*capcut\.com/.test(text)) {
        return reply("❌ Please provide a valid Capcut template URL.");
      }

      let json;
      try {
        const res = await fetch(`https://api.yogik.id/downloader/capcut?url=${encodeURIComponent(text)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        json = await res.json();
      } catch (e) {
        log("[CAPCUT] fetch error:", e.message);
        return reply(`❌ Error occurred while processing the Capcut link: ${e.message}`);
      }

      if (!json.status || !json.result?.videoUrl) {
        log("[CAPCUT] unexpected response shape:", JSON.stringify(json).slice(0, 300));
        return reply("❌ Failed to fetch Capcut video (API returned no video URL — see console for the raw response).");
      }

      await ednut.sendMessage(
        m.chat,
        {
          video: { url: json.result.videoUrl },
          caption: global.footer,
        },
        { quoted: m }
      );
    },
  },

  // ==========================================
  // SHAZAM — song identification
  // ==========================================
  {
    command: ["shazam"],
    alias: ["findsong", "whatsong"],
    category: "Downloader",
    description: "Identify a song from a voice note/audio/video, then reply 1 (audio) or 2 (video) to fetch it.",
    use: "(reply to audio/video)",
    async execute(m, { reply, ednut, quoted, isMedia, mime }) {
      if (!quoted || !isMedia || !/audio|video/.test(mime)) {
        return reply("🎵 Reply to a voice note, audio, or video with *.shazam* to identify the song.");
      }

      react(ednut, m, "🔎");

      let buffer;
      try {
        buffer = await downloadQuoted(quoted);
      } catch (e) {
        react(ednut, m, "⚠️");
        return reply("⚠️ Could not download the media: " + e.message);
      }

      let track = null;
      try {
        track = await shazamIdentify(buffer, mime);
      } catch (e) {
        if (e.code === "NO_AUDIO") {
          log("[SHAZAM]", e.message);
          react(ednut, m, "⚠️");
          return reply(
            `⚠️ I can't identify anything here: ${e.why}.\n\nReply to a video or voice note where the music is actually playing.`
          );
        }
        log("[SHAZAM] identify error:", e.message);
        react(ednut, m, "⚠️");
        // Real API problem — NOT "song not found".
        return reply(
          "⚠️ Song recognition service error:\n" + e.message +
          "\n\nIf it says Cannot find module 'node-shazam', run: npm i node-shazam"
        );
      }

      // Audio not clear or not confirmed? The video's own title is a strong hint.
      if (!track || !track.confident) {
        const hint = await captionHint(quoted);
        if (hint) {
          if (track && metaScore(hint, track) >= 65) track.confident = true; // audio and title agree
          else track = { ...hint, confident: true, fromTitle: true };
        }
      }

      if (!track) {
        react(ednut, m, "❌");
        return reply("❌ Couldn't identify that track. Try a clearer 10-15s clip with the music louder than any talking.");
      }

      // Look the song up on Apple Music + Spotify: gives the official length (to pick
      // the right YouTube version) and the store links for the card.
      try {
        const cat = await lookupCatalog(track);
        if (cat) {
          track.catalog = cat;
          track.durations = cat.durations;
          if (!track.album && cat.album) track.album = cat.album;
        }
      } catch (e) {
        log("[SHAZAM] Apple Music / Spotify lookup failed:", e.message);
      }

      // Find the YouTube matches once, now, so replying 1/2 needs no search.
      track.candidates = [];
      track.searchEntry = null;
      try {
        const found = await findCandidates(`${track.artist} - ${track.title}`, track);
        track.candidates = found.candidates;
        track.searchEntry = found;
      } catch (e) {
        // non-fatal — we can still show title/artist/album, just no duration/views
        log("[SHAZAM] YouTube search failed:", e.message);
      }
      track.video = track.candidates[0] || null;

      // Store BEFORE sending, so a fast reply can never miss it.
      const key = shazamSessionKey(m.chat, shazamNormalizeSender(m));
      const entry = shazamStorePending(key, track);
      log("[SHAZAM] pending saved for", key);

      // Start downloading the mp3 in the background right away. By the time
      // you read the card and reply "1", it is usually already done.
      if (SHAZAM_PREFETCH && entry.candidates.length && (entry.video?.seconds || 0) <= MAX_SECONDS) {
        entry.prefetch = getPlayableAudio(entry.candidates, entry.searchEntry).catch((e) => {
          log("[SHAZAM] background download failed (will retry on reply):", e.message);
          return null;
        });
      }

      react(ednut, m, "✅");

      // Send the card ourselves so we can remember its message id, which lets
      // a reply to this exact card be matched even if the sender id differs.
      try {
        const sent = await ednut.sendMessage(m.chat, { text: shazamFormatCaption(entry) }, { quoted: m });
        shazamAttachMsgId(entry, sent?.key?.id);
      } catch (e) {
        log("[SHAZAM] could not send card:", e.message);
        await reply(shazamFormatCaption(entry));
      }
    },
  },

  // ==========================================
  // Hidden fallback: bare "1" / "2" as commands (no-prefix mode only).
  // If handler.js already handled the reply, this never runs. If nothing is
  // pending it silently does nothing. Delete this block if you use a prefix.
  // ==========================================
  {
    command: ["1", "2"],
    category: "Hidden",
    description: "Internal: answers the .shazam 1/2 prompt",
    async execute(m, { ednut }) {
      await shazamRawHandler(m, ednut, { quiet: true });
    },
  },
];

// Attach the raw intercept as a property on the exported array (arrays are
// still objects in JS, so this is safe) — see wiring note above shazamRawHandler.
plugins.rawHandler = shazamRawHandler;

module.exports = plugins;