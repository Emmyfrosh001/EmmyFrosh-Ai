const axios = require("axios");
const fs = require("fs");
const net = require("net");
const dns = require("dns").promises;

// sharp is already in your package.json. It is used to check that a screenshot is not just
// grey loading placeholders / a blank page. If it is missing, that check is skipped.
let sharp = null;
try { sharp = require("sharp"); } catch (e) {}

// ==========================================================================
// .ssweb <url> [seconds] [full] [force]
//
//  NEVER sends a half-loaded page. It keeps waiting until the page has finished loading,
//  and if it can't get a finished page it tells you instead of sending a bad picture.
//
//  1) REAL BROWSER (best). Used automatically when this server has Chrome/Chromium and
//     puppeteer-core (already in your package.json). Set CHROME_PATH to the browser file,
//     or install the bundled one:  npm i @sparticuz/chromium
//     It waits until: the page is loaded, loading placeholders are gone, the images are
//     in, lazy images were scrolled in, and the page stopped changing.
//  2) SCREENSHOT SERVICES (fallback). Each one is asked to wait for the page, and when a
//     shot still looks unfinished it is asked again with a longer wait.
//
//  Options after the link:  20 = wait longer (seconds, max 25) | full = whole page
//                           force = send whatever loads, even if unfinished
// ==========================================================================

// ---------- settings ----------
const DEFAULT_WAIT = 8;       // seconds
const MAX_WAIT = 25;
const WAIT_STEP = 8;          // screenshot services: each retry waits this much longer
const LOW_DETAIL = 12;        // average colour variation below this = blank / loading placeholders
const MIN_BYTES = 3000;       // smaller than this is an error page, not a screenshot
const TIME_BUDGET = 120000;   // overall limit (ms)
const LOW_DETAIL_GRACE = 10000; // a calm page with no loaders that still looks plain is accepted after this long
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "image/*,*/*;q=0.8"
};
const COMMON_CHROME_PATHS = [
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable", "/snap/bin/chromium", "/opt/google/chrome/chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
];

const log = (...a) => console.log("[SSWEB]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- screenshot services (each can wait for the page to load) ----------
const PROVIDERS = [
    {
        name: "thum.io",
        waits: true,
        build: (u, w) => `https://image.thum.io/get/width/1200/wait/${Math.min(w, 30)}/noanimate/${u}`
    },
    {
        name: "microlink",
        waits: true,
        build: (u, w) =>
            `https://api.microlink.io/?url=${encodeURIComponent(u)}&screenshot=true&meta=false&embed=screenshot.url` +
            `&waitUntil=networkidle2&waitForTimeout=${Math.min(w, 30) * 1000}`
    },
    {
        name: "s-shot",
        waits: false,
        build: (u) => `https://mini.s-shot.ru/1366x768/JPEG/1366/Z100/?${u}`
    },
    {
        name: "screenshotmachine",
        waits: true,
        build: (u, w) => `https://api.screenshotmachine.com/?key=demo&url=${encodeURIComponent(u)}&dimension=1024x768&delay=${Math.min(w, 10) * 1000}`
    }
];

// ==========================================================================
// SAFETY: never screenshot private / internal addresses (stops people from using the bot
// to look at your server's localhost, panel, or cloud metadata).
// ==========================================================================

function isPrivateIp(ip) {
    ip = String(ip).toLowerCase();
    const mapped = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mapped) {
        const hi = parseInt(mapped[1], 16), lo = parseInt(mapped[2], 16);
        ip = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    } else if (ip.startsWith("::ffff:")) {
        ip = ip.slice(7);
    }
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split(".").map(Number);
        return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
            (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) ||
            (a === 198 && (b === 18 || b === 19)) || a >= 224;
    }
    if (net.isIPv6(ip)) {
        return ip === "::1" || ip === "::" || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip);
    }
    return true; // not an address we understand: treat as unsafe
}

async function assertPublicUrl(u) {
    let parsed;
    try { parsed = new URL(u); } catch (e) { throw Object.assign(new Error("invalid link"), { code: "BLOCKED" }); }
    if (!/^https?:$/.test(parsed.protocol)) throw Object.assign(new Error("only http/https links"), { code: "BLOCKED" });
    const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
        throw Object.assign(new Error("private address"), { code: "BLOCKED" });
    }
    if (net.isIP(host)) {
        if (isPrivateIp(host)) throw Object.assign(new Error("private address"), { code: "BLOCKED" });
        return;
    }
    let addrs = [];
    try { addrs = await dns.lookup(host, { all: true }); } catch (e) { return; } // can't resolve: the screenshot will just fail
    if (addrs.some((a) => isPrivateIp(a.address))) throw Object.assign(new Error("private address"), { code: "BLOCKED" });
}

