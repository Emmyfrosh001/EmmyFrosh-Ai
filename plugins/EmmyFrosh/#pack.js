// ============================================================
// 📦 STICKER PACK COMMAND
// Native WhatsApp sticker pack builder & sender
//
// .pack add                      → reply to an image to queue it
// .pack send <name>              → send everything queued, under <name>
// .pack all [name]               → sends EVERY sticker people have sent in
//                                   this group so far (auto-captured, see
//                                   below), plus anything you queued via
//                                   `.pack add`. If more than 30 stickers,
//                                   it automatically splits into multiple
//                                   packs (Pack 1/2, 2/2, ...) until every
//                                   sticker has gone out.
// .pack clear                    → wipe your manual queue
// .pack setname <name>           → save a default pack name for yourself
// .pack <name>                   → SEARCH the web for <name> and build a
//                                   pack straight from the results
//                                   e.g. .pack Superman
// .pack <count> <name>           → same, but pull <count> images instead
//                                   of the default 10 (max 30)
//                                   e.g. .pack 15 Superman
// .pack <name> <count>           → order doesn't matter, works the same
//                                   e.g. .pack Superman 15
// .pack <count> <name>, <pack>   → search mode with an EXPLICIT pack name
//                                   after a comma — otherwise search mode
//                                   never names the pack after the search
//                                   term itself; it falls back to your
//                                   saved `.pack setname` default, or the
//                                   fixed default pack name.
//                                   e.g. .pack 15 Superman, Hero Pack
//
// HOW GROUP STICKER HISTORY WORKS:
// The first time this command runs, it attaches a listener to the socket's
// 'messages.upsert' event that watches every group for incoming sticker
// messages and stores their raw buffers in global.db.stickerHistory[groupId]
// (capped at the last 300 per group, oldest dropped first, to avoid
// unbounded memory growth). `.pack all` reads from that store. This only
// captures stickers sent AFTER the bot starts recording — it can't recover
// stickers sent before this feature was added or before the bot's last
// restart, since nothing was being logged yet.
// ============================================================
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');
const JSZip = require('jszip');
const sharp = require('sharp');
const { Sticker } = require('wa-sticker-formatter');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const DEFAULT_SEARCH_COUNT = 10;
const MAX_SEARCH_COUNT = 30;
const MAX_HISTORY_PER_GROUP = 300;
const DEFAULT_PACK_NAME = "𝛯𝛭𝛭𝒀𝐹𝑅𝛩𝑆𝛨 💔";

/**
 * Attach a one-time listener that captures every sticker sent in every
 * group into global.db.stickerHistory[groupId]. Safe to call repeatedly —
 * it only actually attaches once per process, guarded by a global flag.
 */
function ensureStickerListener(ednut) {
  if (global._stickerHistoryListenerAttached) return;
  global._stickerHistoryListenerAttached = true;

  if (!global.db) global.db = {};
  if (!global.db.stickerHistory) global.db.stickerHistory = {};

  ednut.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        const chat = msg.key?.remoteJid;
        if (!chat || !chat.endsWith('@g.us')) continue; // groups only
        if (msg.key?.fromMe) continue; // don't re-capture the bot's own sent stickers

        const stickerMessage = msg.message?.stickerMessage;
        if (!stickerMessage) continue;

        const stream = await downloadContentFromMessage(stickerMessage, 'sticker');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) continue;

        if (!Array.isArray(global.db.stickerHistory[chat]))
          global.db.stickerHistory[chat] = [];

        global.db.stickerHistory[chat].push(buffer);

        // Keep memory bounded — drop oldest once over the cap.
        if (global.db.stickerHistory[chat].length > MAX_HISTORY_PER_GROUP) {
          global.db.stickerHistory[chat] =
            global.db.stickerHistory[chat].slice(-MAX_HISTORY_PER_GROUP);
        }
      } catch (e) {
        console.error('[pack] sticker history capture error:', e.message);
      }
    }
  });
}

