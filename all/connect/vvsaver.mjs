// all/connect/vvsaver.mjs — view-once saver that runs INSIDE your bot (started by messages.js)
//
// Why it exists: WhatsApp only hands view-once media to a linked device that connects with the
// Android identity. The bot's own connection can't be changed (its connection file is encrypted),
// so this file opens a SECOND connection to the same WhatsApp account with the Android identity.
// messages.js starts it automatically, relays the pairing code to your DM, and controls dm/group/off.
//
// Uses OWNER_NUMBER from your .env. Session is saved in ./vv-auth (bot root).

import * as baileys from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'node:path';

const makeWASocket = baileys.default?.default || baileys.default || baileys.makeWASocket;
const { useMultiFileAuthState, DisconnectReason, Browsers, downloadMediaMessage,
        downloadContentFromMessage, fetchLatestBaileysVersion } = baileys;

const tell = (msg) => { try { process.send?.(msg); } catch { /* parent gone */ } };
const firstNumber = (v) => {
    for (const part of String(v || '').split(/[,;]+/)) {
        const tokens = part.trim().split(/\s+/).filter(Boolean);
        const many = tokens.length > 1 && tokens.every((t) => t.replace(/\D/g, '').length >= 10);
        const d = (many ? tokens[0] : part).replace(/\D/g, '');
        if (d) return d;
    }
    return '';
};

const PHONE = firstNumber(process.env.VV_PHONE || process.env.OWNER_NUMBER);
const OWNER = firstNumber(process.env.VV_OWNER || process.env.OWNER_NUMBER) || PHONE;
const AUTH_DIR = process.env.VV_AUTH_DIR || path.join(process.cwd(), 'vv-auth');

if (!PHONE) { tell({ type: 'fatal', text: 'OWNER_NUMBER is not set in .env, so the view-once saver cannot start.' }); process.exit(3); }
if (!Browsers?.android) { tell({ type: 'fatal', text: 'The installed Baileys has no Browsers.android. Update it (npm i @whiskeysockets/baileys@latest) and restart the bot.' }); process.exit(3); }

const logger = pino({ level: 'silent' });
const ownerJid = `${OWNER}@s.whatsapp.net`; // fallback destination for unrouted error reports only
const store = new Map();   // id -> message
const done = new Set();    // view-once ids already forwarded
let offAll = false;        // owner/mod-only kill switch (pushed by messages.js)
let users = [];            // [{ jid, mode: 'dm' | 'group' }] — per-user routing table
let pairAttempts = 0;
const LINK_MODE = String(process.env.VV_LINK || 'code').toLowerCase() === 'qr' ? 'qr' : 'code';
const MAX_PAIR_ATTEMPTS = LINK_MODE === 'qr' ? 12 : 5;   // QR frames / pairing codes before giving up

// QR mode needs the small "qrcode" package (not part of the bot by default)
let QRCode = null;
if (LINK_MODE === 'qr') {
    try { QRCode = (await import('qrcode')).default; }
    catch {
        tell({ type: 'fatal', text: 'QR linking needs the "qrcode" package. Add "qrcode": "latest" to package.json (or run npm i qrcode) and restart, or remove VV_LINK=qr to link with a pairing code instead.' });
        process.exit(3);
    }
}

process.on('message', (m) => {
    if (m?.type !== 'config') return;
    offAll = !!m.offAll;
    users = Array.isArray(m.users) ? m.users.filter((u) => u?.jid && (u.mode === 'dm' || u.mode === 'group')) : [];
});

