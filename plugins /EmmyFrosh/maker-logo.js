const axios = require("axios");
const sharp = require("sharp");

// ================================================================
//  ALL IN ONE FILE
//
//  Made by the bot itself (NO API, NO internet, NO fonts):
//    .wasted  .wanted  .jail
//        reply to someone's message, reply to a picture, or tag a person:
//          .wasted @person       .wanted @person       .jail @person
//
//  Still use the popcat website (need internet + uploadImage):
//    .nokia  .gun  .ad  .blur  .invert  .mnm  .caution <text>
//
//  This file replaces your old file that had .wanted and .jail.
//  Needs: axios + sharp (both are already in package.json)
// ================================================================

// ---------- letters drawn as shapes (no fonts needed on the server) ----------
// each glyph: w = width (in letter-widths), lines = list of lines in a box
// that is 1 wide and 1.4 tall
const O_SHAPE = [[0.3, 0], [0.7, 0], [1, 0.3], [1, 1.1], [0.7, 1.4], [0.3, 1.4], [0, 1.1], [0, 0.3], [0.3, 0]];
const S_SHAPE = [[1, 0.15], [0.85, 0], [0.15, 0], [0, 0.15], [0, 0.55], [0.15, 0.7], [0.85, 0.7], [1, 0.85], [1, 1.25], [0.85, 1.4], [0.15, 1.4], [0, 1.25]];

const GLYPHS = {
  W: { w: 1, lines: [[[0, 0], [0.22, 1.4], [0.5, 0.4], [0.78, 1.4], [1, 0]]] },
  A: { w: 1, lines: [[[0, 1.4], [0.5, 0], [1, 1.4]], [[0.2, 0.95], [0.8, 0.95]]] },
  S: { w: 1, lines: [S_SHAPE] },
  T: { w: 1, lines: [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1.4]]] },
  E: { w: 1, lines: [[[1, 0], [0, 0], [0, 1.4], [1, 1.4]], [[0, 0.7], [0.8, 0.7]]] },
  D: { w: 1, lines: [[[0, 0], [0.6, 0], [1, 0.35], [1, 1.05], [0.6, 1.4], [0, 1.4], [0, 0]]] },
  N: { w: 1, lines: [[[0, 1.4], [0, 0], [1, 1.4], [1, 0]]] },
  O: { w: 1, lines: [O_SHAPE] },
  R: { w: 1, lines: [[[0, 1.4], [0, 0], [0.75, 0], [1, 0.2], [1, 0.5], [0.75, 0.7], [0, 0.7]], [[0.55, 0.7], [1, 1.4]]] },
  L: { w: 1, lines: [[[0, 0], [0, 1.4], [1, 1.4]]] },
  I: { w: 0, lines: [[[0, 0], [0, 1.4]]] },
  V: { w: 1, lines: [[[0, 0], [0.5, 1.4], [1, 0]]] },
  "5": { w: 1, lines: [[[1, 0], [0.1, 0], [0, 0.7], [0.8, 0.6], [1, 0.8], [1, 1.2], [0.8, 1.4], [0.2, 1.4], [0, 1.25]]] },
  "0": { w: 1, lines: [O_SHAPE] },
  "$": { w: 1, lines: [S_SHAPE, [[0.5, -0.12], [0.5, 1.52]]] },
  ",": { w: 0.3, lines: [[[0.3, 1.3], [0.05, 1.75]]] },
  " ": { w: 0.7, lines: [] },
};

// path data for a text line. cx = centre x, top = y of the top of the capitals,
// k = width of one letter (the capitals are 1.4 * k tall)
function textPath(str, { cx, top, k, gap = 0.4 }) {
  const chars = [...str];
  const g = gap * k;
  const total = chars.reduce((sum, ch) => sum + GLYPHS[ch].w * k, 0) + (chars.length - 1) * g;
  let x = cx - total / 2;
  const parts = [];
  for (const ch of chars) {
    const glyph = GLYPHS[ch];
    for (const line of glyph.lines) {
      parts.push(line.map(([px, py], j) => `${j ? "L" : "M"}${(x + px * k).toFixed(1)},${(top + py * k).toFixed(1)}`).join(" "));
    }
    x += glyph.w * k + g;
  }
  return { d: parts.join(" "), width: total };
}

