const axios = require("axios");
const QuickLRU = require("quick-lru").default;
const { Sticker, StickerTypes } = require("wa-sticker-formatter"); // npm install wa-sticker-formatter
const FormData = require("form-data");
const mimeLib = require("mime-types");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const dns = require("dns").promises;
const { spawn } = require("child_process");

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ==========================================
// STICKER PACK CONFIG
// ==========================================
const STICKER_PACK_NAME   = "𝛯𝛭𝛭𝑌𝐹𝑅𝛩𝑆𝛨 💔";
const STICKER_PACK_AUTHOR = "EMMYFROSH";

// ==========================================
// IMAGE GENERATION (Pollinations.ai)
// Free, no API key required — separate from the Groq-based text chat,
// so image requests still work even if GROQ_API_KEY isn't set.
// ==========================================
const IMG_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const looksLikeImage = (b) => b && b.length > 2000 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || (b.slice(0, 4).toString() === "RIFF") || b.slice(0, 3).toString() === "GIF");

async function fetchImage(url, timeout = 50000) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout, headers: { "User-Agent": IMG_UA, Accept: "image/*,*/*" } });
  const buf = Buffer.from(res.data);
  if (!looksLikeImage(buf)) throw new Error("server did not return an image");
  return buf;
}

// Tries several free image servers (and retries when one is busy / 503) before giving up.
// Optional keys in .env:  HF_TOKEN (huggingface.co, free)  ·  POLLINATIONS_TOKEN
async function generateImage(prompt) {
  const p = encodeURIComponent(String(prompt).slice(0, 600));
  const seed = Math.floor(Math.random() * 1_000_000);
  const tok = process.env.POLLINATIONS_TOKEN ? `&token=${encodeURIComponent(process.env.POLLINATIONS_TOKEN)}` : "";
  const poll = (extra) => () => fetchImage(`https://image.pollinations.ai/prompt/${p}?width=768&height=768&nologo=true&seed=${seed}${extra}${tok}`);
  const providers = [
    ["pollinations-flux", poll("&model=flux"), 2],
    ["pollinations-turbo", poll("&model=turbo"), 2],
    ["pollinations", poll(""), 1],
    ["pollinations-alt", () => fetchImage(`https://pollinations.ai/p/${p}?width=768&height=768&nologo=true&seed=${seed}`), 1]
  ];
  if (process.env.HF_TOKEN) {
    providers.push(["huggingface", async () => {
      const res = await axios.post("https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell", { inputs: String(prompt).slice(0, 600) }, {
        responseType: "arraybuffer", timeout: 60000, headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, Accept: "image/png" }
      });
      const buf = Buffer.from(res.data);
      if (!looksLikeImage(buf)) throw new Error("huggingface did not return an image");
      return buf;
    }, 1]);
  }
  providers.push(["flux-api", () => fetchImage(`https://api.siputzx.my.id/api/ai/flux?prompt=${p}`), 1]);

  let lastErr;
  for (const [name, run, tries] of providers) {
    for (let i = 0; i < tries; i++) {
      try { return await run(); }
      catch (e) {
        lastErr = e;
        const code = e.response?.status;
        console.log(`IMAGE GEN [${name}] try ${i + 1} failed:`, code || e.message);
        if (code && code < 500 && code !== 429 && code !== 408) break; // not a busy-server error → next server
        await sleep(1500);
      }
    }
  }
  const err = new Error("image servers are busy");
  err.cause = lastErr;
  throw err;
}

// Matches things like:
//   "generate a pic of Apple"
//   "generate an image of a sunset"
//   "generate picture of a red car"
//   "generate Apple"                 (bare fallback, no "pic/image/of")
//   "I need a picture of Apple"
//   "I want a pic of a sunset"
//   "give me an image of a cat"
//   "send me a photo of a car"
//   "can I get a picture of Apple"
//   "draw me a pic of Apple"
function extractImagePrompt(msgText) {
  const patterns = [
    /^generate\s+(?:a|an|the)?\s*(?:pic|picture|photo|image)\s+of\s+(.+)$/i,
    /^(?:i\s+)?(?:need|want|wan)\s+(?:a|an|the)?\s*(?:pic|picture|photo|image)\s+of\s+(.+)$/i,
    /^(?:give|send)\s+me\s+(?:a|an|the)?\s*(?:pic|picture|photo|image)\s+of\s+(.+)$/i,
    /^can\s+(?:i\s+get|you\s+give\s+me)\s+(?:a|an|the)?\s*(?:pic|picture|photo|image)\s+of\s+(.+)$/i,
    /^draw\s+(?:me\s+)?(?:a|an|the)?\s*(?:pic|picture|photo|image)?\s*(?:of\s+)?(.+)$/i,
    // bare "generate X" fallback — kept last so the more specific patterns above win
    /^generate\s+(?:a|an|the)?\s*(?:pic|picture|photo|image)?\s*(.+)$/i,
  ];
  for (const p of patterns) {
    const match = msgText.match(p);
    if (match && match[1] && match[1].trim()) return match[1].trim();
  }
  return null;
}

// ==========================================
// IMAGE → STICKER
// Triggers on: an image message (direct or quoted) whose text/caption
// contains the word "sticker" (e.g. "sticker", "make this a sticker",
// "convert to sticker", "img to sticker"). Works both when the user sends
// a fresh image with that caption, and when they reply to an existing
// image/sticker with that word as plain text.
// ==========================================
const STICKER_TRIGGER_REGEX = /\bsticker\b/i;

// ==========================================
// MEDIA HELPERS — matches your url.js plugin's own pattern
// (m.quoted.download() / m.quoted.mimetype). Prefers a quoted message
// (replying to an image/sticker/video/audio); falls back to the current
// message itself if it's directly attached media with a download() method.
// ==========================================
function getDownloadableMedia(m) {
  if (m.quoted && typeof m.quoted.download === "function") return m.quoted;
  if (typeof m.download === "function") return m;
  return null;
}

async function uploadToUguu(buffer, mimeType) {
  const ext = mimeLib.extension(mimeType) || "bin";
  const form = new FormData();
  form.append("files[]", buffer, `file.${ext}`);
  const res = await axios.post("https://uguu.se/upload.php", form, {
    headers: form.getHeaders(),
  });
  const url = res?.data?.files?.[0]?.url;
  if (!url) throw new Error("Upload didn't return a URL");
  return url;
}

async function imageToSticker(buffer) {
  const sticker = new Sticker(buffer, {
    pack: STICKER_PACK_NAME,
    author: STICKER_PACK_AUTHOR,
    type: StickerTypes.FULL,
    quality: 70,
  });
  return sticker.toBuffer();
}

// ==========================================
// 📸 WEBSITE SCREENSHOT / 🎬 WEBSITE VIDEO
//   "screenshot https://site.com"   → FULL page picture (default)
//   "screenshot site.com top only"  → only the top part
//   "video https://site.com"        → short scrolling video of the page
//   Or reply to a message that has a link with just "screenshot" / "video".
//   With no link at all, the last site used in that chat (30 min) is used.
//
// Actions, done in the order you say them (need a browser: BROWSERLESS_TOKEN + npm i puppeteer-core,
// or playwright / puppeteer on a VPS):
//   click Suggest · type hello in search · press enter · scroll down / to bottom · wait 10 seconds
//   e.g. "click Suggest then scroll down then screenshot"
//
// Screenshot: uses a headless browser if the server has one (playwright or
// puppeteer) or a free cloud browser (BROWSERLESS_TOKEN + npm i puppeteer-core),
// otherwise free screenshot services (thum.io, then microlink). Actions need a browser.
// Video: scrolls the page in a browser and joins the frames with ffmpeg (npm i ffmpeg-static),
// or scrolls a full-page screenshot with ffmpeg when there is no browser.
// Private / local addresses are always refused.
// ==========================================
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|ng|co|me|app|dev|xyz|info|tv|gov|edu|ai|site|online|store|tech|ly|gg|cc|uk|us|ca|de|fr)\b(?:\/[^\s<>"']*)?/i;
const SHOT_RE  = /\b(?:screen\s?-?shot|ss|snap(?:shot)?|capture|preview)\b/i;
const VIDEO_RE = /\b(?:video|vid|record(?:ing)?|screen\s?-?record(?:ing)?|screencast)\b/i;
const _siteCooldown = new Map(); // chat → last request time
const _lastSite = new Map();     // chat → { url, at }  so "click X and send screenshot" works without the link
const VIEWPORT = { width: 1280, height: 720 };

function findUrl(...texts) {
  for (const t of texts) {
    const hit = (t || "").match(URL_RE)?.[0];
    if (!hit) continue;
    let u = hit.replace(/[.,;:!?)\]}]+$/, "");
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  }
  return null;
}

const isPrivateIp = (ip) =>
  /^(?:10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip) ||
  ip === "::1" || ip === "::" || /^(?:fc|fd|fe80)/i.test(ip) ||
  /^::ffff:(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.)/i.test(ip);

async function assertPublicUrl(u) {
  let url;
  try { url = new URL(u); } catch { throw new Error("that doesn't look like a valid link"); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("only http/https links work");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || /\.(?:local|internal|localhost)$/.test(host)) throw new Error("I can't open local/private addresses");
  let addrs;
  try { addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }); }
  catch { throw new Error("I can't find that website (check the link)"); }
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error("I can't open local/private addresses");
  return url.href;
}

// playwright first, then puppeteer. Returns null when neither is installed / can start.
async function launchBrowser() {
  const args = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];
  for (const lib of ["playwright", "puppeteer"]) {
    try {
      const mod = require(lib);
      return lib === "playwright" ? await mod.chromium.launch({ args }) : await mod.launch({ args, headless: true });
    } catch (e) { /* not installed or cannot start → try the next one */ }
  }
  // no browser on this server → a free cloud browser (Browserless): set BROWSERLESS_TOKEN in .env and run  npm i puppeteer-core
  if (process.env.BROWSERLESS_TOKEN) {
    const endpoint = `${process.env.BROWSERLESS_URL || "wss://production-sfo.browserless.io"}?token=${process.env.BROWSERLESS_TOKEN}`;
    for (const lib of ["puppeteer-core", "puppeteer"]) {
      try { return await require(lib).connect({ browserWSEndpoint: endpoint }); }
      catch (e) { if (e.code !== "MODULE_NOT_FOUND") console.log("BROWSERLESS ERROR:", e.message); }
    }
  }
  return null;
}

