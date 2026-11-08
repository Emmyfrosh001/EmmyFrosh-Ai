// =====================================================
// 🔗 WORD CHAIN GAME (WCG) - v4.8
// =====================================================
// v4.8:
//  - Wrong answers are detected faster (instant local reject + 2s API timeout)
//  - ❌ reaction + wrong message are sent together (no waiting)
//  - Random first player (Fisher-Yates shuffle + random start index)
// v4.7:
//  - Correct answer = ✅ react only (no "accepted" message)
//  - Faster word check (both APIs in parallel + cache)
//  - Random start letter from full A-Z
//  - Min letters grows up to 10
//  - Profile picture fetch has a 2s limit
// v4.6:
//  - Bot joins ONLY if botNumber itself types "join"
//  - When bot types "join", owner is auto-added alongside bot
//  - Owner is auto-added only if not already in the lobby
// =====================================================

const axios = require('axios');

if (!global.wcgGames) global.wcgGames = {};

const JOIN_WINDOW  = 30_000;
const TURN_TIME    = 30_000;
const WARN_AT      = 20_000;
const MIN_PLAYERS  = 2;
const FALLBACK_PIC = 'https://telegra.ph/file/a059a6a734ed202c879d3.jpg';
const MEDALS       = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

// ── Strip everything except digits for JID comparison ──
function numOnly(jid) {
  return (jid || '').replace(/[^0-9]/g, '');
}

// ── Ensure JID always has @s.whatsapp.net suffix ──
function normalizeJid(jid) {
  if (!jid) return '';
  if (jid.includes('@')) return jid;
  return jid + '@s.whatsapp.net';
}

function jidTag(jid) {
  return (jid || '').split('@')[0];
}

// ── Every id WhatsApp may give for the same person (phone jid, @lid, alt fields) ──
function collectIds(m) {
  const k = m?.key || {};
  const raw = [m?.sender, k.participant, k.participantAlt, k.participantPn, k.senderPn, m?.participant];
  return [...new Set(raw.filter(Boolean).map(String))];
}

// The jid we tag/show: prefer the real phone-number jid
function bestJid(m) {
  const ids = collectIds(m);
  return normalizeJid(ids.find(j => j.endsWith('@s.whatsapp.net')) || m?.sender || ids[0] || '');
}

function whoIs(m) {
  const keys = new Set();
  for (const id of collectIds(m)) {
    keys.add(id);
    const d = numOnly(String(id).split('@')[0].split(':')[0]);
    if (d) keys.add(d);
  }
  return { jid: bestJid(m), keys };
}

function playerKeys(p) {
  const keys = new Set(p.keys || []);
  const d = numOnly(p.jid);
  if (d) keys.add(d);
  if (p.jid) keys.add(p.jid);
  return keys;
}

function sameUser(p, who) {
  const pk = playerKeys(p);
  return [...who.keys].some(k => pk.has(k));
}

// Starts at 4 letters, +1 every 3 rounds, max 10
function getMinLetters(round) {
  return Math.min(4 + Math.floor((round - 1) / 3), 10);
}

// Random letter from the full alphabet A-Z
function randomLetter() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return letters[Math.floor(Math.random() * letters.length)];
}

// Proper random shuffle (Fisher-Yates)
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Profile picture with a 2s limit so turns are never slowed down
async function getPP(conn, jid) {
  try {
    return await Promise.race([
      conn.profilePictureUrl(jid, 'image'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))
    ]);
  } catch {
    return FALLBACK_PIC;
  }
}

function stopTimers(g) {
  clearTimeout(g.timer);
  clearTimeout(g.warnTimer);
  clearTimeout(g.startTimer);
}

function cleanGame(chatId) {
  const g = global.wcgGames[chatId];
  if (!g) return;
  stopTimers(g);
  delete global.wcgGames[chatId];
}

// ── Fast dictionary check ──
// 1) Instant local reject for obvious gibberish (no API call)
// 2) Both APIs in parallel, first valid wins
// 3) Results cached (valid AND invalid)
const wordCache = new Map();

