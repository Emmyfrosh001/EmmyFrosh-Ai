const axios = require("axios");
const cheerio = require("cheerio");

// ---------- Primary source: instatiktok.com ----------
async function fetchFromInstatiktok(platform, text) {
  const SITE_URL = "https://instatiktok.com/";
  const form = new URLSearchParams();
  form.append("url", text);
  form.append("platform", platform);
  form.append("siteurl", SITE_URL);

  const res = await axios.post(`${SITE_URL}api`, form.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Origin": SITE_URL,
      "Referer": SITE_URL,
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest",
    },
    timeout: 20_000,
  });

  const html = res?.data?.html;
  if (!html || res?.data?.status !== "success") {
    throw new Error("instatiktok.com returned no usable data");
  }

  const $ = cheerio.load(html);
  const links = [];
  $('a.btn[href^="http"]').each((_, el) => {
    const link = $(el).attr("href");
    if (link && !links.includes(link)) links.push(link);
  });

  if (links.length === 0) throw new Error("instatiktok.com returned no media links");

  const tag = (url) => ({ url, referer: SITE_URL });

  if (platform === "instagram") return links.map(tag);
  if (platform === "tiktok") {
    const pick = links.find((l) => /hdplay/.test(l)) || links[0];
    return [tag(pick)];
  }
  if (platform === "facebook") return [tag(links.at(-1))];
  return links.map(tag);
}

// ---------- Fallback source for Instagram only: btch.us.kg ----------
async function fetchInstagramFromBtch(text) {
  const res = await axios.get("https://btch.us.kg/download/igdl", {
    params: { url: text },
    timeout: 20_000,
  });

  const data = res?.data;
  if (!data?.status || data?.code !== 200 || !Array.isArray(data?.result) || data.result.length === 0) {
    throw new Error("btch.us.kg returned no usable data");
  }

  // Normalize to the same { url, referer } shape used elsewhere
  return data.result.map((item) => ({ url: item.url, referer: "https://btch.us.kg/" }));
}

async function getInstagramMedia(text) {
  try {
    return await fetchFromInstatiktok("instagram", text);
  } catch (primaryErr) {
    console.error("instatiktok.com (instagram) failed, trying fallback:", primaryErr.message);
    try {
      return await fetchInstagramFromBtch(text);
    } catch (fallbackErr) {
      console.error("btch.us.kg fallback also failed:", fallbackErr.message);
      throw new Error("All Instagram download sources failed");
    }
  }
}

// Hard ceiling on what we'll even attempt to download/send — past this,
// no WhatsApp path is reliable regardless of message type.
const DOCUMENT_LIMIT = 300 * 1024 * 1024; // 300 MB

// Sniffs the first few bytes to tell image vs video when the server only
// gave us a generic "application/octet-stream" content-type.
function sniffMediaType(buff) {
  if (buff.length < 12) return null;
  const hex = buff.subarray(0, 12).toString("hex");

  if (hex.startsWith("ffd8ff")) return "image"; // JPEG
  if (hex.startsWith("89504e47")) return "image"; // PNG
  if (hex.startsWith("47494638")) return "image"; // GIF
  if (buff.subarray(0, 4).toString("ascii") === "RIFF" && buff.subarray(8, 12).toString("ascii") === "WEBP")
    return "image"; // WEBP
  if (buff.subarray(4, 8).toString("ascii") === "ftyp") return "video"; // MP4/MOV family
  if (hex.startsWith("1a45dfa3")) return "video"; // WEBM/MKV (EBML header)

  return null;
}

// Downloads a media URL and confirms it's actually image/video bytes,
// not an HTML error page or an empty/expired-link response.
// `referer` matters a lot here: many downloader-site CDN/proxy links use
// hotlink protection and will only serve the real file (instead of a
// blocked/HTML response) if the request's Referer matches their own domain.
async function fetchMediaBuffer(url, referer) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60_000,
    validateStatus: () => true,
    maxRedirects: 5,
    maxContentLength: DOCUMENT_LIMIT,
    maxBodyLength: DOCUMENT_LIMIT,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      ...(referer ? { Referer: referer, Origin: referer.replace(/\/$/, "") } : {}),
    },
  });

  const contentType = res.headers["content-type"] || "";
  const buff = Buffer.from(res.data);

  if (res.status !== 200 || buff.length === 0) {
    throw new Error(`status ${res.status}, content-type "${contentType}", ${buff.length} bytes`);
  }

  let mediaKind = null;
  if (contentType.startsWith("image/")) mediaKind = "image";
  else if (contentType.startsWith("video/")) mediaKind = "video";
  else if (contentType.startsWith("application/octet-stream")) mediaKind = sniffMediaType(buff);

  if (!mediaKind) {
    let snippet = "";
    if (contentType.startsWith("text/") || contentType.includes("json")) {
      snippet = buff.toString("utf8").slice(0, 120).replace(/\s+/g, " ");
    }
    throw new Error(
      `status ${res.status}, content-type "${contentType}", ${buff.length} bytes — doesn't look like image or video data${
        snippet ? ` (body: "${snippet}")` : ""
      }`
    );
  }

  if (buff.length > DOCUMENT_LIMIT) {
    throw new Error(
      `file is ${(buff.length / 1024 / 1024).toFixed(1)} MB, which exceeds the ${(
        DOCUMENT_LIMIT /
        1024 /
        1024
      ).toFixed(0)} MB hard limit — too large to deliver on WhatsApp at all`
    );
  }

  const isVideo = mediaKind === "video" || url.includes(".mp4");
  return { buff, isVideo };
}

