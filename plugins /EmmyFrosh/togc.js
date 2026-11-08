'use strict';
/**
 * togc.js — Post text / link / image / video / sticker / audio as a WhatsApp
 * GROUP STATUS (same mechanism as gcstatus.js), for the EmmyFrosh plugin loader.
 *
 * ── IN A GROUP (group admins) ──────────────────────────────────────────
 * .togc <text>                    — text status
 * .togc <text>,<color>            — text status with inline color
 * .togc (reply to a text/link message) — posts the quoted text (link + its write-up)
 * .togc <caption> (reply to a text/link message) — caption on top, then the quoted link + write-up
 * .togc <color> (reply to a text/link message) — same as plain reply, with a color override
 * .togc <caption>,<color> (reply to a text/link message) — caption + color
 * .togc (reply to image/video)    — image/video status [+ optional caption]
 * .togc (reply to sticker)        — sticker status
 * .togc (reply to audio/voice note) — audio status
 * .togc color <name|random|reset> — save background color for this group
 *
 * ── IN DM (bot owner / moderators / sudo) ──────────────────────────────
 * .togc <group>, <text>, <color>
 * .togc <group1>, <group2>, <group3>, <text>, <color>   — many groups at once
 * .togc groups                    — list your groups with their ids
 *
 *   <group> = the group ID (120363...@g.us, the @g.us is optional)
 *             or the group NAME (or a unique part of it)
 *   <color> = optional, last. If left out, the group's saved color is used,
 *             otherwise a random color.
 *   You can also reply to an image / video / sticker / audio / text / link in the
 *   DM:   .togc <group1>, <group2>, <caption>
 *
 * Color resolution for text statuses: color typed by you > the group's saved
 * color (.togc color <name>) > a random color each time.
 * Caption for image/video: text you typed > the quoted media's own caption > blank.
 * Caption for a replied text/link: your caption goes first, then the full quoted text.
 *
 * Delivery: ednut.sendMessage() with isGroupStatus / statusSourceType /
 * statusAttributions merged into contextInfo. backgroundColor/font go in
 * sendMessage's 3rd (options) argument — Baileys ignores them inside content.
 */

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

// ── Color config (per-group, persisted to disk) ─────────────────────────────
const CONFIG_PATH = path.join(__dirname, '../../data/togc.json');

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}
function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.log('[togc] failed to save config:', e.message);
  }
}
function getGroupColor(groupId) {
  return loadConfig()[groupId] || null;
}
function setGroupColor(groupId, value) {
  const cfg = loadConfig();
  cfg[groupId] = value;
  saveConfig(cfg);
}

const COLOR_MAP = {
  purple: '#9C27B0', violet: '#7B1FA2', pink: '#E91E63', hotpink: '#FF4081',
  red: '#F44336', orange: '#FF5722', amber: '#FF8F00', yellow: '#FFC107',
  lime: '#8BC34A', green: '#4CAF50', teal: '#009688', cyan: '#00BCD4',
  blue: '#2196F3', navy: '#1565C0', indigo: '#3F51B5', black: '#212121',
  dark: '#263238', grey: '#607D8B', white: '#FAFAFA', brown: '#795548',
  gold: '#F9A825', maroon: '#880E4F',
};
const COLOR_NAMES = Object.keys(COLOR_MAP).join(', ');
const DEFAULT_COLOR = COLOR_MAP.purple;

function resolveColor(name) {
  const lower = (name || '').toLowerCase().trim();
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];
  const hex = lower.replace('#', '');
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  return null;
}
function pickColor(groupId, inlineColor) {
  if (inlineColor) return inlineColor;
  const saved = getGroupColor(groupId);
  if (saved === 'random' || !saved) {
    const randomHex = Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');
    return `#${randomHex}`;
  }
  return resolveColor(saved) || DEFAULT_COLOR;
}