// ---------- getting the picture ----------
// WhatsApp often hands us a hidden "@lid" id instead of the phone number, and
// the profile picture can only be read with the real phone-number id. So we
// build a list of ids to try (phone number first, lid last) and try them all.
const stripDevice = (j) => String(j || "").replace(/:\d+@/, "@");
const isLidJid = (j) => String(j || "").endsWith("@lid");
const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function candidateJids(m, ednut, target, resolveLidDigits) {
  const list = [];
  const add = (j) => {
    if (!j || typeof j !== "string") return;
    const clean = stripDevice(j);
    if (!/@/.test(clean)) return;
    if (!list.includes(clean)) list.push(clean);
  };
  const addPhone = (j) => { if (j && !isLidJid(j)) add(j); };

  const t = stripDevice(target);
  if (!target) return list;

  // ids that belong to the person who SENT the command. They must never be used
  // for somebody else, otherwise you get your own picture (or the wrong person's).
  const senderIds = [m.sender, m.key?.participant, m.key?.participantAlt, m.key?.remoteJidAlt]
    .filter(Boolean).map(stripDevice);
  const isSelf = senderIds.includes(t);
  const finish = () => (isSelf ? list : list.filter((j) => !senderIds.includes(j)));

  if (!isLidJid(t)) {
    // already a phone-number id: use it straight away
    add(t);
    return list;
  }

  // 1) the lid -> phone number table inside Baileys
  for (const l of [target, t]) {
    try {
      const pn = await ednut.signalRepository?.lidMapping?.getPNForLID?.(l);
      addPhone(pn);
    } catch {}
  }

  // 2) phone number info that came with the replied message
  //    (only when the target really is the person who was replied to)
  if (stripDevice(m.quoted?.sender) === t) {
    for (const alt of [
      m.quoted?.senderAlt,
      m.quoted?.key?.participantPn,
      m.quoted?.key?.participantAlt,
      m.quoted?.participantAlt,
    ]) addPhone(alt);
  }

  // 3) the group member list (in lid groups each member carries the phone number)
  if (String(m.chat || "").endsWith("@g.us")) {
    try {
      const meta = await withTimeout(ednut.groupMetadata(m.chat), 8000);
      const same = (x) => x && stripDevice(x) === t;
      const p = (meta?.participants || []).find((x) => same(x.id) || same(x.lid) || same(x.jid));
      if (p) {
        addPhone(p.phoneNumber);
        addPhone(p.jid);
        addPhone(p.id);
      }
    } catch {}
  }

  // 4) the bot's own lid resolver (same one the handler uses)
  try {
    if (typeof resolveLidDigits === "function") {
      const digits = await resolveLidDigits(target);
      if (digits && /^\d{7,15}$/.test(String(digits))) add(digits + "@s.whatsapp.net");
    }
  } catch {}

  // 5) last chance: the lid itself
  add(t);
  return finish();
}

// Same cache as .pp (tools-bot.js): a picture that loaded before is reused, and if WhatsApp
// refuses later we use the last picture that worked instead of a blank avatar.
const ppCache = global.__ppCache || (global.__ppCache = new Map());
const PP_FRESH = 2 * 60 * 1000;
const PP_KEEP = 14 * 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fromCache = (jids, maxAge) => {
  let best = null;
  for (const j of jids) {
    const hit = ppCache.get(stripDevice(j));
    if (hit && Date.now() - hit.t < maxAge && (!best || hit.t > best.t)) best = hit;
  }
  return best ? best.buf : null;
};
const noPicture = (e) => {
  const msg = String(e?.message || e || "").toLowerCase();
  const code = e?.data || e?.output?.statusCode || e?.statusCode;
  return code === 404 || code === 401 || msg.includes("item-not-found") || msg.includes("not-authorized");
};

async function downloadProfilePicture(ednut, jids, tag = "dp") {
  const fresh = fromCache(jids, PP_FRESH);
  if (fresh) return fresh;

  let lastError = null;
  for (const jid of jids) {
    for (const type of ["image", "preview"]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const url = await withTimeout(ednut.profilePictureUrl(jid, type), 10000);
          if (!url) break;
          const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
          const buf = Buffer.from(res.data);
          for (const k of jids) ppCache.set(stripDevice(k), { buf, t: Date.now() });
          console.log(`[${tag}] profile picture OK from ${jid} (${type})`);
          return buf;
        } catch (e) {
          lastError = e;
          if (noPicture(e)) break;          // refused / no picture: next size / next id
          await sleep(1000);                // WhatsApp just slow: one more try
        }
      }
    }
  }
  const last = fromCache(jids, PP_KEEP);
  if (last) {
    console.log(`[${tag}] WhatsApp refused right now, using the last picture that worked`);
    return last;
  }
  console.log(`[${tag}] could not read the profile picture (tried ${jids.join(", ") || "nothing"}):`, lastError?.message || lastError);
  return null; // hidden by the person's privacy settings, or no picture
}