async function isValidWord(word) {
  const clean = word.toLowerCase().trim();
  if (wordCache.has(clean)) return wordCache.get(clean);

  // ⚡ Instant reject: no vowels at all, or same letter 3+ times in a row
  if (!/[aeiouy]/.test(clean) || /(.)\1\1/.test(clean)) {
    const r = { valid: false, source: 'local' };
    wordCache.set(clean, r);
    return r;
  }

  const checkDict = axios
    .get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`, { timeout: 2000 })
    .then(res => ({ ok: true, valid: Array.isArray(res.data) && res.data.length > 0 }))
    .catch(err => err?.response?.status === 404
      ? { ok: true, valid: false }
      : { ok: false, valid: false });

  const checkMuse = axios
    .get(`https://api.datamuse.com/words?sp=${encodeURIComponent(clean)}&max=3`, { timeout: 2000 })
    .then(res => ({
      ok: true,
      valid: Array.isArray(res.data) && res.data.some(e => e.word?.toLowerCase() === clean)
    }))
    .catch(() => ({ ok: false, valid: false }));

  const result = await new Promise(resolve => {
    let done = 0;
    const results = [];
    const handle = r => {
      results.push(r);
      done++;
      if (r.ok && r.valid) return resolve({ valid: true, source: 'api' }); // first valid wins
      if (done === 2) {
        if (results.some(x => x.ok)) resolve({ valid: false, source: 'api' });
        else resolve({ valid: false, source: 'offline' });
      }
    };
    checkDict.then(handle);
    checkMuse.then(handle);
  });

  if (result.source !== 'offline') wordCache.set(clean, result);
  return result;
}

// ── Show final leaderboard ──
async function showResults(conn, chatId) {
  const g = global.wcgGames[chatId];
  if (!g) return;

  const rankings = [
    ...(g.players || []),
    ...[...(g.eliminated || [])].reverse()
  ];

  const mentions = rankings.map(p => p.jid);
  const lines    = rankings.map((p, i) => {
    const medal = MEDALS[i] || `${i + 1}.`;
    const extra = i === 0 ? ' 🏆 *WINNER!*' : i === 1 ? ' 🎉' : '';
    return `${medal} @${jidTag(p.jid)} — *${p.name}*${extra}`;
  }).join('\n');

  await conn.sendMessage(chatId, {
    text:
      `🏁 *WORD CHAIN GAME — OVER!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 *FINAL STANDINGS*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${lines}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 Rounds played: *${g.round - 1}*\n` +
      `📝 Words used: *${g.usedWords.size}*\n` +
      `👥 Total players: *${(g.allPlayers || []).length}*\n\n` +
      `Thanks for playing WCG! 🎮`,
    mentions
  });
}

// ── Check if only 1 player left ──
async function checkWin(conn, chatId) {
  const g = global.wcgGames[chatId];
  if (!g) return;
  if (g.players.length <= 1) {
    await showResults(conn, chatId);
    cleanGame(chatId);
    return;
  }
  await askNextPlayer(conn, chatId);
}