// "caption" or "caption,blue" -> { caption, color }
// A lone color name ("blue") is treated as a color, not a caption.
function splitCaptionAndColor(input) {
  let caption = (input || '').trim();
  if (!caption) return { caption: '', color: null };

  const whole = resolveColor(caption);
  if (whole !== null) return { caption: '', color: whole };

  const comma = caption.lastIndexOf(',');
  if (comma !== -1) {
    const resolved = resolveColor(caption.slice(comma + 1));
    if (resolved !== null) {
      return { caption: caption.slice(0, comma).trim(), color: resolved };
    }
  }
  return { caption, color: null };
}

// ── The actual status-post mechanism, ported from gcstatus.js ───────────────
async function postGroupStatus(ednut, jid, content) {
  const statusSourceType = content.text
    ? 'TEXT'
    : content.image
    ? 'IMAGE'
    : content.video
    ? 'VIDEO'
    : content.audio
    ? 'AUDIO'
    : content.sticker
    ? 'IMAGE'
    : 'TEXT';

  const contextInfo = {
    ...(content.contextInfo || {}),
    isGroupStatus: true,
    statusSourceType,
    statusAttributions: [{ type: 10 }],
  };

  const { backgroundColor, font, ...restContent } = content;
  const options = {};
  if (backgroundColor) options.backgroundColor = backgroundColor;
  if (font) options.font = font;

  return ednut.sendMessage(jid, { ...restContent, contextInfo }, options);
}

// ── Media helpers ────────────────────────────────────────────────────────────
function detectQuotedMediaType(quoted) {
  const mtype = quoted?.mtype || '';
  if (mtype === 'imageMessage')   return 'image';
  if (mtype === 'videoMessage')   return 'video';
  if (mtype === 'audioMessage')   return 'audio';
  if (mtype === 'stickerMessage') return 'sticker';
  return null;
}