// plain white avatar, used when the person has no visible profile picture
function defaultAvatarSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#ffffff"/>
  <circle cx="${size / 2}" cy="${size * 0.38}" r="${size * 0.17}" fill="#c4c8cf"/>
  <ellipse cx="${size / 2}" cy="${size * 0.88}" rx="${size * 0.3}" ry="${size * 0.3}" fill="#c4c8cf"/>
</svg>`;
}
const avatarOrDefault = (buf, size) => buf || Buffer.from(defaultAvatarSvg(size));

// who we are making the picture of:
//  tagged person -> replied person -> the person who sent the command
const pickTarget = (m, typedText) => {
  if (Array.isArray(m.mentionedJid) && m.mentionedJid[0]) return m.mentionedJid[0];
  if (m.quoted?.sender) return m.quoted.sender;
  const typed = String(typedText || "").replace(/[^0-9]/g, "");        // .wanted 2349012345678
  if (typed.length >= 8 && typed.length <= 15) return `${typed}@s.whatsapp.net`;
  return m.sender || null;
};

// the picture to use:
//  1) a picture you replied to, or
//  2) the profile picture of the person you replied to / tagged / yourself
async function getPicture(m, ednut, resolveLidDigits, tag, typedText) {
  const target = pickTarget(m, typedText);

  if (m.quoted && m.quoted.mtype === "imageMessage") {
    try {
      const buffer = await ednut.downloadMediaMessage(m.quoted);
      if (buffer) return { buffer, target, hidden: false };
    } catch {}
  }
  if (!target) return null;
  const jids = await candidateJids(m, ednut, target, resolveLidDigits);
  console.log(`[${tag}] target=${target} | quoted=${m.quoted?.sender || "-"} | mention=${(m.mentionedJid || [])[0] || "-"} | sender=${m.sender || "-"} | trying: ${jids.join(", ")}`);
  const buffer = await downloadProfilePicture(ednut, jids, tag);
  // show the real phone number (not the hidden @lid number) in the caption
  const shown = jids.find((j) => String(j).endsWith("@s.whatsapp.net")) || target;
  return { buffer, target: shown, hidden: !buffer };
}

// =====================================================
// WASTED  (GTA style)
// =====================================================
const WASTED_SIZE = 800;

function wastedOverlaySvg(size) {
  const k = size * 0.1;
  const { d } = textPath("WASTED", { cx: size / 2, top: size * 0.5 - 0.7 * k, k, gap: 0.45 });
  const bandH = size * 0.27;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect x="0" y="${(size / 2 - bandH / 2).toFixed(1)}" width="${size}" height="${bandH.toFixed(1)}" fill="#000" fill-opacity="0.55"/>
  <path d="${d}" fill="none" stroke="#000" stroke-opacity="0.8" stroke-width="${(0.34 * k).toFixed(1)}" stroke-linejoin="miter" stroke-linecap="butt"/>
  <path d="${d}" fill="none" stroke="#c9141f" stroke-width="${(0.24 * k).toFixed(1)}" stroke-linejoin="miter" stroke-linecap="butt"/>
</svg>`;
}