/**
 * Search Bing Images for a query and return a list of direct image URLs.
 * No API key required — scrapes Bing's public image search results page.
 * NOTE: this is an unofficial scrape, so it can break if Bing changes its
 * markup. Swap this out for a paid image API (Pexels, Unsplash, etc.) if
 * you want something more stable — just keep the same
 * `searchImages(query, count) -> string[]` shape and the rest of the file
 * doesn't need to change.
 */
async function searchImages(query, count) {
  const { data } = await axios.get('https://www.bing.com/images/search', {
    params: { q: query, form: 'HDRSC2', first: 1 },
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    timeout: 15000,
  });

  const $ = cheerio.load(data);
  const urls = [];

  $('a.iusc').each((_, el) => {
    if (urls.length >= count) return;
    const raw = $(el).attr('m');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.murl) urls.push(parsed.murl);
    } catch (e) {
      // malformed entry, skip it
    }
  });

  return urls.slice(0, count);
}

/** Download a list of image URLs into buffers, silently skipping failures. */
async function downloadImages(urls) {
  const buffers = [];
  for (const url of urls) {
    try {
      const { data } = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      buffers.push(Buffer.from(data));
    } catch (e) {
      // broken/blocked link — skip it, don't fail the whole pack
    }
  }
  return buffers;
}

/** Resolve the pack name to use: typed name > your saved default > fallback. */
function resolvePackName(sender, typedName, fallback) {
  if (typedName) return typedName;
  const saved = global.db?.packNames?.[sender];
  if (saved) return saved;
  return fallback;
}

/**
 * Upload to WhatsApp servers
 * @param {Object} client - WhatsApp socket (ednut)
 * @param {Buffer} buffer - Data to upload
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result
 */
async function uploadToServer(client, buffer, { hkdf, mediaPath, mediaKey = crypto.randomBytes(32) }) {
    const expanded = Buffer.from(crypto.hkdfSync('sha256', mediaKey, Buffer.alloc(32), Buffer.from(hkdf), 112));
    const iv = expanded.subarray(0, 16);
    const cipherKey = expanded.subarray(16, 48);
    const macKey = expanded.subarray(48, 80);

    const cipher = crypto.createCipheriv('aes-256-cbc', cipherKey, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const mac = crypto.createHmac('sha256', macKey).update(iv).update(encrypted).digest().subarray(0, 10);
    const encBuffer = Buffer.concat([encrypted, mac]);
    const fileSha256 = crypto.createHash('sha256').update(buffer).digest();
    const fileEncSha256 = crypto.createHash('sha256').update(encBuffer).digest();

    // Get media connection
    const iq = await client.query({
        tag: 'iq',
        attrs: {
            id: client.generateMessageTag?.() ?? Date.now().toString(),
            to: 's.whatsapp.net',
            type: 'set',
            xmlns: 'w:m'
        },
        content: [{ tag: 'media_conn', attrs: {} }]
    });

    const mediaConn = iq.content?.find(v => v.tag === 'media_conn');
    if (!mediaConn) throw new Error('media_conn not found');

    const auth = mediaConn.attrs?.auth;
    if (!auth) throw new Error('auth not found');

    const hosts = (mediaConn.content || [])
        .filter(v => v.tag === 'host')
        .map(v => v.attrs?.hostname)
        .filter(Boolean);

    if (!hosts.length) throw new Error('No host for upload');

    const token = encodeURIComponent(
        fileEncSha256.toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '')
    );

    let lastError;
    for (const host of hosts) {
        try {
            const url = new URL(`https://${host}${mediaPath}/${token}`);
            url.searchParams.set('auth', auth);
            url.searchParams.set('token', token);

            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Origin': 'https://web.whatsapp.com',
                    'Referer': 'https://web.whatsapp.com/',
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': encBuffer.length.toString()
                },
                body: encBuffer
            });

            if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

            const json = await response.json();
            const directPath = json.direct_path ?? json.directPath ?? json.url ?? json.path;

            if (!directPath) throw new Error('directPath not found');

            return {
                mediaKey,
                fileLength: buffer.length,
                fileSha256,
                fileEncSha256,
                directPath,
                ...json
            };
        } catch (error) {
            lastError = error;
            console.error(`Upload to ${host} failed:`, error.message);
        }
    }

    throw lastError ?? new Error('All upload attempts failed');
}