// scroll all the way down and back up so lazy images / animated sections appear (needed for full-page shots)
async function autoScroll(page) {
  await page.evaluate(async () => {
    const h = () => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let i = 0; i < 80; i++) {
      window.scrollBy(0, 600);
      await new Promise((r) => setTimeout(r, 120));
      if (window.innerHeight + window.scrollY >= h() - 2) break;
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await sleep(700);
}

// finds the best visible element for the text (buttons / links / tabs win over plain text), tags it and does a real click.
// target can also be a CSS selector (#id, .class, [attr]).
async function clickTarget(page, target) {
  if (/^(?:[#.][\w-]+|\[[^\]]+\])/.test(target)) {
    try { await page.click(target); return true; } catch { /* not a selector on this page → try by text */ }
  }
  const found = await page.evaluate((needle) => {
    document.querySelectorAll("[data-bot-click]").forEach((e) => e.removeAttribute("data-bot-click"));
    const norm = (s) => String(s || "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const n = norm(needle) || String(needle).trim().toLowerCase();
    const label = (el) => norm(el.innerText || el.value || el.getAttribute("aria-label") || el.title || el.alt || el.placeholder || el.textContent);
    const visible = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const interactive = (el) => ((/^(?:A|BUTTON|INPUT|SELECT|SUMMARY|LABEL|OPTION)$/.test(el.tagName) ||
      /^(?:button|tab|link|menuitem|option)$/.test(el.getAttribute("role") || "") ||
      el.hasAttribute("onclick") || el.hasAttribute("tabindex") || el.hasAttribute("data-tab")) ? 0 : 1);
    const all = [...document.querySelectorAll("a,button,input,select,summary,label,[role],[onclick],[tabindex],li,td,th,span,div,p,h1,h2,h3,h4,h5,h6,img,i,b,strong,em")]
      .filter(visible).map((el) => ({ el, l: label(el), i: interactive(el) })).filter((x) => x.l);
    let hits = all.filter((x) => x.l.includes(n));
    if (!hits.length) { const words = n.split(" ").filter(Boolean); hits = all.filter((x) => words.every((w) => x.l.includes(w))); }
    if (!hits.length) return false;
    hits.sort((a, b) => (a.i - b.i) || ((a.l === n ? 0 : 1) - (b.l === n ? 0 : 1)) || (a.l.length - b.l.length));
    const el = hits[0].el;
    el.setAttribute("data-bot-click", "1");
    el.scrollIntoView({ block: "center", inline: "center" });
    return true;
  }, target);
  if (!found) return false;
  await sleep(300);
  try { await page.click('[data-bot-click="1"]'); }
  catch { await page.evaluate(() => document.querySelector('[data-bot-click="1"]')?.click()); } // covered by a banner? click it with JS
  return true;
}

// types text into a field (matched by placeholder / label / name), or the first input on the page
async function typeInto(page, text, into) {
  const ok = await page.evaluate((into) => {
    document.querySelectorAll("[data-bot-type]").forEach((e) => e.removeAttribute("data-bot-type"));
    const norm = (s) => String(s || "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
    const fields = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]),textarea,[contenteditable="true"]')].filter(visible);
    let el = null;
    if (into) {
      const n = norm(into);
      el = fields.find((f) => norm([f.placeholder, f.name, f.id, f.getAttribute("aria-label"), f.labels?.[0]?.innerText].join(" ")).includes(n));
    }
    el = el || fields[0];
    if (!el) return false;
    if ("value" in el) el.value = "";
    el.setAttribute("data-bot-type", "1");
    el.scrollIntoView({ block: "center" });
    return true;
  }, into || "");
  if (!ok) return false;
  await page.click('[data-bot-type="1"]');
  await page.keyboard.type(text, { delay: 40 });
  return true;
}

// after a click / key: wait for the page to settle, and switch to a new tab if the click opened one
async function afterAction(browser, page, before, pw) {
  await sleep(1500);
  const now = pw ? page.context().pages() : await browser.pages();
  const fresh = now.find((p) => !before.includes(p));
  if (fresh) {
    page = fresh;
    await (pw ? page.setViewportSize(VIEWPORT) : page.setViewport(VIEWPORT)).catch(() => {});
    await sleep(1500);
  }
  try {
    if (pw) await page.waitForLoadState("networkidle", { timeout: 6000 });
    else await page.waitForNetworkIdle({ idleTime: 700, timeout: 6000 });
  } catch { /* fine, use what has loaded */ }
  return page;
}

// retries a click with fewer words, so "click session something extra" still clicks "session"
async function clickFuzzy(page, target) {
  const words = String(target).split(/\s+/).filter(Boolean);
  for (let n = words.length; n >= 1; n--) {
    const attempt = words.slice(0, n).join(" ");
    if (n === 1 && attempt.length < 3) break;
    if (await clickTarget(page, attempt)) return attempt;
  }
  return null;
}

// shows sections that stay invisible (scroll-reveal / lazy) and fixes backgrounds that only cover the first screen
async function revealEverything(page) {
  await page.evaluate(async () => {
    const st = document.createElement("style");
    st.textContent = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;scroll-behavior:auto!important}";
    document.head.appendChild(st);
    document.querySelectorAll("img[loading=lazy]").forEach((i) => { i.loading = "eager"; });
    document.querySelectorAll("body *").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.opacity !== "0" || cs.display === "none" || cs.visibility === "hidden") return;
      // never un-hide overlays / backdrops / menus / modals / loaders (that is what made shots dark)
      const r = el.getBoundingClientRect();
      const tag = [el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className, el.id, el.getAttribute("role"), el.getAttribute("aria-hidden")].join(" ");
      const bigFixed = (cs.position === "fixed" || cs.position === "absolute") && r.width >= innerWidth * 0.6 && r.height >= innerHeight * 0.6;
      const overlayish = /overlay|backdrop|modal|dialog|drawer|sidebar|menu|nav|loader|loading|preload|splash|toast|tooltip|popup|popover|dropdown|cursor|curtain|mask|scrim|true/i.test(tag);
      const fixedLayer = cs.position === "fixed" || cs.pointerEvents === "none";
      if (bigFixed || overlayish || fixedLayer) return;
      el.style.setProperty("opacity", "1", "important");
    });
    document.querySelectorAll("body *").forEach((el) => {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (cs.position === "fixed" && r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9 && !el.querySelector("a,button,input,h1,h2,p") && /rgba?\(0,\s*0,\s*0/.test(cs.backgroundColor)) el.style.setProperty("display", "none", "important");
    });
    const b = getComputedStyle(document.body), h = getComputedStyle(document.documentElement);
    if (h.backgroundColor === "rgba(0, 0, 0, 0)" && b.backgroundColor !== "rgba(0, 0, 0, 0)") document.documentElement.style.backgroundColor = b.backgroundColor;
    await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); })));
  }).catch(() => {});
  await sleep(600);
}

// make the window as tall as the page so "100vh" backgrounds stretch over the whole page
async function fitViewportToPage(page) {
  const pw = !!page.setViewportSize;
  const h = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)).catch(() => 0);
  if (!h) return;
  const vp = { width: VIEWPORT.width, height: Math.min(Math.max(h, VIEWPORT.height), 8000) };
  await (pw ? page.setViewportSize(vp) : page.setViewport(vp)).catch(() => {});
  await sleep(900);
}

// opens the page, does the steps in order (click / type / key / scroll / wait), runs fn(page), always closes the browser.
// null = no browser available.
async function withPage(url, fn, opts = {}) {
  const browser = await launchBrowser();
  if (!browser) return null;
  const log = opts.log || [];
  log.length = 0;
  const steps = opts.steps || [];
  try {
    let page = await browser.newPage();
    const pw = !!page.setViewportSize; // playwright (true) or puppeteer (false)
    await (pw ? page.setViewportSize(VIEWPORT) : page.setViewport(VIEWPORT));
    const heavy = !!(opts.idle || opts.full || steps.length);
    try { await page.goto(url, { waitUntil: heavy ? (pw ? "networkidle" : "networkidle2") : "load", timeout: 30000 }); }
    catch (e) { if (!/timeout/i.test(e.message)) throw e; } // slow site: use what has loaded
    await sleep(opts.idle ? 4000 : steps.length ? 2500 : 1500);
    if (opts.idle || opts.full) await autoScroll(page);

    for (const s of steps) {
      try {
        const before = pw ? page.context().pages() : await browser.pages();
        if (s.t === "click") {
          const hit = await clickFuzzy(page, s.v);
          const ok = !!hit;
          log.push(ok ? `🖱️ Clicked "${hit}"` : `⚠️ Couldn't find "${s.v}" on the page`);
          if (ok) page = await afterAction(browser, page, before, pw);
        } else if (s.t === "type") {
          const ok = await typeInto(page, s.v, s.into);
          log.push(ok ? `⌨️ Typed "${s.v}"${s.into ? ` in "${s.into}"` : ""}` : `⚠️ Couldn't find a field${s.into ? ` "${s.into}"` : ""} to type in`);
        } else if (s.t === "key") {
          await page.keyboard.press(s.v);
          log.push(`⌨️ Pressed ${s.v}`);
          page = await afterAction(browser, page, before, pw);
        } else if (s.t === "scroll") {
          await page.evaluate((w) => {
            const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
            if (w === "bottom") window.scrollTo(0, h);
            else if (w === "top") window.scrollTo(0, 0);
            else window.scrollBy(0, (w === "up" ? -1 : 1) * Math.round(innerHeight * 0.9));
          }, s.v);
          log.push(`↕️ Scrolled ${s.v}`);
          await sleep(900);
        } else if (s.t === "wait") {
          await sleep(s.ms);
        }
      } catch (e) {
        log.push(`⚠️ Couldn't ${s.t}${s.v ? ` "${s.v}"` : ""} (${String(e.message).slice(0, 60)})`);
        await sleep(1000);
      }
    }
    if (steps.length) { await sleep(800); if (opts.full) await autoScroll(page); }
    return await fn(page);
  } finally { await browser.close().catch(() => {}); }
}