async function makeWasted(pictureBuffer) {
  return sharp(avatarOrDefault(pictureBuffer, WASTED_SIZE))
    .resize(WASTED_SIZE, WASTED_SIZE, { fit: "cover" })
    .grayscale()
    .modulate({ brightness: 0.9 })
    .linear(1.12, -8) // a bit more contrast
    .composite([{ input: Buffer.from(wastedOverlaySvg(WASTED_SIZE)), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// =====================================================
// WANTED  (old west poster)
// =====================================================
const POSTER_W = 800;
const POSTER_H = 1200;
const PHOTO = 520;
const PHOTO_LEFT = (POSTER_W - PHOTO) / 2;
const PHOTO_TOP = 270;
const INK = "#3b2410";

// old paper with darker, worn edges
function posterBackgroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_W}" height="${POSTER_H}">
  <defs>
    <radialGradient id="edge" cx="50%" cy="50%" r="75%">
      <stop offset="55%" stop-color="#5a3d1e" stop-opacity="0"/>
      <stop offset="100%" stop-color="#5a3d1e" stop-opacity="0.6"/>
    </radialGradient>
  </defs>
  <rect width="${POSTER_W}" height="${POSTER_H}" fill="#e6cf9c"/>
  <rect width="${POSTER_W}" height="${POSTER_H}" fill="url(#edge)"/>
</svg>`;
}

// border, photo frame and all the text
function posterTextSvg() {
  const cx = POSTER_W / 2;
  const lines = [
    textPath("WANTED", { cx, top: 100, k: 72 }),
    textPath("DEAD OR ALIVE", { cx, top: 845, k: 37 }),
    textPath("REWARD", { cx, top: 930, k: 36 }),
    textPath("$5,000,000", { cx, top: 1020, k: 50 }),
  ];
  const sizes = [72, 37, 36, 50];
  const paths = lines
    .map((l, i) => `<path d="${l.d}" fill="none" stroke="${INK}" stroke-width="${(0.2 * sizes[i]).toFixed(1)}" stroke-linejoin="miter" stroke-linecap="butt"/>`)
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_W}" height="${POSTER_H}">
  <rect x="25" y="25" width="${POSTER_W - 50}" height="${POSTER_H - 50}" fill="none" stroke="${INK}" stroke-width="10"/>
  <rect x="48" y="48" width="${POSTER_W - 96}" height="${POSTER_H - 96}" fill="none" stroke="${INK}" stroke-width="3"/>
  <rect x="${PHOTO_LEFT - 7}" y="${PHOTO_TOP - 7}" width="${PHOTO + 14}" height="${PHOTO + 14}" fill="none" stroke="${INK}" stroke-width="14"/>
  ${paths}
</svg>`;
}

async function makeWanted(pictureBuffer) {
  // the photo: black & white, then tinted brown like an old photograph
  const sepia = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PHOTO}" height="${PHOTO}"><rect width="${PHOTO}" height="${PHOTO}" fill="#e4c898"/></svg>`
  );
  const photo = await sharp(avatarOrDefault(pictureBuffer, PHOTO))
    .resize(PHOTO, PHOTO, { fit: "cover" })
    .grayscale()
    .linear(1.1, 12)
    .composite([{ input: sepia, blend: "multiply" }])
    .png()
    .toBuffer();

  return sharp(Buffer.from(posterBackgroundSvg()))
    .composite([
      { input: photo, left: PHOTO_LEFT, top: PHOTO_TOP },
      { input: Buffer.from(posterTextSvg()), left: 0, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// =====================================================
// JAIL  (picture behind iron bars)
// =====================================================
const JAIL_SIZE = 800;

function jailBarsSvg(size) {
  const bars = 9;
  const barW = size * 0.036;
  const gap = (size - barW) / (bars - 1);
  const rail = size * 0.045;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#101214"/>
      <stop offset="0.35" stop-color="#7d838b"/>
      <stop offset="0.55" stop-color="#3a3e44"/>
      <stop offset="1" stop-color="#0c0d0f"/>
    </linearGradient>
    <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8b9199"/>
      <stop offset="0.5" stop-color="#3a3e44"/>
      <stop offset="1" stop-color="#0c0d0f"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="#000" fill-opacity="0.18"/>`;
  for (let i = 0; i < bars; i++) {
    const x = i * gap;
    out += `\n  <rect x="${(x + barW * 0.5).toFixed(1)}" y="0" width="${barW.toFixed(1)}" height="${size}" fill="#000" fill-opacity="0.35"/>`; // shadow
    out += `\n  <rect x="${x.toFixed(1)}" y="0" width="${barW.toFixed(1)}" height="${size}" fill="url(#bar)"/>`;
  }
  for (const y of [size * 0.14, size * 0.78]) {
    out += `\n  <rect x="0" y="${(y + rail * 0.3).toFixed(1)}" width="${size}" height="${rail.toFixed(1)}" fill="#000" fill-opacity="0.35"/>`;
    out += `\n  <rect x="0" y="${y.toFixed(1)}" width="${size}" height="${rail.toFixed(1)}" fill="url(#rail)"/>`;
  }
  return out + "\n</svg>";
}

async function makeJail(pictureBuffer) {
  return sharp(avatarOrDefault(pictureBuffer, JAIL_SIZE))
    .resize(JAIL_SIZE, JAIL_SIZE, { fit: "cover" })
    .grayscale()
    .modulate({ brightness: 0.85 })
    .linear(1.1, -6)
    .composite([{ input: Buffer.from(jailBarsSvg(JAIL_SIZE)), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// =====================================================
// commands made by the bot (no API)
// =====================================================
function localCommand({ command, description, build, caption }) {
  return {
    command: [command],
    description,
    category: "Logo",
    use: "(reply to someone / a picture) or @person",
    ban: true,
    gcban: true,
    filename: __filename,

    async execute(m, { ednut, reply, prefix, resolveLidDigits, text }) {
      try {
        const found = await getPicture(m, ednut, resolveLidDigits, command, text);
        if (!found) {
          const p = Array.isArray(prefix) ? prefix[0] : prefix;
          return await reply(`Reply to someone or a picture, or tag a person.\nExample: ${p || "."}${command} @person`);
        }

        const image = await build(found.buffer);
        const msg = { image };
        if (found.target) {
          msg.caption = caption(found.target);
          if (found.hidden) {
            msg.caption += "\n\nℹ️ I can't see this person's profile picture (their privacy setting hides it from me), so I used a white avatar. Reply to a picture of them instead to use that picture.";
          }
          msg.mentions = [found.target];
        }
        await ednut.sendMessage(m.chat, msg, { quoted: m });
      } catch (e) {
        console.error(`[${command}]`, e.message);
        await reply("❌ Could not make the picture. Please try again.");
      }
    },
  };
}

// =====================================================
// commands that use the popcat website
// =====================================================
function popcatImageCommand(command, article, label) {
  return {
    command: [command],
    description: `Create ${article} ${label} also reply to someone's message to use the profile picture`,
    category: "Logo",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, uploadImage, reply, resolveLidDigits }) => {
      try {
        if (!m.quoted) return reply(`Reply to an image or someone's message to create ${article} ${label}.`);
        let buffer;
        if (m.quoted && m.quoted.mtype === "imageMessage") {
          buffer = await ednut.downloadMediaMessage(m.quoted);
        } else {
          const sender = pickTarget(m);
          const jids = await candidateJids(m, ednut, sender, resolveLidDigits);
          buffer = await downloadProfilePicture(ednut, jids, command);
          if (!buffer) {
            const response = await fetch("https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png");
            buffer = Buffer.from(await response.arrayBuffer());
          }
        }
        const image = await uploadImage(buffer);
        const url = `https://api.popcat.xyz/v2/${command}?image=${image}`;
        await ednut.sendMessage(m.chat, { image: { url }, caption: `${global.footer}` }, { quoted: m });
      } catch (error) {
        global.log("ERROR", `${command} plugin: ${error.message || error}`);
      }
    },
  };
}

module.exports = [
  // ----- made by the bot (no API) -----
  localCommand({
    command: "wasted",
    description: "Put the GTA WASTED banner on someone's profile picture (reply or tag)",
    build: makeWasted,
    caption: (jid) => `@${jid.split("@")[0]} 💀`,
  }),
  localCommand({
    command: "wanted",
    description: "Make a WANTED poster of someone's profile picture (reply or tag)",
    build: makeWanted,
    caption: (jid) => `🚨 @${jid.split("@")[0]} is WANTED 🚨`,
  }),
  localCommand({
    command: "jail",
    description: "Put someone's profile picture behind jail bars (reply or tag)",
    build: makeJail,
    caption: (jid) => `🔒 @${jid.split("@")[0]} is in JAIL 🔒`,
  }),

  // ----- popcat website -----
  popcatImageCommand("nokia", "a", "nokia poster"),
  popcatImageCommand("gun", "a", "gun image poster"),
  popcatImageCommand("ad", "an", "ad image"),
  popcatImageCommand("blur", "a", "blur image"),
  popcatImageCommand("invert", "an", "invert image"),
  popcatImageCommand("mnm", "an", "M&M's image"),
  {
    command: ["caution"],
    description: "Create a caution fake logo image",
    category: "Logo",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, reply }) => {
      try {
        const text = m.text.split(" ").slice(1).join(" ");
        if (!text) return reply("Please provide a text");
        const url = `https://api.popcat.xyz/v2/caution?text=${encodeURIComponent(text)}`;
        await ednut.sendMessage(m.chat, { image: { url }, caption: `${global.footer}` }, { quoted: m });
      } catch (error) {
        global.log("ERROR", `caution plugin: ${error.message || error}`);
      }
    },
  },
];

// only used for testing the designs on their own
module.exports.__design = { makeWasted, makeWanted, makeJail };