/**
 * Create thumbnail from sticker
 * @param {Buffer} stickerBuffer - Sticker buffer
 * @returns {Promise<Buffer>} Thumbnail buffer
 */
async function createThumbnail(stickerBuffer) {
    try {
        return await sharp(stickerBuffer)
            .resize(252, 252, { fit: 'cover' })
            .jpeg()
            .toBuffer();
    } catch (error) {
        console.error('Thumbnail creation error:', error);
        return await sharp({
            create: {
                width: 252,
                height: 252,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        })
        .jpeg()
        .toBuffer();
    }
}

/**
 * Build+send ONE native WhatsApp sticker pack of <=30 stickers. Throws on
 * failure — callers should use sendStickerPackSafe() instead of this
 * directly unless they specifically want the native-only, no-fallback
 * behavior.
 * @param {Object} sock - WhatsApp socket (ednut)
 * @param {string} chatId - Chat ID
 * @param {Buffer[]} stickerBuffers - Array of ALREADY-WEBP sticker buffers (<=30)
 * @param {string} packName - Name of the sticker pack
 * @param {string} author - Author name
 * @param {Object} quotedMsg - Quoted message for reply
 * @returns {Promise<Object>}
 */
async function sendStickerPackNative(sock, chatId, stickerBuffers, packName = 'MY-PACK', author = 'MY-PACK', quotedMsg = null) {
    if (!stickerBuffers || stickerBuffers.length === 0) {
        throw new Error('No stickers to send');
    }

    console.log(`📦 Creating sticker pack with ${stickerBuffers.length} stickers...`);

    // Create ZIP archive
    const zip = new JSZip();
    const stickersMetadata = [];

    for (const [index, stickerBuffer] of stickerBuffers.entries()) {
        const fileName = `sticker_${String(index + 1).padStart(3, '0')}.webp`;
        zip.file(fileName, stickerBuffer);

        const isAnimated = stickerBuffer.includes(Buffer.from('VP8X'));

        stickersMetadata.push({
            fileName: fileName,
            isAnimated: isAnimated,
            emojis: ['⚡', '🔥'],
            accessibilityLabel: '',
            isLottie: false,
            mimetype: 'image/webp'
        });
    }

    const trayFileName = 'tray_icon.webp';
    const trayBuffer = stickerBuffers[0];
    zip.file(trayFileName, trayBuffer);

    const archiveBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'STORE'
    });

    let packUpload;
    try {
        packUpload = await uploadToServer(sock, archiveBuffer, {
            hkdf: 'WhatsApp Sticker Pack Keys',
            mediaPath: '/mms/sticker-pack'
        });
    } catch (e) {
        throw new Error(`Pack archive upload failed: ${e.message}`);
    }

    const thumbnailBuffer = await createThumbnail(stickerBuffers[0]);
    let thumbUpload;
    try {
        thumbUpload = await uploadToServer(sock, thumbnailBuffer, {
            hkdf: 'WhatsApp Sticker Pack Thumbnail Keys',
            mediaPath: '/mms/thumbnail-sticker-pack',
            mediaKey: packUpload.mediaKey
        });
    } catch (e) {
        throw new Error(`Thumbnail upload failed: ${e.message}`);
    }

    const packId = 'PACK_' + crypto.randomBytes(8).toString('hex');

    try {
        await sock.relayMessage(chatId, {
            messageContextInfo: { messageSecret: crypto.randomBytes(32) },
            stickerPackMessage: {
                stickerPackId: packId,
                name: `${packName}`,
                publisher: author,
                packDescription: `⚡ ${stickerBuffers.length} stickers`,
                stickers: stickersMetadata,
                fileLength: packUpload.fileLength,
                fileSha256: packUpload.fileSha256,
                fileEncSha256: packUpload.fileEncSha256,
                mediaKey: packUpload.mediaKey,
                directPath: packUpload.directPath,
                mediaKeyTimestamp: Math.floor(Date.now() / 1000),
                stickerPackSize: packUpload.fileLength,
                stickerPackOrigin: 2,
                trayIconFileName: trayFileName,
                thumbnailDirectPath: thumbUpload.directPath,
                thumbnailSha256: thumbUpload.fileSha256,
                thumbnailEncSha256: thumbUpload.fileEncSha256,
                thumbnailHeight: 252,
                thumbnailWidth: 252,
                imageDataHash: thumbUpload.fileSha256.toString('base64')
            }
        }, { quoted: quotedMsg });
    } catch (e) {
        throw new Error(`relayMessage failed: ${e.message}`);
    }

    console.log(`✅ Sticker pack sent successfully!`);
    return { success: true, count: stickerBuffers.length };
}

