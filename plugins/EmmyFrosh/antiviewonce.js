// plugins/EmmyFrosh/antiviewonce.js
// EMMYFROSH-AI — Anti View-Once (all-in-one, no other file needed)
//
// AUTO: anybody drops a view-once (photo / video / voice note) in a group or DM
//       -> the bot saves it and sends it to YOUR DM automatically.
//
//   .antiviewonce dm     -> send to the OWNER's DM (default)
//   .antiviewonce group  -> send back into the same chat it came from
//   .antiviewonce off    -> do nothing
//   .antiviewonce debug  -> counters + last error
//
// Install: put this at plugins/EmmyFrosh/antiviewonce.js (replace the old one).
// all/connect/antiviewonce.js is no longer needed.

const { downloadMediaMessage, downloadContentFromMessage } = require('@whiskeysockets/baileys');

const MESSAGE_STORE_LIMIT = 1500;          // recent incoming messages, kept for the auto-saver's lookups
const SEEN_LIMIT = 1000;
const MAX_BYTES = 40 * 1024 * 1024;        // skip anything bigger than 40MB
const stats = { seen: 0, sent: 0, failed: 0, stubs: 0, upserts: 0, lastError: '', lastMedia: '', lastStub: '', lastTypes: [] };
const seen = new Set();                    // view-once ids already handled (no double sends)
const messageStore = new Map();            // id -> { message, jids }

// ── helpers ──────────────────────────────────────────────────────────────

