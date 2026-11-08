'use strict';
/**
 * afk.js — Multi-user AFK system.
 *
 * .afk <reason>   — mark yourself AFK (reason optional)
 * (anything else) — sending any other message (or reacting with an emoji to
 *                    any message) while AFK automatically clears your status,
 *                    with a "welcome back" note.
 *
 * While you're AFK:
 *   • Anyone who @mentions you (direct tag OR hidetag/@all) gets your
 *     AFK note posted back at them.
 *   • Anyone who replies to one of your messages gets the same note.
 *
 * Storage: global.db.afk = { [digits]: { reason, since, jid } }, keyed by
 * resolveLidDigits() output — NOT raw JIDs — since a mentionedJid entry
 * or quoted contextInfo.participant can be reported as @lid while the
 * setter's own JID resolves to @s.whatsapp.net (or vice versa).
 *
 * Two entry points:
 *   - module.exports.execute    → the ".afk <reason>" command, picked up
 *     automatically by handler.js's normal plugin loader.
 *   - module.exports.rawHandler → mention/reply/auto-clear detection,
 *     which must run on EVERY message regardless of command, so
 *     handler.js calls it directly (same pattern as biblequiz.js /
 *     shazam.js's rawHandler).
 */

const unique = (arr) => [...new Set((arr || []).filter(Boolean))];

// ─────────────────────────────────────────────────────────────
// AFK STORAGE: a small local file (tmp/afk.json), NOT MongoDB.
//   - .afk                       -> saved to the file at once
//   - you come back / are cleared -> removed from the file at once
// So after a restart: if you were AFK you are still AFK, if you were not you are not.
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const AFK_FILE = path.join(__dirname, '..', '..', 'tmp', 'afk.json');
let afkLoaded = false;

function loadAfk() {
  if (!global.db) global.db = {};
  if (!global.db.afk) global.db.afk = {};
  if (afkLoaded) return;
  afkLoaded = true;
  try {
    const saved = JSON.parse(fs.readFileSync(AFK_FILE, 'utf8'));
    for (const [k, v] of Object.entries(saved || {})) {
      if (v && typeof v === 'object' && !global.db.afk[k]) global.db.afk[k] = v;
    }
  } catch { /* no file yet = nobody is AFK */ }
}

function saveAfk() {
  try {
    fs.mkdirSync(path.dirname(AFK_FILE), { recursive: true });
    const tmp = AFK_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(global.db.afk || {}));
    fs.renameSync(tmp, AFK_FILE);            // never leaves a half-written file
  } catch (e) {
    console.log('[AFK] could not save afk file:', e.message);
  }
}

// A message that was sent while the bot was OFF (so it is not processed any more) can still
// tell us the person came back. If it is newer than their AFK time, end their AFK quietly.
function silentBack(mek) {
  try {
    loadAfk();
    const entries = Object.entries(global.db.afk);
    if (!entries.length || !mek?.key || !mek.message) return false;
    if (mek.message.reactionMessage && !mek.message.reactionMessage.text) return false;
    const ts = (Number(mek.messageTimestamp) || 0) * 1000;
    if (!ts) return false;

    const dg = (j) => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    const ids = new Set();
    const k = mek.key;
    for (const j of [k.participant, k.participantAlt, k.participantPn, k.senderPn, mek.participant]) { const d = dg(j); if (d) ids.add(d); }
    if (!String(k.remoteJid || '').endsWith('@g.us') && !k.fromMe) { const d = dg(k.remoteJid); if (d) ids.add(d); }
    if (k.fromMe && !(global._botSentIds && global._botSentIds.has(k.id))) {
      const d = dg(global.ednut?.user?.id); if (d) ids.add(d);    // the owner typing from the bot's own number
    }
    if (!ids.size) return false;

    let changed = false;
    for (const [key, data] of entries) {
      if (ts <= (data.since || 0)) continue;
      if (ids.has(dg(key)) || ids.has(dg(data.jid))) { delete global.db.afk[key]; changed = true; }
    }
    if (changed) saveAfk();
    return changed;
  } catch { return false; }
}


// "4 hours, 29 minutes, 37 seconds" — proper h/m/s breakdown with correct
// singular/plural per unit (never "1 hours"), used in the tag/reply notice.
function verboseDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (h > 0 || m > 0) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  parts.push(`${s} ${s === 1 ? 'second' : 'seconds'}`);
  return parts.join(', ');
}

// "25s" / "1m 22s" / "1h 2m 3s" — short form used in the welcome-back message.
function shortDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

// Shared by both the message-based auto-clear (rawHandler, below) and the
// presence-based auto-clear (called from store.js when the AFK'd person's
// account comes back "available"). Clears the AFK entry and sends one
// welcome-back message — kept in one place so the two trigger paths can
// never drift into different wording/behavior.
//
//   ednut     — the socket (has .sendMessage)
//   afkKey    — the resolveLidDigits() key into global.db.afk
//   targetChat— which chat to post the welcome-back message in
//   opts.note — overrides the default "You were AFK for: Xh Ym" line,
//               e.g. presence-triggered clears use a different phrasing
//               since there was no actual message to react to
async function clearAfkAndNotify(ednut, afkKey, targetChat, opts = {}) {
  if (!global.db.afk || !global.db.afk[afkKey]) return false;

  const afkData = global.db.afk[afkKey];
  delete global.db.afk[afkKey];
  saveAfk();

  const mentionJid = afkData.jid || targetChat;
  const awaySeconds = Math.max(0, Math.floor((Date.now() - afkData.since) / 1000));
  const noteLine = opts.note || `You were AFK for: *${verboseDuration(awaySeconds)}*`;

  await ednut.sendMessage(targetChat, {
    text:
      `✅ *Welcome back @${mentionJid.split('@')[0]}!*\n` +
      `╰┈➤ ${noteLine}\n` +
      `╰┈➤ Reason was: *${afkData.reason || 'no reason specified'}*`,
    mentions: [mentionJid]
  }, opts.quoted ? { quoted: opts.quoted } : {}).catch(() => {});

  return true;
}

