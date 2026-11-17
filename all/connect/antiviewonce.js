/**
 * Anti-ViewOnce keeper — Emmy Frosh AI
 * Place in: ./all/connect/antiviewonce.js
 *
 * What it does
 *  1. When a view-once message arrives, it is downloaded and kept in memory
 *     BEFORE messages.js deletes it from the chat.
 *  2. When the OWNER (you) replies to it with anything (text, image, sticker,
 *     voice note...) or reacts to it with an emoji, the saved copy is sent out.
 *
 * Where it is sent — chosen by each person with .avv dm / .avv chat:
 *   "chat" (default) -> the chat where they replied/reacted
 *   "dm"             -> that person's own DM (owner -> owner DM, mod/sudo -> their DM)
 */

const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const MAX_ITEMS = 40;                    // how many view-once items to remember
const MAX_BYTES = 40 * 1024 * 1024;      // skip anything bigger than 40MB
const TTL_MS    = 6 * 60 * 60 * 1000;    // forget after 6 hours

const failed = new Map(); // messageId -> reason it could not be saved
const pending = new Map(); // messageId -> promise of a save in progress (so two callers never download twice)
const revealed = new Set(); // trigger message ids already answered
const stats = { seen: 0, saved: 0, failed: 0, revealed: 0, lastError: "", lastDenied: "", lastTypes: [], attachedAt: 0 };
const store = new Map(); // messageId -> { buffer, kind, mimetype, caption, ptt, sender, chat, at }

// ── helpers ───────────────────────────────────────────────────────────────