const digits = (jid) => String(jid || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');

const unwrap = (message) => {
    let cur = message || {};
    for (let i = 0; i < 6; i++) {
        const inner = cur.ephemeralMessage?.message || cur.viewOnceMessage?.message ||
            cur.viewOnceMessageV2?.message || cur.viewOnceMessageV2Extension?.message ||
            cur.documentWithCaptionMessage?.message;
        if (!inner) break;
        cur = inner;
    }
    return cur;
};

const isViewOnce = (message) => {
    const raw = message || {};
    if (raw.viewOnceMessage || raw.viewOnceMessageV2 || raw.viewOnceMessageV2Extension) return true;
    const m = unwrap(raw);
    return m.imageMessage?.viewOnce === true || m.videoMessage?.viewOnce === true || m.audioMessage?.viewOnce === true;
};

const describe = (inner) =>
    inner.imageMessage ? { kind: 'image', node: inner.imageMessage, inner } :
    inner.videoMessage ? { kind: 'video', node: inner.videoMessage, inner } :
    inner.audioMessage ? { kind: 'audio', node: inner.audioMessage, inner } : null;

const ownerDigits = () => {
    const list = [];
    const push = (v) => {
        if (Array.isArray(v)) v.forEach(push);
        else if (v) String(v).split(/[,\s]+/).forEach((x) => { const d = digits(x); if (d) list.push(d); });
    };
    push(process.env.OWNER_NUMBER);
    push(global.ownerNumber);
    push(global.owner);
    return list[0] || '';
};

const ownerDmJid = (ednut) => {
    const d = ownerDigits() || digits(ednut.user?.id);
    return d ? `${d}@s.whatsapp.net` : null;
};

// who may use .antiviewonce for THEMSELVES: owner + global.db.sudo + global.db.setmod (moderators)
const isSudoDigits = (d) => (Array.isArray(global.db?.sudo) ? global.db.sudo : []).some((v) => digits(v) === d);
const isModDigits = (d) => (Array.isArray(global.db?.setmod) ? global.db.setmod : []).some((v) => digits(v) === d);

// ── per-user settings: every owner / sudo / moderator has their OWN mode ──
// global.db.settings.antivv = { offAll: false, users: { "<digits>": { mode: 'dm' | 'group' | 'off' } } }

const settingsStore = () => {
    if (!global.db) global.db = {};
    if (!global.db.settings) global.db.settings = {};
    if (!global.db.settings.antivv) global.db.settings.antivv = { offAll: false, users: {} };
    return global.db.settings.antivv;
};

const saveSettings = async () => { try { await global.flushDB?.(); } catch { /* best effort */ } };

const getUserMode = (d) => {
    const store = settingsStore();
    if (d === ownerDigits() && !store.users[d]) return 'dm'; // owner defaults ON
    return store.users[d]?.mode || 'off';
};

const setUserMode = async (d, mode) => {
    const store = settingsStore();
    store.users[d] = { mode };
    await saveSettings();
};

const isOffAll = () => !!settingsStore().offAll;
const setOffAll = async (v) => { settingsStore().offAll = !!v; await saveSettings(); };

// everyone currently ON, for building where an incoming view-once goes
const activeUsers = () => {
    if (isOffAll()) return [];
    const store = settingsStore();
    const owner = ownerDigits();
    const all = new Set([owner, ...Object.keys(store.users)].filter(Boolean));
    return [...all].map((d) => ({ d, mode: getUserMode(d) })).filter((u) => u.mode !== 'off');
};

// ── message store (so a view-once can be found again later) ──────────────

const remember = (mek) => {
    const id = mek?.key?.id;
    if (!id || !mek.message) return;
    messageStore.delete(id);
    messageStore.set(id, { message: mek.message, chat: mek.key.remoteJid });
    while (messageStore.size > MESSAGE_STORE_LIMIT) messageStore.delete(messageStore.keys().next().value);
};

// ── download: tries every source, 3 methods each ─────────────────────────
// sources = [[label, rawMessage], ...]; returns { d, buffer } or throws with details

const fetchMedia = async (ednut, key, sources) => {
    const notes = [];
    const opts = { logger: console, reuploadRequest: (msg) => ednut.updateMediaMessage(msg) };

    for (const [label, source] of sources.filter(([, s]) => s)) {
        const d = describe(unwrap(source));
        if (!d) { notes.push(`${label}: no photo/video/voice inside`); continue; }
        notes.push(`${label}: ${d.kind}, mediaKey ${d.node.mediaKey ? 'yes' : 'NO'}, directPath ${d.node.directPath ? 'yes' : 'NO'}`);

        let buffer = null;
        try {
            buffer = await downloadMediaMessage({ key, message: d.inner }, 'buffer', {}, opts);
        } catch (e1) {
            notes.push(`${label} download error: ${e1?.message || e1}`);
            try {
                const stream = await downloadContentFromMessage(d.node, d.kind);
                const chunks = [];
                for await (const c of stream) chunks.push(c);
                buffer = Buffer.concat(chunks);
            } catch (e2) {
                notes.push(`${label} retry error: ${e2?.message || e2}`);
                buffer = null;
            }
        }
        if (Buffer.isBuffer(buffer) && buffer.length) {
            if (buffer.length > MAX_BYTES) { notes.push(`${label}: file too big (over 40MB)`); continue; }
            return { d, buffer };
        }
    }
    const err = new Error('Could not download the media');
    err.notes = notes;
    throw err;
};

const groupNameCache = new Map();
async function groupName(ednut, chat) {
    if (!String(chat).endsWith('@g.us')) return null;
    if (groupNameCache.has(chat)) return groupNameCache.get(chat);
    try {
        const meta = await ednut.groupMetadata(chat);
        const name = meta?.subject || digits(chat);
        groupNameCache.set(chat, name);
        setTimeout(() => groupNameCache.delete(chat), 10 * 60 * 1000);
        return name;
    } catch { return digits(chat); }
}
function stamp(mek) {
    const ms = Number(mek.messageTimestamp) ? Number(mek.messageTimestamp) * 1000 : Date.now();
    const d = new Date(ms);
    const p2 = (n) => String(n).padStart(2, '0');
    return { time: `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`, date: `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` };
}
async function buildHeader(ednut, mek, kind) {
    const chat = mek.key.remoteJid;
    const isGroup = String(chat).endsWith('@g.us');
    const sender = mek.key.participant || mek.participant || chat;
    const senderTag = `@${digits(mek.key.participantAlt || sender)}`;
    const place = isGroup ? (await groupName(ednut, chat)) : 'Direct Message';
    const { time, date } = stamp(mek);
    const kindLabel = kind === 'image' ? 'Image 🖼️' : kind === 'video' ? 'Video 🎥' : 'Voice note 🎙️';
    const text =
        `✝️ *ᴠɪᴇᴡᴏɴᴄᴇ*\n\n` +
        `┃ 👤 ꜱᴇɴᴅᴇʀ: ${senderTag}\n` +
        `┃ 🗑️ ᴅᴇʟᴇᴛᴇᴅ ʙʏ: ${senderTag}\n` +
        `┃ 🏘️ ɢʀᴏᴜᴘ ɴᴀᴍᴇ: ${place}\n` +
        `┃ 📂 ᴛʏᴘᴇ: ${kindLabel}\n` +
        `┃ ⏰ ${time} • 📅 ${date}\n` +
        `╰━━━━━━━━━━━━━━━━━`;
    return { text, sender };
}

const sendMedia = async (ednut, dest, { d, buffer }, header, mentions = []) => {
    const caption = d.node.caption ? `${header}\n\n${d.node.caption}` : header;
    if (d.kind === 'image') {
        await ednut.sendMessage(dest, { image: buffer, mimetype: d.node.mimetype || 'image/jpeg', caption, mentions });
    } else if (d.kind === 'video') {
        await ednut.sendMessage(dest, { video: buffer, mimetype: d.node.mimetype || 'video/mp4', caption, mentions });
    } else {
        await ednut.sendMessage(dest, { audio: buffer, mimetype: d.node.mimetype || 'audio/ogg; codecs=opus', ptt: !!d.node.ptt });
        await ednut.sendMessage(dest, { text: header, mentions });
    }
};

// ── AUTO: handle one incoming view-once from anybody ─────────────────────

const handle = async (ednut, mek) => {
    if (global.__vvSaver?.ready) return;      // the Android-identity saver (started by messages.js) handles it instead
    const id = mek.key?.id;
    if (!id || seen.has(id)) return;
    seen.add(id);
    if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value);

    if (mek.key.fromMe) return;                          // never react to our own sends
    if (mek.key.remoteJid === 'status@broadcast') return;

    const chat = mek.key.remoteJid;
    const isGroup = String(chat).endsWith('@g.us');

    // build the set of destinations from everyone currently ON (each owner/sudo/mod has their own mode)
    const dests = new Set();
    for (const u of activeUsers()) {
        if (u.mode === 'dm') dests.add(`${u.d}@s.whatsapp.net`);
        else if (u.mode === 'group') dests.add(chat);
    }
    if (!dests.size) return; // nobody has it on right now

    stats.seen++;
    try {
        const stored = messageStore.get(id)?.message;
        const media = await fetchMedia(ednut, mek.key, [['original', mek.message], ['stored copy', stored]]);

        const { text: header, sender } = await buildHeader(ednut, mek, media.d.kind);

        for (const dest of dests) {
            try {
                await sendMedia(ednut, dest, media, header, [sender]);
                stats.sent++;
            } catch (e2) {
                console.log('[ANTIVV] delivery failed to', digits(dest), e2?.message || e2);
            }
        }
        console.log(`[ANTIVV] sent view-once ${id} to ${dests.size} destination(s) (${media.buffer.length} bytes)`);
    } catch (e) {
        stats.failed++;
        stats.lastError = e?.message || String(e);
        console.log('[ANTIVV] failed:', stats.lastError, e?.notes || '');
        const dm = ownerDmJid(ednut);
        if (dm) {
            await ednut.sendMessage(dm, {
                text: `⚠️ *Anti View-Once:* could not save a view-once from ${isGroup ? 'group ' + digits(chat) : 'DM ' + digits(chat)}\n` +
                      `_${stats.lastError}_\n\n🔎 Details:\n${(e?.notes || []).join('\n') || '(none)'}\n\n` +
                      `💡 If it says mediaKey NO, the bot is on a web identity (see the note in the reply).`
            }).catch(() => {});
        }
    }
};