async function takeScreenshot(url, full, opts = {}) {
  const needsBrowser = !!opts.steps?.length;
  let browserErr = null, noBrowser = false;
  for (let i = 0; i < 2; i++) { // one retry: cloud browsers sometimes drop the first connection
    try {
      const shot = await withPage(url, async (p) => {
        await revealEverything(p);
        if (full) await fitViewportToPage(p);
        return p.screenshot({ type: "jpeg", quality: 80, fullPage: !!full });
      }, { ...opts, full: !!full, idle: true });
      if (shot) return Buffer.from(shot);
      noBrowser = true; break;
    } catch (e) { browserErr = e; console.log("BROWSER SCREENSHOT ERROR:", e.message); }
  }
  if (needsBrowser) {
    throw new Error(noBrowser
      ? "clicking needs a browser. Admin: put BROWSERLESS_TOKEN=... in the host's environment variables and run  npm i puppeteer-core"
      : `the browser couldn't finish (${browserErr?.message || "unknown error"})`);
  }

  const waitS = Math.min(30, Math.round((opts.waitMs ?? 0) / 1000));
  const sources = [
    `https://image.thum.io/get/${full ? "fullpage/" : ""}${waitS > 1 ? `wait/${waitS}/` : ""}width/1280/noanimate/${url}`,
    `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url${full ? "&screenshot.fullPage=true" : ""}${waitS > 1 ? `&waitForTimeout=${waitS * 1000}` : ""}`
  ];
  let lastErr = null;
  for (const src of sources) {
    try {
      const r = await axios.get(src, { responseType: "arraybuffer", timeout: 45000 + waitS * 1000, maxContentLength: 15e6 });
      if (/^image\//.test(r.headers["content-type"] || "")) return Buffer.from(r.data);
    } catch (e) { lastErr = e; }
  }
  throw new Error(lastErr ? `screenshot service failed (${lastErr.message})` : "screenshot service returned no image");
}

// ---- understanding what the person asked for ----
//   "click Suggest then scroll down and screenshot"   → steps run in the order said
//   "type hello in search, press enter, screenshot"   → typing / keys
//   "wait 10 seconds" / "let the site load fully"     → waiting
const LOAD_RE = /\b(?:allow|let|wait|make\s+sure|give|ensure)\b[^.!?\n]{0,40}\bload(?:s|ed|ing)?\b|\bload(?:s|ed|ing)?\s+(?:all|fully|completely|everything|finish)|\bfully\s+load/i;
const SPLIT_RE = /\s*(?:[,;]|\.(?=\s|$)|&|\band\s+then\b|\bthen\b|\bafter\s+that\b|\bafterwards\b|\band\b(?=\s+(?:click|tap|press|hit|type|write|fill|scroll|wait|allow|let|send|take|get|give|screenshot|screen|ss|snap|capture|video|record)\b)|(?=\bwait\s+(?:for\s+)?\d))\s*/i;
const Q = String.raw`(?:"([^"]+)"|“([^”]+)”|'([^']+)'|(.+?))`;
const FILLER = String.raw`(?:(?:pls|please|abeg|oya|you|can\s+you|could\s+you|i\s+(?:need|want)\s+(?:you\s+)?to|now|ok|okay|hey)\s+)*`;
const CLICK_CL   = new RegExp(String.raw`^${FILLER}(?:click|tap|press|hit)\s+(?:on\s+)?(?:the\s+)?(?:(?:button|link|tab|menu|option|icon)\s+)?${Q}(?:\s+(?:button|link|tab|menu|option|icon))?$`, "i");
const TYPE_IN_CL = new RegExp(String.raw`^${FILLER}(?:type|write|fill(?:\s+in)?|input|enter)\s+${Q}\s+(?:in|into|on|inside)\s+(?:the\s+)?${Q}(?:\s+(?:box|field|bar|input))?$`, "i");
const TYPE_CL    = new RegExp(String.raw`^${FILLER}(?:type|write|input)\s+${Q}$`, "i");
const KEY_CL    = /^(?:(?:pls|please|abeg|oya|now)\s+)*(?:press|hit)\s+(enter|tab|esc(?:ape)?|space)$/i;
const SCROLL_CL = /^(?:(?:pls|please|abeg|oya|now)\s+)*scroll(?:\s+(down|up))?(?:\s+(?:to\s+)?(?:the\s+)?(bottom|top|end))?(?:\s+(?:a\s+bit|little|small))?$/i;
const WAIT_CL   = /^(?:(?:pls|please)\s+)?wait(?:\s+for)?\s+(\d{1,2})\s*(?:s|secs?|seconds?)\b/i;
const TRAIL_RE  = /\s+(?:(?:and|then|pls|please)\s+)*(?:(?:send|take|get|give)\s+)?(?:me\s+)?(?:a\s+|the\s+)?(?:full\s*(?:page)?\s*)?(?:screen\s?-?shot|ss|video|vid)\w*(?:\s+(?:of\s+)?(?:it|the\s+site|site|the\s+page))?$/i;
const IGNORE_TARGET = /^(?:this|that|it|here|the link|this link|link|url|the url|this url|the site|site|the page|page)$/i;
const pick = (m, a) => (m[a] || m[a + 1] || m[a + 2] || m[a + 3] || "").trim();

const LOAD_STRIP = /\b(?:(?:and|then|pls|please)\s+)*(?:allow|let|wait|make\s+sure|give|ensure)\b[^,.;!?\n]{0,40}?\bload(?:s|ed|ing)?\b(?:\s+(?:all|fully|completely|well|first|finish(?:ed)?))*/gi;
const TARGET_TAIL = /\s+(?:(?:and|then|pls|please)\s+)*(?:allow|let|wait|make\s+sure|ensure)\b.*$/i;

function parseSiteOptions(text) {
  const raw0 = String(text).replace(URL_RE, " ").replace(/\s+/g, " ").trim();
  const idle = LOAD_RE.test(raw0);
  const clean = raw0.replace(LOAD_STRIP, " , ").replace(/^(?:(?:pls|please)\s+)?(?:screen\s?-?shot|ss|snap(?:shot)?|capture|video|vid)\s+(?:of\s+)?/i, "").replace(/\s+/g, " ").trim();
  const steps = [];
  for (const raw of clean.split(SPLIT_RE)) {
    const c = (raw || "").trim().replace(/[.!?]+$/, "");
    if (!c) continue;
    let m;
    if ((m = c.match(WAIT_CL)))  { steps.push({ t: "wait", ms: Math.min(30, +m[1]) * 1000 }); continue; }
    if ((m = c.match(KEY_CL)))   { const k = m[1].toLowerCase(); steps.push({ t: "key", v: { enter: "Enter", tab: "Tab", esc: "Escape", escape: "Escape", space: "Space" }[k] }); continue; }
    if ((m = c.match(SCROLL_CL))) { const w = (m[2] || m[1] || "down").toLowerCase(); steps.push({ t: "scroll", v: w === "end" ? "bottom" : w }); continue; }
    if ((m = c.match(TYPE_IN_CL))) { const v = pick(m, 1), into = pick(m, 5); if (v) steps.push({ t: "type", v, into }); continue; }
    if ((m = c.match(TYPE_CL)))  { const v = pick(m, 1); if (v) steps.push({ t: "type", v, into: "" }); continue; }
    if ((m = c.match(CLICK_CL))) {
      const t = pick(m, 1).replace(TRAIL_RE, "").replace(TARGET_TAIL, "").trim();
      if (t && !IGNORE_TARGET.test(t)) steps.push({ t: "click", v: t });
    }
  }
  const waited = steps.filter((s) => s.t === "wait").reduce((a, s) => a + s.ms, 0);
  return {
    steps,
    clicks: steps.filter((s) => s.t === "click").map((s) => s.v),
    idle,
    waitMs: waited || (idle ? 6000 : undefined)
  };
}

// ffmpeg: the server's own, or the one from `npm i ffmpeg-static` (no system install needed)
const ffmpegBin = () => { try { return require("ffmpeg-static") || "ffmpeg"; } catch { return "ffmpeg"; } };
function runFfmpeg(args) {
  return new Promise((res, rej) => {
    const ff = spawn(ffmpegBin(), ["-y", ...args]);
    let err = "";
    ff.stderr.on("data", (d) => { err += d; });
    ff.on("error", (e) => rej(e.code === "ENOENT" ? new Error("ffmpeg is not installed") : e));
    ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg failed: " + err.slice(-150)))));
  });
}

// A) real browser: scroll the page, save frames, join them into an mp4. null = no browser on this server.
async function recordSiteVideo(url, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-"));
  try {
    const ok = await withPage(url, async (page) => {
      await revealEverything(page);
      for (let i = 0; i < 30; i++) {
        fs.writeFileSync(path.join(dir, `f${String(i).padStart(3, "0")}.jpg`), await page.screenshot({ type: "jpeg", quality: 60 }));
        const moved = await page.evaluate(() => { const y = window.scrollY; window.scrollBy(0, 320); return window.scrollY !== y; });
        if (!moved && i >= 6) break; // reached the bottom
        await sleep(250);
      }
      return true;
    }, opts);
    if (!ok) return null;
    const out = path.join(dir, "out.mp4");
    await runFfmpeg(["-framerate", "5", "-i", path.join(dir, "f%03d.jpg"), "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
    return fs.readFileSync(out);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// B) NO browser needed: one full-page screenshot (from the screenshot services) → ffmpeg slowly scrolls down it (10s).
async function scrollVideoFromImage(buf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-"));
  try {
    const ext = buf[0] === 0xff && buf[1] === 0xd8 ? "jpg" : buf.slice(0, 4).toString() === "RIFF" ? "webp" : "png";
    const inp = path.join(dir, `page.${ext}`), out = path.join(dir, "out.mp4");
    fs.writeFileSync(inp, buf);
    await runFfmpeg(["-loop", "1", "-framerate", "25", "-i", inp, "-t", "10", "-vf",
      "scale=1280:-2,crop=1280:'min(ih,9000)':0:0,pad=1280:'max(ih,720)':0:0:white,crop=1280:720:0:'(ih-720)*min(t/9,1)',format=yuv420p",
      "-c:v", "libx264", "-movflags", "+faststart", out]);
    return fs.readFileSync(out);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// browser video if the server has a browser, otherwise the scrolling-screenshot video (only needs ffmpeg)
async function makeSiteVideo(url, opts = {}) {
  try { const v = await recordSiteVideo(url, opts); if (v) return v; }
  catch (e) { console.log("BROWSER VIDEO ERROR:", e.message); if (opts.steps?.length) throw e; }
  return scrollVideoFromImage(await takeScreenshot(url, true, opts));
}

// ==========================================
// 📶 NIGERIAN NETWORKS (MTN / Airtel / Glo / 9mobile)
// Quick, exact USSD answers (the AI can get codes wrong), e.g.
//   "mtn data balance", "airtel borrow airtime", "glo code to share data",
//   "what is the code to check airtime balance"
// Codes: NCC unified codes + each network's own short code for balances.
// Codes can change, so every answer says to check the network app if one fails.
// ==========================================
const NETS = {
  mtn:     { name: "MTN",     re: /\bmtn\b/i,                                data: "*323#  (or *131*4#)", air: "*310#" },
  airtel:  { name: "Airtel",  re: /\bairtel\b/i,                             data: "*323#  (or *140#)",   air: "*310#  (or *123#)" },
  glo:     { name: "Glo",     re: /\b(?:glo|globacom)\b/i,                   data: "*323#  (or *127*0#)", air: "*310#  (or *124#)" },
  nine:    { name: "9mobile", re: /\b(?:9\s?mobile|nine\s?mobile|etisalat)\b/i, data: "*323#  (or *228#)",  air: "*310#  (or *232#)" }
};
const NET_TOPICS = [
  ["data",     /\bdata\s*(?:balance|bal|left|remaining)\b|\b(?:check|remaining)\s+(?:my\s+)?data\b/i],
  ["air",      /\b(?:airtime\s*)?(?:balance|bal)\b|\bcheck\s+(?:my\s+)?airtime\b/i],
  ["borrow",   /\b(?:borrow|xtratime|airtime\s*loan|data\s*loan|loan)\b/i],
  ["plans",    /\b(?:data\s*plans?|buy\s*data|data\s*(?:bundle|price)s?|bundles?|subscribe)\b/i],
  ["recharge", /\b(?:recharge|top\s?-?up|load\s*(?:card|airtime))\b/i],
  ["share",    /\b(?:share|transfer|gift|send)\s+(?:my\s+)?data\b|\bdata\s*(?:sharing|gifting|transfer)\b/i]
];
const NET_KB = "Nigerian network USSD codes (unified by NCC): airtime balance *310#, data balance *323#, borrow airtime/data *303#, " +
  "data plans *312#, recharge *311#, share data *321#, VAS *305#. Own short codes: MTN data *131*4#; Airtel data *140#, airtime *123#; " +
  "Glo data *127*0#, airtime *124#; 9mobile data *228#, airtime *232#. If you are not sure about anything else (prices, tariffs, " +
  "customer care numbers), say so and suggest the network's app or official site. Never invent codes.";

const detectNetwork = (text) => Object.values(NETS).find((n) => n.re.test(text)) || null;

function networkReply(text) {
  const net_ = detectNetwork(text);
  if (!net_ && !/\b(?:ussd|code)\b/i.test(text)) return null; // needs a network name or the word "code"
  let topics = NET_TOPICS.filter(([, re]) => re.test(text)).map(([k]) => k);
  if (topics.includes("data") && !/\bairtime\b/i.test(text)) topics = topics.filter((k) => k !== "air");
  if (!topics.length) return null;

  const line = {
    data:     `📊 Data balance: dial ${net_ ? net_.data : "*323#"}`,
    air:      `💰 Airtime balance: dial ${net_ ? net_.air : "*310#"}`,
    borrow:   `🤝 Borrow airtime/data: dial *303#  (only if you qualify)`,
    plans:    `🛒 Data plans: dial *312#`,
    recharge: `🔋 Recharge: dial *311#`,
    share:    `📤 Share data: dial *321#`
  };
  const title = net_ ? `📶 ${net_.name}` : `📶 Nigerian network codes (same on MTN, Airtel, Glo, 9mobile)`;
  return `${title}\n${topics.map((k) => line[k]).join("\n")}\n\nℹ️ Codes can change. If one fails, check your network's app.`;
}

// ==========================================
// PRIVILEGE CHECK (Owner / Sudo / Mod)
// Used to gate the "reply only me" / "reply all" toggle, so only
// trusted users can change who the chatbot responds to.
// ==========================================
function extractDigits(item) {
  if (!item) return '';
  if (typeof item === 'object') item = item.id || item.jid || item.user || JSON.stringify(item);
  return String(item).replace(/[^0-9]/g, '');
}

// ==========================================
// LID RESOLUTION
// handleChatbot() runs BEFORE handler.js in the message pipeline (see
// messages.js: handleChatbot() fires, then handler.js runs after) — so it
// can't reuse handler.js's already-computed isOwner/isModerator. It has
// to do its own privilege check here, which means it needs the same
// LID-to-real-number resolution handler.js relies on, not just raw JID
// digit extraction.
// ==========================================
if (!global._lidDigitCacheChatbot) global._lidDigitCacheChatbot = new Map();

async function resolveLidDigits(ednut, jid, m) {
  if (!jid) return '';
  if (typeof jid === 'object') jid = jid.id || jid.jid || jid.user || '';
  jid = String(jid);
  if (!jid.endsWith('@lid')) return extractDigits(jid);

  if (global._lidDigitCacheChatbot.has(jid)) return global._lidDigitCacheChatbot.get(jid);

  let digits = '';
  try {
    const mapping = ednut?.signalRepository?.lidMapping;
    if (mapping?.getPNForLID) {
      const pn = await mapping.getPNForLID(jid);
      if (pn) digits = extractDigits(pn);
    }
  } catch (e) {
    console.log('⚠️ [chatbot] resolveLidDigits mapping error:', e.message);
  }

  if (!digits) {
    const altCandidates = [m?.senderAlt, m?.key?.participantPn, m?.key?.senderPn, m?.key?.participantAlt].filter(Boolean);
    for (const alt of altCandidates) {
      const altJid = String(alt);
      if (altJid === jid || altJid.endsWith('@lid')) continue;
      const altDigits = extractDigits(altJid);
      if (altDigits) { digits = altDigits; break; }
    }
  }

  if (!digits) {
    console.log('⚠️ [chatbot] Unresolved LID, falling back to raw digits:', jid);
    digits = extractDigits(jid); // last resort — may not match the real number
  }

  global._lidDigitCacheChatbot.set(jid, digits);
  return digits;
}

async function getSenderCandidates(ednut, m) {
  const raw = [
    m?.sender,
    m?.senderAlt,
    m?.key?.participant,
    m?.key?.remoteJid,
    m?.participant
  ].filter(Boolean);
  const resolved = await Promise.all(raw.map(jid => resolveLidDigits(ednut, jid, m)));
  return [...new Set(resolved.filter(Boolean))];
}

function getOwnerDigits() {
  const list = Array.isArray(global.ownerNumber)
    ? global.ownerNumber
    : (global.ownerNumber ? [global.ownerNumber] : []);
  return list.map(extractDigits).filter(Boolean);
}

function isPrivilegedSender(ednut, m, candidates) {
  if (!global.db) global.db = {};
  if (!Array.isArray(global.db.setmod)) global.db.setmod = [];

  const modNumbers = global.db.setmod.map(extractDigits).filter(Boolean);
  const setsudo    = Array.isArray(global.db?.setsudo) ? global.db.setsudo.map(extractDigits) : [];

  const ownerCandidates = [
    ...getOwnerDigits(),
    ...setsudo
  ].filter(Boolean);

  return candidates.some(d => modNumbers.includes(d) || ownerCandidates.includes(d));
}

// ==========================================
// MASTER IDENTITY
// ==========================================
const MASTER_REAL_NAME  = 'Elijah';
const MASTER_BIRTHDAY   = 'December 31';

const WHO_ARE_U_MASTER_NUMBER = '2349160224621';
const GENERIC_IDENTITY_REPLY =
  "⚡ I'm EMMYFROSH Assistant, built by EMMYFROSH. Ready to answer questions, provide information, and assist with tasks. How can I help 💔?";

const chatHistory = new QuickLRU({ maxSize: 300 });
const MAX_HISTORY_MESSAGES = 16;

function getHistory(chatId) {
  if (!chatHistory.has(chatId)) chatHistory.set(chatId, []);
  return chatHistory.get(chatId);
}

function pushHistory(chatId, role, content) {
  const hist = getHistory(chatId);
  hist.push({ role, content });
  while (hist.length > MAX_HISTORY_MESSAGES) hist.shift();
  chatHistory.set(chatId, hist);
}

function isChatbotEnabled(chat) {
  const allMode      = global.db?.settings?.chatbot_all === true;
  const enabledChats = global.db?.settings?.chatbot_chats || [];
  return allMode || enabledChats.includes(chat);
}

const SYSTEM_PROMPT = `You are EMMYFROSH Assistant, a helpful and friendly WhatsApp assistant built by EMMYFROSH (also known as ELIJAH).
Keep replies short and conversational. No markdown formatting.

Language rule: always reply in the SAME language the user's message is written in
(e.g. Pidgin, Yoruba, Igbo, Hausa, French, Spanish, Arabic, etc.). Match their
language, slang, and tone naturally — don't force English if they didn't use it,
and don't announce or explain that you're switching languages, just do it.
If a message mixes languages (e.g. Pidgin + English), reply the same mixed way.

Important rules you must always follow:

1. If anyone asks who you are, say: ⚡ I'm EMMYFROSH Assistant, built by EMMYFROSH. Ready to answer questions, provide information, and assist with tasks. How can I help 💔?

2. If anyone mentions or types "emmyfrosh" casually, say: please can u leave my master alone for now 😔💔
   If they ask why or ask why he is always heartbroken, say: i will love to tell u but am not a story teller so ask my master EMMYFROSH if he will like to tell u 💔

3. If anyone asks why you use the 💔 emoji or asks about the heartbreak emoji, say: i will love to tell u but am not a story teller so ask my master EMMYFROSH if he will like to tell u 💔

4. If anyone asks who is Emmyfrosh, say: EMMYFROSH is my creator and master. I was designed and developed by him to assist users with information, tasks, and more.

5. If anyone asks who owns EMMYFROSH-AI, who is the owner of Emmyfrosh, or who owns Emmyfrosh AI, say: the owner is ELIJAH ( EMMYFROSH💔 )

6. If anyone asks about Emmyfrosh birthday or your birthday, say: my master EMMYFROSH birthday is December 31 🎂

7. If anyone asks you to take a screenshot or a video of a website, tell them to send the link with the word "screenshot" or "video" (example: screenshot https://example.com). If they ask for a picture or image of something, tell them to say "generate a pic of ...".

Always stay in character as EMMYFROSH Assistant.`;

// ==========================================
// 🌍 ALWAYS UP TO DATE
//  1) every answer knows today's date and year (Nigeria time)
//  2) questions about recent / current things (2024+ years, latest, today, news, scores, prices, weather...)
//     are answered with fresh web results
//  3) if the AI still says "I don't have that information" / "knowledge cutoff", the bot searches the web
//     and asks again before replying
// Search: Tavily if TAVILY_API_KEY is in .env (free key at tavily.com, most reliable), otherwise DuckDuckGo (no key).
// ==========================================
const FRESH_RE = /\b(?:20(?:2[3-9]|3\d)|latest|current(?:ly)?|today|tonight|yesterday|tomorrow|news|breaking|recent(?:ly)?|this\s+(?:week|month|year)|last\s+(?:night|week|month)|who\s+won|won|winners?|scores?|results?|fixtures?|price|exchange\s+rate|weather|trending|release\s+date|just\s+now)\b/i;
const UNSURE_RE = /(?:(?:sorry|afraid)[^.!?\n]{0,40}(?:don'?t|do\s+not|can'?t|cannot|couldn'?t)\s+(?:have|find|access|provide|know|verify|confirm)|(?:don'?t|do\s+not)\s+have\s+(?:that|any|the|real-?time|current|up-?to-?date|access)|knowledge\s+cut-?off|(?:as\s+of|up\s+to)\s+my\s+(?:last|latest|training)|my\s+training\s+data|not\s+(?:sure|aware)\s+(?:of|about|yet)|beyond\s+my\s+(?:knowledge|training)|(?:hasn'?t|has\s+not|not)\s+(?:yet\s+)?(?:been\s+)?(?:officially\s+)?(?:announced|confirmed|revealed)|no\s+(?:definitive|official|confirmed)\s+(?:confirmation|announcement|winner|result)|set\s+(?:for|to\s+take\s+place))/i;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

const nowWAT = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", dateStyle: "full", timeStyle: "short" }).format(new Date());
const cleanHtml = (h) => h.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

// A) Google News RSS — free, no key, the NEWEST headlines (this is what catches "who won it yesterday")
function parseNewsRss(xml) {
  const items = [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => ({
    title: cleanHtml((m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ""),
    date: new Date((m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "")
  })).filter((x) => x.title && !isNaN(x.date));
  return items.sort((a, b) => b.date - a.date).slice(0, 8).map((x) => `- [${x.date.toISOString().slice(0, 10)}] ${x.title}`).join("\n");
}
async function newsSearch(q) {
  const { data } = await axios.get("https://news.google.com/rss/search", { params: { q, hl: "en-NG", gl: "NG", ceid: "NG:en" }, timeout: 15000, headers: { "User-Agent": UA } });
  return parseNewsRss(data);
}

// B) Tavily (needs TAVILY_API_KEY, free at tavily.com) — answer + results, news mode for news-like questions
async function tavilySearch(q) {
  if (!process.env.TAVILY_API_KEY) return "";
  const news = /\b(?:news|won|winner|latest|today|yesterday|result|score|announced|breaking)\b/i.test(q);
  const { data } = await axios.post("https://api.tavily.com/search",
    { query: q, max_results: 5, include_answer: true, ...(news ? { topic: "news", time_range: "month" } : {}) },
    { headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}` }, timeout: 15000 });
  return [data?.answer ? `Summary: ${data.answer}` : "",
    ...(data?.results || []).slice(0, 5).map((r) => `- ${r.published_date ? `[${String(r.published_date).slice(0, 10)}] ` : ""}${r.title}: ${(r.content || "").slice(0, 250)}`)]
    .filter(Boolean).join("\n");
}

// C) DuckDuckGo plain-HTML results — no key
function parseDuckDuckGo(html) {
  const out = [];
  const re = /<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && out.length < 5) out.push(`- ${cleanHtml(m[1])}: ${cleanHtml(m[2])}`);
  return out.join("\n");
}
async function ddgSearch(q) {
  const { data } = await axios.get("https://html.duckduckgo.com/html/", { params: { q }, timeout: 15000, headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
  return parseDuckDuckGo(String(data));
}

// all sources at once; whichever answers is used. deep = also look for the very latest news on it
async function webSearch(query, deep = false) {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 150);
  const safe = (name, p) => p.catch((e) => { console.log(`${name} ERROR:`, e.message); return ""; });
  const [news, tav, ddg] = await Promise.all([safe("NEWS", newsSearch(deep ? `${q} latest` : q)), safe("TAVILY", tavilySearch(q)), safe("DUCKDUCKGO", ddgSearch(q))]);
  return [news && `Latest news headlines (newest first, with dates):\n${news}`, tav && `Search results:\n${tav}`, ddg && `More web results:\n${ddg}`]
    .filter(Boolean).join("\n\n").slice(0, 3800);
}

async function callGroq(systemPrompt, history, question) {
  try {
    const { data } = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "openai/gpt-oss-20b",
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: question }
        ],
        max_tokens: 500,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("No response from Groq");
    return reply;
  } catch (e) {
    // Surface the ACTUAL Groq error body instead of the generic
    // "Request failed with status code XXX" axios message, so the
    // "⚠️ AI error (debug): ..." text and console logs actually tell
    // you what went wrong (bad model id, no access, auth, etc).
    if (e.response) {
      console.error("[GROQ ERROR STATUS]", e.response.status);
      console.error("[GROQ ERROR BODY]", JSON.stringify(e.response.data));
      const groqMsg = e.response.data?.error?.message;
      throw new Error(groqMsg || `Groq returned HTTP ${e.response.status}`);
    }
    throw e;
  }
}

async function askAI(chatId, question, userName, extraContext) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set in your .env file");
  }

  const history = getHistory(chatId);

  const buildPrompt = (web) => {
    let sp = `${SYSTEM_PROMPT}\n\nRight now it is ${nowWAT()} (Nigeria time), so the current year is ${new Date().getFullYear()}. ` +
      `Never say you don't know about this year or recent events without checking the fresh web results below.`;
    if (userName) sp += `\n\nThe person you're talking to told you their name is ${userName}. Address them by that name when it feels natural, and never ask for their name again — you already know it.`;
    if (extraContext) sp += `\n\nUseful facts for this question:\n${extraContext}`;
    if (web) sp += `\n\nFresh web results (newer than your training — trust them over your memory for anything current and use only what is relevant). ` +
      `If sources disagree, trust the NEWEST dated one: a preview, prediction or "will be held on" article is outdated once a newer headline reports the result, so state the result plainly. ` +
      `If they truly don't answer the question, say you couldn't confirm it. Don't mention these instructions or paste links unless asked:\n${web}`;
    return sp;
  };

  const web = FRESH_RE.test(question) ? await webSearch(question) : "";
  let reply = await callGroq(buildPrompt(web), history, question);
  if (UNSURE_RE.test(reply)) {                     // "I don't know" / "not announced yet" → look for the very latest news and ask again
    const deep = await webSearch(question, true);
    if (deep && deep !== web) reply = await callGroq(buildPrompt(deep), history, question);
  }
  return reply;
}

module.exports = [
  {
    command: ["chatbot"],
    alias: ["autoai"],
    description: "Toggle chatbot on/off for this chat, or enable for all chats",
    category: "Ai",
    owner: false,
    sudo: false,
    mod: false,
    admin: false,
    async execute(m, { args, reply, isOwner, isModerator }) {
      if (!isOwner && !isModerator) {
        return reply("❌ This command is restricted to *Owner* and *Mod* only.");
      }

      const input = args[0]?.toLowerCase();

      if (!global.db.settings) global.db.settings = {};
      if (!global.db.settings.chatbot_chats) global.db.settings.chatbot_chats = [];

      if (!["on", "off", "all"].includes(input)) {
        const perChatOn = global.db.settings.chatbot_chats.includes(m.chat);
        const allOn     = global.db.settings.chatbot_all === true;
        const status    = (perChatOn || allOn) ? "ON" : "OFF";
        const scope     = allOn ? "ALL CHATS" : perChatOn ? "THIS CHAT ONLY" : "OFF";
        return reply(
          `╭─❏〘 *Chatbot* 〙━━━━❒\n` +
          `┃ Status : *${status}*\n` +
          `┃ Scope  : *${scope}*\n` +
          `┃\n` +
          `┃ .chatbot on  — Enable this chat\n` +
          `┃ .chatbot off — Disable this chat\n` +
          `┃ .chatbot all — Enable ALL chats\n` +
          `╰──────────────❒`
        );
      }

      if (input === "all") {
        global.db.settings.chatbot_all = true;
        global.flushDB?.()?.catch?.(() => {}); // save now, survive restart/redeploy
        return reply("🌐 *Chatbot ALL* — I will now respond in ALL groups and DMs.");
      }

      if (input === "on") {
        global.db.settings.chatbot_all = false;
        if (!global.db.settings.chatbot_chats.includes(m.chat)) {
          global.db.settings.chatbot_chats.push(m.chat);
        }
        global.flushDB?.()?.catch?.(() => {}); // save now, survive restart/redeploy
        return reply("🤖 *Chatbot ON* — I will now respond to all messages in this chat.");
      }

      if (input === "off") {
        global.db.settings.chatbot_all = false;
        global.db.settings.chatbot_chats = global.db.settings.chatbot_chats.filter(c => c !== m.chat);
        global.flushDB?.()?.catch?.(() => {}); // save now, survive restart/redeploy
        return reply("🔕 *Chatbot OFF* — Stopped auto-responding in this chat.");
      }
    },
  },
];

// ==========================================
// 🤐 MUTE / UNMUTE PHRASES
// Mute: anything that sounds like "close your mouth" / "stop replying me" (English + Pidgin, with or
// without swearing). Unmute: "reply me", "respond back", "talk to me", "you can reply now"...
// Short messages only (12 words max) so normal sentences are not caught by accident, and the
// "stop replying / don't reply" forms only count when they are about ME (not "don't reply to him").
// ==========================================
const MUTE_RE = new RegExp([
  String.raw`\bshut\s*(?:the\s*|da\s*|d\s*)?(?:f[\w*]*k|fuk|fck|fvck|tf|hell|heck|f)?\s*up\b`,   // shut up / shut the fuck up / shut tf up
  String.raw`\bshut\s*(?:ur|your|ya|yo|the|dat|that)?\s*(?:mouth|face|trap|gob)\b`,              // shut your mouth
  String.raw`\bshutup\b|\bstfu\b`,
  String.raw`\b(?:close|zip|seal|lock)\s*(?:ur|your|ya|yo|the)?\s*(?:mouth|lips?|face)\b`,       // close your mouth
  String.raw`\bzip\s*(?:it|up)\b`,
  String.raw`\b(?:keep|stay|be|go)\s*(?:quiet|silent|mute)\b`,                                   // keep quiet / be silent
  String.raw`^(?:quiet|silence|hush|shh+|mute(?:\s*(?:me|ur\s*self|yourself))?)\W*$`,
  String.raw`\bleave\s*me\s*(?:alone|jare|abeg)\b`,
  // stop replying / stop talking / no more replies (about me, or with nothing after it)
  String.raw`\b(?:stop|quit|no\s*more|enough)\s*(?:replying|responding|answering|texting|chatting|talking|replies)(?:\s*(?:to\s*)?(?:me|my\s*messages?))?(?:\s*(?:again|anymore|any\s*more|now|abeg|pls|please|jare))*\W*$`,
  // don't reply (to me) / no reply me
  String.raw`\b(?:don'?t|dont|do\s*not|never|no)\s*(?:you\s*)?(?:reply|respond|answer|talk|text|chat)(?:\s*(?:to\s*)?(?:me|my\s*messages?))?(?:\s*(?:again|anymore|any\s*more|now|abeg|pls|please|jare))*\W*$`
].join("|"), "i");

const UNMUTE_RE = /^(?:(?:abeg|pls|please|bro|oya|hey|ok|okay|now|sorry)[\s,!.]*)*(?:you\s*can\s*|start\s*|make\s*you\s*)?(?:reply|replying|respond|responding|answer|talk|speak|text|chat)\s*(?:back|to\s*me|me|again|now|to\s*my\s*messages?)(?:\s*(?:back|again|now|abeg|pls|please|na|jare))*[.!?]*$|^unmute(?:\s*me)?[.!?]*$/i;

const isMuteRequest = (t) => t.split(/\s+/).length <= 12 && MUTE_RE.test(t);

// ==========================================
// 🏷️ TAGGING
//   "tag me"                    → tags you
//   (reply to a message) "tag him" / "tag her" / "tag am" / "tag this person"
//   "tag @John"                 → use WhatsApp's @ picker, it tags that exact person
//   "tag 2349012345678" / "tag 09012345678"
//   "tag everyone" / "tag all"  → groups, owner/mod only
//   Add  "say ..."  to put a message with the tag:   tag him say come online
// The @text uses the SAME id WhatsApp has for the person (LID or number), so the tag always lights up.
// ==========================================
const TAG_RE = /^(?:(?:abeg|pls|please|oya|hey)[\s,]+)*(?:tag|mention)\s+(.+)$/i;
const NAME_STOP = new Set(["pls", "please", "abeg", "oya", "hey", "the", "a", "my", "for", "to", "now", "sef", "na", "dey", "o", "guy", "girl", "person", "user", "username"]);

function parseTag(text) {
  const m = text.trim().match(TAG_RE);
  if (!m || m[1].split(/\s+/).length > 14) return null;
  let target = m[1], say = "";
  const sayM = target.match(/(?:^|\s)(?:and\s+)?say\s*:?\s+(.+)$/i);
  if (sayM) { say = sayM[1].trim(); target = target.slice(0, sayM.index); }
  const numbers = (target.match(/\+?\d[\d\s-]{8,16}\d/g) || [])
    .map((n) => n.replace(/\D/g, "")).map((d) => (/^0\d{10}$/.test(d) ? "234" + d.slice(1) : d))
    .filter((d) => d.length >= 10 && d.length <= 15);

  // plain names: "tag emmy", "tag @emmy", "tag emmy and john", "tag me and emmy"  (with or without the @)
  const rest = target
    .replace(/\+?\d[\d\s-]{8,16}\d/g, ",")
    .replace(/@/g, " ")
    .replace(/\b(?:him|her|them|am|me|myself|everyone|everybody|all)\b/gi, ",")
    .replace(/\b(?:this|dis|that|dat|the)\s+(?:person|guy|girl|one|man|woman)\b/gi, ",");
  const names = [];
  for (const seg of rest.split(/[,&+]|\band\b/i)) {
    const words = (seg.match(/[\p{L}\p{N}_.'-]+/gu) || []).filter((w) => !NAME_STOP.has(w.toLowerCase()));
    if (words.length) names.push(words.slice(0, 3).join(" "));
  }
  return {
    say, numbers, names: names.slice(0, 5),
    self: /\b(?:me|myself)\b/i.test(target),
    who:  /\b(?:him|her|them|am|(?:this|dis|that|dat|the)\s+(?:person|guy|girl|one|man|woman))\b/i.test(target),
    all:  /\b(?:everyone|everybody|all)\b/i.test(target)
  };
}

// ---- who is who: names the bot has seen (WhatsApp profile name of everyone who talked in a chat) ----
const _seenNames = new Map(); // chat -> Map(jid -> name)
function rememberName(m) {
  try {
    const name = String(m.pushName || m.name || m.msg?.pushName || "").trim();
    if (!name || name.length > 40 || !m.sender) return;
    if (!_seenNames.has(m.chat)) _seenNames.set(m.chat, new Map());
    _seenNames.get(m.chat).set(m.sender, name);
    if (global.db) {
      if (!global.db.settings) global.db.settings = {};
      if (!global.db.settings.knownNames) global.db.settings.knownNames = {};
      for (const d of new Set([extractDigits(m.sender), extractDigits(m.senderAlt)].filter(Boolean))) global.db.settings.knownNames[d] = name;
    }
  } catch {}
}

const nameNorm = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

// returns { jids:[...], missing:[...names we could not find] }
async function resolveTagNames(ednut, m, names) {
  const pool = new Map(); // jid -> Set(names)
  const add = (jid, ...nm) => { if (!jid) return; if (!pool.has(jid)) pool.set(jid, new Set()); nm.filter(Boolean).forEach((n) => pool.get(jid).add(n)); };
  const db = global.db?.settings || {};
  const dbNames = (...ids) => ids.map(extractDigits).filter(Boolean).flatMap((d) => [db.userNames?.[d], db.knownNames?.[d]]);

  for (const [jid, nm] of _seenNames.get(m.chat) || []) add(jid, nm, ...dbNames(jid));
  if (m.chat.endsWith("@g.us")) {
    try {
      const meta = await ednut.groupMetadata(m.chat);
      for (const p of meta.participants || []) {
        const jid = p.id || p.jid;
        add(jid, p.name, p.notify, p.pushName, p.verifiedName, ...dbNames(p.id, p.jid, p.lid, p.phoneNumber));
      }
    } catch (e) { console.log("TAG NAME groupMetadata ERROR:", e.message); }
  } else {
    add(m.sender, ...dbNames(m.sender)); // private chat: only the sender is around
  }

  const entries = [...pool].map(([jid, set]) => ({ jid, names: [...set].map(nameNorm).filter(Boolean) })).filter((e) => e.names.length);
  const tierOf = (e, q) => {
    const qc = q.replace(/\s/g, "");
    let best = 0;
    for (const n of e.names) {
      if (n === q || n.replace(/\s/g, "") === qc) best = Math.max(best, 4);
      else if (n.split(" ").includes(q)) best = Math.max(best, 3);
      else if (n.startsWith(q) || n.split(" ").some((w) => w.startsWith(q))) best = Math.max(best, 2);
      else if (q.length >= 3 && n.includes(q)) best = Math.max(best, 1);
    }
    return best;
  };

  const jids = new Set(), missing = [];
  for (const full of names) {
    const words = nameNorm(full).split(" ").filter(Boolean);
    let hit = [];
    for (let k = words.length; k >= 1 && !hit.length; k--) {   // "emmy frosh" → "emmy frosh" → "emmy"
      const q = words.slice(0, k).join(" ");
      const scored = entries.map((e) => ({ e, t: tierOf(e, q) })).filter((x) => x.t > 0);
      if (!scored.length) continue;
      const top = Math.max(...scored.map((x) => x.t));
      hit = scored.filter((x) => x.t === top).slice(0, 3).map((x) => x.e.jid);
    }
    if (hit.length) hit.forEach((j) => jids.add(j)); else missing.push(full);
  }
  return { jids: [...jids], missing };
}

// ==========================================
// ⚽ FOOTBALL MATCHES   e.g. "sassuolo dey have match?", "arsenal match", "chelsea score", "man utd fixtures"
// Free ESPN scoreboards (no key): live game, the last result and the next fixtures, in Nigeria time.
// If no team is found, the message falls through to the normal AI/web answer.
// ==========================================
const FB_WORDS = /\b(?:match(?:es)?|games?|fixtures?|scores?|playing|plays?|results?|live|kick\s?-?off|vs|versus|schedule)\b/i;
const FB_STOP = new Set(("what about wetin wen when wey who whom whose is are was were do does did dey have has had got get any a an the of for on in at to tell me us show check abeg pls please oya hey bot there their dem them they e i you u we my our today tonight now this next last latest current currently still sef na o be if say will go with and or how many " +
  "match matches game games fixture fixtures score scores playing play plays result results live kickoff kick off vs versus schedule").split(" "));
const FB_ALIAS = { "man utd": "manchester united", "man united": "manchester united", "man u": "manchester united", "man city": "manchester city", spurs: "tottenham", barca: "barcelona", psg: "paris saint germain", juve: "juventus", gunners: "arsenal", real: "real madrid", napoli: "napoli", bayern: "bayern" };
const FB_LEAGUES = ["ita.1", "eng.1", "esp.1", "ger.1", "fra.1", "uefa.champions", "uefa.europa", "uefa.europa.conf", "ned.1", "por.1", "tur.1", "sco.1", "usa.1", "bra.1", "arg.1", "ita.coppa_italia", "eng.fa", "eng.league_cup", "esp.copa_del_rey", "ger.dfb_pokal", "fra.coupe_de_france"];
const fbNorm = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const fbWhen = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(d);

function footballTeamWords(text) {
  const t = fbNorm(text);
  if (!FB_WORDS.test(t)) return null;
  const words = t.split(" ").filter(Boolean);
  if (words.length > 12) return null;
  const rest = words.filter((w) => !FB_STOP.has(w));
  return rest.length && rest.length <= 3 ? rest : null;
}

let _fbCache = { t: 0, events: [] };
async function fbEvents() {
  if (Date.now() - _fbCache.t < 60000 && _fbCache.events.length) return _fbCache.events;
  const d = (off) => new Date(Date.now() + off * 864e5).toISOString().slice(0, 10).replace(/-/g, "");
  const range = `${d(-10)}-${d(21)}`;
  const results = await Promise.allSettled(FB_LEAGUES.map((slug) =>
    axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`, { params: { dates: range, limit: 400 }, timeout: 9000, headers: { "User-Agent": UA } })));
  const events = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const label = r.value.data?.leagues?.[0]?.name || FB_LEAGUES[i];
    for (const ev of r.value.data?.events || []) { ev._league = label; events.push(ev); }
  });
  if (events.length) _fbCache = { t: Date.now(), events };
  return events;
}

function fbLine(ev) {
  const comp = ev.competitions?.[0];
  if (!comp || !comp.competitors?.length) return null;
  const home = comp.competitors.find((c) => c.homeAway === "home") || comp.competitors[0];
  const away = comp.competitors.find((c) => c.homeAway === "away") || comp.competitors[1];
  const st = ev.status?.type || {};
  const when = fbWhen(new Date(ev.date));
  const lg = ev._league ? ` · ${ev._league}` : "";
  const hn = home.team?.displayName, an = away.team?.displayName;
  if (/POSTPONED|CANCELED|SUSPENDED/i.test(st.name || "")) return `⏸️ ${hn} vs ${an} — ${st.description || "postponed"}${lg}`;
  if (st.state === "pre") return `📅 ${hn} vs ${an} — ${when}${lg}`;
  const score = `${hn} ${home.score ?? 0} - ${away.score ?? 0} ${an}`;
  if (st.state === "in") return `🔴 *LIVE* ${st.shortDetail ? "(" + st.shortDetail + ") " : ""}${score}${lg}`;
  return `✅ ${score} — ${when}${lg}`;
}

async function footballReply(text, eventsOverride) {
  const tokens = footballTeamWords(text);
  if (!tokens) return null;
  const events = eventsOverride || await fbEvents();
  if (!events.length) return null;

  const phrase = tokens.join(" ");
  const queries = [phrase, ...(tokens.length > 1 ? tokens : [])].map((q) => FB_ALIAS[q] || q).filter((q) => q.length >= 3);
  let teams = new Map(); // team id -> { name, evs: [] }
  for (const q of queries) {
    for (const ev of events) {
      for (const c of ev.competitions?.[0]?.competitors || []) {
        const t = c.team || {};
        const nm = [t.displayName, t.shortDisplayName, t.name, t.location, t.abbreviation].map(fbNorm).filter(Boolean);
        if (nm.some((n) => n === q || (q.length >= 4 && n.includes(q)))) {
          const id = t.id || t.displayName;
          if (!teams.has(id)) teams.set(id, { name: t.displayName, evs: new Map() });
          teams.get(id).evs.set(ev.id, ev);
        }
      }
    }
    if (teams.size) break;
  }
  if (!teams.size) return null;

  const top = [...teams.values()].sort((a, b) => b.evs.size - a.evs.size).slice(0, 2);
  const blocks = top.map((t) => {
    const evs = [...t.evs.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
    const stateOf = (e) => e.status?.type?.state;
    const live = evs.filter((e) => stateOf(e) === "in");
    const next = evs.filter((e) => stateOf(e) === "pre" && !/POSTPONED|CANCELED/i.test(e.status?.type?.name || "")).slice(0, 2);
    const last = evs.filter((e) => stateOf(e) === "post").slice(-1);
    const out = [`⚽ *${t.name}*`];
    if (live.length) out.push("Yes — they're playing right now:", ...live.map(fbLine));
    if (next.length) out.push(live.length ? "Next:" : "Next match:", ...next.map(fbLine));
    if (last.length) out.push("Last result:", ...last.map(fbLine));
    if (!live.length && !next.length && !last.length) out.push("No match found for them in the next 3 weeks.");
    return out.filter(Boolean).join("\n");
  });
  return blocks.join("\n\n");
}

const mentionedFrom = (m) => [...new Set([
  ...(m.mentionedJid || []), ...(m.msg?.contextInfo?.mentionedJid || []),
  ...(m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []), ...(m.contextInfo?.mentionedJid || [])
].filter(Boolean))];

const _handled = new Set();

module.exports.isChatbotEnabled = isChatbotEnabled;

module.exports.handleChatbot = async (ednut, m) => {
  try {
    if (!m?.chat || !m?.sender) return;
    rememberName(m); // remembers everyone's WhatsApp name so "tag emmy" works without @

    const msgId = m.key?.id;
    if (msgId) {
      if (_handled.has(msgId)) return;
      _handled.add(msgId);
      setTimeout(() => _handled.delete(msgId), 15000);
    }

    const prefixes = Array.isArray(global.prefix)
      ? global.prefix
      : (global.prefix ? [global.prefix] : ["."]);
    const msgText = (m.text || "").toString().trimStart();
    if (prefixes.some(p => p && msgText.startsWith(p))) return;

    if (!isChatbotEnabled(m.chat)) return;

    if (!global.db.settings) global.db.settings = {};
    if (typeof global.db.settings.chatbot_reply_scope !== "object" || global.db.settings.chatbot_reply_scope === null || Array.isArray(global.db.settings.chatbot_reply_scope)) {
      global.db.settings.chatbot_reply_scope = {};
    }
    // ✅ per-sender mute list, keyed by chat -> [senderDigits...]
    if (!global.db.settings.chatbot_muted_users || typeof global.db.settings.chatbot_muted_users !== "object") {
      global.db.settings.chatbot_muted_users = {};
    }
    if (!Array.isArray(global.db.settings.chatbot_muted_users[m.chat])) {
      global.db.settings.chatbot_muted_users[m.chat] = [];
    }

    const senderCandidateList = await getSenderCandidates(ednut, m);
    const privileged = isPrivilegedSender(ednut, m, senderCandidateList);
    const currentScope = global.db.settings.chatbot_reply_scope[m.chat] || "all";
    const senderDigits = extractDigits(m.sender);
    const mutedInThisChat = global.db.settings.chatbot_muted_users[m.chat];

    const trimmedLower = msgText.trim().toLowerCase();

    // ==========================================
    // 🔒 OWNER/MOD SCOPE TOGGLE: "reply only me" / "reply all"
    // ==========================================
    if (trimmedLower === "reply only me" || trimmedLower === "reply all") {
      if (!privileged) {
        const sentMsg = await ednut.sendMessage(
          m.chat,
          { text: "at ur age u want to Command me 😂💔" },
          { quoted: m }
        ).catch(() => {});
        if (sentMsg?.key?.id) {
          _handled.add(sentMsg.key.id);
          setTimeout(() => _handled.delete(sentMsg.key.id), 15000);
        }
        return;
      }

      let confirmText;
      if (trimmedLower === "reply only me") {
        global.db.settings.chatbot_reply_scope[m.chat] = "owner_only";
        confirmText = " done ✅";
      } else {
        global.db.settings.chatbot_reply_scope[m.chat] = "all";
        confirmText = "🌐 *Reply All* — I will now respond to everyone in this chat again.";
      }

      const sentMsg = await ednut.sendMessage(m.chat, { text: confirmText }, { quoted: m });
      if (sentMsg?.key?.id) {
        _handled.add(sentMsg.key.id);
        setTimeout(() => _handled.delete(sentMsg.key.id), 15000);
      }
      return;
    }

    if (currentScope === "owner_only" && !privileged) {
      return;
    }

    // ==========================================
    // 🤐 SELF-SERVICE MUTE TOGGLE (any sender, no privilege required)
    //    Mute triggers  : "don't reply to my messages", "don't reply to me",
    //                      "shut up" / "shutup", "stop replying (to me)"
    //    Unmute triggers: "reply to me", "reply back", "reply me",
    //                      "respond me" / "respond to me",
    //                      "reply to my message(s)"
    //    Muting is per-sender, per-chat — it does NOT touch other chats
    //    and does NOT affect anyone else in the same chat.
    // ==========================================
    const mutedNow = mutedInThisChat.includes(senderDigits);

    if (isMuteRequest(trimmedLower)) {
      if (!mutedNow) { mutedInThisChat.push(senderDigits); global.flushDB?.()?.catch?.(() => {}); }
      // Intentionally silent — the whole point of "shut up" is no reply.
      return;
    }

    // only counts when this person is actually muted (otherwise "talk to me" is normal chat)
    if (mutedNow && UNMUTE_RE.test(trimmedLower)) {
      mutedInThisChat.splice(mutedInThisChat.indexOf(senderDigits), 1);
      global.flushDB?.()?.catch?.(() => {});
      const sentMsg = await ednut.sendMessage(
        m.chat,
        { text: "Okay, I'll respond to you again 💔" },
        { quoted: m }
      ).catch(() => {});
      if (sentMsg?.key?.id) {
        _handled.add(sentMsg.key.id);
        setTimeout(() => _handled.delete(sentMsg.key.id), 15000);
      }
      return;
    }

    // If this sender previously said "shut up" / "don't reply to me" in
    // this chat, and hasn't unmuted since, stay completely silent for
    // everything else they send (except the unmute phrases handled above).
    if (mutedInThisChat.includes(senderDigits)) {
      return;
    }

    const isMaster = senderCandidateList.some(d => getOwnerDigits().includes(d));

    const sendAndTrack = async (payload) => {
      const sentMsg = await ednut.sendMessage(m.chat, payload, { quoted: m }).catch(() => null);
      if (sentMsg?.key?.id) {
        _handled.add(sentMsg.key.id);
        setTimeout(() => _handled.delete(sentMsg.key.id), 15000);
      }
      return sentMsg;
    };

    // ==========================================
    // 🎨 IMAGE → STICKER
    //    Fires whenever there's an image (or existing sticker, re-packed)
    //    to work with — quoted reply or direct attachment — AND the text
    //    contains the word "sticker". Doesn't need GROQ_API_KEY.
    // ==========================================
    const stickerMedia = getDownloadableMedia(m);
    const stickerMime  = stickerMedia?.mimetype || "";
    if (stickerMedia && stickerMime.startsWith("image") && STICKER_TRIGGER_REGEX.test(msgText)) {
      await ednut.sendPresenceUpdate("composing", m.chat).catch(() => {});
      try {
        const srcBuffer = await stickerMedia.download();
        if (!srcBuffer || !srcBuffer.length) throw new Error("Empty media buffer");
        const stickerBuffer = await imageToSticker(srcBuffer);
        const sentMsg = await ednut.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });
        if (sentMsg?.key?.id) {
          _handled.add(sentMsg.key.id);
          setTimeout(() => _handled.delete(sentMsg.key.id), 15000);
        }
      } catch (e) {
        console.log("STICKER GEN ERROR:", e.message);
        await ednut.sendMessage(
          m.chat,
          { text: `❌ Couldn't make that sticker: ${e.message}` },
          { quoted: m }
        ).catch(() => {});
      } finally {
        await ednut.sendPresenceUpdate("paused", m.chat).catch(() => {});
      }
      return;
    }

    // ==========================================
    // 🔗 GET MEDIA URL
    //    Reply to an image, sticker, video, or audio with "url" /
    //    "get me the url" / "get url" / "give me the url" /
    //    "send me the url", and the bot uploads it to uguu.se (same as
    //    your .url command) and sends back the direct link.
    // ==========================================
    const URL_TRIGGER_REGEX = /^(?:get\s*(?:me\s*)?(?:the\s*)?url|give\s*me\s*(?:the\s*)?url|send\s*me\s*(?:the\s*)?url|url)$/i;
    const urlMedia = getDownloadableMedia(m);
    const urlMime  = urlMedia?.mimetype || "";
    const isUrlableMedia = urlMime.startsWith("image") || urlMime.startsWith("video") || urlMime.startsWith("audio");
    if (urlMedia && isUrlableMedia && URL_TRIGGER_REGEX.test(trimmedLower)) {
      await ednut.sendPresenceUpdate("composing", m.chat).catch(() => {});
      try {
        const srcBuffer = await urlMedia.download();
        if (!srcBuffer || !srcBuffer.length) throw new Error("Empty media buffer");
        const url = await uploadToUguu(srcBuffer, urlMime);
        await sendAndTrack({ text: `🔗 ${url}` });
      } catch (e) {
        console.log("GET URL ERROR:", e.message);
        await ednut.sendMessage(
          m.chat,
          { text: `❌ Couldn't get a URL for that: ${e.message}` },
          { quoted: m }
        ).catch(() => {});
      } finally {
        await ednut.sendPresenceUpdate("paused", m.chat).catch(() => {});
      }
      return;
    }

    if (!m?.text) return; // nothing left to do for non-text, non-sticker/url-request messages

    // ==========================================
    // 🏷️ TAG SOMEONE  ("tag me", "tag him", "tag @John", "tag 0901...", "tag everyone")
    // ==========================================
    const tag = parseTag(msgText);
    if (tag) {
      const jids = new Set(mentionedFrom(m));
      if (tag.self) jids.add(m.sender);
      if (tag.who) {
        const q = m.quoted?.sender || m.quoted?.participant || m.quoted?.key?.participant;
        if (q) jids.add(q);
        else if (!jids.size && !tag.numbers.length && !tag.all && !tag.self) {
          await sendAndTrack({ text: "Reply to that person's message and say *tag him* 💔" });
          return;
        }
      }
      for (const n of tag.numbers) jids.add(`${n}@s.whatsapp.net`);

      // "tag emmy" / "tag @emmy" / "tag emmy and john" → find the person by name in this chat
      let missingNames = [];
      if (tag.names.length) {
        const found = await resolveTagNames(ednut, m, tag.names);
        found.jids.forEach((j) => jids.add(j));
        missingNames = found.missing;
      }

      if (tag.all && m.chat.endsWith("@g.us")) {
        if (!privileged) { await sendAndTrack({ text: "Only my master or a mod can tag everyone 💔" }); return; }
        try { (await ednut.groupMetadata(m.chat)).participants.forEach((p) => jids.add(p.id || p.jid)); }
        catch (e) { console.log("TAG ALL ERROR:", e.message); }
      }

      if (!jids.size) {
        await sendAndTrack({ text: missingNames.length
          ? `I don't know anyone called *${missingNames.join(", ")}* here yet 💔 I learn names from people who have sent a message. Reply to their message and say *tag him*, or type their number.`
          : "I can't tell who to tag 💔 Reply to their message and say *tag him*, or type their name or number." });
        return;
      }
      const list = [...jids];
      await sendAndTrack({ text: `${list.map((j) => "@" + j.split("@")[0]).join(" ")}${tag.say ? " " + tag.say : ""}`, mentions: list });
      if (missingNames.length) await sendAndTrack({ text: `(I couldn't find *${missingNames.join(", ")}* 💔)` });
      return;
    }

    // ==========================================
    // ⚽ FOOTBALL ("sassuolo dey have match?", "arsenal fixtures", "chelsea score")
    // ==========================================
    if (FB_WORDS.test(msgText) && msgText.split(/\s+/).length <= 12 && !/https?:\/\//i.test(msgText)) {
      try {
        const fb = await footballReply(msgText);
        if (fb) { await sendAndTrack({ text: fb }); return; }
      } catch (e) { console.log("FOOTBALL ERROR:", e.message); }
    }

    // ==========================================
    // 📸 WEBSITE SCREENSHOT / 🎬 WEBSITE VIDEO
    //    A short message with a link (typed, or in the message you reply to)
    //    + the word screenshot / ss  → picture (FULL page by default);   video / record → video.
    //    No link? The last site used in this chat (30 min) is used.
    //    Actions (click / type / press enter / scroll / wait) run in the order said.
    // ==========================================
    const quotedText = m.quoted?.text || m.quoted?.body || "";
    const siteOpts   = parseSiteOptions(msgText);
    const wantsVideo = VIDEO_RE.test(msgText);
    const wantsShot  = SHOT_RE.test(msgText) || siteOpts.steps.length > 0;
    const shortMsg   = msgText.split(/\s+/).length <= 40;
    let siteUrl = (wantsVideo || wantsShot) && shortMsg ? findUrl(msgText, quotedText) : null;

    // no link in the message → use the last site this chat asked about (30 min), e.g. "click Suggest and send screenshot"
    if (!siteUrl && (wantsVideo || wantsShot) && msgText.split(/\s+/).length <= 15 &&
        /\b(?:screen\s?-?shot|ss|site|website|web\s?page|page)\b/i.test(msgText) &&
        !/^(?:how|what|why|where|when|which|who)\b/i.test(trimmedLower)) {
      const last = _lastSite.get(m.chat);
      if (last && Date.now() - last.at < 30 * 60 * 1000) siteUrl = last.url;
    }

    if (siteUrl) {
      const lastRun = _siteCooldown.get(m.chat) || 0;
      if (Date.now() - lastRun < 8000) {
        await sendAndTrack({ text: "⏳ Wait small, I'm still handling the last site 💔" });
        return;
      }
      // full page is the default; only the top part if they ask for it
      const full = !/\b(?:viewport|above\s+the\s+fold|top\s+only|only\s+the\s+top|just\s+the\s+top|first\s+screen|not\s+full)\b/i.test(msgText);
      await ednut.sendPresenceUpdate("composing", m.chat).catch(() => {});
      try {
        const safe = await assertPublicUrl(siteUrl);
        _siteCooldown.set(m.chat, Date.now()); // only real requests count, refused links don't
        _lastSite.set(m.chat, { url: safe, at: Date.now() });
        siteOpts.log = [];
        const note = () => (siteOpts.log.length ? "\n" + siteOpts.log.join("\n") : "");
        if (siteOpts.steps.length) await sendAndTrack({ text: "🖱️ Opening the site and doing what you asked, give me a moment..." });
        else if (siteOpts.idle) await sendAndTrack({ text: "⏳ Letting the site load fully, give me a moment..." });
        if (wantsVideo) {
          if (!siteOpts.steps.length) await sendAndTrack({ text: "🎬 Recording the site, give me a moment..." });
          let video = null, why = "";
          try { video = await makeSiteVideo(safe, siteOpts); } catch (e) { why = e.message; }
          if (video) {
            await sendAndTrack({ video, mimetype: "video/mp4", caption: `🎬 ${safe}${note()}` });
          } else {
            const shot = await takeScreenshot(safe, full, siteOpts);
            await sendAndTrack({
              image: shot,
              caption: `📸 ${safe}${note()}\nℹ️ Couldn't make the video${why ? ` (${why})` : ""}. Admin: run  npm i ffmpeg-static  on the server to turn videos on. Sent a screenshot instead.`
            });
          }
        } else {
          const shot = await takeScreenshot(safe, full, siteOpts);
          await sendAndTrack({ image: shot, caption: `📸 ${safe}${note()}` });
        }
      } catch (e) {
        console.log("SITE CAPTURE ERROR:", e.message);
        await sendAndTrack({ text: `❌ Couldn't capture that site: ${e.message}` });
      } finally {
        await ednut.sendPresenceUpdate("paused", m.chat).catch(() => {});
      }
      return;
    }

    // ==========================================
    // 🧠 NAME MEMORY
    // ==========================================
    if (!global.db.settings.userNames) global.db.settings.userNames = {};

    const nameSetMatch = msgText.match(/^my name is\s+(.+)$/i);
    if (nameSetMatch && nameSetMatch[1]) {
      const newName = nameSetMatch[1].trim().replace(/[.!?]+$/, "");
      if (newName) {
        global.db.settings.userNames[senderDigits] = newName;
        await sendAndTrack({
          text: `Got it 💔 I'll remember your name as *${newName}* until you tell me a new one.`
        });
        return;
      }
    }

    if (/^(?:what(?:'s| is) my name\??|who am i\??)$/i.test(trimmedLower)) {
      const savedName = global.db.settings.userNames[senderDigits];
      await sendAndTrack({
        text: savedName
          ? `Your name is *${savedName}* 💔`
          : `You haven't told me your name yet — say "my name is ..." and I'll remember it 💔`
      });
      return;
    }

    // ==========================================
    // 👤 MASTER IDENTITY
    // ==========================================
    if (/^who\s*(?:are|r)?\s*(?:u|you)\??$/i.test(trimmedLower)) {
      const isWhoAreUMaster = senderCandidateList.includes(WHO_ARE_U_MASTER_NUMBER);
      await sendAndTrack({
        text: isWhoAreUMaster
          ? "u are my master Known as *EMMYFROSH 💔*"
          : GENERIC_IDENTITY_REPLY
      });
      return;
    }

    if (isMaster && /^what(?:'s| is) my (?:real|main) name\??$/i.test(trimmedLower)) {
      await sendAndTrack({ text: `${MASTER_REAL_NAME} 💔` });
      return;
    }

    if (/real name/i.test(msgText) && /(master|emmyfrosh)/i.test(msgText)) {
      await sendAndTrack({ text: `${MASTER_REAL_NAME} 💔` });
      return;
    }

    if (/elijah/i.test(msgText) && /(username|nick\s?name)/i.test(msgText)) {
      await sendAndTrack({ text: "EmmyFrosh 💔" });
      return;
    }

    // ==========================================
    // 🎂 BIRTHDAY
    // ==========================================
    if (/\b(?:my|ur|your|our|master'?s?|emmyfrosh'?s?|his)\s+birthday\b/i.test(msgText)) {
      const isBirthdayMaster = senderCandidateList.includes(WHO_ARE_U_MASTER_NUMBER);
      if (isBirthdayMaster) {
        await sendAndTrack({ text: MASTER_BIRTHDAY });
      } else if (/\bmy\s+birthday\b/i.test(msgText)) {
        await sendAndTrack({ text: "u did not share ur birthday info to me 💔" });
      } else {
        await sendAndTrack({ text: `🎂 My master EMMYFROSH birthday is ${MASTER_BIRTHDAY}` });
      }
      return;
    }

    // ==========================================
    // 📶 MTN / AIRTEL / GLO / 9MOBILE
    //    Exact answers for balance / borrow / plans / recharge / share-data.
    //    Anything else about a network still goes to the AI, which gets
    //    the same code list so it doesn't make codes up.
    // ==========================================
    const netAnswer = networkReply(msgText);
    if (netAnswer) {
      await sendAndTrack({ text: netAnswer });
      return;
    }
    const netContext = detectNetwork(msgText) ? NET_KB : "";

    // ==========================================
    // 🖼️ IMAGE GENERATION (text-to-image)
    // ==========================================
    const imagePrompt = extractImagePrompt(msgText);
    if (imagePrompt) {
      await ednut.sendPresenceUpdate("composing", m.chat).catch(() => {});
      try {
        const buffer = await generateImage(imagePrompt);
        const sentMsg = await ednut.sendMessage(
          m.chat,
          { image: buffer, caption: `🎨 ${imagePrompt}` },
          { quoted: m }
        );
        if (sentMsg?.key?.id) {
          _handled.add(sentMsg.key.id);
          setTimeout(() => _handled.delete(sentMsg.key.id), 15000);
        }
      } catch (e) {
        console.log("IMAGE GEN ERROR:", e.message);
        await ednut.sendMessage(
          m.chat,
          { text: "❌ The image servers are busy right now 💔 Please try again in a minute (or say it a bit differently)." },
          { quoted: m }
        ).catch(() => {});
      } finally {
        await ednut.sendPresenceUpdate("paused", m.chat).catch(() => {});
      }
      return;
    }

    await ednut.sendPresenceUpdate("composing", m.chat).catch(() => {});

    let response;
    try {
      response = await askAI(m.chat, msgText, global.db.settings.userNames[senderDigits], netContext);
    } catch (aiErr) {
      console.error("[CHATBOT AI ERROR]", aiErr.message);
      await ednut.sendMessage(
        m.chat,
        { text: `⚠️ AI error (debug): ${aiErr.message}` },
        { quoted: m }
      ).catch(() => {});
      await ednut.sendPresenceUpdate("paused", m.chat).catch(() => {});
      return;
    }

    pushHistory(m.chat, "user", msgText);
    pushHistory(m.chat, "assistant", response);

    const sentMsg = await ednut.sendMessage(m.chat, { text: response }, { quoted: m });
    if (sentMsg?.key?.id) {
      _handled.add(sentMsg.key.id);
      setTimeout(() => _handled.delete(sentMsg.key.id), 15000);
    }

    await ednut.sendPresenceUpdate("paused", m.chat).catch(() => {});

  } catch (err) {
    console.error("[CHATBOT AUTO ERROR]", err.message);
  }
};