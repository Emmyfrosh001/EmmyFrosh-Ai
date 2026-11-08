const axios = require("axios")

// =========================
// CONFIG
// =========================
const MONEYBLINK_KEY = "524de9dbd18357810a9e6b76810ace32d81a7d5f" // regenerate this if the file was shared publicly
const TIMEOUT = 15000

// =========================
// HELPERS
// =========================

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
      if (!text) return reply("❎ Please input an Instagram link.")
      if (!text.includes("instagram.com")) return reply("❎ Invalid Instagram link!")

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
        reply("❎ Instagram download failed. The post may be private or unsupported.")
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
      if (!text) return reply("❎ Provide a Facebook link.")
      if (!/(facebook\.com|fb\.watch|fb\.com)/i.test(text))
        return reply("❎ Invalid Facebook link!")

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
      if (!text) return reply("❎ Provide a TikTok link.")
      if (!text.includes("tiktok.com")) return reply("❎ Invalid TikTok link!")

      try {
        await reply("⏳ Downloading TikTok video...")

        const api = await axios.get(
          `https://www.tikwm.com/api/?url=${encodeURIComponent(text.trim())}`,
          { timeout: TIMEOUT }
        )
        const data = api.data?.data
        if (!data || !data.play) return reply("⚠️ Could not fetch TikTok video.")

        // Send by URL (faster, no buffer download on your server)
        await ednut.sendMessage(
          m.chat,
          {
            video: { url: data.play },
            mimetype: "video/mp4",
            fileName: "tiktok.mp4",
            gifPlayback: false,
            caption: `🎵 *${data.title || "TikTok Video"}*\n\n👤 Author: ${data.author?.nickname || "Unknown"}\n\n${global.footer}`
          },
          { quoted: m }
        )
      } catch (err) {
        global.log("ERROR", err)
        reply("❌ TikTok download failed.")
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
      if (!text) return reply("❎ Provide a TikTok link.")
      if (!text.includes("tiktok.com")) return reply("❎ Invalid TikTok link!")

      try {
        const api = await axios.get(
          `https://www.tikwm.com/api/?url=${encodeURIComponent(text.trim())}`,
          { timeout: TIMEOUT }
        )
        const data = api.data?.data
        const audioUrl = data?.music
        if (!audioUrl) return reply("⚠️ Audio not found.")

        await ednut.sendMessage(
          m.chat,
          {
            audio: { url: audioUrl },
            mimetype: "audio/mpeg"
          },
          { quoted: m }
        )
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
      if (!text) return reply("❎ Provide a URL.")
      if (!isUrl(text)) return reply("❎ Invalid URL.")

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