// ── listener: attaches itself, survives reconnects and listener resets ───

const onUpsert = (ednut, { messages }) => {
    for (const mek of messages || []) {
        try {
            if (String(mek?.key?.remoteJid || '').endsWith('@newsletter')) continue; // WhatsApp Channel traffic, not view-once
            stats.upserts++;
            if (!mek?.message) {
                // WhatsApp sent a placeholder with no content. For view-once this means the
                // bot is on a web identity and WhatsApp withheld the media (see the notes).
                if (mek?.key && !mek.key.fromMe && mek.key.remoteJid !== 'status@broadcast' && !global.__vvSaver?.ready) {
                    const chatJ = mek.key.remoteJid;
                    stats.lastStub = `${digits(mek.key.participant || chatJ)} in ${String(chatJ).endsWith('@g.us') ? 'group ' + digits(chatJ) : 'DM'} (stubType ${mek.messageStubType ?? '?'})`;
                    // experimental: ask your phone to re-send the content of this empty message.
                    // (only works if this Baileys version has requestPlaceholderResend; harmless otherwise)
                    if (typeof ednut.requestPlaceholderResend === 'function' && mek.key.id) {
                        Promise.resolve(ednut.requestPlaceholderResend(mek.key)).catch(() => {});
                    }
                    const now = Date.now();
                    if (now - (global.__antivvStubNote || 0) > 20000) {   // at most one notice per 20s
                        global.__antivvStubNote = now;
                        const dm = ownerDmJid(ednut);
                        if (dm) ednut.sendMessage(dm, {
                            text: `⚠️ *Anti View-Once:* a message from ${stats.lastStub} reached the bot with NO content.\n\n` +
                                  (global.__vvAndroidPatched
                                      ? `If that was a view-once, WhatsApp still withheld it even though the bot logged in as Android. Set VV_ANDROID=off in .env and restart so the helper device (a one-time link) takes over.`
                                      : `If that was a view-once, WhatsApp withheld it because the bot is logged in as a web device. Start the bot with: node -r ./vvpatch.cjs index.js`)
                        }).catch(() => {});
                    }
                }
                continue;
            }
            remember(mek);
            if (isViewOnce(mek.message)) handle(ednut, mek).catch(() => {});
        } catch (e) { stats.lastError = e.message; }
    }
};

