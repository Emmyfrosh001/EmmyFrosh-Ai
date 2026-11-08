const axios = require("axios");
const yts = require("yt-search");

// ─────────────────────────── Lyrics Helpers ───────────────────

async function fetchLyrics(query) {
  let artist = "";
  let title  = "";

  if (query.includes(" - ")) {
    const parts = query.split(" - ");
    artist = parts[0].trim();
    title  = parts[1].trim();
  } else {
    title = query.trim();
  }

  // ── 1. Try lrclib.net ─────────────────────────────────────
  try {
    const res = await axios.get("https://lrclib.net/api/search", {
      params: { q: artist ? `${artist} ${title}` : title },
      timeout: 10000,
    });

    const results = res.data;
    if (Array.isArray(results) && results.length > 0) {
      const match = artist
        ? results.find((r) =>
            r.artistName?.toLowerCase().includes(artist.toLowerCase())
          ) || results[0]
        : results[0];

      const lyrics =
        match.plainLyrics ||
        (match.syncedLyrics
          ? match.syncedLyrics.replace(/\[\d+:\d+\.\d+\]/g, "").trim()
          : null);

      if (lyrics) {
        return {
          lyrics: lyrics.trim(),
          title:  match.trackName  || title,
          artist: match.artistName || artist || "Unknown Artist",
          source: "lrclib.net",
        };
      }
    }
  } catch (_) {}

  // ── 2. Fallback: yt-search to resolve artist/title ────────
  try {
    if (!artist) {
      const search = await yts(title);
      if (search.videos.length) {
        const vid = search.videos[0];
        if (vid.title.includes("-")) {
          const parts = vid.title.split("-");
          artist = parts[0].trim();
          title  = parts.slice(1).join("-").trim();
        } else {
          artist = "Unknown";
          title  = vid.title;
        }
      }
    }
  } catch (_) {}

  // ── 3. Fallback: lyrics.ovh ───────────────────────────────
  try {
    if (!artist) {
      const autoRes = await axios.get(
        `https://api.lyrics.ovh/suggest/${encodeURIComponent(title)}`,
        { timeout: 10000 }
      );
      const hits = autoRes.data?.data;
      if (hits && hits.length > 0) {
        artist = hits[0].artist?.name || "";
        title  = hits[0].title        || title;
      }
    }

    if (artist) {
      const res = await axios.get(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
        { timeout: 15000 }
      );
      if (res.data?.lyrics) {
        return {
          lyrics: res.data.lyrics.trim(),
          title,
          artist,
          source: "lyrics.ovh",
        };
      }
    }
  } catch (_) {}

  throw new Error(
    `Lyrics not found for *${title}*${artist ? ` by ${artist}` : ""}.\nTry checking the spelling or adding the artist name.`
  );
}

function chunkLyrics(text, maxLen = 3800) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < 1) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  return chunks;
}

// ─────────────────────────── Commands ─────────────────────────

