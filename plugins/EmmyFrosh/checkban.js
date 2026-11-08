// =====================================================
// 🔎 CHECKBAN  (plugins/EmmyFrosh/checkban.js)
// =====================================================
// .checkban 2349012345678
// .checkban 09012345678 09098765432      (up to 5 numbers, spaces / commas / new lines)
// or tag / reply to a person
//
// Uses the baron0.com ban-check API:
//     POST https://baron0.com/api/v2/check
//     Authorization: Bearer <your key>
//     { "number": "+2349012345678" }
//
// SET YOUR KEY AS AN ENVIRONMENT VARIABLE on your host (Katabump / Render):
//     BARON_API_KEY = bk_v1_...
//
// Or, if you prefer, paste your NEW key into HARDCODED_KEY below.
// Never share this file or upload it to GitHub if you do that.
//
// If baron0 can't be reached, the bot falls back to checking whether the number is
// registered on WhatsApp, and says clearly that this is only the fallback.
// =====================================================

const axios = require('axios');

const API_URL       = process.env.BARON_API_URL || 'https://baron0.com/api/v2/check';
const HARDCODED_KEY = '';            // optional: 'bk_v1_...' (use your NEW key)
const MAX_NUMBERS   = 5;
const FOOTER        = '> 𝛯𝛭𝛭𝑌𝐹𝑅𝛩𝑆𝛨 💔';

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// 0803... -> 234803... (Nigeria), otherwise digits only
function normalize(raw) {
  let n = String(raw || '').replace(/[^0-9]/g, '');
  if (/^0\d{10}$/.test(n)) n = '234' + n.slice(1);
  return /^\d{7,15}$/.test(n) ? n : null;
}

// ── call baron0 ────────────────────────────────────────
async function baronCheck(number) {
  const key = process.env.BARON_API_KEY || HARDCODED_KEY;
  if (!key) return { ok: false, reason: 'no_key' };

  try {
    const res = await axios.post(API_URL, { number: `+${number}` }, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 25000,
      validateStatus: () => true
    });
    if (res.status === 401) return { ok: false, reason: 'bad_key' };
    if (res.status === 403) return { ok: false, reason: 'denied' };
    if (res.status === 429) return { ok: false, reason: 'rate' };
    if (res.status >= 400)  return { ok: false, reason: 'http', status: res.status, data: res.data };
    return { ok: true, data: res.data };
  } catch (e) {
    return { ok: false, reason: 'network', message: e.message };
  }
}

// ── understand whatever shape the answer has ───────────
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

function flatten(obj, out = {}, prefix = '') {
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== 'object') { out[prefix || 'value'] = obj; return out; }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, out, key);
    else out[key] = v;
  }
  return out;
}

function interpret(data) {
  if (typeof data === 'string') data = safeJson(data) || { message: data };
  const flat = flatten(data);
  const text = Object.entries(flat).map(([k, v]) => `${k} ${v}`).join(' ').toLowerCase();

  // explicit booleans first
  for (const [k, v] of Object.entries(flat)) {
    const key = k.toLowerCase();
    if (/(^|\.)(is_?)?banned$/.test(key) && typeof v === 'boolean') return v ? 'banned' : 'ok';
    if (/(^|\.)(is_?)?(active|registered|exists)$/.test(key) && v === false) return 'none';
  }
  if (/not\s*(registered|on whatsapp|found)|invalid number|does not exist/.test(text)) return 'none';
  if (/temporar|temp[_ -]?ban|restrict|limited|cooldown|review/.test(text)) return 'temp';
  if (/not\s*banned|unbanned|no\s*ban|clean|\bok\b|\bactive\b|working|normal/.test(text)) return 'ok';
  if (/perm|banned|blocked|suspended/.test(text)) return 'banned';
  return 'unknown';
}

// a short list of the useful details baron0 sent (so you can always see the real answer)
function details(data) {
  if (typeof data === 'string') data = safeJson(data) || { message: data };
  const flat = flatten(data);
  const skip = /token|key|secret|cookie|authorization|turnstile|signature/i;
  return Object.entries(flat)
    .filter(([k, v]) => v !== '' && v !== null && !skip.test(k) && String(v).length <= 120)
    .slice(0, 8)
    .map(([k, v]) => `   • ${k}: ${v}`)
    .join('\n');
}

// ── fallback: is the number registered on WhatsApp? ────
async function waRegistered(ednut, number) {
  try {
    const [info] = await withTimeout(ednut.onWhatsApp(`${number}@s.whatsapp.net`), 10000);
    return info && info.exists ? 'active' : 'none';
  } catch { return 'error'; }
}