// Full text of a quoted text/link message (the link AND any write-up around it)
function extractQuotedText(quoted) {
  if (!quoted) return null;
  const t =
    quoted.text ||
    quoted.body ||
    quoted.msg?.text ||
    quoted.msg?.conversation ||
    quoted.message?.conversation ||
    quoted.message?.extendedTextMessage?.text ||
    null;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

function extractQuotedCaption(quoted, mediaType) {
  if (!quoted) return null;
  const c =
    quoted.caption ||
    quoted.text ||
    quoted.body ||
    quoted.message?.[`${mediaType}Message`]?.caption ||
    null;
  return c && c.trim() ? c.trim() : null;
}

async function downloadQuotedMedia(quoted, type) {
  if (typeof quoted?.download === 'function') {
    const buf = await quoted.download();
    if (buf?.length) return buf;
  }
  const mediaMessage = quoted?.message?.[`${type}Message`] || quoted?.msg;
  if (!mediaMessage) throw new Error(`Missing ${type} message payload.`);
  const stream = await downloadContentFromMessage(mediaMessage, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Group lookup (used when posting from DM) ────────────────────────────────
const MAX_TARGETS = 25;       // most groups in one command
const POST_GAP_MS = 1500;     // pause between groups, to stay under rate limits
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let groupCache = { at: 0, list: [] };
async function fetchGroups(ednut) {
  if (Date.now() - groupCache.at < 60 * 1000 && groupCache.list.length) return groupCache.list;
  const all = await ednut.groupFetchAllParticipating();
  const list = Object.values(all || {}).map((g) => ({ id: g.id, name: g.subject || '' }));
  groupCache = { at: Date.now(), list };
  return list;
}

// "120363...@g.us", "120363..." (long number) or a group name / part of a name
function resolveGroupToken(token, groups) {
  const t = token.trim();
  if (!t) return null;

  const idMatch = t.match(/^(\d{5,}(?:-\d+)?)@g\.us$/i) || t.match(/^(\d{15,}(?:-\d+)?)$/);
  if (idMatch) {
    const id = `${idMatch[1]}@g.us`;
    return { id, name: groups.find((g) => g.id === id)?.name || id };
  }

  const lower = t.toLowerCase();
  const exact = groups.filter((g) => g.name.toLowerCase() === lower);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return { ambiguous: exact };

  const part = groups.filter((g) => g.name.toLowerCase().includes(lower));
  if (part.length === 1) return part[0];
  if (part.length > 1) return { ambiguous: part };
  return null;
}

// Reads the groups typed at the start of the DM command (separated by commas).
// Whatever comes after the last group is the text / caption / color.
function parseTargets(text, groups) {
  const parts = text.split(',');
  const targets = [];
  let i = 0;
  for (; i < parts.length; i++) {
    const found = resolveGroupToken(parts[i], groups);
    if (!found) break;
    if (found.ambiguous) {
      return {
        error:
          `❌ "${parts[i].trim()}" matches more than one group:\n` +
          found.ambiguous.slice(0, 8).map((g) => `• ${g.name}\n  ${g.id}`).join('\n') +
          `\n\nUse the full name or the id.`,
      };
    }
    if (!targets.some((g) => g.id === found.id)) targets.push(found);
  }
  return { targets, rest: parts.slice(i).join(',').trim(), firstBad: parts[0] };
}

const DM_HELP =
  `📢 *TOGC FROM DM*\n\n` +
  `▢ .togc <group>, <text>, <color>\n` +
  `▢ .togc <group1>, <group2>, <text>, <color>\n` +
  `▢ .togc groups  — see your groups & ids\n\n` +
  `<group> = group id or group name\n` +
  `<color> = optional, always last\n` +
  `You can also reply to an image / video / sticker / audio / text / link:\n` +
  `▢ .togc <group1>, <group2>, <caption>\n\n` +
  `*Colors:* ${COLOR_NAMES}`;

module.exports = {
  command: ['togc'],
  alias: [],
  category: 'group',
  description: 'Post text/link/image/video/sticker/audio as a WhatsApp group status (in a group, or from DM to one or many groups).',

  execute: async (m, { ednut, isGroup, isAdmins, isBotAdmins, isHighStaff, toPTT, args, text }) => {
    const send = (content, opts = {}) => ednut.sendMessage(m.chat, content, { quoted: m, ...opts });
    const react = (emoji) => ednut.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {});

    // ── permissions ──────────────────────────────────────────────────────
    if (isGroup) {
      if (!isAdmins && !isHighStaff) {
        return send({ text: '❌ Only group admins can use *.togc*.' });
      }
    } else if (!isHighStaff) {
      return send({ text: '❌ In DM, only the bot owner and moderators can use *.togc*.\n\nGroup admins can use it inside their group.' });
    }

    // ── .togc color <name|random|reset>  (group only) ────────────────────
    if ((args[0] || '').toLowerCase() === 'color') {
      if (!isGroup) {
        return send({
          text: '🎨 Set a color for a group inside that group: *.togc color <name>*\n\nFrom DM, put the color at the end of your post:\n*.togc <group>, your text, blue*'
        });
      }
      const val = (args[1] || '').toLowerCase();
      if (!val) {
        const saved = getGroupColor(m.chat);
        const displayName = saved === 'random' ? 'random 🎲' : (saved || 'purple (default)');
        return send({
          text: `╭━━━「 🎨 *TOGC COLOR* 」━━━\n┃\n┃ Current: *${displayName}*\n┃\n┃ ▸ *.togc color <name>* — set color\n┃ ▸ *.togc color random* — random each time\n┃ ▸ *.togc color reset* — restore default\n┃\n┃ *Colors:* ${COLOR_NAMES}\n╰━━━━━━━━━━━━━━━━━━━━━`
        });
      }
      if (val === 'reset') {
        setGroupColor(m.chat, null);
        return send({ text: `🎨 *Togc color reset* to default *purple*.` });
      }
      if (val === 'random') {
        setGroupColor(m.chat, 'random');
        return send({ text: `🎲 *Togc color set to random!*\n\nA new color will be picked each time.` });
      }
      if (!resolveColor(val)) {
        return send({ text: `❌ Unknown color *"${val}"*.\n\nAvailable:\n${COLOR_NAMES}` });
      }
      setGroupColor(m.chat, val);
      return send({ text: `✅ *Togc color set to ${val}!*` });
    }

    // ── DM: .togc groups ────────────────────────────────────────────────
    if (!isGroup && (args[0] || '').toLowerCase() === 'groups' && args.length === 1) {
      try {
        groupCache = { at: 0, list: [] }; // always fresh when you ask for the list
        const groups = (await fetchGroups(ednut)).sort((a, b) => a.name.localeCompare(b.name));
        if (!groups.length) return send({ text: 'I am not in any group.' });
        const lines = groups.slice(0, 60).map((g, i) => `${i + 1}. *${g.name || '(no name)'}*\n    ${g.id}`);
        return send({ text: `📋 *Your groups (${groups.length})*\n\n${lines.join('\n')}${groups.length > 60 ? '\n\n…and more' : ''}` });
      } catch (e) {
        return send({ text: `❌ Could not read the group list.\n\n_${e.message}_` });
      }
    }

    // ── who gets the status? ─────────────────────────────────────────────
    let targets;   // [{ id, name }]
    let rest;      // what is left after the group(s): text / caption / color

    if (isGroup) {
      targets = [{ id: m.chat, name: 'this group' }];
      rest = text || '';
    } else {
      if (!text) return send({ text: DM_HELP });
      let groups;
      try {
        groups = await fetchGroups(ednut);
      } catch (e) {
        return send({ text: `❌ Could not read the group list.\n\n_${e.message}_` });
      }
      const parsed = parseTargets(text, groups);
      if (parsed.error) return send({ text: parsed.error });
      if (!parsed.targets.length) {
        return send({
          text: `❌ I could not find a group called *"${parsed.firstBad.trim()}"*.\n\nSend *.togc groups* to see your groups and their ids.\n\n${DM_HELP}`
        });
      }
      if (parsed.targets.length > MAX_TARGETS) {
        return send({ text: `❌ Too many groups. The most in one command is ${MAX_TARGETS}.` });
      }
      targets = parsed.targets;
      rest = parsed.rest;
    }

    // NOTE: handler.js does `const quoted = m.quoted ? m.quoted : m`, so
    // m.quoted can silently be `m` itself. Real quote = m.quoted differs from m.
    const hasQuote = !!(m.quoted && m.quoted !== m);
    const quoted = hasQuote ? m.quoted : null;
    const mediaType = hasQuote ? detectQuotedMediaType(m.quoted) : null;

    // ── decide WHAT to post (once), then post it to every target ─────────
    let plan;   // { label, make: async (target) => content }

    if (!hasQuote || (!mediaType && extractQuotedText(quoted))) {
      // TEXT status: typed text, or the quoted text / link message
      let statusText;
      let inlineColor = null;

      if (!hasQuote) {
        if (!rest) {
          return send({ text: isGroup ? groupHelp() : `❌ Write the text you want to post after the group.\n\n${DM_HELP}` });
        }
        statusText = rest;
        // inline color: "Hello,blue"
        if (rest.includes(',')) {
          const comma = rest.lastIndexOf(',');
          const resolved = resolveColor(rest.slice(comma + 1));
          if (resolved !== null) {
            statusText = rest.slice(0, comma).trim();
            inlineColor = resolved;
          }
        }
      } else {
        // replying to a text / link message:
        //   nothing typed      -> post the quoted text (link + its write-up)
        //   a color typed      -> same, with that color
        //   a caption typed    -> caption first, then the full quoted text
        //   caption,color      -> both
        const quotedText = extractQuotedText(quoted);
        const { caption, color } = splitCaptionAndColor(rest);
        inlineColor = color;
        statusText = caption ? `${caption}\n\n${quotedText}` : quotedText;
      }

      if (!statusText) return send({ text: '❌ There is no text to post.' });
      plan = {
        label: 'Text',
        make: async (target) => ({ text: statusText, backgroundColor: pickColor(target.id, inlineColor) }),
      };
    } else if (!mediaType) {
      return send({ text: '❌ Unsupported media type. Reply to a *text*, *link*, *image*, *video*, *sticker*, or *audio* message.' });
    } else {
      // MEDIA status: download once, reuse for every group
      await react('⏳');
      let buffer;
      try {
        buffer = await downloadQuotedMedia(quoted, mediaType);
        if (!buffer?.length) throw new Error('The quoted media could not be downloaded.');
        if (mediaType === 'audio' && typeof toPTT === 'function') buffer = await toPTT(buffer);
      } catch (err) {
        console.error(`[togc/${mediaType}]`, err);
        await react('❌');
        return send({ text: `❌ Failed to read the ${mediaType}.\n\n_${err.message}_` });
      }
      // caption: typed text > the media's own caption > blank
      const caption = rest || extractQuotedCaption(quoted, mediaType) || '';
      plan = {
        label: mediaType[0].toUpperCase() + mediaType.slice(1),
        make: async () => {
          if (mediaType === 'audio') return { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true };
          if (mediaType === 'sticker') return { sticker: buffer };
          return { [mediaType]: buffer, caption };
        },
      };
    }

    // ── post ─────────────────────────────────────────────────────────────
    await react('⏳');
    const ok = [];
    const failed = [];
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      try {
        await postGroupStatus(ednut, target.id, await plan.make(target));
        ok.push(target);
      } catch (err) {
        console.error(`[togc/${plan.label.toLowerCase()}] ${target.id}`, err);
        failed.push({ target, reason: err.message || String(err) });
      }
      if (i < targets.length - 1) await sleep(POST_GAP_MS);
    }
    await react(ok.length ? '✅' : '❌');

    // in a group: same short messages as before
    if (isGroup) {
      return ok.length
        ? send({ text: `✅ *${plan.label} group status posted!*` })
        : send({ text: `❌ Failed to post ${plan.label.toLowerCase()} status.\n\n_${failed[0].reason}_` });
    }

    // from DM: one summary
    const lines = [];
    if (ok.length) lines.push(`✅ *${plan.label} status posted to ${ok.length} group${ok.length > 1 ? 's' : ''}:*\n${ok.map((g) => `• ${g.name}`).join('\n')}`);
    if (failed.length) lines.push(`❌ *Failed (${failed.length}):*\n${failed.map((f) => `• ${f.target.name} — ${f.reason}`).join('\n')}`);
    return send({ text: lines.join('\n\n') });
  }
};

function groupHelp() {
  return (
    `📢 *ɢᴄ ꜱᴛᴀᴛᴜꜱ ꜱʏꜱᴛᴇᴍ*\n\n` +
    `▢ .ᴛᴏɢᴄ <ᴛᴇxᴛ>\n` +
    `▢ .ᴛᴏɢᴄ <ᴛᴇxᴛ>,<ᴄᴏʟᴏʀ>\n` +
    `▢ .ᴛᴏɢᴄ [ᴄᴏʟᴏʀ]\n` +
    `▢ .ᴛᴏɢᴄ [ᴄᴀᴘᴛɪᴏɴ] — ʀᴇᴘʟʏ ᴛᴏ ʟɪɴᴋ/ᴛᴇxᴛ/ᴍᴇᴅɪᴀ\n` +
    `▢ .ᴛᴏɢᴄ ᴄᴏʟᴏʀ <ᴄᴏʟᴏʀ/ʀᴀɴᴅᴏᴍ/ʀᴇꜱᴇᴛ>\n` +
    `*ᴄᴏʟᴏʀꜱ:*\n` +
    `ᴘᴜʀᴘʟᴇ,ᴠɪᴏʟᴇᴛ,ᴘɪɴᴋ,ʜᴏᴛᴘɪɴᴋ,ʀᴇᴅ,\n` +
    `ᴏʀᴀɴɢᴇ,ᴀᴍʙᴇʀ,ʏᴇʟʟᴏᴡ,ʟɪᴍᴇ,ɢʀᴇᴇɴ,\n` +
    `ᴛᴇᴀʟ,ᴄʏᴀɴ,ʙʟᴜᴇ,ɴᴀᴠʏ,ɪɴᴅɪɢᴏ,ʙʟᴀᴄᴋ,\n` +
    `ᴅᴀʀᴋ,ɢʀᴇʏ,ᴡʜɪᴛᴇ,ʙʀᴏᴡɴ,ɢᴏʟᴅ,ᴍᴀʀᴏᴏɴ`
  );
}