// ==========================================
// EMMYFROSH TRIGGER — RAW HANDLER
//
//  1) Trigger words ("emmyfrosh", "jmighty") -> quick emoji reactions + reply
//
//  2) TAG REACTION — the bot reacts when ANYONE tags you (also a hidetag /
//     tag-all that includes you) or types your name in plain text. The owner
//     and every moderator each have their OWN emoji and their OWN names.
//
//     Commands live in tagreact.js (owner / moderator only):
//       tagreact on / off           switch YOUR tag reaction on or off
//       tagreact 🔥                 set your emoji (and switch it on)
//       tagreact                    show your status
//       settagemoji 🔥              set YOUR reaction emoji
//       settagemoji                 show your emoji
//       settagemoji off             turn your reaction off
//       settagname emmyfrosh        add a name/username to watch for
//       settagname list             show your names
//       settagname remove <name>    remove one name
//       settagname clear            remove all your names
//
//  Note: WhatsApp allows only ONE reaction per message. If one message tags
//  or names two people, only the first one found reacts (owner first).
//
//  If the owner removes a moderator (delmod), that moderator's reaction
//  switches off automatically.
//
//  Settings are saved in tagreact.json (in the app's main folder), so they
//  survive restarts and do not depend on the bot's database.
// ==========================================
const fs = require("fs");
const path = require("path");

const REACTION_DELAY = 300; // milliseconds between trigger reactions (1000 = 1 second)

const TRIGGERS = ["emmyfrosh", "jmighty"]; // add/remove trigger words here
const SET_CMD = /^[^\p{L}\p{N}\s]?(settagemoji|tagemoji|settagname|tagname)\b\s*(.*)$/iu;
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
const MIN_NAME_LEN = 3; // shorter names would react to normal words by mistake

// ---------- storage ----------
const FILE = path.join(process.cwd(), "tagreact.json");
let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    cache = {};
    // one-time import from the older versions that used the bot database
    const old = global.db && global.db.settings;
    if (old && old.tagReact && Object.keys(old.tagReact).length) cache = { ...old.tagReact };
    else if (old && old.tagEmoji) cache = { owner: { emoji: old.tagEmoji, names: [] } };
    if (Object.keys(cache).length) save();
  }
  return cache;
}
function save() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.log("[TAG REACT] could not save tagreact.json:", e.message);
  }
}

// ---------- helpers ----------
function firstEmoji(str) {
  const s = String(str || "").trim();
  if (!s) return null;
  let first = s;
  try {
    first = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)][0].segment;
  } catch {}
  return EMOJI_RE.test(first) ? first : null;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// matches the name as a whole word, with or without a leading @
function nameInText(name, text) {
  try {
    return new RegExp(`(?<![\\p{L}\\p{N}_])@?${escapeRe(name)}(?![\\p{L}\\p{N}_])`, "iu").test(text);
  } catch {
    return false;
  }
}

// is this key (a phone number) still in the moderator / sudo list?
function isStaff(key, staffIds) {
  return staffIds.some((id) => id === key || String(id).replace(/\D/g, "") === key);
}

// is any of the mentioned ids this person? (works for phone ids and @lid ids)
async function mentionsPerson(mentioned, idSet, ednut, ctx) {
  const checks = mentioned.map(async (j) => {
    const forms = [j, ednut.decodeJid ? ednut.decodeJid(j) : j];
    if (forms.some((f) => idSet.includes(f))) return true;
    if (ctx.resolveLidDigits) {
      const d = await ctx.resolveLidDigits(j).catch(() => "");
      if (d && idSet.includes(d)) return true;
    }
    return false;
  });
  const results = await Promise.all(checks);
  return results.some(Boolean);
}

