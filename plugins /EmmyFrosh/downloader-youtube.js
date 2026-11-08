const yts = require("youtube-yts");
const axios = require("axios");

// ─── Configuration ──────────────────────────────────────────────
const CONFIG = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  TIMEOUT: 30000, // 30 seconds
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  API_ENDPOINTS: [
    "https://media.cypherxbot.space/download",
    "https://api.cypherxbot.space/download",
    "https://youtube-download-api.vercel.app/download",
    // Add more endpoints here
  ],
};

// ─── Cache System ──────────────────────────────────────────────
const searchCache = new Map();
const activeDownloads = new Map();

// ─── Helper Functions ──────────────────────────────────────────

const formatViews = (num) => {
  if (!num || isNaN(num)) return "n/a";
  return Number(num).toLocaleString();
};

const buildCaption = (result, info, videoUrl) => {
  const title = info?.title || result?.title || "unknown title";
  const duration = info?.metadata?.duration || info?.duration || result?.duration?.timestamp || "n/a";
  const views = formatViews(info?.metadata?.view || info?.viewCount || result?.views);
  const description = (info?.description || result?.description || "").slice(0, 100) + "...";
  const uploaded = info?.uploadDate || result?.ago || "n/a";
  const url = videoUrl || result?.url || "";

  return (
    `❦ ᴠɪᴅᴇᴏ ᴅᴇᴛᴀɪʟꜱ ❦\n\n` +
    `➟ ᴠɪᴅᴇᴏ ᴜʀʟ: ${url}\n` +
    `➟ ᴛɪᴛʟᴇ: ${title.toLowerCase()}\n` +
    `➟ ᴅᴇꜱᴄʀɪᴘᴛɪᴏɴ: ${description.toLowerCase()}\n` +
    `➟ ᴅᴜʀᴀᴛɪᴏɴ: ${duration}\n` +
    `➟ ᴠɪᴇᴡꜱ: ${views}\n` +
    `➟ ᴅᴀᴛᴇ ᴜᴘʟᴏᴀᴅᴇᴅ: ${uploaded}`
  );
};

const react = (ednut, m, emoji) => {
  ednut.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {});
};

const extractVideoId = (url) => {
  if (!url) return null;
  const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:\?|&|$)/);
  return match ? match[1] : null;
};

const isValidYoutubeUrl = (url) => {
  if (!url) return false;
  const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
  return pattern.test(url);
};

const getFileSize = async (url) => {
  try {
    const head = await axios.head(url, { timeout: 5000 });
    return parseInt(head.headers['content-length'] || 0);
  } catch {
    return 0;
  }
};