const digits = (j) => String(j || '').split(':')[0].split('@')[0].replace(/\D/g, '');
// BUG FIX: start() runs again every time the socket reconnects — including the normal
// "restart required" (515) reconnect WhatsApp triggers right after you enter a pairing code.
// The old code re-requested a brand-new code on every one of those reconnects, which silently
// invalidated the code already shown to you before you could finish typing it in — that's why
// linking kept saying "Couldn't connect" and the code seemed to "drop" almost immediately.
// A pairing code must be requested exactly ONCE per link attempt; these flags live at module
// level (not inside start()) so they survive every reconnect within this one process, and only
// reset when .vvlink forks a brand-new process.
let pairingRequested = false;
let pairingDeadline = 0;               // wall-clock giveup, NOT an attempt counter
const PAIRING_TIMEOUT_MS = 3 * 60 * 1000;
const groupNameCache = new Map();
async function groupName(sock, chat) {
    if (!String(chat).endsWith('@g.us')) return null;
    if (groupNameCache.has(chat)) return groupNameCache.get(chat);
    try {
        const meta = await sock.groupMetadata(chat);
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
async function buildHeader(sock, mek, kind) {
    const chat = mek.key.remoteJid;
    const isGroup = chat.endsWith('@g.us');
    const sender = mek.key.participant || chat;
    const senderTag = `@${digits(mek.key.participantAlt || sender)}`;
    const place = isGroup ? (await groupName(sock, chat)) : 'Direct Message';
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
const isViewOnce = (raw = {}) => {
    if (raw.viewOnceMessage || raw.viewOnceMessageV2 || raw.viewOnceMessageV2Extension) return true;
    const m = unwrap(raw);
    return m.imageMessage?.viewOnce === true || m.videoMessage?.viewOnce === true || m.audioMessage?.viewOnce === true;
};
const describe = (m) =>
    m.imageMessage ? { kind: 'image', node: m.imageMessage } :
    m.videoMessage ? { kind: 'video', node: m.videoMessage } :
    m.audioMessage ? { kind: 'audio', node: m.audioMessage } : null;

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({}));

    const sock = makeWASocket({
        ...(version ? { version } : {}),
        logger,
        auth: state,
        printQRInTerminal: false,
        // web identity only while pairing (Android breaks pairing codes), Android once registered
        browser: state.creds.registered ? Browsers.android('13') : ['Ubuntu', 'Chrome', '20.0.04'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        getMessage: async (key) => store.get(key.id)
    });

    sock.ev.on('creds.update', saveCreds);

    if (!state.creds.registered && LINK_MODE === 'code' && !pairingRequested) {
        pairingRequested = true;                         // never request a second code while this one is still live
        if (!pairingDeadline) pairingDeadline = Date.now() + PAIRING_TIMEOUT_MS;
        setTimeout(async () => {
            try {
                pairAttempts++;
                const code = await sock.requestPairingCode(PHONE);
                tell({ type: 'pairing', code, attempt: pairAttempts });
            } catch (e) {
                pairingRequested = false;                // the request itself failed — safe to try again on the next reconnect
                tell({ type: 'status', text: `Could not get a pairing code: ${e?.message || e}` });
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr && LINK_MODE === 'qr' && !state.creds.registered) {
            pairAttempts++;
            try {
                const png = await QRCode.toBuffer(qr, { width: 512, margin: 2 });
                console.log('\nScan this QR: WhatsApp > Linked devices > Link a device\n' + await QRCode.toString(qr, { type: 'terminal', small: true }));
                tell({ type: 'qr', png: png.toString('base64'), attempt: pairAttempts });
            } catch (e) { tell({ type: 'status', text: `Could not draw the QR: ${e?.message || e}` }); }
        }
        if (connection === 'open') tell({ type: 'ready' });
        if (connection === 'close') {
            tell({ type: 'notready' });
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code === DisconnectReason.loggedOut) {
                tell({ type: 'status', text: 'The view-once saver device was logged out. Delete the vv-auth folder and send .vvlink to link it again.' });
                process.exit(4);
            }
            // give up on WALL-CLOCK time, not reconnect count — the normal pairing dance reconnects
            // the socket itself (that's expected and must NOT burn through a retry budget)
            if (!state.creds.registered && LINK_MODE === 'code' && pairingDeadline && Date.now() > pairingDeadline) {
                tell({ type: 'status', text: 'Linking timed out (the code was never entered in time). Send .vvlink for a fresh code.' });
                process.exit(4);
            }
            if (!state.creds.registered && LINK_MODE === 'qr' && pairAttempts >= MAX_PAIR_ATTEMPTS) {
                tell({ type: 'status', text: 'Linking timed out. Send .vvlink for a fresh QR.' });
                process.exit(4);
            }
            setTimeout(start, 2000);   // also covers the restart WhatsApp asks for right after you enter the code
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const mek of messages || []) {
            try {
                if (!mek?.key || mek.key.remoteJid === 'status@broadcast' || String(mek.key.remoteJid).endsWith('@newsletter')) continue;
                if (!mek.message) continue; // placeholder with no content — nothing to save, nothing to log
                store.set(mek.key.id, mek.message);
                if (store.size > 1500) store.delete(store.keys().next().value);

                if (mek.key.fromMe || !isViewOnce(mek.message) || done.has(mek.key.id)) continue;
                done.add(mek.key.id);
                if (done.size > 1000) done.delete(done.values().next().value);

                const inner = unwrap(mek.message);
                const d = describe(inner);
                if (!d) continue; // a view-once in a type this saver doesn't handle

                const chat0 = mek.key.remoteJid;
                const dests = new Set();
                if (!offAll) {
                    for (const u of users) {
                        if (u.mode === 'dm') dests.add(u.jid);
                        else if (u.mode === 'group') dests.add(chat0);
                    }
                }
                if (!dests.size) continue; // nobody has it on right now

                let buffer;
                try {
                    buffer = await downloadMediaMessage({ key: mek.key, message: inner }, 'buffer', {},
                        { logger, reuploadRequest: sock.updateMediaMessage });
                } catch {
                    const stream = await downloadContentFromMessage(d.node, d.kind);
                    const chunks = []; for await (const c of stream) chunks.push(c);
                    buffer = Buffer.concat(chunks);
                }
                if (!buffer?.length) throw new Error('empty download');

                const { text: header, sender } = await buildHeader(sock, mek, d.kind);
                const caption = d.node.caption ? `${header}\n\n${d.node.caption}` : header;

                for (const dest of dests) {
                    try {
                        if (d.kind === 'image') await sock.sendMessage(dest, { image: buffer, caption, mimetype: d.node.mimetype || 'image/jpeg', mentions: [sender] });
                        else if (d.kind === 'video') await sock.sendMessage(dest, { video: buffer, caption, mimetype: d.node.mimetype || 'video/mp4', mentions: [sender] });
                        else {
                            await sock.sendMessage(dest, { audio: buffer, mimetype: d.node.mimetype || 'audio/ogg; codecs=opus', ptt: !!d.node.ptt });
                            await sock.sendMessage(dest, { text: header, mentions: [sender] });
                        }
                        tell({ type: 'sent', kind: d.kind, bytes: buffer.length, from: digits(sender), to: digits(dest) });
                    } catch (e) {
                        tell({ type: 'failed', text: `Could not deliver a view-once to ${digits(dest)}: ${e?.message || e}` });
                    }
                }
            } catch (e) {
                tell({ type: 'failed', text: `Could not save a view-once (reported to ${digits(ownerJid)}): ${e?.message || e}` });
            }
        }
    });
}

start().catch((e) => { tell({ type: 'fatal', text: `View-once saver crashed on start: ${e?.message || e}` }); process.exit(1); });