const attach = (sock) => {
    if (!sock?.ev || sock.__antivvAttached) return false;
    sock.__antivvAttached = true;
    const listener = (u) => onUpsert(sock, u);
    sock.ev.on('messages.upsert', listener);

    // if something calls removeAllListeners('messages.upsert'), put ours straight back
    const origRemove = sock.ev.removeAllListeners.bind(sock.ev);
    sock.ev.removeAllListeners = (...a) => {
        const r = origRemove(...a);
        if (!a.length || a[0] === 'messages.upsert') sock.ev.on('messages.upsert', listener);
        return r;
    };
    console.log('[ANTIVV] attached to the bot connection');
    return true;
};

// re-check every 3s so it re-attaches after a reconnect creates a new socket
if (!global.__antivvTimer) {
    const tick = () => { try { attach(global.ednut); } catch (e) { stats.lastError = e.message; } };
    tick();
    global.__antivvTimer = setInterval(tick, 3000);
    if (global.__antivvTimer.unref) global.__antivvTimer.unref();
}

// ── commands ─────────────────────────────────────────────────────────────

// shared permission check: owner, sudo, or moderator — each may run .antiviewonce for THEMSELVES
// BUG FIX: in a group where WhatsApp reports the sender as an LID (privacy ID) instead of their
// real phone number, m.key.participant / m.sender hold that LID, not the number — but
// global.db.setmod / global.db.sudo store real phone numbers, and so does the per-user settings
// key below. Using the LID here meant a mod's own .antiviewonce was saved under a digit string
// that could never match their entry in setmod, so isModDigits() failed and the config built for
// the saver never included them — their view-once copies silently went nowhere. messages.js
// already resolves this exact case into m.senderAlt (from key.participantAlt / key.remoteJidAlt);
// using that first fixes both the permission check and which key the setting is stored under.
const callerDigits = (m) => digits(m.senderAlt || m.sender || m.key?.participantAlt || m.key?.participant || m.key?.remoteJidAlt || m.key?.remoteJid);
const isAuthorized = (m, flags = {}) => {
    const d = callerDigits(m);
    return !!(flags.isOwner || d === ownerDigits() || flags.isSudo || isSudoDigits(d) || m.isModerator || flags.isModerator || isModDigits(d));
};
// only the owner or a moderator may flip the kill switch for EVERYONE at once
const isTopAuthority = (m, flags = {}) => {
    const d = callerDigits(m);
    return !!(flags.isOwner || d === ownerDigits() || m.isModerator || flags.isModerator || isModDigits(d));
};

