'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const util = require('util');

// ==========================================
// .ff <command>   (aliases: .findcmd  .where)
// Finds a command and tells you which file it is in.
//
//   .ff thunder     ->  file, line, category, other commands in that file
//   .ff thun        ->  not exact? shows the closest matches
//   (or reply to a message that has the command name)
//
// It also tells you the ERROR:
//   - a syntax error in the file (with line number + the bad line)
//   - the last runtime errors the bot printed for that command
//   - the real reason if .ff itself fails
//   .file thunder  ->  SENDS you the file that has that command
// Both commands work for the OWNER and MODS only (see STAFF_ONLY / OWNERS / MODS below).
// It only READS your plugin files as text (nothing is run), so it is safe.
// It searches the folder this file is in, plus ./plugins ./commands ./cmds
// ./lib ./src (if they exist) from where the bot was started.
// ==========================================

// ---- who may use .ff and .file: OWNER and MODS only ----
const STAFF_ONLY = true;                 // false = everyone can use them
// Numbers (digits only, with country code) that are always allowed. Fill these in
// if your bot does not tell commands who the owner / mods are:
const OWNERS = [];                       // e.g. ['2348012345678']
const MODS = [];                         // e.g. ['2349011112222']
const MAX_FILE = 3 * 1024 * 1024;                      // skip files bigger than 3 MB
const SKIP_DIR = new Set(['node_modules', '.git', 'session', 'sessions', 'auth', 'tmp', 'temp', 'logs', '.cache']);

function roots() {
  const cand = [__dirname, ...['plugins', 'commands', 'cmds', 'lib', 'src'].map((d) => path.join(process.cwd(), d))];
  const seen = new Set(), out = [];
  for (const c of cand) {
    try {
      const r = fs.realpathSync(c);
      if (fs.statSync(r).isDirectory() && !seen.has(r)) { seen.add(r); out.push(r); }
    } catch {}
  }
  // drop folders that are inside another searched folder
  return out.filter((a) => !out.some((b) => b !== a && a.startsWith(b + path.sep)));
}

function walk(dir, files, depth = 0) {
  if (depth > 6) return;
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of list) {
    if (e.name.startsWith('.') && e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name.toLowerCase())) walk(p, files, depth + 1); }
    else if (/\.(js|cjs|mjs)$/i.test(e.name)) files.push(p);
  }
}

const digits = (v) => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const numList = (v) => (Array.isArray(v) ? v : v ? [v] : []).flat(2).map(digits).filter(Boolean);

function isStaff(m, ctx) {
  if (!STAFF_ONLY) return true;
  // 1) flags the bot may pass to commands
  const flags = ['isOwner', 'isCreator', 'isOwn', 'isCreater', 'isMod', 'isMods', 'isModerator'];
  if (flags.some((f) => ctx[f] === true || m[f] === true)) return true;
  if (m.fromMe || (m.key && m.key.fromMe)) return true;           // the bot's own number
  // 2) number lists (this file + common globals)
  const sender = digits(m.sender || (m.key && (m.key.participant || m.key.remoteJid)) || ctx.sender);
  if (!sender) return false;
  const g = global;
  const all = new Set([
    ...numList(OWNERS), ...numList(MODS),
    ...numList(g.owner), ...numList(g.owners), ...numList(g.ownerNumber), ...numList(g.creator),
    ...numList(g.mods), ...numList(g.mod), ...numList(g.moderators), ...numList(g.modNumbers),
    ...numList(ctx.owner), ...numList(ctx.mods), ...numList(ctx.moderators),
  ]);
  return all.has(sender);
}
const DENY = '❌ Only the *owner* and *mods* can use this command.';

// ---- remember the last errors the bot prints (so .ff can show them) ----
const RECENT = (global.__ffRecentErrors = global.__ffRecentErrors || []);
if (!console.error.__ff) {
  const orig = console.error;
  console.error = function (...a) {
    try {
      RECENT.push({ t: Date.now(), msg: util.format(...a).slice(0, 600) });
      if (RECENT.length > 60) RECENT.shift();
    } catch {}
    return orig.apply(this, a);
  };
  console.error.__ff = true;
}