/**
 * Fallback for when the native sticker-pack message fails: sends every
 * sticker as a normal individual sticker message instead. Not as slick
 * as a real WhatsApp sticker pack, but it reliably gets every sticker
 * delivered even if the native protocol implementation above breaks
 * (which it's prone to — it hand-builds low-level upload/relay calls
 * that can go stale across Baileys versions).
 */
async function sendStickersIndividually(sock, chatId, stickerBuffers, packName, quotedMsg) {
    if (packName) {
        await sock.sendMessage(chatId, {
            text: `📦 Native pack failed — sending *${stickerBuffers.length}* sticker(s) individually as "*${packName}*" instead...`
        }, quotedMsg ? { quoted: quotedMsg } : {}).catch(() => {});
    }
    let sent = 0;
    for (const buf of stickerBuffers) {
        try {
            await sock.sendMessage(chatId, { sticker: buf }, quotedMsg ? { quoted: quotedMsg } : {});
            sent++;
            await new Promise((r) => setTimeout(r, 350)); // gentle pacing to avoid rate limits
        } catch (e) {
            console.error('[pack] individual sticker send failed:', e.message);
        }
    }
    return { success: true, count: sent, fallback: true };
}

/** Try the native pack first; on ANY failure, fall back to individual sends. */
async function sendStickerPackSafe(sock, chatId, stickerBuffers, packName, author, quotedMsg) {
    try {
        return await sendStickerPackNative(sock, chatId, stickerBuffers, packName, author, quotedMsg);
    } catch (e) {
        console.error('[pack] native sticker pack failed, falling back to individual sends:', e.message);
        return await sendStickersIndividually(sock, chatId, stickerBuffers, packName, quotedMsg);
    }
}

/**
 * Public entry point. Handles WhatsApp's 30-sticker-per-pack limit by
 * chunking, and for EACH chunk tries a native pack first via
 * sendStickerPackSafe(), falling back to individual sends just for that
 * chunk if it fails — so one bad chunk doesn't lose stickers that
 * would've gone out fine in another chunk.
 * @param {Object} sock - WhatsApp socket (ednut)
 * @param {string} chatId - Chat ID
 * @param {Buffer[]} stickerBuffers - Array of ALREADY-WEBP sticker buffers
 * @param {string} packName - Name of the sticker pack
 * @param {string} author - Author name
 * @param {Object} quotedMsg - Quoted message for reply
 * @returns {Promise<Object|Object[]>}
 */