// ==========================================================================
// IMAGE HELPERS
// ==========================================================================

/** True only for a real image file (PNG / JPEG / GIF / WEBP). */
function isImage(b) {
    if (!b || b.length < MIN_BYTES) return false;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
    if (b.toString("ascii", 0, 4) === "GIF8") return true;
    if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return true;
    return false;
}

async function fetchImage(link, waitSec) {
    const res = await axios.get(link, {
        responseType: "arraybuffer",
        timeout: (waitSec + 25) * 1000, // the service is waiting for the page, so allow for that
        maxRedirects: 5,
        headers: { ...HEADERS, Referer: link }
    });
    const buf = Buffer.from(res.data);
    if (!isImage(buf)) throw new Error("service did not return an image");
    return buf;
}

/**
 * How much real picture detail the screenshot has (average colour variation, 0-255).
 * Loading placeholders or a blank page score very low; a loaded page scores much higher.
 * Returns null if it can't be measured.
 */
async function detail(buf) {
    if (!sharp) return null;
    try {
        const st = await sharp(buf).stats();
        const ch = st.channels.slice(0, 3);
        return ch.reduce((a, c) => a + c.stdev, 0) / ch.length;
    } catch (e) {
        return null;
    }
}

const looksUnloaded = (d) => d !== null && d < LOW_DETAIL;

// ==========================================================================
// 1) REAL BROWSER
// ==========================================================================

let browserBusy = false; // one browser at a time (they are heavy); others use the services

async function findBrowser() {
    let lib = null, name = "";
    for (const n of ["puppeteer", "puppeteer-core"]) {
        try { lib = require(n); name = n; break; } catch (e) {}
    }
    if (!lib) return null;

    let args = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--hide-scrollbars"];
    let executablePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || "";

    if (!executablePath) {
        try {
            const sp = require("@sparticuz/chromium");
            executablePath = await sp.executablePath();
            args = [...(sp.args || []), ...args];
        } catch (e) {}
    }
    if (!executablePath) {
        for (const p of COMMON_CHROME_PATHS) {
            try { if (fs.existsSync(p)) { executablePath = p; break; } } catch (e) {}
        }
    }
    if (!executablePath && name !== "puppeteer") return null; // puppeteer-core has no browser of its own
    return { lib: lib.launch ? lib : lib.default, executablePath: executablePath || undefined, args };
}

// ----- functions that run INSIDE the page -----
function PAGE_WATCH() {
    window.__lastMut = Date.now();
    try {
        new MutationObserver(() => { window.__lastMut = Date.now(); })
            .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch (e) {}
}

function PAGE_STATE() {
    const vh = window.innerHeight, vw = window.innerWidth;
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return false;
        if (r.bottom < 0 || r.top > vh * 1.2 || r.right < 0 || r.left > vw) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity || "1") > 0.05;
    };
    const sel = '[class*="skeleton" i],[class*="shimmer" i],[class*="placeholder" i],[class*="spinner" i],' +
        '[class*="loader" i],[class*="loading" i],[class*="animate-pulse" i],[aria-busy="true"],[role="progressbar"]';
    let loaders = 0;
    document.querySelectorAll(sel).forEach((el) => { if (visible(el)) loaders++; });
    // empty filled rounded blocks with no text/image inside = skeleton cards, whatever they are called
    let ghosts = 0;
    document.querySelectorAll("div,span,li,section,article,a").forEach((el) => {
        if (el.children.length > 0 || (el.textContent || "").trim()) return;
        if (!visible(el)) return;
        const r = el.getBoundingClientRect();
        if (r.width < 60 || r.height < 12) return;
        const cs = getComputedStyle(el);
        const bg = cs.backgroundColor;
        if (!bg || bg === "transparent" || /rgba\(.*,\s*0\)$/.test(bg)) return;
        if (cs.backgroundImage && cs.backgroundImage !== "none" && /url\(/.test(cs.backgroundImage)) return;
        if (parseFloat(cs.borderTopLeftRadius) < 3) return;
        ghosts++;
    });
    document.querySelectorAll("*").forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.animationName !== "none" && cs.animationIterationCount === "infinite" && visible(el)) {
            const r = el.getBoundingClientRect();
            if (r.width >= 20 && r.height >= 8 && !el.children.length && !(el.textContent || "").trim()) loaders++;
        }
    });
    if (ghosts >= 3) loaders += ghosts;
    let imgsPending = 0;
    document.querySelectorAll("img").forEach((img) => {
        if (visible(img) && !(img.complete && img.naturalWidth > 0)) imgsPending++;
    });
    return {
        ready: document.readyState === "complete",
        loaders,
        imgsPending,
        stableFor: Date.now() - (window.__lastMut || 0)
    };
}