// ── Ask the current player for their word ──
async function askNextPlayer(conn, chatId) {
  const g = global.wcgGames[chatId];
  if (!g || g.status !== 'active') return;

  clearTimeout(g.timer);
  clearTimeout(g.warnTimer);

  if (g.currentPlayerIndex >= g.players.length) g.currentPlayerIndex = 0;

  const player = g.players[g.currentPlayerIndex];
  if (!player) return checkWin(conn, chatId);

  const minL   = getMinLetters(g.round);
  g.minLetters = minL;

  const ppUrl = await getPP(conn, player.jid);

  await conn.sendMessage(chatId, {
    image:   { url: ppUrl },
    caption:
      `🎮 *WCG — Round ${g.round}*\n\n` +
      `👤 *Player:* @${jidTag(player.jid)}\n` +
      `🔤 *Your word must start with:* *${g.currentLetter}*\n` +
      `📏 *Min letters:* ${minL}\n` +
      `⏳ You have *30 seconds* — reply now!`,
    mentions: [player.jid]
  });

  // 10s warning
  g.warnTimer = setTimeout(async () => {
    const s = global.wcgGames[chatId];
    if (!s || s.status !== 'active') return;
    const cur = s.players[s.currentPlayerIndex];
    if (!cur) return;
    await conn.sendMessage(chatId, {
      text:
        `⚠️ @${jidTag(cur.jid)} — *10 seconds left!*\n` +
        `Send a word starting with *${s.currentLetter}*!`,
      mentions: [cur.jid]
    });
  }, WARN_AT);

  // Timeout = eliminate player (bot, owner, anyone)
  g.timer = setTimeout(async () => {
    const s = global.wcgGames[chatId];
    if (!s || s.status !== 'active') return;
    const cur = s.players[s.currentPlayerIndex];
    if (!cur) return;

    s.eliminated = s.eliminated || [];
    s.eliminated.push({ ...cur });
    s.players.splice(s.currentPlayerIndex, 1);
    if (s.currentPlayerIndex >= s.players.length) s.currentPlayerIndex = 0;

    await conn.sendMessage(chatId, {
      text:
        `⏰ @${jidTag(cur.jid)} *timed out and is eliminated!*\n` +
        `👥 Players remaining: *${s.players.length}*`,
      mentions: [cur.jid]
    });

    await checkWin(conn, chatId);
  }, TURN_TIME);
}

// ── Send ❌ reaction + wrong message together (fast, no waiting) ──
function sendWrong(conn, chatId, m, text, mentions) {
  conn.sendMessage(chatId, { react: { text: '❌', key: m.key } }).catch(() => {});
  conn.sendMessage(chatId, { text, mentions }, { quoted: m }).catch(() => {});
}