const fetchWithFallback = async (url, type) => {
  let lastError = null;

  // Try all endpoints
  for (const endpoint of CONFIG.API_ENDPOINTS) {
    try {
      const apiUrl = `${endpoint}?url=${encodeURIComponent(url)}&type=${type}`;
      console.log(`[API] Trying: ${apiUrl}`);

      const { data } = await axios.get(apiUrl, {
        timeout: CONFIG.TIMEOUT,
        validateStatus: () => true, // Don't throw on any status
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      if (data?.status && data?.result?.download_url) {
        console.log(`[API] Success with endpoint: ${endpoint}`);
        return { success: true, data };
      }

      console.log(`[API] Invalid response from ${endpoint}:`, data);
    } catch (error) {
      lastError = error;
      console.log(`[API] Endpoint ${endpoint} failed:`, error.message);
    }
  }

  return { success: false, error: lastError };
};

// ─── Commands ──────────────────────────────────────────────────

module.exports = [
  // ──────────────────────────────────────────────
  // .yta — YouTube Audio Download
  // ──────────────────────────────────────────────
  {
    command: ["yta"],
    alias: ["ytmp3", "ytaudio"],
    description: "Download YouTube audio (MP3)",
    category: "Downloader",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, text, reply }) => {
      if (!text) return reply("❌ please provide a youtube video link.");
      if (!isValidYoutubeUrl(text)) {
        return reply("❌ invalid youtube link!");
      }

      // Check for active download
      if (activeDownloads.has(m.sender)) {
        return reply("⏳ You have an active download. Please wait.");
      }
      activeDownloads.set(m.sender, Date.now());

      react(ednut, m, "🔍");

      try {
        // Extract video ID for clean URL
        const videoId = extractVideoId(text);
        const cleanUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : text;

        const result = await fetchWithFallback(cleanUrl, "audio");

        if (!result.success) {
          throw new Error("Failed to fetch audio from all endpoints");
        }

        const { data } = result;

        // Check file size
        const size = await getFileSize(data.downloadUrl);
        if (size > CONFIG.MAX_FILE_SIZE) {
          return reply(
            `❌ File too large (${(size / 1024 / 1024).toFixed(1)}MB). Maximum: ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`
          );
        }

        react(ednut, m, "⬇️");

        await ednut.sendMessage(
          m.chat,
          {
            audio: { url: data.downloadUrl },
            mimetype: "audio/mpeg",
            fileName: "YouTube-Audio.mp3",
            ptt: false,
          },
          { quoted: m }
        );

        react(ednut, m, "✅");

      } catch (err) {
        console.log("[YTA ERROR]", err.message);
        react(ednut, m, "❌");
        reply(getUserFriendlyError(err));
      } finally {
        activeDownloads.delete(m.sender);
      }
    },
  },

  // ──────────────────────────────────────────────
  // .ytv — YouTube Video Download
  // ──────────────────────────────────────────────
  {
    command: ["ytv"],
    alias: ["ytmp4", "ytvideo", "mp4"],
    description: "Download YouTube video as MP4",
    category: "Downloader",
    ban: true,
    gcban: true,
    async execute(m, { ednut, text, reply }) {
      if (!text) return reply("❌ please provide a youtube video link.");
      if (!isValidYoutubeUrl(text)) {
        return reply("❌ invalid youtube link!");
      }

      // Check for active download
      if (activeDownloads.has(m.sender)) {
        return reply("⏳ You have an active download. Please wait.");
      }
      activeDownloads.set(m.sender, Date.now());

      react(ednut, m, "🔍");

      try {
        // Extract video ID for clean URL
        const videoId = extractVideoId(text);
        const cleanUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : text;

        const result = await fetchWithFallback(cleanUrl, "video");

        if (!result.success) {
          throw new Error("Failed to fetch video from all endpoints");
        }

        const { data } = result;

        // Check file size
        const size = await getFileSize(data.result.download_url);
        if (size > CONFIG.MAX_FILE_SIZE) {
          return reply(
            `❌ File too large (${(size / 1024 / 1024).toFixed(1)}MB). Maximum: ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`
          );
        }

        react(ednut, m, "⬇️");

        const caption = buildCaption({ url: text }, data.result, text);

        await ednut.sendMessage(
          m.chat,
          {
            video: { url: data.result.download_url },
            mimetype: "video/mp4",
            caption,
          },
          { quoted: m }
        );

        react(ednut, m, "✅");

      } catch (err) {
        console.log("[YTV ERROR]", err.message);
        react(ednut, m, "❌");
        reply(getUserFriendlyError(err));
      } finally {
        activeDownloads.delete(m.sender);
      }
    },
  },

  // ──────────────────────────────────────────────
  // .video — Search + Download YouTube Video
  // ──────────────────────────────────────────────
  {
    command: ["video"],
    alias: ["ytgrab", "ytsearch"],
    description: "Search and download YouTube video",
    category: "Downloader",
    ban: true,
    gcban: true,
    async execute(m, { ednut, text, reply }) {
      if (!text) return reply("❌ please provide a video name to search.");

      // Check for active download
      if (activeDownloads.has(m.sender)) {
        return reply("⏳ You have an active download. Please wait.");
      }
      activeDownloads.set(m.sender, Date.now());

      react(ednut, m, "🔍");

      try {
        // Check cache first
        const cacheKey = text.toLowerCase();
        let searchResult = null;

        if (searchCache.has(cacheKey)) {
          const cached = searchCache.get(cacheKey);
          if (Date.now() - cached.timestamp < CONFIG.CACHE_TTL) {
            searchResult = cached.data;
            console.log("[CACHE] Hit for:", text);
          } else {
            searchCache.delete(cacheKey);
          }
        }

        // If not in cache, search
        if (!searchResult) {
          const search = await yts(text);
          searchResult = search.all?.[0];
          
          if (searchResult) {
            searchCache.set(cacheKey, {
              data: searchResult,
              timestamp: Date.now()
            });
          }
        }

        if (!searchResult) {
          return reply("❌ no video found for your search.");
        }

        console.log("[SEARCH] Found:", searchResult.title);

        react(ednut, m, "⏳");

        // Extract video ID for clean URL
        const videoId = extractVideoId(searchResult.url);
        const cleanUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : searchResult.url;

        const result = await fetchWithFallback(cleanUrl, "video");

        if (!result.success) {
          throw new Error("Failed to fetch video from all endpoints");
        }

        const { data } = result;

        // Check file size
        const size = await getFileSize(data.result.download_url);
        if (size > CONFIG.MAX_FILE_SIZE) {
          return reply(
            `❌ File too large (${(size / 1024 / 1024).toFixed(1)}MB). Maximum: ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`
          );
        }

        react(ednut, m, "⬇️");

        const caption = buildCaption(searchResult, data.result, searchResult.url);

        await ednut.sendMessage(
          m.chat,
          {
            video: { url: data.result.download_url },
            mimetype: "video/mp4",
            caption,
          },
          { quoted: m }
        );

        react(ednut, m, "✅");

      } catch (err) {
        console.log("[VIDEO ERROR]");
        console.log("Error details:", {
          message: err.message,
          stack: err.stack,
          response: err.response?.data,
          status: err.response?.status,
        });

        react(ednut, m, "❌");
        reply(getUserFriendlyError(err));
      } finally {
        activeDownloads.delete(m.sender);
      }
    },
  },

  // ──────────────────────────────────────────────
  // .testapi — Test YouTube Download API
  // ──────────────────────────────────────────────
  {
    command: ["testapi"],
    description: "Test YouTube download API status",
    category: "Developer",
    async execute(m, { ednut, reply }) {
      const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      
      try {
        reply("🔍 Testing API endpoints...");
        
        const results = [];
        for (const endpoint of CONFIG.API_ENDPOINTS) {
          try {
            const startTime = Date.now();
            const { data } = await axios.get(
              `${endpoint}?url=${encodeURIComponent(testUrl)}&type=video`,
              { timeout: 15000 }
            );
            const responseTime = Date.now() - startTime;
            
            results.push({
              endpoint,
              status: data?.status ? "✅ Working" : "⚠️ Invalid response",
              time: `${responseTime}ms`,
              data: data?.result?.title || "N/A"
            });
          } catch (err) {
            results.push({
              endpoint,
              status: "❌ Failed",
              error: err.message
            });
          }
        }

        let message = "📊 API TEST RESULTS\n\n";
        results.forEach(r => {
          message += `• ${r.endpoint}\n`;
          message += `  Status: ${r.status}\n`;
          if (r.time) message += `  Time: ${r.time}\n`;
          if (r.data) message += `  Video: ${r.data}\n`;
          if (r.error) message += `  Error: ${r.error}\n`;
          message += "\n";
        });

        reply(message);
      } catch (err) {
        reply(`❌ Test failed: ${err.message}`);
      }
    },
  },

  // ──────────────────────────────────────────────
  // .clear_cache — Clear Search Cache
  // ──────────────────────────────────────────────
  {
    command: ["clear_cache"],
    description: "Clear YouTube search cache",
    category: "Developer",
    async execute(m, { ednut, reply }) {
      const count = searchCache.size;
      searchCache.clear();
      reply(`✅ Cache cleared. Removed ${count} entries.`);
    },
  },
];

// ─── Error Handler ─────────────────────────────────────────────

const getUserFriendlyError = (err) => {
  if (err.code === 'ECONNABORTED') {
    return "❌ Request timed out. The video might be too long or the server is slow.";
  }
  if (err.code === 'ENOTFOUND') {
    return "❌ Network error. Please check your internet connection.";
  }
  if (err.response?.status === 404) {
    return "❌ Video not found or unavailable.";
  }
  if (err.response?.status === 429) {
    return "❌ Too many requests. Please try again in a few minutes.";
  }
  if (err.response?.status === 403) {
    return "❌ Access denied. The video might be age-restricted or private.";
  }
  if (err.message?.includes("Failed to fetch")) {
    return "❌ Download service is currently unavailable. Please try again later.";
  }
  
  // Return generic error with details for debugging
  const errorId = Math.random().toString(36).substring(7);
  console.log(`[ERROR ID: ${errorId}]`, err);
  return `❌ An error occurred. [Error ID: ${errorId}]\nPlease try again later.`;
};