const cheerio = require("cheerio");
const fetch = require("node-fetch");

// ========== XNXX SEARCH ==========
async function xnxxSearch(query) {
  try {
    const base = "https://www.xnxx.com";
    const res = await fetch(
      `${base}/search/${encodeURIComponent(query)}/${Math.floor(1 + Math.random() * 3)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5"
        }
      }
    );
    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];

    $("div.mozaique").each(function () {
      $(this).find("div.thumb-under").each(function () {
        const title = $(this).find("a").attr("title");
        const href  = $(this).find("a").attr("href");
        if (title && href) results.push({ title, link: base + href });
      });
    });

    if (!results.length) {
      $(".thumb-block").each(function () {
        const title = $(this).find("a").attr("title") || $(this).find("p").text().trim();
        const href  = $(this).find("a").first().attr("href");
        if (title && href) results.push({ title, link: base + href });
      });
    }

    console.log(`[XNXX SEARCH] Query: "${query}" | Found: ${results.length} results`);
    return { status: true, result: results.slice(0, 10) };
  } catch (err) {
    console.log("[XNXX SEARCH ERROR]:", err.message);
    return { status: false, error: err.message };
  }
}

// ========== DURATION HELPERS ==========
function formatSeconds(secs) {
  if (!secs || isNaN(secs)) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatISO(iso) {
  const h = iso.match(/(\d+)H/i)?.[1];
  const m = iso.match(/(\d+)M/i)?.[1];
  const s = iso.match(/(\d+)S/i)?.[1];
  const result = [h ? `${h}h` : null, m ? `${m}m` : null, s ? `${s}s` : null].filter(Boolean).join(" ");
  return result || null;
}

function parseDuration(html, $) {
  // 1. html5video.setVideoDuration('600') — raw seconds
  const d1 = html.match(/html5video\.setVideoDuration\s*\(\s*['"](\d+)['"]\s*\)/);
  if (d1) { const r = formatSeconds(parseInt(d1[1])); if (r) return r; }

  // 2. "videoDuration": 600 or "videoDuration":"600"
  const d2 = html.match(/"videoDuration"\s*:\s*"?(\d+)"?/);
  if (d2) { const r = formatSeconds(parseInt(d2[1])); if (r) return r; }

  // 3. setVideoDuration any variation
  const d3 = html.match(/setVideoDuration\s*\(["'](\d+)["']\)/);
  if (d3) { const r = formatSeconds(parseInt(d3[1])); if (r) return r; }

  // 4. ISO 8601 from meta content
  const d4 = html.match(/content="(PT[\dHMS]+)"/i);
  if (d4) { const r = formatISO(d4[1]); if (r) return r; }

  // 5. JSON-LD duration
  const d5 = html.match(/"duration"\s*:\s*"(PT[\dHMS]+)"/i);
  if (d5) { const r = formatISO(d5[1]); if (r) return r; }

  // 6. raw seconds in JSON: "duration": 600
  const d6 = html.match(/"duration"\s*:\s*(\d+)/);
  if (d6 && parseInt(d6[1]) > 10) { const r = formatSeconds(parseInt(d6[1])); if (r) return r; }

  // 7. Visible .duration span text like "12:34"
  let textDur = null;
  $(".duration, .thumb-duration, span.duration, .video-duration, [class*='duration']").each(function () {
    const t = $(this).text().trim();
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) { textDur = t; return false; }
  });
  if (textDur) return textDur;

  // 8. Any mm:ss or hh:mm:ss pattern in HTML (skip 00:00)
  const d8 = html.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g);
  if (d8) {
    const valid = d8.find(t => t !== "00:00" && t !== "0:00");
    if (valid) return valid;
  }

  return "N/A";
}

// ========== XNXX DOWNLOADER ==========
async function xnxxDownload(url) {
  try {
    console.log("[XNXX DL] Fetching URL:", url);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.xnxx.com/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      }
    });

    console.log("[XNXX DL] HTTP Status:", res.status);
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);

    const html = await res.text();
    const $    = cheerio.load(html);

    // ── Video streams ──
    const high = html.match(/html5video\.setVideoHigh\s*\(\s*'([^']+)'\s*\)/)?.[1]
               || html.match(/"videoHigh"\s*:\s*"([^"]+)"/)?.[1]
               || html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/i)?.[0]
               || "";

    const low  = html.match(/html5video\.setVideoLow\s*\(\s*'([^']+)'\s*\)/)?.[1]
               || html.match(/"videoLow"\s*:\s*"([^"]+)"/)?.[1]
               || "";

    // ── Thumbnail ──
    const thumb = html.match(/html5video\.setThumbUrl\s*\(\s*'([^']+)'\s*\)/)?.[1]
                || html.match(/"thumbUrl"\s*:\s*"([^"]+)"/)?.[1]
                || "";

    // ── Title ──
    const title = html.match(/html5video\.setVideoTitle\s*\(\s*'([^']+)'\s*\)/)?.[1]
                || html.match(/"videoTitle"\s*:\s*"([^"]+)"/)?.[1]
                || $("title").text().replace(/\s*[-|].*$/, "").trim()
                || "XNXX Video";

    // ── Duration ──
    const duration = parseDuration(html, $);
    console.log("[XNXX DL] Duration resolved:", duration);

    // ── Actors — real pornstar/model page links only ──
    const actors = [];
    $('a[href*="/pornstar/"], a[href*="/model/"]').each(function () {
      const name = $(this).text().trim();
      if (name && name.length > 1 && name.length < 40 && !actors.includes(name)) {
        actors.push(name);
      }
    });
    // fallback: data-model or data-pornstar attributes
    if (!actors.length) {
      $("[data-model], [data-pornstar]").each(function () {
        const name = $(this).attr("data-model") || $(this).attr("data-pornstar") || "";
        if (name && !actors.includes(name)) actors.push(name.trim());
      });
    }

    // ── Tags/Categories — from tag links only ──
    const tags = [];
    const badTags = new Set(["porn", "free porn", "free porn movies", "sex", "xxx", "porn movies", "xnxx", "video"]);
    $('a[href*="/tags/"], a[href*="/category/"], a[href*="/tag/"], .tags a, .video-tags a').each(function () {
      const tag = $(this).text().trim();
      if (tag && tag.length > 1 && tag.length < 40 && !tags.includes(tag) && !badTags.has(tag.toLowerCase())) {
        tags.push(tag);
      }
    });
    // fallback: genre/category links
    if (!tags.length) {
      $('a[href*="/genre/"], a[href*="/cat/"]').each(function () {
        const tag = $(this).text().trim();
        if (tag && !tags.includes(tag) && !badTags.has(tag.toLowerCase())) tags.push(tag);
      });
    }

    console.log("[XNXX DL] Extracted =>", {
      title,
      thumb:  thumb    ? "✅" : "❌",
      high:   high     ? "✅" : "❌",
      low:    low      ? "✅" : "❌",
      duration,
      actors,
      tags: tags.slice(0, 8)
    });

    const videoUrl = high || low;
    if (!videoUrl) {
      console.log("[XNXX DL] PAGE SNIPPET:\n", html.slice(0, 3000));
      throw new Error("No video stream found — page structure may have changed");
    }

    return {
      status: true,
      result: {
        title,
        image: thumb,
        duration,
        files: { high, low },
        actors,
        tags: tags.slice(0, 8)
      }
    };
  } catch (err) {
    console.log("[XNXX DL ERROR]:", err.message);
    return { status: false, error: err.message };
  }
}

// ========== PLUGIN EXPORTS ==========
module.exports = [
  {
    command: "xnxxdl",
    alias: ["xnxxdownload"],
    category: "Nsfw",
    description: "🔞 Download XNXX Video",
    gcban: true,
    ban: true,
    async execute(m, { ednut, args, reply }) {
      const text = args.join(" ").trim();
      console.log("[XNXXDL CMD] Args:", args, "| Text:", text);

      if (!text) {
        return reply("❌ Please send a valid XNXX link.\n\nExample:\n.xnxxdl https://www.xnxx.com/video-...");
      }
      if (!text.includes("xnxx.com")) {
        return reply("❌ That doesn't look like an XNXX link.\n\nExample:\n.xnxxdl https://www.xnxx.com/video-...");
      }

      const urlMatch = text.match(/(https?:\/\/[^\s]+)/g);
      const targetUrl = urlMatch ? urlMatch[0] : text;
      console.log("[XNXXDL CMD] Target URL:", targetUrl);

      try {
        await reply("⏳ Processing video request... Please wait.");

        const data = await xnxxDownload(targetUrl);
        console.log("[XNXXDL CMD] Result status:", data.status);

        if (!data.status || !data.result) {
          return reply(`❌ Could not extract video.\n\nReason: ${data.error || "Unknown error"}`);
        }

        const vid      = data.result;
        const videoUrl = vid.files?.high || vid.files?.low;

        if (!videoUrl) {
          return reply("❌ No downloadable video stream found for this link.");
        }

        const actorLine = vid.actors?.length
          ? `\n👤 *Cast:* ${vid.actors.join(", ")}`
          : "";

        const tagLine = vid.tags?.length
          ? `\n🏷️ *Tags:* ${vid.tags.join(" • ")}`
          : "";

        const caption =
          `🔞 *${vid.title}*\n` +
          `🕐 *Duration:* ${vid.duration}` +
          actorLine +
          tagLine +
          `\n\n${global.footer || "🎥 Powered by EmmyFrosh-AI"}`;

        await ednut.sendMessage(m.chat, {
          video: { url: videoUrl },
          caption,
          jpegThumbnail: vid.image
            ? await fetch(vid.image).then(r => r.buffer()).catch(() => null)
            : null
        }, { quoted: m });

      } catch (err) {
        console.log("❌ [XNXXDL EXECUTE ERROR]:", err.message);
        reply(`❌ Internal error: ${err.message}`);
      }
    }
  },

  {
    command: "xns",
    alias: ["xnxxsearch"],
    category: "Nsfw",
    description: "🔍 Search videos on XNXX",
    gcban: true,
    ban: true,
    async execute(m, { ednut, args, reply }) {
      const text = args.join(" ").trim();
      console.log("[XNS CMD] Args:", args, "| Text:", text);

      if (!text) return reply("❌ Please provide a search query.\nExample: .xns lisa");

      try {
        await reply("🔍 Searching XNXX... Please wait.");

        const res = await xnxxSearch(text);
        console.log("[XNS CMD] Status:", res.status, "| Count:", res.result?.length);

        if (!res.status || !res.result?.length) {
          return reply(`❌ No results found.\n\nReason: ${res.error || "Empty results — XNXX may have blocked the request"}`);
        }

        let txt = `🔞 *XNXX Search Results for "${text}":*\n\n`;
        for (let i = 0; i < res.result.length; i++) {
          const { title, link } = res.result[i];
          txt += `*${i + 1}.* ${title}\n🔗 ${link}\n\n`;
        }
        txt += `_Use .xnxxdl <link> to download any video_`;

        await ednut.sendMessage(m.chat, { text: txt.trim() }, { quoted: m });

      } catch (err) {
        console.log("❌ [XNS EXECUTE ERROR]:", err.message);
        reply(`❌ Search error: ${err.message}`);
      }
    }
  }
];