// =====================================================
// 🎯 RAW HANDLER
// =====================================================
async function handleWcgRaw(conn, m) {
  const chatId = m.chat;
  const g      = global.wcgGames[chatId];
  if (!g) return false;

  // ── Extract the message text reliably ──
  const raw = (
    m.body ||
    m.text ||
    m.message?.conversation ||
    m.message?.extendedTextMessage?.text ||
    m.message?.imageMessage?.caption ||
    m.message?.videoMessage?.caption ||
    ''
  ).toString().trim();

  if (!raw) return false;

  // Lowercase, strip leading punctuation/prefix chars
  const lower = raw.toLowerCase().replace(/^[.!/\\]+/, '').trim();
  if (!lower) return false;

  // ══════════════════════════════════════════════════
  // QUIT — a player leaves the lobby / game, the others carry on
  // ══════════════════════════════════════════════════
  if (lower === 'quit' || lower === 'quit!' || lower === 'quit.' || lower === 'wcgquit') {
    const whoQ = whoIs(m);
    const at   = g.players.findIndex(p => sameUser(p, whoQ));
    if (at === -1) return false;                       // not a player -> ignore the word "quit"
    const p = g.players[at];

    // still in the lobby: just leave it
    if (g.status === 'waiting') {
      g.players.splice(at, 1);
      await conn.sendMessage(chatId, {
        text: `🚪 @${jidTag(p.jid)} *left the lobby.*\n👥 Players in lobby: *${g.players.length}*`,
        mentions: [p.jid]
      }, { quoted: m });
      return true;
    }

    if (g.status !== 'active') return false;

    const wasTurn = at === g.currentPlayerIndex;
    g.eliminated = g.eliminated || [];
    g.eliminated.push({ ...p, quit: true });
    g.players.splice(at, 1);
    if (at < g.currentPlayerIndex) g.currentPlayerIndex--;
    if (wasTurn) { clearTimeout(g.timer); clearTimeout(g.warnTimer); }
    if (g.currentPlayerIndex >= g.players.length) g.currentPlayerIndex = 0;

    await conn.sendMessage(chatId, {
      text: `🚪 @${jidTag(p.jid)} *quit the game* and is out!\n👥 Players remaining: *${g.players.length}*`,
      mentions: [p.jid]
    }, { quoted: m });

    if (wasTurn || g.players.length <= 1) await checkWin(conn, chatId);   // next player is asked / winner announced
    return true;
  }

  // ══════════════════════════════════════════════════
  // PHASE 1: LOBBY — handle "join"
  // ══════════════════════════════════════════════════
  if (g.status === 'waiting') {
    const isJoin =
      lower === 'join'          ||
      lower === 'join!'         ||
      lower === 'join.'         ||
      lower === 'wcgjoin'       ||
      lower.startsWith('join ') ||
      lower.startsWith('wcgjoin');

    if (!isJoin) return false;

    const who       = whoIs(m);
    const senderJid = who.jid;
    const senderNum = numOnly(senderJid);

    // Already joined?
    const already = g.players.find(p => sameUser(p, who));
    if (already) {
      await conn.sendMessage(chatId, {
        text: `⚠️ @${jidTag(senderJid)} you're already in the lobby!`,
        mentions: [senderJid]
      }, { quoted: m });
      return true;
    }

    const name = m.pushName || m.push_name || jidTag(senderJid);

    // Add the player who typed join
    g.players.push({ jid: senderJid, name, keys: who.keys });

    await conn.sendMessage(chatId, {
      text:
        `✅ @${jidTag(senderJid)} *joined WCG!*\n` +
        `👥 Players in lobby: *${g.players.length}*`,
      mentions: [senderJid]
    }, { quoted: m });

    // If the BOT itself just typed "join", auto-add the owner too
    const botJid = normalizeJid(g.botJid || '');
    const botNum = numOnly(botJid);
    const isBotJoining = botNum && (senderNum === botNum || who.keys.has(botNum));

    if (isBotJoining) {
      const ownerJid = normalizeJid(global.owner || '');
      const ownerNum = numOnly(ownerJid);
      const ownerAlready = ownerJid && g.players.find(p => playerKeys(p).has(ownerNum));

      if (ownerJid && !ownerAlready) {
        const ownerName = g.ownerName || jidTag(ownerJid);
        g.players.push({ jid: ownerJid, name: ownerName });

        await conn.sendMessage(chatId, {
          text:
            `👑 *Owner auto-joined alongside the bot!*\n` +
            `👥 Players in lobby: *${g.players.length}*`
        });
      }
    }

    return true;
  }

  // ══════════════════════════════════════════════════
  // PHASE 2: ACTIVE GAME — handle word answers
  // ══════════════════════════════════════════════════
  if (g.status !== 'active') return false;

  const current = g.players[g.currentPlayerIndex];
  if (!current) return false;

  const who       = whoIs(m);
  const senderJid = who.jid;

  // Not the current player's turn — ignore silently
  if (!sameUser(current, who)) return false;

  // Ignore prefix commands (e.g. .menu, .help)
  const prefixList = Array.isArray(global.prefix)
    ? global.prefix
    : (global.prefix ? [global.prefix] : ['.']);
  if (prefixList.some(p => p && lower.startsWith(p.toLowerCase()))) return false;

  // Count real alpha words — handles iOS trailing spaces
  const wordCount = raw.trim().split(/\s+/).filter(w => w.replace(/[^a-zA-Z]/g, '').length > 0).length;
  if (wordCount > 1) return false;

  // Strip non-alpha to get clean word (handles apostrophes, punctuation)
  const word = lower.replace(/[^a-z]/g, '');
  if (!word) return false;

  const minL = g.minLetters || getMinLetters(g.round);

  // ── Check 1: starts with correct letter ──
  if (word[0] !== g.currentLetter.toLowerCase()) {
    sendWrong(conn, chatId, m,
      `❌ @${jidTag(senderJid)} *Wrong letter!*\n` +
      `Your word must start with *${g.currentLetter}*\n` +
      `⏳ Try again — timer still running!`,
      [senderJid]
    );
    return true;
  }

  // ── Check 2: word is long enough ──
  if (word.length < minL) {
    sendWrong(conn, chatId, m,
      `❌ @${jidTag(senderJid)} *Too short!*\n` +
      `Need at least *${minL} letters* — yours has *${word.length}*\n` +
      `⏳ Try again — timer still running!`,
      [senderJid]
    );
    return true;
  }

  // ── Check 3: word not already used ──
  if (g.usedWords.has(word)) {
    sendWrong(conn, chatId, m,
      `❌ @${jidTag(senderJid)} *${word.toUpperCase()}* was already used!\n` +
      `⏳ Try a different word — timer still running!`,
      [senderJid]
    );
    return true;
  }

  // ── Check 4: real English word (instant local reject + fast parallel check) ──
  const dictResult = await isValidWord(word);

  if (dictResult.source === 'offline') {
    // Both APIs down — warn but allow this round
    conn.sendMessage(chatId, {
      text:
        `⚠️ @${jidTag(senderJid)} Dictionary is offline — word accepted this round!\n` +
        `🔤 Try to use real words!`,
      mentions: [senderJid]
    }, { quoted: m }).catch(() => {});
  } else if (!dictResult.valid) {
    sendWrong(conn, chatId, m,
      `❌ @${jidTag(senderJid)} *${word.toUpperCase()}* is not a valid English word!\n` +
      `📖 Not found in the dictionary.\n` +
      `⏳ Try again — timer still running!`,
      [senderJid]
    );
    return true;
  }

  // ── ✅ Word accepted! (react only, no message) ──
  clearTimeout(g.timer);
  clearTimeout(g.warnTimer);

  g.usedWords.add(word);
  const nextLetter = word[word.length - 1].toUpperCase();

  conn.sendMessage(chatId, { react: { text: '✅', key: m.key } }).catch(() => {});

  g.currentLetter      = nextLetter;
  g.round++;
  g.currentPlayerIndex = (g.currentPlayerIndex + 1) % g.players.length;

  await askNextPlayer(conn, chatId);
  return true;
}