async function PAGE_SCROLL() {
    const total = Math.min(document.documentElement.scrollHeight, 12000);
    const step = Math.max(300, window.innerHeight * 0.8);
    for (let y = 0; y < total; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 250));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
}

/**
 * Opens the page in a real browser and waits until it has really finished loading.
 * Returns { buf, loaded } | null (no browser available / browser failed).
 */
async function browserShot(url, { wait, full, deadline }) {
    if (browserBusy) { log("browser busy, using the screenshot services"); return null; }

    let found;
    try { found = await findBrowser(); } catch (e) { found = null; }
    if (!found) { log("no local browser found (set CHROME_PATH or npm i @sparticuz/chromium) - using the screenshot services"); return null; }

    browserBusy = true;
    let browser = null;
    try {
        browser = await found.lib.launch({ executablePath: found.executablePath, args: found.args, headless: true });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.setUserAgent(HEADERS["User-Agent"]);

        try {
            await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
        } catch (e) {
            log("page did not go idle (normal for busy sites):", e.message); // keep going, the checks below decide
        }
        await assertPublicUrl(page.url()); // a redirect must not lead to a private address
        await page.evaluate(PAGE_WATCH);

        const maxMs = Math.min((wait + 12) * 1000, 45000);
        const t0 = Date.now();
        let scrolled = false;
        let last = null; // last screenshot { buf }

        while (Date.now() - t0 < maxMs && Date.now() < deadline) {
            const st = await page.evaluate(PAGE_STATE);
            const elapsed = Date.now() - t0;
            const calm = st.loaders === 0
                ? (st.stableFor >= 1500 || elapsed >= 8000)  // busy pages (sliders, tickers) are fine after 8s
                : st.stableFor >= 4500;                       // loaders still visible: they must have gone still
            const settled = st.ready && st.imgsPending === 0 && calm;

            if (!settled) { await sleep(500); continue; }

            if (!scrolled) { // bring lazy-loaded images in, then check again
                scrolled = true;
                await page.evaluate(PAGE_SCROLL);
                continue;
            }

            await assertPublicUrl(page.url());
            const buf = Buffer.from(await page.screenshot({ type: "jpeg", quality: 85, fullPage: !!full }));
            last = { buf };
            const d = await detail(buf);
            log(`browser shot: detail=${d === null ? "n/a" : d.toFixed(1)} loaders=${st.loaders} after ${(elapsed / 1000).toFixed(1)}s`);

            if (st.loaders === 0 && !looksUnloaded(d)) return { buf, loaded: true };
            // looks plain but no placeholders found: a really simple page, accept after a grace period.
            if (st.loaders === 0 && elapsed >= LOW_DETAIL_GRACE) return { buf, loaded: true };
            // placeholders still visible: never accept, keep waiting
            await sleep(2500);
        }

        // ran out of time without a finished page
        if (!last) last = { buf: Buffer.from(await page.screenshot({ type: "jpeg", quality: 85, fullPage: !!full })) };
        return { buf: last.buf, loaded: false };
    } catch (e) {
        if (e && e.code === "BLOCKED") throw e;
        log("browser failed:", e.message);
        return null;
    } finally {
        browserBusy = false;
        if (browser) { try { await Promise.race([browser.close(), sleep(8000)]); } catch (e) {} }
    }
}

// ==========================================================================
// 2) SCREENSHOT SERVICES (fallback)
// ==========================================================================

/**
 * Each service is asked to wait for the page; if the shot still looks unfinished it is asked
 * again with a longer wait (8s more each time). Returns { buf, loaded } | null.
 */
async function serviceShot(url, { wait, started }) {
    let best = null; // best unfinished shot, only used with `force`

    for (const p of PROVIDERS) {
        let w = wait;
        const tries = p.waits ? 3 : 1;

        for (let i = 0; i < tries; i++) {
            if (Date.now() - started > TIME_BUDGET) return best;
            try {
                const buf = await fetchImage(p.build(url, w), w);
                const d = await detail(buf);
                log(`${p.name} (wait ${w}s): detail=${d === null ? "n/a" : d.toFixed(1)}`);
                if (!looksUnloaded(d)) return { buf, loaded: true };
                if (!best || (d ?? 255) > (best.d ?? 255)) best = { buf, loaded: false, d };
                w = Math.min(w + WAIT_STEP, 30); // looks unfinished: wait longer next time
            } catch (e) {
                log(`${p.name} failed:`, e.message);
                break; // this service is down, go to the next one
            }
        }
    }
    return best;
}