// Always builds an inline image/video payload (real thumbnail + player) —
// never a `document`, which WhatsApp renders as a bare file-icon card.
function buildMediaPayload({ buff, isVideo }, caption) {
  return isVideo ? { video: buff, caption } : { image: buff, caption };
}

// Uploads to WhatsApp with a couple of retries — transient host failures
// ("media upload failed on all hosts") are common and often succeed on retry.
async function sendMediaWithRetry(ednut, from, payload, options, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await ednut.sendMessage(from, payload, options);
    } catch (err) {
      lastErr = err;
      console.error(`Upload attempt ${i}/${attempts} failed:`, err.message || err);
      if (i < attempts) await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  throw lastErr;
}

// Reacts to the user's original message instead of sending a separate text
// status message — much lighter/faster (no extra round-trip message).
async function setReaction(ednut, from, mek, emoji) {
  try {
    await ednut.sendMessage(from, { react: { text: emoji, key: mek.key } });
  } catch (err) {
    // Reactions are cosmetic — never let a failure here break the download.
    console.error("Reaction failed:", err.message || err);
  }
}

async function downloader(platform, text, { ednut, mek, from, reply }) {
  let reacted = false;
  try {
    if (!text) {
      return reply(`❌ Please provide a link.\nExample:\n.${platform} <url>`);
    }

    // Single 📥 reaction marks "working on it" — no status text messages,
    // which cuts out extra round-trips and makes the whole flow feel faster.
    await setReaction(ednut, from, mek, "📥");
    reacted = true;

    let items;
    if (platform === "instagram") {
      items = await getInstagramMedia(text);
    } else {
      items = await fetchFromInstatiktok(platform, text);
    }

    if (!items || items.length === 0) return reply("❌ Could not retrieve download link.");

    const footer = `\n\n> *EmmyFrosh-Ai*`;

    if (platform === "instagram") {
      // Fetch every carousel item in parallel (independent network calls),
      // then send in order — much faster than fetching one-by-one.
      const results = await Promise.allSettled(
        items.map(({ url: media, referer }) => fetchMediaBuffer(media, referer))
      );

      let sentAny = false;
      const failures = [];
      for (const r of results) {
        if (r.status === "fulfilled") {
          const payload = buildMediaPayload(r.value, `📥 Instagram Downloader${footer}`);
          try {
            await sendMediaWithRetry(ednut, from, payload, { quoted: mek });
            sentAny = true;
          } catch (sendErr) {
            failures.push(sendErr.message || String(sendErr));
          }
        } else {
          failures.push(r.reason?.message || String(r.reason));
        }
      }
      if (!sentAny) {
        return reply(
          `❌ Found download links, but none of them contained valid media.\n\nReason: ${failures[0] || "unknown"}`
        );
      }
    } else {
      const { url: download, referer } = items[0];
      const result = await fetchMediaBuffer(download, referer);
      const caption = `📥 *${platform.toUpperCase()} Download Successful!*${footer}`;
      const payload = buildMediaPayload(result, caption);
      await sendMediaWithRetry(ednut, from, payload, { quoted: mek });
    }
  } catch (e) {
    console.error(e);
    reply(`❌ An error occurred.\n\n${e.message || e}`);
  } finally {
    // Clear the reaction once we're done, success or fail.
    if (reacted) await setReaction(ednut, from, mek, "");
  }
}

module.exports = [
  {
    command: ["facebook2"],
    alias: ["fb2"],
    description: "Download Facebook videos",
    category: "Downloader",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      await downloader("facebook", q, { ednut, mek: m, from, reply });
    },
  },
  {
    command: ["instagram2"],
    alias: ["ig2"],
    description: "Download Instagram photos/videos",
    category: "Downloader",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      await downloader("instagram", q, { ednut, mek: m, from, reply });
    },
  },
  {
    command: ["tiktok2"],
    alias: ["tt2"],
    description: "Download TikTok videos",
    category: "Downloader",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      await downloader("tiktok", q, { ednut, mek: m, from, reply });
    },
  },
];