module.exports = [
    {
        command: ['antiviewonce'],
        alias: ['antivv', 'avv'],
        category: 'owner',
        description: 'Anti view-once: each owner/sudo/mod sets their OWN dm / group / off',
        async execute(m, { ednut, args = [], reply, isOwner, isSudo, isModerator }) {
            attach(ednut);
            const flags = { isOwner, isSudo, isModerator };
            if (!isAuthorized(m, flags)) return reply('Only the owner, a sudo or a moderator can use this command.');
            const d = callerDigits(m);

            // accept both ".avv on dm" and ".avv dm"
            const a0 = (args[0] || '').toLowerCase();
            const a1 = (args[1] || '').toLowerCase();
            const sub = a0 === 'on' ? (a1 || 'dm') : a0;

            if (sub === 'offall' || sub === 'onall') {
                if (!isTopAuthority(m, flags)) return reply('Only the owner or a moderator can turn it off/on for everyone.');
                await setOffAll(sub === 'offall');
                return reply(sub === 'offall'
                    ? '✔️ *ᴀɴᴛɪᴠɪᴇᴡᴏɴᴄᴇ: ᴏꜰꜰ ꜰᴏʀ ᴇᴠᴇʀʏᴏɴᴇ*\nꜱᴇɴᴅ *.antiviewonce onall* ᴛᴏ ʀᴇꜱᴛᴏʀᴇ ᴇᴠᴇʀʏᴏɴᴇ\'ꜱ ᴏᴡɴ ꜱᴇᴛᴛɪɴɢ.'
                    : '✔️ *ᴀɴᴛɪᴠɪᴇᴡᴏɴᴄᴇ: ʀᴇꜱᴛᴏʀᴇᴅ*\nᴇᴠᴇʀʏᴏɴᴇ\'ꜱ ᴏᴡɴ ꜱᴇᴛᴛɪɴɢ ɪꜱ ᴀᴄᴛɪᴠᴇ ᴀɢᴀɪɴ.');
            }

            if (sub === 'dm' || sub === 'group' || sub === 'chat' || sub === 'off') {
                const mode = sub === 'chat' ? 'group' : sub;
                await setUserMode(d, mode);
                // first time anyone turns it on: start the saver and send ONE pairing code to whoever ran this
                if (mode !== 'off' && !global.__vvAndroidPatched) global.__vvSaverEnsure?.(d);
                const linkNote = (global.__vvSaver && !global.__vvSaver.ready) ? '\n🔗 ᴀ ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ ɪꜱ ᴏɴ ɪᴛꜱ ᴡᴀʏ ᴛᴏ ʏᴏᴜʀ ᴅᴍ — ᴛʜɪꜱ ᴏɴʟʏ ʜᴀꜱ ᴛᴏ ʙᴇ ᴅᴏɴᴇ ᴏɴᴄᴇ.' : '';

                if (mode === 'dm') return reply(`✔️ *ᴀɴᴛɪᴠɪᴇᴡᴏɴᴄᴇ: ᴅᴍ ᴍᴏᴅᴇ ᴏɴ*\nᴠɪᴇᴡ-ᴏɴᴄᴇ ꜰʀᴏᴍ ᴀɴʏ ɢʀᴏᴜᴘ ᴏʀ ᴄʜᴀᴛ ɪꜱ ꜱᴇɴᴛ ᴛᴏ ʏᴏᴜʀ ᴏᴡɴ ᴅᴍ.${linkNote}`);
                if (mode === 'group') return reply(`✔️ *ᴀɴᴛɪᴠɪᴇᴡᴏɴᴄᴇ: ɢʀᴏᴜᴘ ᴍᴏᴅᴇ ᴏɴ*\nᴠɪᴇᴡ-ᴏɴᴄᴇ ɪꜱ ꜱᴇɴᴛ ʙᴀᴄᴋ ɪɴᴛᴏ ᴛʜᴇ ꜱᴀᴍᴇ ᴄʜᴀᴛ.${linkNote}`);
                return reply('✔️ *ᴀɴᴛɪᴠɪᴇᴡᴏɴᴄᴇ: ᴏꜰꜰ*\nʏᴏᴜʀ ᴏᴡɴ ᴠɪᴇᴡ-ᴏɴᴄᴇ ꜱᴀᴠɪɴɢ ɪꜱ ᴏꜰꜰ.');
            }

            const mine = getUserMode(d);
            const modeLabel = mine === 'dm' ? 'ᴅᴍ ᴍᴏᴅᴇ' : mine === 'group' ? 'ɢʀᴏᴜᴘ ᴍᴏᴅᴇ' : 'ᴏꜰꜰ';
            return reply(
                `👁️ *ᴀɴᴛɪᴠɪᴇᴡᴏɴᴄᴇ ꜱᴇᴛᴛɪɴɢꜱ*\n\n` +
                `• ᴍᴇꜱꜱᴀɢᴇ ᴍᴏᴅᴇ: ${mine === 'off' ? '❌' : '✔️'} ${modeLabel}\n` +
                `• ꜱᴛᴀᴛᴜꜱ: ${mine === 'off' ? '❌ ᴏꜰꜰ' : '✔️ ᴏɴ'}` +
                (isOffAll() ? ' ⚠️ (ᴏꜰꜰᴀʟʟ ɪꜱ ᴏɴ)' : '') + `\n\n` +
                `*ᴄᴏᴍᴍᴀɴᴅꜱ:*\n` +
                `• .antiviewonce dm\n` +
                `• .antiviewonce group\n` +
                `• .antiviewonce off\n` +
                `• .antiviewonce offall  _(owner/mod)_\n` +
                `• .antiviewonce onall  _(owner/mod)_`
            );
        }
    },

    // restart the Android-identity saver and get a fresh pairing code/QR for whoever asks
    {
        command: ['vvlink'],
        alias: ['vvrelink'],
        category: 'owner',
        description: 'Restart the view-once saver and send a fresh pairing code/QR to your DM',
        async execute(m, { reply, isOwner, isSudo, isModerator, args = [] }) {
            if (!isAuthorized(m, { isOwner, isSudo, isModerator })) return reply('Only the owner, a sudo or a moderator can use this command.');
            if (global.__vvAndroidPatched) return reply('ℹ️ The main bot is already logged in with the Android identity (vvpatch.cjs) — there is no separate device to link.');
            const d = callerDigits(m);
            const link = (args[0] || '').toLowerCase();   // .vvlink qr | .vvlink code
            if (!global.__vvSaver) { global.__vvSaverEnsure?.(d); return reply('🔗 Starting the view-once saver — a pairing code will arrive in your DM in a few seconds.'); }
            global.__vvSaver.restart({ link: link === 'qr' || link === 'code' ? link : undefined, requesterDigits: d });
            const how = global.__vvSaver.linkMode === 'qr' ? 'A QR code image' : 'A pairing code';
            return reply(global.__vvSaver.ready ? '🔄 Restarting the view-once saver…' : `🔄 Restarting the view-once saver. ${how} will arrive in your DM in a few seconds.`);
        }
    }
];