// ─── PLUGIN EXPORTS ───────────────────────────────────
module.exports = [

  // ── .wcg — start game ──────────────────────────────
  {
    command:     'wcg',
    alias:       ['wordchain', 'wc'],
    category:    'games',
    description: 'Start a Word Chain Game',
    use:         '',
    group:       true,
    rawHandler:  handleWcgRaw,

    async execute(m, { ednut, from, botNumber, reply }) {
      const chatId  = from;
      const botJid  = normalizeJid(botNumber);
      const botName = ednut.user?.name || 'EmmyFrosh-AI';

      const ownerJid  = normalizeJid(global.owner || '');
      const ownerName = ednut.contacts?.[ownerJid]?.name
                     || ednut.contacts?.[ownerJid]?.notify
                     || jidTag(ownerJid)
                     || 'Owner';

      if (global.wcgGames[chatId]) {
        return reply('⚠️ A WCG game is already running! Type *.wcgstop* to end it.');
      }

      global.wcgGames[chatId] = {
        status:             'waiting',
        players:            [],
        allPlayers:         [],
        eliminated:         [],
        currentPlayerIndex: 0,
        usedWords:          new Set(),
        currentLetter:      randomLetter(),
        minLetters:         4,
        round:              1,
        timer:              null,
        warnTimer:          null,
        startTimer:         null,
        botJid,
        botName,
        ownerName,
        host:        normalizeJid(m.sender)
      };

      const g = global.wcgGames[chatId];

      await ednut.sendMessage(chatId, {
        text:
          `🎮 *WORD CHAIN GAME (WCG) STARTING!*\n\n` +
          `📌 *How to join:*\n` +
          `Simply type *join* to enter the lobby\n` +
          `Everyone must join manually — including the owner!\n` +
          `🚪 Type *quit* anytime to leave the game\n` +
          `🤖 *Bot joining = Owner joins too automatically!*\n\n` +
          `👥 Minimum players: *${MIN_PLAYERS}*\n` +
          `⏳ Lobby closes in *30 seconds*\n\n` +
          `📖 *Rules:*\n` +
          `• Each word must start with the *last letter* of the previous word\n` +
          `• No repeating words\n` +
          `• Words must be real English words\n` +
          `• Minimum letters increases every 3 rounds (up to 10)\n` +
          `• Miss your turn = *ELIMINATED* ❌\n` +
          `• Last one standing *WINS* 🏆`,
      }, { quoted: m });

      // Countdown to start
      g.startTimer = setTimeout(async () => {
        const s = global.wcgGames[chatId];
        if (!s || s.status !== 'waiting') return;

        if (s.players.length < MIN_PLAYERS) {
          await ednut.sendMessage(chatId, {
            text:
              `❌ *WCG Cancelled!*\n` +
              `Not enough players joined (${s.players.length}/${MIN_PLAYERS}).\n` +
              `Type *.wcg* to try again.`
          });
          cleanGame(chatId);
          return;
        }

        // Shuffle (Fisher-Yates) and pick a RANDOM first player
        shuffle(s.players);
        s.allPlayers         = [...s.players];
        s.eliminated         = [];
        s.status             = 'active';
        s.currentLetter      = randomLetter();
        s.currentPlayerIndex = Math.floor(Math.random() * s.players.length);

        const mentions   = s.players.map(p => p.jid);
        const playerList = s.players
          .map((p, i) => `${i + 1}. @${jidTag(p.jid)} — ${p.name}`)
          .join('\n');

        await ednut.sendMessage(chatId, {
          text:
            `🚀 *WCG IS STARTING NOW!*\n\n` +
            `👥 *Players (${s.players.length}):*\n${playerList}\n\n` +
            `🎯 *First letter:* *${s.currentLetter}*\n` +
            `🎲 *First player:* @${jidTag(s.players[s.currentPlayerIndex].jid)}\n\n` +
            `🍀 Good luck everyone!`,
          mentions
        });

        await askNextPlayer(ednut, chatId);
      }, JOIN_WINDOW);
    }
  },

  // ── .wcgstop ───────────────────────────────────────
  {
    command:     'wcgstop',
    alias:       ['endwcg', 'stopwcg'],
    category:    'games',
    description: 'Stop the current WCG game',
    use:         '',
    group:       true,

    async execute(m, { ednut, from, isHighStaff, reply }) {
      const chatId = from;
      const g      = global.wcgGames[chatId];
      if (!g) return reply('❌ No WCG game is currently running.');

      if (!isHighStaff && numOnly(normalizeJid(m.sender)) !== numOnly(g.host)) {
        return reply('❌ Only the game host or admins can stop the game.');
      }

      if (g.status === 'active' && g.players.length > 0) {
        const mentions  = g.players.map(p => p.jid);
        const remaining = g.players.map((p, i) => `${i + 1}. @${jidTag(p.jid)}`).join('\n');
        await ednut.sendMessage(from, {
          text:
            `🛑 *WCG stopped by @${jidTag(m.sender)}*\n\n` +
            `🏃 Players still alive:\n${remaining}`,
          mentions: [...mentions, m.sender]
        }, { quoted: m });
      } else {
        await ednut.sendMessage(from, {
          text: `🛑 *WCG stopped by @${jidTag(m.sender)}*`,
          mentions: [m.sender]
        }, { quoted: m });
      }

      cleanGame(chatId);
    }
  },

  // ── .wcgplayers ────────────────────────────────────
  {
    command:     'wcgplayers',
    alias:       ['wcglist', 'wcgp'],
    category:    'games',
    description: 'Show current WCG players',
    use:         '',
    group:       true,

    async execute(m, { ednut, from, reply }) {
      const chatId = from;
      const g      = global.wcgGames[chatId];
      if (!g) return reply('❌ No WCG game is currently running.');

      const mentions = g.players.map(p => p.jid);
      const list     = g.players.length > 0
        ? g.players.map((p, i) => `${i + 1}. @${jidTag(p.jid)} — ${p.name}`).join('\n')
        : '_No players yet — type *join* to enter!_';
      const status   = g.status === 'waiting' ? '⏳ Lobby open' : '🎮 Game in progress';

      await ednut.sendMessage(from, {
        text:
          `🎮 *WCG Players* [${status}]\n\n` +
          `${list}\n\n` +
          `👥 Total: *${g.players.length}*`,
        mentions
      }, { quoted: m });
    }
  }
];