function unwrap(message) {
  let m = message || {};
  for (let i = 0; i < 6; i++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

function isViewOnceMessage(message) {
  const raw = message || {};
  if (raw.viewOnceMessage || raw.viewOnceMessageV2 || raw.viewOnceMessageV2Extension) return true;
  const m = unwrap(raw);
  return (
    m.imageMessage?.viewOnce === true ||
    m.videoMessage?.viewOnce === true ||
    m.audioMessage?.viewOnce === true
  );
}

function digits(jid) {
  return String(jid || "").split(":")[0].split("@")[0].replace(/[^0-9]/g, "");
}

function ownerDigits() {
  const list = [];
  const push = (v) => {
    if (Array.isArray(v)) v.forEach(push);
    else if (v) String(v).split(/[,\s]+/).forEach((x) => { const d = digits(x); if (d) list.push(d); });
  };
  push(global.ownerNumber);
  push(global.owner);
  return list;
}

// owner + sudo + moderators (env values and the ones added with the sudo / mod commands)
function allowedDigits() {
  const list = ownerDigits();
  const push = (v) => {
    if (Array.isArray(v)) v.forEach(push);
    else if (v) String(v).split(/[,\s]+/).forEach((x) => { const d = digits(x); if (d) list.push(d); });
  };
  push(global.sudo);
  push(global.db?.setsudo);
  push(global.db?.setmod);
  return list;
}

function senderJids(mek) {
  return [
    mek.key?.participant,
    mek.key?.participantAlt,
    mek.participant,
    mek.key?.remoteJid,
    mek.key?.remoteJidAlt,
  ].filter(Boolean);
}

const metaCache = new Map(); // group jid -> { at, participants }

async function groupParticipants(ednut, chat) {
  if (!String(chat).endsWith("@g.us")) return [];
  const hit = metaCache.get(chat);
  if (hit && Date.now() - hit.at < 2 * 60 * 1000) return hit.participants;
  try {
    const meta = await ednut.groupMetadata(chat);
    const participants = meta?.participants || [];
    metaCache.set(chat, { at: Date.now(), participants });
    return participants;
  } catch { return hit?.participants || []; }
}

// every number/LID this person is known by (phone number AND hidden LID form)
async function aliasesOf(ednut, chat, jids) {
  const out = new Set(jids.map(digits).filter(Boolean));
  const lm = ednut.signalRepository?.lidMapping;

  for (const j of jids) {
    try {
      if (String(j).endsWith("@lid")) { const pn = await lm?.getPNForLID?.(j); if (pn) out.add(digits(pn)); }
      else { const lid = await lm?.getLIDForPN?.(j); if (lid) out.add(digits(lid)); }
    } catch { /* no mapping */ }
  }

  // group member list carries both forms for each member
  for (const p of await groupParticipants(ednut, chat)) {
    const fields = [p.id, p.lid, p.phoneNumber, p.jid, p.pn].filter(Boolean).map(digits).filter(Boolean);
    if (fields.some((f) => out.has(f))) fields.forEach((f) => out.add(f));
  }
  return out;
}

// WhatsApp can show the same person as a phone number OR as a hidden LID id.
// Mods added with the mod command may be saved either way, so we collect every
// form of the sender (from the message, the group member list and the bot's
// LID map) and compare it with every form of each allowed person.
const groupCache = new Map(); // chat -> { at, data }

async function groupParticipants(ednut, chat) {
  if (!chat || !chat.endsWith("@g.us")) return [];
  const hit = groupCache.get(chat);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.data;
  try {
    const meta = await ednut.groupMetadata(chat);
    const data = meta?.participants || [];
    groupCache.set(chat, { at: Date.now(), data });
    return data;
  } catch { return hit?.data || []; }
}

function idsOf(obj) {
  const out = [];
  for (const v of Object.values(obj || {})) {
    if (typeof v === "string" && /@(s\.whatsapp\.net|lid)$/.test(v)) out.push(digits(v));
  }
  return out.filter(Boolean);
}

async function senderIdentities(ednut, mek) {
  const ids = new Set(senderJids(mek).map(digits).filter(Boolean));

  // hidden LID -> phone number (and back) using the bot's own map
  for (const j of senderJids(mek)) {
    try {
      const lm = ednut.signalRepository?.lidMapping;
      if (String(j).endsWith("@lid")) {
        const pn = await lm?.getPNForLID?.(j);
        if (pn) ids.add(digits(pn));
      } else {
        const lid = await lm?.getLIDForPN?.(j);
        if (lid) ids.add(digits(lid));
      }
    } catch { /* no mapping available */ }
  }

  // group member list carries both forms for each member
  const members = await groupParticipants(ednut, mek.key?.remoteJid);
  for (const mem of members) {
    const forms = idsOf(mem);
    if (forms.some((d) => ids.has(d))) forms.forEach((d) => ids.add(d));
  }
  return ids;
}

async function isOwnerMessage(ednut, mek) {
  // Sent from your own linked number (the normal case for a self-bot).
  // Ignore anything the bot itself sent, so it can never trigger itself.
  if (mek.key?.fromMe) return !global._botSentIds?.has(mek.key.id);

  const allowed = allowedDigits();
  const quick = senderJids(mek).map(digits);
  if (quick.some((d) => allowed.includes(d))) return true;

  const ids = await senderIdentities(ednut, mek);
  if ([...ids].some((d) => allowed.includes(d))) return true;

  stats.lastDenied = `${[...ids].join(", ")} (allowed: ${allowed.length} numbers)`;
  return false;
}

// ── per-person destination: each allowed person picks dm/chat for themselves ──
// stored as global.db.antivvdest = { "<number or LID digits>": "dm" | "chat" }

async function identitiesFor(ednut, mek) {
  if (mek.key?.fromMe) return new Set(["owner", ...ownerDigits(), digits(ednut.user?.id)].filter(Boolean));
  return senderIdentities(ednut, mek);
}

async function getDestMode(ednut, mek) {
  const map = global.db?.antivvdest;
  if (map && typeof map === "object") {
    for (const id of await identitiesFor(ednut, mek)) if (map[id]) return map[id];
  }
  return (process.env.ANTIVV_DEST || "chat").toLowerCase() === "dm" ? "dm" : "chat";
}

async function setDestMode(ednut, mek, mode) {
  if (!global.db) global.db = {};
  if (!global.db.antivvdest || typeof global.db.antivvdest !== "object") global.db.antivvdest = {};
  for (const id of await identitiesFor(ednut, mek)) global.db.antivvdest[id] = mode;
  try { await global.flushDB?.(); } catch { /* saving is best effort */ }
}

// the sender's own DM: owner -> owner number; others -> their phone number when we can find it
async function dmJidFor(ednut, mek) {
  if (mek.key?.fromMe) return ownerDmJid(ednut);

  const jids = senderJids(mek).filter((j) => /@(s\.whatsapp\.net|lid)$/.test(String(j)));
  const pn = jids.find((j) => String(j).endsWith("@s.whatsapp.net"));
  if (pn) return `${digits(pn)}@s.whatsapp.net`;

  for (const j of jids) {
    try {
      const got = await ednut.signalRepository?.lidMapping?.getPNForLID?.(j);
      if (got) return `${digits(got)}@s.whatsapp.net`;
    } catch { /* keep looking */ }
  }

  const ids = new Set(jids.map(digits));
  for (const mem of await groupParticipants(ednut, mek.key?.remoteJid)) {
    if (idsOf(mem).some((d) => ids.has(d))) {
      const phone = mem.phoneNumber || mem.pn || (String(mem.jid || "").endsWith("@s.whatsapp.net") ? mem.jid : null);
      if (phone) return `${digits(phone)}@s.whatsapp.net`;
    }
  }
  return jids[0] || mek.key?.remoteJid; // last resort
}

function ownerDmJid(ednut) {
  const first = ownerDigits()[0];
  const d = first || digits(ednut.user?.id);
  return d ? `${d}@s.whatsapp.net` : null;
}

function prune() {
  const now = Date.now();
  for (const [id, v] of store) if (now - v.at > TTL_MS) store.delete(id);
  while (store.size > MAX_ITEMS) store.delete(store.keys().next().value);
}

function describe(inner) {
  if (inner.imageMessage) return { kind: "image", node: inner.imageMessage };
  if (inner.videoMessage) return { kind: "video", node: inner.videoMessage };
  if (inner.audioMessage) return { kind: "audio", node: inner.audioMessage };
  return null;
}

async function download(ednut, key, inner, original) {
  const opts = { logger: console, reuploadRequest: ednut.updateMediaMessage };
  let buffer;
  try {
    buffer = await downloadMediaMessage({ key, message: inner }, "buffer", {}, opts);
  } catch (e1) {
    if (!original) throw e1;
    buffer = await downloadMediaMessage(original, "buffer", {}, opts); // second try with the untouched message
  }
  if (!buffer || !buffer.length) throw new Error("downloaded file was empty");
  if (buffer.length > MAX_BYTES) throw new Error("file is too big (over 40MB)");
  return buffer;
}

// ── 1. keep a copy of every incoming view-once ───────────────────────────

function keep(ednut, mek) {
  const id = mek.key?.id;
  if (!id) return Promise.resolve();
  if (store.has(id)) return Promise.resolve();
  if (pending.has(id)) return pending.get(id);
  const job = doKeep(ednut, mek, id).finally(() => pending.delete(id));
  pending.set(id, job);
  return job;
}

async function doKeep(ednut, mek, id) {
  try {
    stats.seen++;
    console.log(`[ANTIVV] view-once seen (${id}) fromMe=${!!mek.key.fromMe}`);

    const inner = unwrap(mek.message);
    const d = describe(inner);
    if (!d) { failed.set(id, "unsupported view-once type"); stats.failed++; stats.lastError = "unsupported view-once type"; return; }
    if (!d.node.mediaKey) { failed.set(id, "WhatsApp gave the bot no media key for this view-once"); stats.failed++; stats.lastError = "no media key"; console.log("[ANTIVV] no mediaKey on", id); return; }

    const buffer = await download(ednut, mek.key, inner, mek);

    store.set(id, {
      buffer,
      kind: d.kind,
      mimetype: d.node.mimetype || (d.kind === "image" ? "image/jpeg" : d.kind === "video" ? "video/mp4" : "audio/ogg; codecs=opus"),
      caption: d.node.caption || "",
      ptt: !!d.node.ptt,
      sender: mek.key.participant || mek.participant || mek.key.remoteJid,
      chat: mek.key.remoteJid,
      at: Date.now(),
    });
    stats.saved++;
    console.log(`[ANTIVV] saved view-once ${id} (${buffer.length} bytes)`);
    prune();
  } catch (e) {
    failed.set(id, `download failed: ${e.message}`);
    stats.failed++; stats.lastError = e.message;
    console.log("[ANTIVV] could not save view-once:", e.message);
  }
}

// ── 2. owner replied / reacted / sticker-replied -> send the saved copy ──

function findTarget(message) {
  const m = unwrap(message);

  // emoji reaction: the reacted message id lives in reactionMessage.key
  if (m.reactionMessage) {
    if (!m.reactionMessage.text) return null; // reaction removed, ignore
    return { id: m.reactionMessage.key?.id, quoted: null };
  }

  // reply (text / image / video / audio / sticker / document ...): contextInfo
  for (const node of Object.values(m)) {
    const ci = node && typeof node === "object" ? node.contextInfo : null;
    if (ci?.stanzaId) return { id: ci.stanzaId, quoted: ci.quotedMessage || null, participant: ci.participant };
  }
  return null;
}

async function reveal(ednut, mek) {
  try {
    if (!mek?.message || mek.key?.remoteJid === "status@broadcast") return;
    // read the target right away, before anything else can rewrite this message
    const target = findTarget(mek.message);
    if (!target?.id) return;

    // only look at replies/reactions aimed at a view-once (keeps this cheap for normal chat)
    const aimedAtViewOnce = store.has(target.id) || pending.has(target.id) || failed.has(target.id) ||
      !!(target.quoted && isViewOnceMessage(target.quoted));
    if (!aimedAtViewOnce) return;

    if (!(await isOwnerMessage(ednut, mek))) return;

    const trig = mek.key?.id;
    if (trig) { if (revealed.has(trig)) return; revealed.add(trig); if (revealed.size > 500) revealed.delete(revealed.values().next().value); }

    // if that view-once is still being saved, wait for it
    if (pending.has(target.id)) await pending.get(target.id);

    let item = store.get(target.id);

    // Not saved earlier (e.g. arrived while bot was off): try the copy inside the reply
    if (!item && target.quoted && isViewOnceMessage(target.quoted)) {
      const inner = unwrap(target.quoted);
      const d = describe(inner);
      if (d) {
        try {
          const key = { remoteJid: mek.key.remoteJid, id: target.id, fromMe: false, participant: target.participant };
          const buffer = await download(ednut, key, inner);
          if (buffer) {
            item = {
              buffer, kind: d.kind, mimetype: d.node.mimetype || "", caption: d.node.caption || "",
              ptt: !!d.node.ptt, sender: target.participant || mek.key.remoteJid, chat: mek.key.remoteJid, at: Date.now(),
            };
          }
        } catch (e) { failed.set(target.id, `download failed: ${e.message}`); }
      }
    }

    if (!item) {
      const quotedIsVO = !!(target.quoted && isViewOnceMessage(target.quoted));
      const reason = failed.get(target.id) || (quotedIsVO ? "the bot never saw this view-once arrive (sent before the bot started, or messages.js is not updated)" : null);
      console.log(`[ANTIVV] nothing to send for ${target.id}: ${reason || "not a view-once"}`);
      if (reason && !mek.message.reactionMessage) {
        await ednut.sendMessage(mek.key.remoteJid, { text: `⚠️ *Anti View-Once:* couldn't recover that view-once.\n_${reason}_` });
      }
      return;
    }

    // each person gets it where THEY chose: .avv dm -> their own DM, .avv chat -> this chat
    const mode = await getDestMode(ednut, mek);
    const dest = mode === "dm"
      ? (await dmJidFor(ednut, mek) || mek.key.remoteJid)
      : mek.key.remoteJid;

    const who = digits(item.sender);
    const header = `👁 *View-once*${who ? ` from @${who}` : ""}`;
    const caption = item.caption ? `${header}\n\n${item.caption}` : header;
    const mentions = item.sender ? [item.sender] : [];

    stats.revealed++;
    if (item.kind === "image") {
      await ednut.sendMessage(dest, { image: item.buffer, mimetype: item.mimetype, caption, mentions });
    } else if (item.kind === "video") {
      await ednut.sendMessage(dest, { video: item.buffer, mimetype: item.mimetype, caption, mentions });
    } else {
      await ednut.sendMessage(dest, { audio: item.buffer, mimetype: item.mimetype, ptt: item.ptt });
    }
  } catch (e) {
    console.log("[ANTIVV] could not send view-once:", e.message);
  }
}

// ── 3. listen to the bot's connection by itself ─────────────────────────
// Works without any change to messages.js. It re-attaches after reconnects
// and survives messages.js clearing the listeners.

function onUpsert(ednut, { messages }) {
  for (const mek of messages || []) {
    try {
      if (!mek?.message) continue;
      stats.lastTypes.push(`${mek.key?.fromMe ? "me" : "them"}:${Object.keys(unwrap(mek.message)).join(",").slice(0, 60)}`);
      if (stats.lastTypes.length > 5) stats.lastTypes.shift();

      if (global.db?.settings?.antiviewonce === false) continue;
      if (isViewOnceMessage(mek.message)) keep(ednut, mek);
      else reveal(ednut, mek).catch(() => {});
    } catch (e) { stats.lastError = e.message; }
  }
}

function attach(sock) {
  if (!sock?.ev || sock.__antivvAttached) return false;
  sock.__antivvAttached = true;
  stats.attachedAt = Date.now();

  const listener = (u) => onUpsert(sock, u);
  sock.ev.on("messages.upsert", listener);

  // messages.js calls removeAllListeners("messages.upsert"); put ours back right after
  const origRemove = sock.ev.removeAllListeners.bind(sock.ev);
  sock.ev.removeAllListeners = (...a) => {
    const r = origRemove(...a);
    if (!a.length || a[0] === "messages.upsert") sock.ev.on("messages.upsert", listener);
    return r;
  };
  console.log("[ANTIVV] attached to the bot connection");
  return true;
}

let timer = null;
function autoAttach() {
  if (timer) return;
  const tick = () => { try { attach(global.ednut); } catch (e) { stats.lastError = e.message; } };
  tick();
  timer = setInterval(tick, 3000);
  if (timer.unref) timer.unref();
}

function status() {
  return { ...stats, stored: store.size, attached: !!global.ednut?.__antivvAttached };
}

module.exports = {
  attach, autoAttach, status, isViewOnceMessage, keep, reveal, isOwnerMessage, getDestMode, setDestMode, _store: store, _findTarget: findTarget };