module.exports = [

  // ── Read More ──────────────────────────────────────────────
  {
    command: ["readmore"],
    description: "Hide text using read more",
    category: "Tool",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, text }) => {
      const more = String.fromCharCode(8206);
      const readmore = more.repeat(4001);
      let [l = "", r = ""] = text.split("|");
      await ednut.sendMessage(m.chat, { text: l + readmore + r }, { quoted: m });
    },
  },

  // ── Lyrics ─────────────────────────────────────────────────
  {
    command: ["lyrics"],
    alias: ["ly"],
    description: "Get song lyrics. Usage: .lyrics <artist> - <song>",
    category: "Tool",
    async execute(m, { ednut, reply, text }) {
      try {
        if (!text) {
          return reply(
            "🎵 Please provide a song name.\n\n" +
            "Usage: *.lyrics <artist> - <song>*\n" +
            "Example: *.lyrics Rihanna - Diamonds*\n\n" +
            "Or just: *.lyrics Diamonds*"
          );
        }

        // Clean input — strip word "lyrics" and normalise "by" → "-"
        const query = text
          .toLowerCase()
          .replace(/\blyrics\b/g, "")
          .replace(/\bby\b/, "-")
          .trim();

        await reply("🔍 Searching for lyrics...");

        const { lyrics, title, artist, source } = await fetchLyrics(query);

        const header = `🎵 *${title}*\n👤 *${artist}*\n${"─".repeat(30)}\n\n`;
        const chunks = chunkLyrics(lyrics);

        for (let i = 0; i < chunks.length; i++) {
          const isFirst = i === 0;
          const isLast  = i === chunks.length - 1;

          const content = (isFirst ? header : "") + chunks[i];
          const footer  = isLast
            ? `\n\n${"─".repeat(30)}\n🌐 Powered by ${source}`
            : `\n\n_...continued (${i + 1}/${chunks.length})_`;

          await ednut.sendMessage(
            m.chat,
            { text: content + footer, mentions: [m.sender] },
            { quoted: m }
          );

          if (!isLast) await new Promise((r) => setTimeout(r, 800));
        }
      } catch (err) {
        console.error(`\n========== LYRICS ERROR ==========\n`);
        console.error(err);
        console.error(`\n==================================\n`);
        reply(`❌ Failed to fetch lyrics.\n\nReason: ${err?.message || "Unknown Error"}`);
      }
    },
  },

  // ── Track IP ───────────────────────────────────────────────
  {
    command: ["trackip"],
    description: "Track IP address information",
    category: "Tool",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, text, fetch }) => {
      if (!text) return m.reply("Example: 112.90.150.204");

      try {
        const res = await fetch(`https://ipwho.is/${text}`).then((r) => r.json());
        if (!res.success) throw new Error(`IP ${text} not found!`);

        const info =
`IP: ${res.ip}
Country: ${res.country}
Region: ${res.region}
City: ${res.city}
Latitude: ${res.latitude}
Longitude: ${res.longitude}
ISP: ${res.connection?.isp}
Org: ${res.connection?.org}
Timezone: ${res.timezone?.id} (${res.timezone?.current_time})`;

        await ednut.sendMessage(
          m.chat,
          { location: { degreesLatitude: res.latitude, degreesLongitude: res.longitude } },
          { ephemeralExpiration: 604800 }
        );

        await new Promise((resolve) => setTimeout(resolve, 2000));
        m.reply(info);
      } catch (err) {
        console.log(err);
        m.reply(`Error: Unable to retrieve data for IP ${text}`);
      }
    },
  },

  // ── TTS ────────────────────────────────────────────────────
  {
    command: ["tts"],
    alias: ["say", "gtts"],
    description: "Convert text to speech",
    category: "Converter",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, args, q, googleTTS }) => {
      let text = args.length > 1 ? args.slice(1).join(" ") : q;
      if (!text) return m.reply("Missing text.");

      let voiceLanguage = "en-US";
      let speed = false;
      const style = args[0]?.toLowerCase();

      switch (style) {
        case "female": voiceLanguage = "en-GB";  break;
        case "deep":   voiceLanguage = "en-IN";  break;
        case "slow":   speed = true;             break;
        case "ng":     voiceLanguage = "en-NG";  break;
        case "au":     voiceLanguage = "en-AU";  break;
      }

      if (text.length > 200) return m.reply("Text must be under 200 characters.");

      try {
        const url = googleTTS.getAudioUrl(text, {
          lang: voiceLanguage,
          slow: speed,
          host: "https://translate.google.com",
        });

        await ednut.sendMessage(
          m.chat,
          { audio: { url }, mimetype: "audio/mpeg", ptt: true },
          { quoted: m }
        );
      } catch (err) {
        console.log(err);
        m.reply("Error occurred while converting text to speech.");
      }
    },
  },

  // ── Device ─────────────────────────────────────────────────
  {
    command: ["device"],
    alias: ["getdevice", "phone"],
    description: "Detect device from quoted message",
    category: "Tool",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, getDevice }) => {
      if (!m.quoted) return m.reply("Reply to a message");

      try {
        const device = await getDevice(m.quoted.id);

        await ednut.sendMessage(
          m.chat,
          {
            text: `@${m.quoted.sender.split("@")[0]} is using ${device}`,
            contextInfo: { mentionedJid: [m.quoted.sender] },
          },
          { quoted: m }
        );
      } catch (err) {
        console.log(err);
        m.reply("Error occurred while fetching device info.");
      }
    },
  },
];