// ==========================================================================
// COMMAND
// ==========================================================================

module.exports = [{

    command: ["ssweb"],

    category: "Search",

    description: "Screenshot of a website, only sent once the page has fully loaded. Usage: .ssweb <url> [seconds] [full] [force]",

    async execute(m, { text, reply, ednut }) {

        try {

            // =========================
            // GET URL (TEXT OR REPLY)
            // =========================
            let url = text?.trim();

            if (!url && m.quoted) {
                url =
                    m.quoted.text ||
                    m.quoted.message?.conversation ||
                    m.quoted.message?.extendedTextMessage?.text ||
                    "";
            }

            if (!url) {
                return reply("❌ Example: .ssweb https://google.com\nSlow site? Add seconds to wait: .ssweb https://google.com 20\nWhole page: .ssweb https://google.com full");
            }

            // options at the end:  .ssweb https://site.com 15 full force
            let wait = DEFAULT_WAIT, full = false, force = false;
            for (;;) {
                const mm = url.match(/^(.*\S)\s+(\d{1,2}|full|force|now)$/i);
                if (!mm) break;
                const w = mm[2].toLowerCase();
                if (/^\d+$/.test(w)) wait = Math.min(Math.max(parseInt(w, 10), 3), MAX_WAIT);
                else if (w === "full") full = true;
                else force = true;
                url = mm[1];
            }

            url = url.replace(/\.ssweb2|\.ssweb|webshot/gi, "").trim();

            const match = url.match(/https?:\/\/[^\s]+/);
            if (match) url = match[0];

            if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^https?:\/\//i.test(url)) {
                return reply("❌ I can only take screenshots of public websites.");
            }
            if (!/^https?:\/\//i.test(url)) {
                url = "https://" + url;
            }

            try {
                await assertPublicUrl(url);
            } catch (e) {
                if (e.code === "BLOCKED") return reply("❌ I can only take screenshots of public websites.");
                throw e;
            }

            await ednut.sendMessage(m.chat, {
                react: { text: "📸", key: m.key }
            });

            // =========================
            // DIRECT IMAGE LINK
            // =========================
            if (/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url)) {
                try {
                    const buffer = await fetchImage(url, 0);
                    await ednut.sendMessage(m.chat, {
                        image: buffer,
                        caption: "✅ Image loaded successfully"
                    }, { quoted: m });
                    return;
                } catch (e) {
                    log("image error:", e.message);
                    return reply("❌ Failed to load image (server blocked access)");
                }
            }

            // =========================
            // TAKE THE SCREENSHOT
            // =========================
            const started = Date.now();
            const deadline = started + TIME_BUDGET;
            let result = null;

            try {
                result = await browserShot(url, { wait, full, deadline });          // 1) real browser (if available)
            } catch (e) {
                if (e.code === "BLOCKED") return reply("❌ I can only take screenshots of public websites.");
                log("browser path error:", e.message);
            }

            if (!result || (!result.loaded && !force)) {
                const viaService = await serviceShot(url, { wait, started });      // 2) screenshot services
                if (viaService && (viaService.loaded || !result)) result = viaService;
            }

            // =========================
            // RESULT
            // =========================
            if (!result) {
                return reply("❌ Screenshot failed (site blocked bots or the screenshot services are down). Try again in a moment.");
            }

            if (!result.loaded && !force) {
                ednut.sendMessage(m.chat, { react: { text: "⚠️", key: m.key } }).catch(() => {});
                return reply(
                    "⚠️ That page didn't finish loading in time, so I didn't send a half-loaded screenshot.\n\n" +
                    `Give it longer: .ssweb ${url} 25\nOr send whatever loads: .ssweb ${url} force`
                );
            }

            await ednut.sendMessage(m.chat, {
                image: result.buf,
                caption: result.loaded ? "✅ Screenshot taken successfully" : "⚠️ Sent as-is (force): the page may not have fully loaded"
            }, { quoted: m });

            ednut.sendMessage(m.chat, { react: { text: result.loaded ? "✅" : "⚠️", key: m.key } }).catch(() => {});

        } catch (err) {

            console.error(err);

            reply(`❌ Error: ${err.code || err.message}`);

        }

    }

}];