async function sendStickerPack(sock, chatId, stickerBuffers, packName = 'MY-PACK', author = 'MY-PACK', quotedMsg = null) {
    if (!stickerBuffers || stickerBuffers.length === 0) {
        throw new Error('No stickers to send');
    }

    const MAX_STICKERS = 30;
    if (stickerBuffers.length <= MAX_STICKERS) {
        return sendStickerPackSafe(sock, chatId, stickerBuffers, packName, author, quotedMsg);
    }

    console.log(`⚠️ Too many stickers (${stickerBuffers.length}), splitting into multiple packs`);
    const results = [];
    const totalPacks = Math.ceil(stickerBuffers.length / MAX_STICKERS);
    for (let i = 0; i < stickerBuffers.length; i += MAX_STICKERS) {
        const chunk = stickerBuffers.slice(i, i + MAX_STICKERS);
        const packNum = Math.floor(i / MAX_STICKERS) + 1;
        const result = await sendStickerPackSafe(
            sock,
            chatId,
            chunk,
            `${packName} (${packNum}/${totalPacks})`,
            author,
            quotedMsg
        );
        results.push(result);

        if (i + MAX_STICKERS < stickerBuffers.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    return results;
}

/** Convert raw IMAGE buffers into sticker (webp) buffers, without sending. */
async function convertImagesToStickerBuffers(imageBuffers, packName = 'MY-PACK') {
    const stickers = [];
    for (let i = 0; i < imageBuffers.length; i++) {
        try {
            const sticker = new Sticker(imageBuffers[i], {
                pack: packName,
                author: packName,
                quality: 80,
                type: 'full'
            });
            const stickerBuffer = await sticker.toBuffer();
            stickers.push(stickerBuffer);

            if ((i + 1) % 10 === 0 || i === imageBuffers.length - 1) {
                console.log(`📦 Created ${i + 1}/${imageBuffers.length} stickers`);
            }
        } catch (err) {
            console.error(`Failed to create sticker ${i}:`, err);
        }
    }
    return stickers;
}

/**
 * Convert images to stickers and send as pack
 * @param {Object} sock - WhatsApp socket (ednut)
 * @param {string} chatId - Chat ID
 * @param {Buffer[]} imageBuffers - Array of RAW IMAGE buffers (not yet stickers)
 * @param {string} packName - Name of the sticker pack
 * @param {Object} quotedMsg - Quoted message for reply
 * @returns {Promise<void>}
 */
async function convertAndSendStickerPack(sock, chatId, imageBuffers, packName = 'MY-PACK', quotedMsg = null) {
    try {
        const stickers = await convertImagesToStickerBuffers(imageBuffers, packName);
        if (stickers.length === 0) {
            throw new Error('No stickers were created successfully');
        }
        await sendStickerPack(sock, chatId, stickers, packName, packName, quotedMsg);
    } catch (error) {
        console.error('❌ Failed to convert and send sticker pack:', error);
        throw error;
    }
}

// ============================================================
// 🤖 COMMAND HANDLER — matches your bot's command module format
// ============================================================
module.exports = [
{
  command: ["pack", "stickerpack", "spack"],
  category: "Sticker",
  description: "Build and send a native WhatsApp sticker pack",
  async execute(m, { ednut, args, reply, text }) {
    ensureStickerListener(ednut);

    if (!global.db) global.db = {};
    if (!global.db.stickerPackQueue) global.db.stickerPackQueue = {};
    if (!global.db.stickerHistory) global.db.stickerHistory = {};
    if (!global.db.packNames) global.db.packNames = {};

    const sender = m.sender;
    const sub = (args[0] || "").toLowerCase();
    const KNOWN = ["add", "send", "clear", "all", "setname"];

    // .pack add — reply to an image to queue it
    if (sub === "add") {
      if (!m.quoted || !/image/.test(m.quoted.mimetype || ""))
        return reply("❌ Reply to an *image* with `.pack add`");

      let buffer;
      try {
        buffer = await m.quoted.download();
      } catch (e) {
        console.error("Sticker pack download error:", e);
        return reply("❌ Couldn't download that image, try again.");
      }

      if (!Array.isArray(global.db.stickerPackQueue[sender]))
        global.db.stickerPackQueue[sender] = [];

      global.db.stickerPackQueue[sender].push(buffer);

      return reply(
        `✅ Added image (*${global.db.stickerPackQueue[sender].length}* in pack).\n` +
        `Reply more images with \`.pack add\`, or run \`.pack send <name>\` to finish.`
      );
    }

    // .pack send <name> — finalize and send the manually-queued images only
    if (sub === "send") {
      const queue = global.db.stickerPackQueue[sender] || [];
      if (!queue.length)
        return reply("❌ No images queued yet. Reply to an image with `.pack add` first.");

      const typedName = args.slice(1).join(" ").trim();
      const packName = resolvePackName(sender, typedName, DEFAULT_PACK_NAME);

      await reply(`⏳ Building sticker pack (*${queue.length}* stickers) named "*${packName}*"...`);

      try {
        await convertAndSendStickerPack(ednut, m.chat, queue, packName, m);
      } catch (e) {
        console.error("Sticker pack send error:", e);
        return reply("❌ Failed to send sticker pack. Check the logs.");
      }

      delete global.db.stickerPackQueue[sender];
      return;
    }

    // .pack all [name] — grabs EVERY sticker people have sent in this
    // group (auto-captured since the bot started tracking), plus anything
    // manually queued via `.pack add`, and sends it all. Automatically
    // splits into multiple packs of 30 if there's more than that, and
    // keeps going until everything has gone out.
    if (sub === "all") {
      const history = global.db.stickerHistory[m.chat] || [];
      const manualQueue = global.db.stickerPackQueue[sender] || [];

      const typedName = args.slice(1).join(" ").trim();
      const packName = resolvePackName(sender, typedName, DEFAULT_PACK_NAME);

      if (!history.length && !manualQueue.length) {
        return reply(
          "❌ No stickers captured from this group yet, and nothing queued.\n\n" +
          "Note: sticker history only starts recording from when this feature was turned on — " +
          "it can't pull stickers sent before that. Wait for people to send a few, or use `.pack add` manually."
        );
      }

      let manualStickers = [];
      if (manualQueue.length) {
        await reply(`⏳ Converting *${manualQueue.length}* queued image(s) into stickers...`);
        manualStickers = await convertImagesToStickerBuffers(manualQueue, packName);
      }

      const combined = [...history, ...manualStickers];
      const packCount = Math.ceil(combined.length / 30);

      await reply(
        `⏳ Sending *${combined.length}* sticker(s) as "*${packName}*"` +
        (packCount > 1 ? ` across *${packCount}* packs...` : `...`)
      );

      try {
        await sendStickerPack(ednut, m.chat, combined, packName, packName, m);
      } catch (e) {
        console.error("Sticker pack (all) send error:", e);
        return reply("❌ Failed to send sticker pack(s). Check the logs.");
      }

      delete global.db.stickerPackQueue[sender];
      return;
    }

    // .pack clear — wipe manual queue
    if (sub === "clear") {
      delete global.db.stickerPackQueue[sender];
      return reply("🗑️ Sticker pack queue cleared.");
    }

    // .pack setname <name> — save a personal default pack name
    if (sub === "setname") {
      const name = args.slice(1).join(" ").trim();
      if (!name) return reply("❌ Usage: `.pack setname <name>`");
      global.db.packNames[sender] = name;
      return reply(`✅ Default pack name set to "*${name}*". Used whenever you don't type one.`);
    }

    // Anything else → treat the whole thing as a SEARCH request:
    //   .pack Superman
    //   .pack 15 Superman
    //   .pack Superman 15
    //   .pack 15 Superman, Hero Pack   <- explicit pack name after a comma
    if (sub && !KNOWN.includes(sub)) {
      // Full remainder after ".pack", exactly as typed (falls back to
      // re-joining args if `text` wasn't passed through for some reason).
      const fullText = (typeof text === "string" && text) || args.join(" ");

      // An explicit pack name can be given after a comma:
      //   .pack 3 Batman, emmy   -> query "Batman", count 3, name "emmy"
      //   .pack Batman, emmy     -> query "Batman", name "emmy"
      // Without a comma, NO explicit name is set here — search mode never
      // names the pack after the search term itself anymore. It falls
      // through to your saved `.pack setname` default, or the fixed
      // default pack name below.
      const commaIndex = fullText.indexOf(",");
      const searchPart = (commaIndex !== -1 ? fullText.slice(0, commaIndex) : fullText).trim();
      const explicitName = commaIndex !== -1 ? fullText.slice(commaIndex + 1).trim() : "";

      const rest = searchPart.split(/\s+/).filter(Boolean);
      let count = DEFAULT_SEARCH_COUNT;

      const numIndex = rest.findIndex((a) => /^\d+$/.test(a));
      if (numIndex !== -1) {
        count = Math.min(MAX_SEARCH_COUNT, Math.max(1, parseInt(rest[numIndex], 10)));
        rest.splice(numIndex, 1);
      }

      const query = rest.join(" ").trim();
      if (!query)
        return reply(
          "❌ Usage: `.pack <name>` or `.pack <count> <name>` — e.g. `.pack Superman` or `.pack 15 Superman`\n" +
          "Add `, <packname>` to name the pack yourself — e.g. `.pack 15 Superman, Hero Pack`"
        );

      await reply(`🔎 Searching *${count}* image(s) for "*${query}*"...`);

      let urls;
      try {
        urls = await searchImages(query, count);
      } catch (e) {
        console.error("Pack image search error:", e);
        return reply("❌ Image search failed, try again later.");
      }

      if (!urls.length)
        return reply(`❌ No images found for "*${query}*". Try a different name.`);

      await reply(`⬇️ Downloading ${urls.length} image(s)...`);
      const buffers = await downloadImages(urls);

      if (!buffers.length)
        return reply("❌ Couldn't download any of the found images. Try again.");

      // Priority: explicit name after a comma > your saved `.pack setname`
      // default > the fixed default pack name. The search query itself is
      // never used as the pack name unless you explicitly typed it after
      // a comma.
      const packName = resolvePackName(sender, explicitName, DEFAULT_PACK_NAME);

      await reply(`⏳ Building sticker pack (*${buffers.length}* stickers) named "*${packName}*"...`);

      try {
        await convertAndSendStickerPack(ednut, m.chat, buffers, packName, m);
      } catch (e) {
        console.error("Sticker pack send error:", e);
        return reply("❌ Failed to send sticker pack. Check the logs.");
      }
      return;
    }

    // No subcommand at all — show help
    const queuedCount = (global.db.stickerPackQueue[sender] || []).length;
    const historyCount = (global.db.stickerHistory[m.chat] || []).length;
    const savedName = global.db.packNames[sender];
    return reply(
      "📦 *STICKER PACK*\n\n" +
      "*Manual mode:*\n" +
      "• `.pack add` — reply to an image to add it\n" +
      "• `.pack send <name>` — build & send only what you queued\n" +
      "• `.pack all [name]` — send EVERY sticker sent in this group so far (auto-splits into multiple packs if over 30)\n" +
      "• `.pack clear` — clear your manual queue\n" +
      "• `.pack setname <name>` — save your default pack name\n\n" +
      "*Search mode (no reply needed):*\n" +
      "• `.pack <name>` — e.g. `.pack Superman`\n" +
      "• `.pack <count> <name>` — e.g. `.pack 15 Superman`\n" +
      "• `.pack <name> <count>` — e.g. `.pack Superman 15`\n" +
      "• `.pack <count> <name>, <pack name>` — explicit pack name, e.g. `.pack 15 Superman, Hero Pack`\n\n" +
      `📊 Your manual queue: ${queuedCount} image(s)\n` +
      `📊 Group sticker history: ${historyCount} sticker(s)\n` +
      `🏷️ Your saved default name: ${savedName || "(none set)"}`
    );
  }
}
];

// Also export the raw helpers in case other files want to call them directly
module.exports.uploadToServer = uploadToServer;
module.exports.createThumbnail = createThumbnail;
module.exports.sendStickerPack = sendStickerPack;
module.exports.convertAndSendStickerPack = convertAndSendStickerPack;
module.exports.convertImagesToStickerBuffers = convertImagesToStickerBuffers;
module.exports.searchImages = searchImages;
module.exports.downloadImages = downloadImages;
