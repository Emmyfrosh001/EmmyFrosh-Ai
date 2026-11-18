const axios = require("axios")

// =========================
// CONFIG
// =========================
const MONEYBLINK_KEY =
  process.env.MONEYBLINK_KEY || "524de9dbd18357810a9e6b76810ace32d81a7d5f" // regenerate this if the file was shared publicly
const TIMEOUT = 20000
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
async function getBuffer(url, referer = "https://www.tikwm.com/") {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
    maxContentLength: 100 * 1024 * 1024,
    headers: { "User-Agent": UA, Referer: referer }
  })
  const buf = Buffer.from(res.data)
  if (!buf.length) throw new Error("empty file")
  return buf
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
        const video = absUrl(d.hdplay || d.play)
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
  u => `https://api.ryzendesu.vip/api/downloader/ttdl?url=${encodeURIComponent(u)}`
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

async function fetchTikTok(url) {
  const tasks = [tikwm(url), ...TT_APIS.map(api => fallbackApi(api, url))]

  // Optional extra source: npm i btch-downloader
  try {
    const { ttdl } = require("btch-downloader")
    tasks.push(
      ttdl(url).then(r => {
        const video = r?.video?.[0] || pickVideo(r)
        if (!video) throw new Error("no video")
        return {
          video,
          images: [],
          audio: r?.audio?.[0],
          title: r?.title,
          author: r?.author
        }
      })
    )
  } catch {}

  return Promise.any(tasks)
}

// Clean TikTok link (removes tracking junk, keeps short links working)
function extractTikTokUrl(text) {
  const m = String(text).match(/https?:\/\/(?:[\w-]+\.)?tiktok\.com\/[^\s]+/i)
  return m ? m[0] : null
}

// Sends video as a buffer first (most reliable), falls back to URL
async function sendVideo(ednut, m, videoUrl, caption) {
  try {
    const buffer = await getBuffer(videoUrl)
    return await ednut.sendMessage(
      m.chat,
      { video: buffer, mimetype: "video/mp4", fileName: "tiktok.mp4", caption },
      { quoted: m }
    )
  } catch {
    return ednut.sendMessage(
      m.chat,
      { video: { url: videoUrl }, mimetype: "video/mp4", fileName: "tiktok.mp4", caption },
      { quoted: m }
    )
  }
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

        const data = await fetchTikTok(link)
        const caption =
          `🎵 *${data.title || "TikTok Video"}*\n\n` +
          `👤 Author: ${data.author || "Unknown"}\n\n${global.footer}`

        // Photo slideshow post
        if (!data.video && data.images?.length) {
          for (const img of data.images.slice(0, 10)) {
            await ednut.sendMessage(m.chat, { image: { url: img } }, { quoted: m })
          }
          return
        }

        await sendVideo(ednut, m, data.video, caption)
      } catch (err) {
        global.log("ERROR", err)
        reply("❌ TikTok download failed. The link may be private, removed, or unsupported.")
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