module.exports = {
  command: ['afk'],
  alias: [],
  category: 'main',
  description: 'Mark yourself AFK. Anyone who tags or replies to you will be told.',

  // Exposed so store.js's presence.update listener can trigger the exact
  // same clear-and-notify logic without duplicating it.
  clearAfkAndNotify,
  silentBack,

  // .afk <reason>
  execute: async (m, { ednut, text, senderNumber, fontx }) => {
    const reason = (text || '').trim();
    loadAfk();
    const afkKey = senderNumber || m.sender;
    global.db.afk[afkKey] = { reason, since: Date.now(), jid: m.sender };
    saveAfk();

    const displayReason = typeof fontx === 'function'
      ? fontx(reason || 'no reason specified')
      : (reason || 'no reason specified');

    await ednut.sendMessage(m.chat, {
      text:
        `💤 *ᴀꜰᴋ ᴇɴᴀʙʟᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ!*\n` +
        `👤 @${m.sender.split('@')[0]} ɪꜱ ɴᴏᴡ ᴏꜰꜰʟɪɴᴇ.\n` +
        `📝 *ʀᴇᴀꜱᴏɴ:* ${displayReason}`,
      mentions: [m.sender]
    }, { quoted: m }).catch(() => {});
  },

  // Called directly by handler.js on every message.
  // helpers = { resolveLidDigits, senderNumber, isBotEcho, runtime }
  rawHandler: async (m, ednut, helpers = {}) => {
    loadAfk();
    const { resolveLidDigits, senderNumber, isBotEcho } = helpers;
    if (typeof resolveLidDigits !== 'function') return false;

    // Auto-clear: sending anything else while AFK ends the status.
    // Guarded by !isBotEcho, not raw fromMe — fromMe alone can't tell
    // "the bot's own reply looping back" apart from "the AFK'd person
    // genuinely typing from the bot's own linked number".
    // An emoji reaction counts too: if the AFK person reacts to any message,
    // welcome them back. (Removing a reaction sends an empty emoji - ignored.)
    // A reaction message can't be quoted sensibly, so we quote the message
    // that was reacted to instead.
    const reaction = m.message?.reactionMessage || null;
    if (reaction && !reaction.text) return false;

    if (!isBotEcho) {
      const afkKey = senderNumber || m.sender;
      if (afkKey && global.db.afk[afkKey]) {
        let quoted = m;
        if (reaction) {
          quoted = null;
          try {
            const target = reaction.key && ednut.loadMessage ? await ednut.loadMessage(m.chat, reaction.key.id) : null;
            if (target && target.message) quoted = target;
          } catch {}
        }
        await clearAfkAndNotify(ednut, afkKey, m.chat, { quoted });
      }
    }

    // A reaction is not a tag or a reply - nothing more to do for it.
    if (reaction) return false;

    // Someone @mentioned (directly or via hidetag/@all) an AFK user.
    try {
      if (!isBotEcho) {
        const afkMentioned = unique([
          ...(m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []),
          ...(m.mentionedJid || [])
        ]);
        for (const jid of afkMentioned) {
          if (!jid) continue;
          const digits = await resolveLidDigits(jid);
          if (!digits || digits === senderNumber) continue;
          const afkData = global.db.afk[digits];
          if (!afkData) continue;
          const awaySeconds = Math.max(0, Math.floor((Date.now() - afkData.since) / 1000));
          await ednut.sendMessage(m.chat, {
            text:
              `⚠️ *@${jid.split('@')[0]} is AFK*\n` +
              `╰┈➤ Reason: *${afkData.reason || 'no reason specified'}*\n` +
              `╰┈➤ Gone for: ${verboseDuration(awaySeconds)} ago.`,
            mentions: [jid]
          }, { quoted: m }).catch(() => {});
        }
      }
    } catch (e) {
      console.log('[AFK MENTION ERROR]', e.message);
    }

    // Someone replied to a message from an AFK user.
    try {
      if (!isBotEcho) {
        const quotedParticipant =
          m.message?.extendedTextMessage?.contextInfo?.participant ||
          m.quoted?.sender ||
          null;
        if (quotedParticipant) {
          const digits = await resolveLidDigits(quotedParticipant);
          if (digits && digits !== senderNumber) {
            const afkData = global.db.afk[digits];
            if (afkData) {
              const awaySeconds = Math.max(0, Math.floor((Date.now() - afkData.since) / 1000));
              await ednut.sendMessage(m.chat, {
                text:
                  `⚠️ *@${quotedParticipant.split('@')[0]} is AFK*\n` +
                  `╰┈➤ Reason: *${afkData.reason || 'no reason specified'}*\n` +
                  `╰┈➤ Gone for: ${verboseDuration(awaySeconds)} ago.`,
                mentions: [quotedParticipant]
              }, { quoted: m }).catch(() => {});
            }
          }
        }
      }
    } catch (e) {
      console.log('[AFK REPLY ERROR]', e.message);
    }

    return false;
  }
};