module.exports = {
  // ------------------------------------------------------------------
  // Called for EVERY message, in every mode (even private mode).
  // ctx: { selfKey, ownerTagSet, buildIdentitySet, resolveLidDigits, text }
  // ------------------------------------------------------------------
  tagReact: async (m, ednut, ctx = {}) => {
    const store = load();
    const entries = Object.entries(store).filter(([, v]) => v && v.emoji && v.enabled !== false);
    if (!entries.length) return;

    const text = (ctx.text || m.text || m.body || "").toString().trim();

    // Do not react to the "settagemoji / settagname" commands themselves
    if (SET_CMD.test(text)) return;

    const mentioned = [
      ...new Set([
        ...(m.mentionedJid || []),
        ...(m.msg?.contextInfo?.mentionedJid || []),
        ...(m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []),
        ...(m.message?.imageMessage?.contextInfo?.mentionedJid || []),
        ...(m.message?.videoMessage?.contextInfo?.mentionedJid || []),
      ]),
    ];

    // owner first, then moderators
    entries.sort(([a], [b]) => (a === "owner" ? -1 : b === "owner" ? 1 : 0));

    for (const [key, v] of entries) {
      if (key === ctx.selfKey) continue; // never react to your own mention

      // A moderator who was removed (delmod) no longer reacts.
      // The owner entry is always active.
      if (key !== "owner" && Array.isArray(ctx.staffIds) && !isStaff(key, ctx.staffIds)) continue;

      let hit = false;

      // a) real @tag, including hidetag / tag-all (you are inside the mention list)
      if (mentioned.length) {
        let idSet;
        if (key === "owner") idSet = ctx.ownerTagSet || [];
        else idSet = ctx.buildIdentitySet ? await ctx.buildIdentitySet([key]) : [key];
        hit = await mentionsPerson(mentioned, idSet, ednut, ctx);
      }

      // b) name typed as plain text
      if (!hit && text && Array.isArray(v.names)) {
        hit = v.names.some((n) => nameInText(n, text));
      }

      if (hit) {
        await ednut.sendMessage(m.chat, { react: { text: v.emoji, key: m.key } }).catch(() => {});
        return; // WhatsApp keeps one reaction per message
      }
    }

  },

  // ------------------------------------------------------------------
  // Used by tagreact.js (the settagemoji / settagname commands).
  // Each returns the text to send back.
  // ------------------------------------------------------------------
  handleEmoji(selfKey, arg, pushName) {
    const store = load();
    const me = store[selfKey] || (store[selfKey] = { emoji: "", names: [] });
    if (!Array.isArray(me.names)) me.names = [];
    arg = String(arg || "").trim();
    const low = arg.toLowerCase();

    if (!arg) {
      if (!me.emoji) return "Your tag reaction is OFF (no emoji set).\nSet it: tagreact <emoji>";
      return `Your tag reaction is ${me.enabled === false ? "OFF" : "ON"}: ${me.emoji}\n` +
        `Names: ${me.names.length ? me.names.join(", ") : "none"}\n\n` +
        "tagreact on / off\ntagreact <emoji>\nsettagname <name>";
    }
    if (low === "on" || low === "enable") {
      if (!me.emoji) return "Set an emoji first: tagreact 🔥";
      me.enabled = true;
      save();
      return `Your tag reaction is ON: ${me.emoji}`;
    }
    if (["off", "none", "disable"].includes(low)) {
      me.enabled = false;
      save();
      return "Your tag reaction is OFF. Turn it on again: tagreact on";
    }
    if (low === "reset") {
      me.emoji = "";
      me.enabled = false;
      save();
      return "Your emoji was removed and the reaction is OFF.";
    }
    const emoji = firstEmoji(arg);
    if (!emoji) return "Send a real emoji, for example: tagreact 🔥  (or: tagreact on / tagreact off)";
    me.emoji = emoji;
    me.enabled = true;

    // first time: also watch for your WhatsApp name automatically
    let extra = "";
    const pn = String(pushName || "").trim();
    if (pn.length >= MIN_NAME_LEN && !me.names.length) {
      me.names.push(pn.toLowerCase());
      extra = `\nI will also react when someone types "${pn}". (settagname remove ${pn.toLowerCase()} to stop that)`;
    }
    save();
    return `Done. Your tag reaction is ON: ${emoji}.${extra}\nAdd more names: settagname <name>`;
  },

  handleName(selfKey, arg) {
    const store = load();
    const me = store[selfKey] || (store[selfKey] = { emoji: "", names: [] });
    if (!Array.isArray(me.names)) me.names = [];
    const low = String(arg || "").trim().toLowerCase();

    if (!low || low === "list") {
      return me.names.length
        ? `Your names:\n- ${me.names.join("\n- ")}\n\nAdd: settagname <name>\nRemove: settagname remove <name>`
        : "You have no names yet.\nAdd one: settagname <name>";
    }
    if (low === "clear") {
      me.names = [];
      save();
      return "All your names removed. Only real @tags will react now.";
    }
    if (low.startsWith("remove ") || low.startsWith("delete ")) {
      const name = low.replace(/^(remove|delete)\s+/, "").replace(/^@/, "").trim();
      const before = me.names.length;
      me.names = me.names.filter((n) => n !== name);
      save();
      return me.names.length < before ? `Removed "${name}".` : `"${name}" was not in your list.`;
    }
    const name = low.replace(/^@/, "").trim();
    if (name.length < MIN_NAME_LEN) return `Name is too short. Use at least ${MIN_NAME_LEN} letters.`;
    if (!me.names.includes(name)) me.names.push(name);
    save();
    if (!me.emoji) return `Added "${name}". Now set your emoji: tagreact <emoji>`;
    if (me.enabled === false) return `Added "${name}". Your reaction is OFF, turn it on: tagreact on`;
    return `Added "${name}". I will react with ${me.emoji} when someone types it.`;
  },

  // ------------------------------------------------------------------
  // Trigger words (private mode: staff only, set by the handler)
  // ------------------------------------------------------------------
  rawHandler: async (m, ednut, ctx = {}) => {
    const lower = (m.text || m.body || "").trim().toLowerCase();
    if (!TRIGGERS.includes(lower)) return false; // not our trigger — let other handlers/commands run

    const emojis = ["🌎", "💨", "🤍", "❤️‍🔥", "💔", ""];
    for (const emoji of emojis) {
      await ednut.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {});
      await new Promise((r) => setTimeout(r, REACTION_DELAY));
    }

    await m.reply("Active what is the way forward ");
    return true; // handled — stop further processing for this message
  }
};