// ── small-caps text (ᴀʙᴄ…) ─────────────────────────────
const SC = {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'};
const sc = (s) => String(s).toLowerCase().replace(/[a-z]/g, c => SC[c]);

// ── the Emmy box ───────────────────────────────────────
function box(rows, resultIcon, result) {
  const lines = rows.map(([icon, label, val]) => `│ ${icon} *${sc(label)}*: ${sc(val)}`).join('\n');
  return `╭──❏〘 *${sc('Emmy check ban')}* 〙❒\n│\n${lines}\n│\n│ ${resultIcon} *${sc('Result')}*: ${sc(result)}\n╰────────────╯`;
}

// ── build one result block ─────────────────────────────
async function checkOne(ednut, number) {
  const r = await baronCheck(number);
  const num = ['📱', 'Number', `_+${number}_`];

  if (r.ok) {
    const state = interpret(r.data);

    if (state === 'ok') return box([num,
      ['🟢', 'Status', 'Active'],
      ['✅', 'Banned', 'False'],
      ['🔓', 'Account', 'Working']
    ], '✅', 'No ban detected');

    if (state === 'banned') return box([num,
      ['🔴', 'Status', 'Banned'],
      ['🚫', 'Banned', 'True'],
      ['🔒', 'Account', 'Restricted']
    ], '❌', 'Ban detected');

    if (state === 'temp') return box([num,
      ['🟠', 'Status', 'Limited'],
      ['⏳', 'Banned', 'Temporary'],
      ['🔒', 'Account', 'Restricted']
    ], '⚠️', 'Temporary restriction');

    if (state === 'none') return box([num,
      ['⚪', 'Status', 'Not found'],
      ['❓', 'Account', 'Not registered']
    ], '❌', 'Not on WhatsApp');

    return box([num,
      ['🟡', 'Status', 'Unknown'],
      ['❔', 'Account', 'Could not tell']
    ], '⚠️', 'Unclear answer') + `\n${details(r.data)}`;
  }

  // baron0 failed: say why, then use the WhatsApp registration check
  const why = {
    no_key:  'API key not set',
    bad_key: 'API key refused (401)',
    denied:  'Request refused (403)',
    rate:    'Too many requests (429)',
    http:    `Server error (HTTP ${r.status})`,
    network: 'Could not reach baron0'
  }[r.reason] || 'baron0 did not answer';

  const wa = await waRegistered(ednut, number);
  const status = wa === 'active' ? ['🟡', 'Status', 'Registered (not verified)']
               : wa === 'none'   ? ['⚪', 'Status', 'Not on WhatsApp']
               :                   ['🟡', 'Status', 'Could not check'];

  return box([num, status, ['⚠️', 'Issue', why]], '⚠️', 'Fallback only');
}

module.exports = [
  {
    command: ['checkban'],
    alias: ['bancheck', 'isbanned', 'checknumber'],
    category: 'tools',
    description: 'Check if a WhatsApp number is banned (baron0 ban checker)',
    use: '.checkban 2349012345678',

    async execute(m, { ednut, text, reply }) {
      let raws = String(text || '').split(/[\s,;\n]+/).filter(Boolean);
      if (!raws.length) {
        const who = (Array.isArray(m.mentionedJid) && m.mentionedJid[0]) || m.quoted?.sender;
        if (who && !String(who).endsWith('@lid')) raws = [String(who).split('@')[0].split(':')[0]];
      }
      if (!raws.length) {
        return reply('🔎 *Check ban*\n\nSend a number:\n`.checkban 2349012345678`\n`.checkban 09012345678 09098765432`');
      }

      const numbers = [];
      const invalid = [];
      for (const r of raws) {
        const n = normalize(r);
        if (!n) invalid.push(r);
        else if (!numbers.includes(n)) numbers.push(n);
      }
      if (!numbers.length) return reply('❎ Those are not valid phone numbers. Use the country code, e.g. *2349012345678*.');
      if (numbers.length > MAX_NUMBERS) return reply(`❎ Please check at most *${MAX_NUMBERS}* numbers at a time.`);

      await reply(`🔎 Checking ${numbers.length} number${numbers.length > 1 ? 's' : ''}…`);

      const blocks = [];
      for (let i = 0; i < numbers.length; i++) {
        blocks.push(await checkOne(ednut, numbers[i]));
        if (i < numbers.length - 1) await new Promise(r => setTimeout(r, 1500));   // go gently
      }
      if (invalid.length) blocks.push(`🚫 Ignored (not a valid number): ${invalid.join(', ')}`);

      return reply(`${blocks.join('\n\n')}\n\n${FOOTER}`);
    }
  }
];