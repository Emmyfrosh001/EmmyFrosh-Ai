const axios = require("axios")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFile } = require("child_process")

// =========================
// CONFIG
// =========================
const MONEYBLINK_KEY =
  process.env.MONEYBLINK_KEY || "524de9dbd18357810a9e6b76810ace32d81a7d5f" // regenerate this if the file was shared publicly
const TIMEOUT = 20000
const DEBUG = true // true = failed downloads also show the reason (success messages are unchanged)
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"

// =========================
// HELPERS
// =========================
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Pulls the best video link out of any JSON shape (prefers HD)
function pickVideo(json) {
  const s = JSON.stringify(json).replace(/\\\//g, "/")
  const links = [...s.matchAll(/https?:\/\/[^"\s\\]+/g)].map(x => x[0])
    .filter(l => !/^https?:\/\/(www\.|vt\.|vm\.|m\.)?tiktok\.com\//i.test(l))
  const videos = links.filter(l => /\.mp4|video|fbcdn|cdninstagram|download/i.test(l))
  return videos.find(l => /hd/i.test(l)) || videos[0] || null
}

// Runs every source in parallel, first success wins
function race(sources, url) {
  const tasks = sources.map(api =>
    axios.get(api(url), { timeout: TIMEOUT }).then(r => {
      const link = pickVideo(r.data)
      if (!link) throw new Error("no video")
      return link
    })
  )
  return Promise.any(tasks)
}

// tikwm sometimes returns relative links like "/video/media/play/xxx.mp4"
function absUrl(u, base = "https://www.tikwm.com") {
  if (!u) return null
  if (/^https?:\/\//i.test(u)) return u
  if (u.startsWith("//")) return "https:" + u
  return base + (u.startsWith("/") ? "" : "/") + u
}

// Downloads a file into a Buffer (WhatsApp often can't fetch TikTok CDN links itself)
async function getBuffer(url, referer = "https://www.tikwm.com/", extraHeaders = {}) {
  const get = range =>
    axios.get(url, {
      responseType: "arraybuffer",
      timeout: 60000,
      maxContentLength: 100 * 1024 * 1024,
      validateStatus: st => st === 200 || st === 206,
      headers: { "User-Agent": UA, Referer: referer, ...extraHeaders, Range: range }
    })

  const res = await get("bytes=0-")
  const type = String(res.headers["content-type"] || "")
  if (/text|json|html/i.test(type)) throw new Error("server returned " + type)

  const parts = [Buffer.from(res.data)]
  let got = parts[0].length
  if (!got) throw new Error("empty file")

  if (res.status === 206) {
    // Server may send the file in pieces: keep asking for the rest
    const total = Number(String(res.headers["content-range"] || "").split("/")[1]) || 0
    for (let i = 0; total && got < total && i < 60; i++) {
      const r = await get(`bytes=${got}-`)
      const piece = Buffer.from(r.data)
      if (!piece.length) break
      parts.push(piece)
      got += piece.length
    }
    if (total && got < total) throw new Error(`truncated download (${got}/${total} bytes)`)
  } else {
    const expected = Number(res.headers["content-length"] || 0)
    if (expected && got < expected) throw new Error(`truncated download (${got}/${expected} bytes)`)
  }
  return Buffer.concat(parts)
}

// =========================
// FACEBOOK / INSTAGRAM SOURCES
// =========================
const FB_APIS = [
  u => `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(u)}`,
  u => `https://api.vreden.my.id/api/fbdl?url=${encodeURIComponent(u)}`,
  u => `https://api.ryzendesu.vip/api/downloader/fbdl?url=${encodeURIComponent(u)}`
]

const IG_APIS = [
  u => `https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(u)}`,
  u => `https://api.vreden.my.id/api/igdl?url=${encodeURIComponent(u)}`,
  u => `https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(u)}`
]

async function fetchFacebook(url) {
  const tasks = [race(FB_APIS, url)]
  // Optional extra source: npm i btch-downloader
  try {
    const { fbdown } = require("btch-downloader")
    tasks.push(
      fbdown(url).then(r => {
        const link = r?.HD || r?.Normal_video
        if (!link) throw new Error("no video")
        return link
      })
    )
  } catch {}
  return Promise.any(tasks)
}

async function fetchInstagram(url) {
  const tasks = [race(IG_APIS, url)]
  // Optional extra source: npm i btch-downloader
  try {
    const { igdl } = require("btch-downloader")
    tasks.push(
      igdl(url).then(r => {
        const link = pickVideo(r)
        if (!link) throw new Error("no video")
        return link
      })
    )
  } catch {}
  return Promise.any(tasks)
}

// =========================
// TIKTOK SOURCES
// =========================

// Primary: tikwm (POST works better than GET and is less likely to be blocked)
async function tikwm(url) {
  let lastErr
  for (let i = 0; i < 3; i++) {
    try {
      const { data } = await axios.post(
        "https://www.tikwm.com/api/",
        new URLSearchParams({ url, hd: "1" }).toString(),
        {
          timeout: TIMEOUT,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": UA,
            Referer: "https://www.tikwm.com/",
            Origin: "https://www.tikwm.com"
          }
        }
      )

      if (data?.code === 0 && data.data) {
        const d = data.data
        const video = absUrl(d.play || d.hdplay)
        const images = Array.isArray(d.images) ? d.images.map(i => absUrl(i)) : []
        if (!video && !images.length) throw new Error("tikwm: no media")
        return {
          video,
          images,
          audio: absUrl(d.music || d.music_info?.play),
          title: d.title,
          author: d.author?.nickname || d.author?.unique_id
        }
      }

      // Free tier is limited to 1 request/second -> wait and retry
      lastErr = new Error(data?.msg || "tikwm error")
      if (/limit|frequen|too many/i.test(data?.msg || "")) {
        await sleep(1500)
        continue
      }
      break
    } catch (e) {
      lastErr = e
      await sleep(800)
    }
  }
  throw lastErr || new Error("tikwm failed")
}

// Fallback APIs (generic JSON scanning)
const TT_APIS = [
  u => `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(u)}`,
  u => `https://api.vreden.my.id/api/tiktok?url=${encodeURIComponent(u)}`,
  u => `https://api.ryzendesu.vip/api/downloader/ttdl?url=${encodeURIComponent(u)}`,
  u => `https://api.siputzx.my.id/api/tiktok/v2?url=${encodeURIComponent(u)}`,
  u => `https://api.tiklydown.eu.org/api/download/v5?url=${encodeURIComponent(u)}`,
  u => `https://api.agatz.xyz/api/tiktok?url=${encodeURIComponent(u)}`,
  u => `https://api.nyxs.pw/dl/tiktok?url=${encodeURIComponent(u)}`
]

function fallbackApi(api, url) {
  return axios
    .get(api(url), { timeout: TIMEOUT, headers: { "User-Agent": UA } })
    .then(r => {
      const video = pickVideo(r.data)
      if (!video) throw new Error("no video")
      return { video, images: [] }
    })
}

// Direct source: reads TikTok's own page (no third-party API needed)
async function tiktokDirect(url) {
  const res = await axios.get(url, {
    timeout: TIMEOUT,
    maxRedirects: 5,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml"
    }
  })
  const cookie = (res.headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; ")
  const html = String(res.data)
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) throw new Error("direct: page data not found")
  const json = JSON.parse(m[1])
  const item = json?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct
  if (!item) throw new Error("direct: video unavailable")
  const h264 = (item.video?.bitrateInfo || []).find(b =>
    /h264/i.test(b.CodecType || "")
  )?.PlayAddr?.UrlList?.[0]
  const video = h264 || item.video?.downloadAddr || item.video?.playAddr
  if (!video) throw new Error("direct: no video url")
  return {
    video,
    images: [],
    audio: item.music?.playUrl,
    title: item.desc,
    author:
      (typeof item.author === "object"
        ? item.author?.nickname || item.author?.uniqueId
        : item.author) ||
      item.authorInfo?.nickname ||
      item.authorInfo?.uniqueId ||
      (res.request?.res?.responseUrl || "").match(/@([^/?]+)/)?.[1],
    headers: { Cookie: cookie, Referer: "https://www.tiktok.com/" }
  }
}

// Runs all sources, first success wins. Collects every failure reason.
async function fetchTikTok(url) {
  const sources = {
    tikwm: () => tikwm(url),
    direct: () => tiktokDirect(url)
  }
  TT_APIS.forEach((api, i) => (sources["api" + (i + 1)] = () => fallbackApi(api, url)))

  try {
    const { ttdl } = require("btch-downloader")
    sources.btch = () =>
      ttdl(url).then(r => {
        const video = r?.video?.[0] || pickVideo(r)
        if (!video) throw new Error("no video")
        return { video, images: [], audio: r?.audio?.[0], title: r?.title, author: r?.author }
      })
  } catch {}

  const errors = []
  const tasks = Object.entries(sources).map(([name, fn]) =>
    fn().catch(e => {
      const why = e?.response?.status
        ? `HTTP ${e.response.status}`
        : e?.code || e?.message || "unknown"
      errors.push(`${name}: ${why}`)
      throw e
    })
  )

  const results = await Promise.allSettled(tasks)
  const candidates = results.filter(r => r.status === "fulfilled").map(r => r.value)
  if (!candidates.length) {
    const err = new Error("all sources failed")
    err.reasons = errors
    throw err
  }
  candidates.errors = errors
  return candidates
}

// Clean TikTok link (removes tracking junk, keeps short links working)
function extractTikTokUrl(text) {
  const m = String(text).match(/https?:\/\/(?:[\w-]+\.)?tiktok\.com\/[^\s]+/i)
  return m ? m[0] : null
}

const why = e =>
  e?.response?.status ? `HTTP ${e.response.status}` : e?.code || e?.message || String(e)

// Rejects HTML/JSON error pages that servers return instead of a real video
function assertVideo(buf) {
  const head = buf.slice(0, 1).toString()
  if (head === "<" || head === "{") throw new Error("not a video file")
  if (buf.length < 150 * 1024) throw new Error(`too small (${(buf.length / 1024).toFixed(0)} KB)`)
  if (buf.slice(4, 8).toString("latin1") !== "ftyp") throw new Error("not an mp4 (no ftyp)")
  if (!buf.includes("moov")) throw new Error("incomplete video (no moov, would show 0:00)")
}

// Converts to H.264/AAC mp4 so every WhatsApp client can play it.
// Needs ffmpeg on the server (or: npm i @ffmpeg-installer/ffmpeg). Falls back to the original file.
function ffmpegPath() {
  try {
    return require("@ffmpeg-installer/ffmpeg").path
  } catch {
    return "ffmpeg"
  }
}

async function toPlayable(buf) {
  const id = Date.now() + "-" + Math.random().toString(36).slice(2)
  const inp = path.join(os.tmpdir(), `tt-${id}-in.mp4`)
  const out = path.join(os.tmpdir(), `tt-${id}-out.mp4`)
  try {
    fs.writeFileSync(inp, buf)
    await new Promise((res, rej) =>
      execFile(
        ffmpegPath(),
        ["-y", "-i", inp, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-movflags", "+faststart", out],
        { timeout: 120000 },
        (e, so, se) => (e ? rej(Object.assign(e, { stderr: se })) : res())
      )
    )
    const converted = fs.readFileSync(out)
    if (converted.length < 10000) return { buf, converted: false, note: "ffmpeg output too small" }
    return { buf: converted, converted: true, note: "ok" }
  } catch (e) {
    const note = e.code === "ENOENT" ? "ffmpeg NOT installed" : "ffmpeg failed: " + String(e.stderr || e.message).slice(-150)
    return { buf, converted: false, note }
  } finally {
    for (const f of [inp, out]) {
      try { fs.unlinkSync(f) } catch {}
    }
  }
}

// Downloads one candidate, retrying with different Referer headers on 401/403
async function downloadVideo(c) {
  const h = c.headers || {}
  let origin = ""
  try { origin = new URL(c.video).origin + "/" } catch {}
  const referers = [...new Set([h.Referer, origin, "https://www.tiktok.com/", "https://www.tikwm.com/"].filter(Boolean))]
  let lastErr
  for (const ref of referers) {
    try {
      const buf = await getBuffer(c.video, ref, { ...h, Referer: ref })
      assertVideo(buf)
      return buf
    } catch (e) {
      lastErr = e
      const st = e?.response?.status
      if (st !== 403 && st !== 401) throw e
    }
  }
  throw lastErr
}

// Looks up the author separately (some download sources don't return it)
async function fetchAuthor(url) {
  // 1) TikTok's public oEmbed endpoint
  try {
    const { data } = await axios.get("https://www.tiktok.com/oembed", {
      params: { url },
      timeout: 8000,
      headers: { "User-Agent": UA }
    })
    const name = data?.author_name
    const handle = data?.author_unique_id
    if (name && handle && name.toLowerCase() !== handle.toLowerCase()) return `${name} (${handle})`
    if (name || handle) return name || handle
  } catch {}

  // 2) Username in the redirect target of the short link
  try {
    const r = await axios.get(url, {
      maxRedirects: 0,
      validateStatus: st => st >= 200 && st < 400,
      timeout: 8000,
      headers: { "User-Agent": UA }
    })
    const user = String(r.headers?.location || "").match(/@([^/?]+)/)?.[1]
    if (user) return user
  } catch {}

  return null
}

module.exports = [

  // ✅ INSTAGRAM
  {
    command: ["instagram"],
    alias: ["igdl", "ig", "insta"],
    description: "Download Instagram media",
    category: "Downloader",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, text, reply }) => {
      if (!text) return reply("❌ Please input an Instagram link.")
      if (!text.includes("instagram.com")) return reply("❌ Invalid Instagram link!")

      try {
        const videoUrl = await fetchInstagram(text.trim())

        await ednut.sendMessage(
          m.chat,
          {
            video: { url: videoUrl },
            mimetype: "video/mp4",
            caption: `🎬 *Instagram Video*\n\n${global.footer}`
          },
          { quoted: m }
        )
      } catch (err) {
        global.log("ERROR", err)
        reply("❌ Instagram download failed. The post may be private or unsupported.")
      }
    }
  },

  // ✅ FACEBOOK
  {
    command: ["facebook"],
    alias: ["fb", "fbvid", "fbvideo"],
    description: "Download Facebook media",
    category: "Downloader",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, text, reply }) => {
      if (!text) return reply("❌ Provide a Facebook link.")
      if (!/(facebook\.com|fb\.watch|fb\.com)/i.test(text))
        return reply("❌ Invalid Facebook link!")

      try {
        const videoUrl = await fetchFacebook(text.trim())

        await ednut.sendMessage(
          m.chat,
          {
            video: { url: videoUrl },
            mimetype: "video/mp4",
            caption: `🎥 *Facebook Video*\n\n${global.footer}`
          },
          { quoted: m }
        )
      } catch (err) {
        global.log("ERROR", err)
        reply("❌ Facebook download failed. The link may be private or unsupported.")
      }
    }
  },

  // ✅ TIKTOK
  {
    command: ["tiktok"],
    alias: ["tt", "ttvid"],
    description: "Download TikTok video",
    category: "Downloader",
    ban: false,
    execute: async (m, { ednut, text, reply }) => {
      if (!text) return reply("❌ Provide a TikTok link.")
      const link = extractTikTokUrl(text)
      if (!link) return reply("❌ Invalid TikTok link!")

      try {
        await reply("⏳ Downloading TikTok video...")

        const problems = []

        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt) await sleep(1500)

          let candidates
          try {
            candidates = await fetchTikTok(link)
          } catch (e) {
            problems.push(...(e.reasons || [why(e)]))
            continue
          }

          const title = candidates.find(c => c.title)?.title
          const author = candidates.find(c => c.author)?.author || (await fetchAuthor(link))
          const caption =
            `🎵 *${title || "TikTok Video"}*\n\n` +
            `👤 Author: ${author || "Unknown"}\n\n${global.footer || ""}`

          // Photo slideshow post
          const slide = candidates.find(c => !c.video && c.images?.length)
          if (slide) {
            for (const img of slide.images.slice(0, 10)) {
              await ednut.sendMessage(m.chat, { image: { url: img } }, { quoted: m })
            }
            return
          }

          // Download each source, validate it, send the first real video
          for (const c of candidates.filter(c => c.video)) {
            try {
              const buffer = await downloadVideo(c)
              const info = await toPlayable(buffer)
              await ednut.sendMessage(
                m.chat,
                { video: info.buf, mimetype: "video/mp4", fileName: "tiktok.mp4", caption },
                { quoted: m }
              )
              return
            } catch (e) {
              problems.push(`${c.video.slice(0, 45)}… -> ${why(e)}`)
            }
          }

          if (attempt === 2) problems.push(...(candidates.errors || []))
        }

        // Never let WhatsApp fetch the link itself: it only gets a broken partial file
        const err = new Error("could not download a valid video")
        err.reasons = problems
        throw err
      } catch (err) {
        global.log("ERROR", err.reasons ? err.reasons.join(" | ") : err)
        reply(
          "❌ TikTok download failed." +
            (DEBUG ? "\n\n🛠 Debug:\n" + ([...new Set(err.reasons || [])].join("\n") || why(err)) : "")
        )
      }
    }
  },

  // ✅ TIKTOK AUDIO
  {
    command: ["tiktoksound"],
    alias: ["ttmp3", "tiktokmp3"],
    description: "Download TikTok audio",
    category: "Downloader",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, text, reply }) => {
      if (!text) return reply("❌ Provide a TikTok link.")
      const link = extractTikTokUrl(text)
      if (!link) return reply("❌ Invalid TikTok link!")

      try {
        const data = await tikwm(link)
        if (!data.audio) return reply("⚠️ Audio not found.")

        let audio
        try {
          audio = { audio: await getBuffer(data.audio), mimetype: "audio/mpeg" }
        } catch {
          audio = { audio: { url: data.audio }, mimetype: "audio/mpeg" }
        }

        await ednut.sendMessage(m.chat, audio, { quoted: m })
      } catch (err) {
        global.log("ERROR", err)
        reply("❌ TikTok audio download failed.")
      }
    }
  },

  // ✅ SHORTLINK
  {
    command: ["shortlink-dl"],
    description: "Shorten a link",
    category: "Downloader",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, text, isUrl, reply }) => {
      if (!text) return reply("❌ Provide a URL.")
      if (!isUrl(text)) return reply("❌ Invalid URL.")

      try {
        const { data } = await axios.get(
          `https://moneyblink.com/st/?api=${MONEYBLINK_KEY}&url=${encodeURIComponent(text.trim())}`,
          { timeout: TIMEOUT }
        )
        if (!data?.url) return reply("⚠️ Could not shorten the link.")

        await ednut.sendMessage(m.chat, { text: data.url }, { quoted: m })
      } catch (err) {
        global.log("ERROR", err)
        reply("❌ Failed to process shortlink.")
      }
    }
  }

]