// ---- syntax check without running the file ----
function syntaxError(file) {
  if (/\.mjs$/i.test(file)) return null;
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch (e) { return { msg: 'cannot read file: ' + e.message, line: 0, code: '' }; }
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  src = src.replace(/^#!.*/, '');
  try {
    new vm.Script('(function (exports, require, module, __filename, __dirname) {' + src + '\n})', { filename: file });
    return null;
  } catch (e) {
    if (/import statement|export|await is only valid/i.test(e.message)) return null;   // ES-module style, not a real error
    const m = String(e.stack || '').match(/:(\d+)\n/);
    const line = m ? Number(m[1]) : 0;
    const code = line ? (src.split('\n')[line - 1] || '').trim().slice(0, 90) : '';
    return { msg: e.message, line, code };
  }
}

function recentFor(names, file) {
  const base = path.basename(file).toLowerCase();
  const keys = [...names.map((n) => '[' + n + ']'), base];
  return RECENT.filter((r) => keys.some((k) => r.msg.toLowerCase().includes(k))).slice(-3);
}

const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 90 ? s + 's ago' : s < 5400 ? Math.round(s / 60) + 'm ago' : Math.round(s / 3600) + 'h ago'; };

const clean = (s) => String(s).trim().replace(/^[.!#\/\\$&+\-,;:*?^~]+/, '').toLowerCase();
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// read every command / alias name written in one file
function scan(file) {
  let text;
  try {
    if (fs.statSync(file).size > MAX_FILE) return null;
    text = fs.readFileSync(file, 'utf8');
  } catch { return null; }
  const found = [];       // { name, kind, line }
  const re = /\b(command|alias|aliases|cmd|cmds|pattern)\s*:\s*(\[[^\]]*\]|'[^'\n]*'|"[^"\n]*"|`[^`\n]*`)/g;
  let m;
  while ((m = re.exec(text))) {
    const kind = m[1].toLowerCase().startsWith('alias') ? 'alias' : 'command';
    const line = lineOf(text, m.index);
    const strRe = /['"`]([^'"`\n]+)['"`]/g;
    let s;
    while ((s = strRe.exec(m[2]))) {
      const name = clean(s[1].replace(/[\^$()?|\\]/g, ''));
      if (name && name.length <= 40) found.push({ name, kind, line });
    }
  }
  if (!found.length) return null;
  const cat = (text.match(/\bcategory\s*:\s*['"`]([^'"`\n]+)['"`]/) || [])[1] || '';
  const desc = (text.match(/\bdescription\s*:\s*['"`]([^'"`\n]+)['"`]/) || [])[1] || '';
  return { file, found, cat, desc };
}

function similar(a, b) {            // simple closeness score 0..1
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.8;
  let i = 0; for (const ch of a) { const j = b.indexOf(ch, i); if (j >= 0) i = j + 1; }
  return i === a.length ? 0.5 : 0;
}

function search(q) {
  const files = [];
  const rts = roots();
  for (const r of rts) walk(r, files);
  const base = process.cwd();
  const exact = [], close = [];
  for (const f of [...new Set(files)]) {
    const info = scan(f);
    if (!info) continue;
    const rel = path.relative(base, f) || path.basename(f);
    const names = [...new Set(info.found.map((x) => x.name))];
    const hit = info.found.find((x) => x.name === q);
    if (hit) { exact.push({ rel, info, hit, names, file: f }); continue; }
    let best = 0, bestName = '';
    for (const n of names) { const sc = similar(q, n); if (sc > best) { best = sc; bestName = n; } }
    if (best >= 0.5) close.push({ rel, info, bestName, best });
  }
  close.sort((a, b) => b.best - a.best);
  return { exact, close, scanned: files.length, rts };
}

module.exports = [
  {
    command: ['ff'],
    alias: ['findcmd', 'where'],
    description: 'Find a command and show which file it is in',
    category: 'Tools',
    use: '<command name>',
    filename: __filename,

    async execute(m, ctx) {
      const { q, text, reply, prefix } = ctx;
      try {
        if (!isStaff(m, ctx)) return await reply(DENY);
        const p = prefix || '.';
        let raw = typeof text === 'string' && text.trim() ? text : Array.isArray(q) ? q.join(' ') : String(q || '');
        if (!raw.trim() && m.quoted && m.quoted !== m) raw = m.quoted.text || m.quoted.body || '';
        const name = clean(raw.split(/\s+/)[0] || '');
        if (!name) return await reply(`Tell me the command to find.\nExample: ${p}ff thunder`);

        const { exact, close, scanned } = search(name);

        if (exact.length) {
          const out = [`🔎 *${p}${name}* found in ${exact.length} file${exact.length > 1 ? 's' : ''}:`];
          for (const e of exact) {
            const others = e.names.filter((n) => n !== name).slice(0, 8);
            out.push('',
              `📁 *${e.rel}*`,
              `📍 line ${e.hit.line} (${e.hit.kind})`,
              ...(e.info.cat ? [`🏷️ category: ${e.info.cat}`] : []),
              ...(e.info.desc ? [`📝 ${e.info.desc}`] : []),
              ...(others.length ? [`🔗 same file: ${others.map((n) => p + n).join('  ')}`] : []));

            const se = syntaxError(e.file);
            if (se) {
              out.push('', '🚨 *ERROR in this file:*', `${se.msg}`, ...(se.line ? [`at line ${se.line}${se.code ? ': ' + se.code : ''}`] : []));
            } else {
              out.push('', '✅ no syntax error in the file');
            }
            const rec = recentFor(e.names, e.file);
            if (rec.length) {
              out.push('', '⚠️ *last errors from the bot:*');
              for (const r of rec) out.push(`• (${ago(r.t)}) ${r.msg.split('\n')[0].slice(0, 220)}`);
            }
          }
          return await reply(out.join('\n'));
        }

        if (close.length) {
          const out = [`❌ No command called *${p}${name}*.`, '', 'Did you mean:'];
          for (const c of close.slice(0, 5)) out.push(`• ${p}${c.bestName}  →  ${c.rel}`);
          return await reply(out.join('\n'));
        }

        return await reply(`❌ I could not find *${p}${name}* (looked in ${scanned} files).`);
      } catch (e) {
        console.error('[ff]', e);
        await reply('❌ .ff failed:\n' + String((e && e.stack) || e).split('\n').slice(0, 4).join('\n').slice(0, 500));
      }
    },
  },
  {
    command: ['file'],
    alias: ['getfile', 'sendfile'],
    description: 'Send the plugin file that has a command',
    category: 'Tools',
    use: '<command name>',
    filename: __filename,

    async execute(m, ctx) {
      const { ednut, q, text, reply, prefix } = ctx;
      try {
        const p = prefix || '.';
        if (!isStaff(m, ctx)) return await reply(DENY);

        let raw = typeof text === 'string' && text.trim() ? text : Array.isArray(q) ? q.join(' ') : String(q || '');
        if (!raw.trim() && m.quoted && m.quoted !== m) raw = m.quoted.text || m.quoted.body || '';
        const name = clean(raw.split(/\s+/)[0] || '');
        if (!name) return await reply(`Tell me the command.\nExample: ${p}file thunder`);

        const { exact, close } = search(name);
        if (!exact.length) {
          if (close.length) {
            return await reply(`❌ No command called *${p}${name}*.\n\nDid you mean:\n` + close.slice(0, 5).map((c) => `• ${p}${c.bestName}  →  ${c.rel}`).join('\n'));
          }
          return await reply(`❌ I could not find *${p}${name}*.`);
        }

        const list = exact.slice(0, 3);
        for (const e of list) {
          const buf = fs.readFileSync(e.file);
          await ednut.sendMessage(
            m.chat,
            {
              document: buf,
              fileName: path.basename(e.file),
              mimetype: 'application/javascript',
              caption: `📁 *${e.rel}*\n📍 ${p}${name} is on line ${e.hit.line}`,
            },
            { quoted: m }
          );
        }
        if (exact.length > list.length) await reply(`(${exact.length} files have this command, sent the first ${list.length})`);
      } catch (e) {
        console.error('[file]', e);
        await reply('❌ Could not send the file:\n' + String((e && e.message) || e).slice(0, 300));
      }
    },
  },
];

// only for testing
module.exports.__test = { search, scan, clean };