// =====================================================
// 📖 BIBLE QUIZ GAME  (plugins/EmmyFrosh/biblequiz.js)
// =====================================================
// Commands : .biblequiz  (.bq)   start a lobby
//            .bqstop             stop the game
//            .bqplayers          show players + tries
// Join     : anybody types  join  (any account, any number,
//            even the bot's own linked account)
// Rules    : one player at a time, options A-E, 30s per question,
//            wrong/no answer = 1 try used, 3 tries = REMOVED,
//            last one standing WINS.
// Modes    : EASY first. Every player gets 50 easy questions (no repeats for
//            the same player). Only when ALL players still in the game have had
//            their 50, everyone moves to HARD together, silently
//            ("which book contains this verse?" from bible-api.com).
// Each question is sent with the player's profile picture.
//
// handler.js calls:  bq.rawHandler(m, ednut, { resolveLidDigits })
// =====================================================

if (!global.bibleQuizGames) global.bibleQuizGames = {};

const JOIN_WINDOW = Number(process.env.BQ_JOIN_MS) || 30_000;
const TURN_TIME   = Number(process.env.BQ_TURN_MS) || 30_000;
const MIN_PLAYERS = 2;
const MAX_TRIES   = 3;
const LETTERS     = ['A', 'B', 'C', 'D', 'E'];
const EASY_COUNT  = Number(process.env.BQ_EASY_COUNT) || 50;   // easy questions per player before hard mode

const BOOKS = ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'];

// used only if the API is down
const FALLBACK_VERSES = [
  ['In the beginning God created the heaven and the earth.', 'Genesis'],
  ['The LORD is my shepherd; I shall not want.', 'Psalms'],
  ['Trust in the LORD with all thine heart; and lean not unto thine own understanding.', 'Proverbs'],
  ['For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.', 'John'],
  ['I can do all things through Christ which strengtheneth me.', 'Philippians'],
  ['Jesus wept.', 'John'],
  ['Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.', 'Joshua'],
  ['For all have sinned, and come short of the glory of God.', 'Romans'],
  ['Now faith is the substance of things hoped for, the evidence of things not seen.', 'Hebrews'],
  ['Remember now thy Creator in the days of thy youth, while the evil days come not.', 'Ecclesiastes'],
  ['And the Word was made flesh, and dwelt among us, (and we beheld his glory, the glory as of the only begotten of the Father,) full of grace and truth.', 'John'],
  ['Thy word is a lamp unto my feet, and a light unto my path.', 'Psalms'],
  ['Even so faith, if it hath not works, is dead, being alone.', 'James'],
  ['Behold, I stand at the door, and knock: if any man hear my voice, and open the door, I will come in to him, and will sup with him, and he with me.', 'Revelation'],
  ['Arise, shine; for thy light is come, and the glory of the LORD is risen upon thee.', 'Isaiah']
];

// ── QUESTION BANK: [question, correct answer, [4 wrong answers]] ──
const BANK = [
  ['Who built the ark?', 'Noah', ['Moses', 'Abraham', 'David', 'Elijah']],
  ['What is the first book of the Bible?', 'Genesis', ['Exodus', 'Psalms', 'Matthew', 'Job']],
  ['Who was swallowed by a great fish?', 'Jonah', ['Elijah', 'Peter', 'Paul', 'Daniel']],
  ['How many disciples did Jesus choose?', '12', ['7', '10', '70', '40']],
  ['Who killed Goliath?', 'David', ['Saul', 'Samson', 'Joshua', 'Jonathan']],
  ['Where was Jesus born?', 'Bethlehem', ['Nazareth', 'Jerusalem', 'Capernaum', 'Jericho']],
  ['Who was thrown into the lions\' den?', 'Daniel', ['Joseph', 'Elijah', 'Jeremiah', 'Isaiah']],
  ['Who was the first man created by God?', 'Adam', ['Cain', 'Abel', 'Seth', 'Enoch']],
  ['Who was the brother of Moses?', 'Aaron', ['Joshua', 'Caleb', 'Levi', 'Eli']],
  ['Which disciple denied Jesus three times?', 'Peter', ['Judas', 'Thomas', 'John', 'Andrew']],
  ['What is the last book of the Bible?', 'Revelation', ['Jude', 'Malachi', 'Acts', 'Hebrews']],
  ['Who lost his strength when his hair was cut?', 'Samson', ['Gideon', 'Goliath', 'Saul', 'Jephthah']],
  ['Who betrayed Jesus for thirty pieces of silver?', 'Judas Iscariot', ['Peter', 'Thomas', 'Matthew', 'Philip']],
  ['How many days and nights did it rain in Noah\'s flood?', '40', ['7', '12', '30', '100']],
  ['On which mountain did Moses receive the Ten Commandments?', 'Mount Sinai', ['Mount Carmel', 'Mount Zion', 'Mount Hermon', 'Mount Nebo']],
  ['Who was sold into slavery by his brothers?', 'Joseph', ['Benjamin', 'Reuben', 'Judah', 'Esau']],
  ['Who wrote most of the letters in the New Testament?', 'Paul', ['Peter', 'John', 'James', 'Luke']],
  ['Who was the first Christian martyr?', 'Stephen', ['James', 'Paul', 'Peter', 'Philip']],
  ['Where did Jesus turn water into wine?', 'Cana', ['Bethany', 'Capernaum', 'Nain', 'Emmaus']],
  ['Who was the wife of Abraham?', 'Sarah', ['Rebekah', 'Rachel', 'Leah', 'Hannah']],
  ['Which queen saved the Jews from Haman\'s plot?', 'Esther', ['Ruth', 'Deborah', 'Naomi', 'Miriam']],
  ['Who is known as the wisest king of Israel?', 'Solomon', ['David', 'Saul', 'Hezekiah', 'Josiah']],
  ['In which river was Jesus baptized?', 'Jordan', ['Nile', 'Euphrates', 'Tigris', 'Jabbok']],
  ['Which disciple doubted until he saw Jesus\' wounds?', 'Thomas', ['Peter', 'Andrew', 'Philip', 'Bartholomew']],
  ['How many books are in the Protestant Bible?', '66', ['39', '27', '73', '70']],
  ['Who was the twin brother of Jacob?', 'Esau', ['Isaac', 'Ishmael', 'Laban', 'Reuben']],
  ['Which disciple walked on water toward Jesus?', 'Peter', ['John', 'James', 'Andrew', 'Thomas']],
  ['Which tax collector climbed a sycamore tree to see Jesus?', 'Zacchaeus', ['Matthew', 'Levi', 'Nicodemus', 'Bartimaeus']],
  ['Who was the mother-in-law of Ruth?', 'Naomi', ['Orpah', 'Hannah', 'Elizabeth', 'Sarah']],
  ['Who was the mother of Samuel?', 'Hannah', ['Peninnah', 'Ruth', 'Sarah', 'Rebekah']],
  ['Who led Israel into the Promised Land after Moses?', 'Joshua', ['Caleb', 'Aaron', 'Gideon', 'Samuel']],
  ['Which city\'s walls fell after the Israelites marched around it?', 'Jericho', ['Ai', 'Babylon', 'Nineveh', 'Jerusalem']],
  ['Where did Adam and Eve live before the fall?', 'Garden of Eden', ['Gethsemane', 'Canaan', 'Goshen', 'Bethel']],
  ['Which is the shortest Gospel?', 'Mark', ['Matthew', 'Luke', 'John', 'Acts']],
  ['Who was the mother of Jesus?', 'Mary', ['Martha', 'Elizabeth', 'Anna', 'Salome']],
  ['Who baptized Jesus?', 'John the Baptist', ['Peter', 'Andrew', 'Elijah', 'Paul']],
  ['Who sold his birthright for a bowl of stew?', 'Esau', ['Jacob', 'Cain', 'Reuben', 'Ishmael']],
  ['Which prophet was taken to heaven in a chariot of fire?', 'Elijah', ['Elisha', 'Enoch', 'Isaiah', 'Moses']],
  ['How many plagues did God send on Egypt?', '10', ['7', '12', '5', '40']],
  ['On the road to which city did Saul meet Jesus?', 'Damascus', ['Antioch', 'Tarsus', 'Jerusalem', 'Corinth']],
  ['Psalm 23 begins "The LORD is my ..."', 'Shepherd', ['Rock', 'King', 'Light', 'Shield']],
  ['Who was the best friend of David?', 'Jonathan', ['Saul', 'Samuel', 'Joab', 'Abner']],
  ['What was the food God gave Israel in the wilderness called?', 'Manna', ['Quail', 'Matzah', 'Honey', 'Barley']],
  ['Who interpreted Pharaoh\'s dreams in Egypt?', 'Joseph', ['Daniel', 'Moses', 'Aaron', 'Reuben']],
  ['Who was the first king of Israel?', 'Saul', ['David', 'Solomon', 'Samuel', 'Jeroboam']],
  ['Which son did Abraham almost sacrifice on the mountain?', 'Isaac', ['Ishmael', 'Jacob', 'Esau', 'Joseph']],
  ['Who was the wife of Isaac?', 'Rebekah', ['Rachel', 'Leah', 'Sarah', 'Ruth']],
  ['How many sons did Jacob have?', '12', ['7', '10', '13', '40']],
  ['Who was turned into a pillar of salt?', 'Lot\'s wife', ['Sarah', 'Eve', 'Jezebel', 'Rahab']],
  ['Who was the mother of John the Baptist?', 'Elizabeth', ['Mary', 'Anna', 'Martha', 'Hannah']],
  ['Who was the first murderer in the Bible?', 'Cain', ['Abel', 'Esau', 'Lamech', 'Ham']],
  ['In which garden did Jesus pray before He was arrested?', 'Gethsemane', ['Eden', 'Gilgal', 'Siloam', 'Shiloh']],
  ['What did Jesus use to feed the 5,000?', 'Five loaves and two fish', ['Seven loaves and a few fish', 'Manna and quail', 'Twelve loaves and one fish', 'Bread and wine']],
  ['Who is known as the apostle to the Gentiles?', 'Paul', ['Peter', 'Barnabas', 'Timothy', 'Silas']],
  ['Which prophet challenged the prophets of Baal on Mount Carmel?', 'Elijah', ['Elisha', 'Isaiah', 'Jeremiah', 'Samuel']],
  ['Who was the sister of Moses?', 'Miriam', ['Deborah', 'Zipporah', 'Esther', 'Hannah']],
  ['Which king dreamed of a statue with a head of gold?', 'Nebuchadnezzar', ['Belshazzar', 'Darius', 'Cyrus', 'Herod']],
  ['Who were thrown into the fiery furnace with Shadrach?', 'Meshach and Abednego', ['Daniel and Ezekiel', 'Peter and John', 'Mordecai and Haman', 'Nathan and Gad']],
  ['Who took over from Elijah as prophet?', 'Elisha', ['Isaiah', 'Samuel', 'Gehazi', 'Nathan']],
  ['Which Gospel writer was a physician?', 'Luke', ['Mark', 'Matthew', 'John', 'Paul']],
  ['What is the last book of the Old Testament?', 'Malachi', ['Zechariah', 'Daniel', 'Nehemiah', 'Habakkuk']],
  ['What is the first book of the New Testament?', 'Matthew', ['Mark', 'Luke', 'John', 'Acts']],
  ['Which Roman governor handed Jesus over to be crucified?', 'Pontius Pilate', ['Herod Antipas', 'Caesar Augustus', 'Felix', 'Festus']],
  ['In which town did Jesus grow up?', 'Nazareth', ['Bethlehem', 'Jerusalem', 'Capernaum', 'Cana']],
  ['Who baptized the Ethiopian official on the road to Gaza?', 'Philip', ['Peter', 'Paul', 'Stephen', 'Barnabas']],
  ['Who did Jesus raise from the dead after four days in the tomb?', 'Lazarus', ['Dorcas', 'Eutychus', 'Nicodemus', 'Bartimaeus']],
  ['Which sea did Jesus calm with a word?', 'Sea of Galilee', ['Red Sea', 'Dead Sea', 'Mediterranean Sea', 'Black Sea']],
  ['Who was the first woman?', 'Eve', ['Sarah', 'Rebekah', 'Leah', 'Hagar']],
  ['Who was the father of Joseph (the dreamer)?', 'Jacob', ['Isaac', 'Abraham', 'Esau', 'Laban']],
  ['How many years did Israel wander in the wilderness?', '40', ['7', '12', '70', '400']],
  ['Who replaced Judas as an apostle?', 'Matthias', ['Barnabas', 'Silas', 'Timothy', 'Stephen']],
  ['Which two brothers were fishermen sons of Zebedee?', 'James and John', ['Peter and Andrew', 'Philip and Thomas', 'Matthew and Mark', 'Simon and Jude']],
  ['Which Roman centurion did Peter visit in Caesarea?', 'Cornelius', ['Julius', 'Felix', 'Festus', 'Agrippa']],
  ['Which king wrote most of the Psalms?', 'David', ['Solomon', 'Hezekiah', 'Asaph', 'Moses']],
  ['Who lost everything yet stayed faithful to God?', 'Job', ['Jonah', 'Lot', 'Eli', 'Gideon']],
  ['Who anointed David as king?', 'Samuel', ['Nathan', 'Eli', 'Elijah', 'Saul']],
  ['Which prophet rebuked David about Bathsheba?', 'Nathan', ['Samuel', 'Gad', 'Elijah', 'Isaiah']],
  ['Who was the husband of Bathsheba that David had killed?', 'Uriah', ['Joab', 'Abner', 'Nabal', 'Absalom']],
  ['Which king built the temple in Jerusalem?', 'Solomon', ['David', 'Hezekiah', 'Josiah', 'Rehoboam']],
  ['Who was the mother of Solomon?', 'Bathsheba', ['Michal', 'Abigail', 'Ruth', 'Hannah']],
  ['Which disciple was a tax collector?', 'Matthew', ['Peter', 'Philip', 'Simon', 'Thaddaeus']],
  ['To which city did Jonah preach?', 'Nineveh', ['Babylon', 'Sodom', 'Tyre', 'Damascus']],
  ['Which woman hid the Israelite spies in Jericho?', 'Rahab', ['Ruth', 'Deborah', 'Jael', 'Delilah']],
  ['Which prophetess led Israel with Barak?', 'Deborah', ['Miriam', 'Huldah', 'Jael', 'Hannah']],
  ['Who was the first high priest of Israel?', 'Aaron', ['Eli', 'Zadok', 'Levi', 'Eleazar']],
  ['What did God create on the first day?', 'Light', ['Land and plants', 'Birds and fish', 'Man and woman', 'The sun and moon']],
  ['On which day did God rest after creation?', 'The seventh', ['The first', 'The third', 'The fourth', 'The sixth']],
  ['What did the dove bring back to Noah?', 'An olive leaf', ['A fig leaf', 'A palm branch', 'A grape', 'A flower']]
];

// ── helpers ────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const digits = (s) => String(s || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

function getText(m) {
  return String(
    m?.message?.conversation ||
    m?.message?.extendedTextMessage?.text ||
    m?.message?.imageMessage?.caption ||
    m?.message?.videoMessage?.caption ||
    m?.body || m?.text || ''
  ).trim();
}

// Every id WhatsApp may give for the same person (phone jid, lid jid, alt fields)
function collectIds(m) {
  const k = m?.key || {};
  const raw = [m?.sender, k.participant, k.participantAlt, k.participantPn, k.senderPn, m?.participant];
  if (!m?.isGroup && k.remoteJid) raw.push(k.remoteJid);
  return [...new Set(raw.filter(Boolean).map(String))];
}

// The jid we show/tag: prefer the real phone-number jid
function bestJid(m) {
  const ids = collectIds(m);
  return ids.find(j => j.endsWith('@s.whatsapp.net')) || m?.sender || ids[0] || '';
}

async function whoIs(m, ctx) {
  const ids = collectIds(m);
  const jid = bestJid(m);
  let num = digits(ids.find(j => j.endsWith('@s.whatsapp.net')) || '');
  if (!num && ctx && typeof ctx.resolveLidDigits === 'function') {
    try { num = digits(await ctx.resolveLidDigits(m.sender)); } catch {}
  }
  if (!num) num = digits(jid);
  const keys = new Set();
  for (const id of ids) { keys.add(id); const d = digits(id); if (d) keys.add(d); }
  if (num) keys.add(num);
  // the sender's own @lid and the phone number are never confused with each other
  return { jid, num, keys, name: m.pushName || m.push_name || num };
}

const sameUser = (p, who) => [...who.keys].some(k => p.keys.has(k));
const tag = (p) => `@${p.num || digits(p.jid)}`;

// ── HARD MODE: "which book contains this verse?" ──
async function hardQuestion() {
  let verse = null, book = null;
  try {
    const axios = require('axios');
    for (let i = 0; i < 4 && !verse; i++) {
      const r = await axios.get('https://bible-api.com/data/kjv/random', { timeout: 4000 });
      const rv = r.data && r.data.random_verse;
      const t = rv && String(rv.text || '').replace(/\s+/g, ' ').trim();
      const b = rv && String(rv.book || '').trim();
      if (t && t.length >= 60 && t.length <= 420 && BOOKS.includes(b)) { verse = t; book = b; }
    }
  } catch {}
  if (!verse) { const f = FALLBACK_VERSES[Math.floor(Math.random() * FALLBACK_VERSES.length)]; verse = f[0]; book = f[1]; }

  const wrong = shuffle(BOOKS.filter(b => b !== book)).slice(0, 4);
  const options = shuffle([book, ...wrong]);
  return { q: `Which book of the Bible contains this verse?\n\n_"${verse}"_`, options, answer: options.indexOf(book) };
}

const hearts = (t) => '❤️'.repeat(Math.max(t, 0)) + '🖤'.repeat(Math.max(MAX_TRIES - t, 0));

// ── profile picture (same idea as .pp): real picture, else a plain white avatar ──
const PP_TTL = 30 * 60 * 1000;
const ppCache = global.__ppCache || (global.__ppCache = new Map());   // shared with .pp
const ppKey = (j) => String(j || '').replace(/:\d+@/, '@');

let _white = null;
async function whiteAvatar() {
  if (_white) return _white;
  const size = 640;
  try {
    const sharp = require('sharp');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#ffffff"/>
  <circle cx="${size / 2}" cy="${size * 0.38}" r="${size * 0.17}" fill="#c4c8cf"/>
  <ellipse cx="${size / 2}" cy="${size * 0.95}" rx="${size * 0.32}" ry="${size * 0.32}" fill="#c4c8cf"/>
</svg>`;
    _white = await sharp(Buffer.from(svg)).png().toBuffer();
    return _white;
  } catch {}
  // no sharp installed: build a plain white PNG by hand (no internet needed)
  const zlib = require('zlib');
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 255)]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  _white = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return _white;
}

async function avatarBuffer(conn, p) {
  const ids = [...new Set([p.jid, p.num && `${p.num}@s.whatsapp.net`].filter(Boolean))];
  for (const j of ids) {                                   // 1) cached (a lookup that worked before)
    const hit = ppCache.get(ppKey(j));
    if (hit && Date.now() - hit.t < PP_TTL) return hit.buf;
  }
  let axios = null;
  try { axios = require('axios'); } catch {}
  for (const j of (axios ? ids : [])) {                    // 2) ask WhatsApp: full size, then small
    for (const type of ['image', 'preview']) {
      try {
        const url = await Promise.race([
          conn.profilePictureUrl(j, type),
          new Promise((_, rej) => setTimeout(() => rej(new Error('pp timeout')), 6000))
        ]);
        if (!url) continue;
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        const buf = Buffer.from(res.data);
        for (const k of ids) ppCache.set(ppKey(k), { buf, t: Date.now() });
        return buf;
      } catch {}
    }
  }
  return await whiteAvatar();                              // 3) no picture / hidden -> white avatar
}

// Easy question: never the same one twice for the same player, and not one asked in the last few turns
function pickQuestion(g, p) {
  const seen = p.seen || (p.seen = new Set());
  const recent = g.recent || (g.recent = []);
  const all = BANK.map((_, i) => i);
  let cand = all.filter(i => !seen.has(i) && !recent.includes(i));
  if (!cand.length) cand = all.filter(i => !seen.has(i));
  if (!cand.length) { seen.clear(); cand = all; }
  const idx = cand[Math.floor(Math.random() * cand.length)];
  seen.add(idx);
  recent.push(idx);
  if (recent.length > 8) recent.shift();
  const [q, right, wrong] = BANK[idx];
  const options = shuffle([right, ...wrong]);
  return { q, options, answer: options.indexOf(right) };
}

function clean(chatId) {
  const g = global.bibleQuizGames[chatId];
  if (g) { clearTimeout(g.startTimer); clearTimeout(g.turnTimer); }
  delete global.bibleQuizGames[chatId];
}

const send = (conn, chatId, text, mentions, quoted) =>
  conn.sendMessage(chatId, { text, mentions: mentions || [] }, quoted ? { quoted } : undefined);

// ── game flow ──────────────────────────────────────────
async function askNext(conn, chatId) {
  const g = global.bibleQuizGames[chatId];
  if (!g || g.status !== 'active') return;
  if (g.players.length <= 1) return finish(conn, chatId);

  if (g.idx >= g.players.length) g.idx = 0;
  const p = g.players[g.idx];

  // Everybody stays on EASY until EVERY player still in the game has had EASY_COUNT easy questions.
  // Then the whole game moves to HARD together (never announced).
  const everyoneDone = g.players.every(x => (x.asked || 0) >= EASY_COUNT);
  const qa = everyoneDone ? await hardQuestion() : pickQuestion(g, p);
  p.asked = (p.asked || 0) + 1;
  g.qnum = (g.qnum || 0) + 1;
  g.current = { ...qa, qid: (g.qid = (g.qid || 0) + 1), done: false };

  const opts = qa.options.map((o, i) => `*${LETTERS[i]}.* ${o}`).join('\n');
  const caption =
    `📖 *BIBLE QUIZ — Question ${g.qnum}*\n\n` +
    `👤 *Player:* ${tag(p)}\n` +
    `${hearts(p.tries)}  *${p.tries} ${p.tries === 1 ? 'try' : 'tries'} left*\n\n` +
    `❓ ${qa.q}\n\n${opts}\n\n` +
    `⏳ You have *${TURN_TIME / 1000} seconds* — reply with *A, B, C, D or E*`;

  const qid = g.current.qid;
  const pic = await avatarBuffer(conn, p).catch(() => null);
  try {
    if (pic) await conn.sendMessage(chatId, { image: pic, caption, mentions: [p.jid] });
    else await send(conn, chatId, caption, [p.jid]);
  } catch {
    await send(conn, chatId, caption, [p.jid]);
  }

  // the 30 seconds start once the question is actually on screen
  clearTimeout(g.turnTimer);
  g.turnTimer = setTimeout(() => resolveTurn(conn, chatId, qid, null, true), TURN_TIME);
}

async function resolveTurn(conn, chatId, qid, pickedIndex, timedOut, quoted) {
  const g = global.bibleQuizGames[chatId];
  if (!g || g.status !== 'active' || !g.current || g.current.qid !== qid || g.current.done) return;
  g.current.done = true;                // guard: only one resolution per question
  clearTimeout(g.turnTimer);

  const p = g.players[g.idx];
  const { options, answer } = g.current;
  const correct = !timedOut && pickedIndex === answer;

  if (correct) {
    p.score = (p.score || 0) + 1;
    if (quoted) conn.sendMessage(chatId, { react: { text: '✅', key: quoted.key } }).catch(() => {});
    await send(conn, chatId, `✅ *Correct!* ${tag(p)} is safe.`, [p.jid], quoted);
    g.idx = (g.idx + 1) % g.players.length;
    return askNext(conn, chatId);
  }

  p.tries--;
  if (quoted) conn.sendMessage(chatId, { react: { text: '❌', key: quoted.key } }).catch(() => {});
  const why = timedOut ? `⏰ *Time up!* ${tag(p)} didn't answer.` : `❌ *Wrong!* ${tag(p)}`;
  const ans = `✔️ Correct answer: *${LETTERS[answer]}. ${options[answer]}*`;

  if (p.tries <= 0) {
    g.players.splice(g.idx, 1);
    g.eliminated.push(p);
    if (g.idx >= g.players.length) g.idx = 0;
    await send(conn, chatId,
      `${why}\n${ans}\n\n💀 ${tag(p)} used all ${MAX_TRIES} tries and is *REMOVED* ❌\n👥 Players left: *${g.players.length}*`,
      [p.jid], timedOut ? null : quoted);
  } else {
    await send(conn, chatId,
      `${why}\n${ans}\n\n❤️ Tries left: *${p.tries}/${MAX_TRIES}*`,
      [p.jid], timedOut ? null : quoted);
    g.idx = (g.idx + 1) % g.players.length;
  }
  return askNext(conn, chatId);
}

async function finish(conn, chatId) {
  const g = global.bibleQuizGames[chatId];
  if (!g) return;

  // 1st = last one standing, then the most recently removed, and so on
  const ranking = [...g.players, ...[...g.eliminated].reverse()];
  const total = g.qnum || 0;
  const everyone = ranking.length;
  clean(chatId);

  if (!ranking.length) return send(conn, chatId, '🏁 *BIBLE QUIZ HAS ENDED!*\n\nNobody is left standing.');

  const line = '━━━━━━━━━━━━━━━━━━━━';
  const places = [
    ['👑 *1ST PLACE*', '🏆 Champion'],
    ['🥈 *2ND PLACE*', '🎖️ Gift'],
    ['🥉 *3RD PLACE*', '🎖️ Gift']
  ];
  const blocks = ranking.slice(0, 3).map((p, i) =>
    `${places[i][0]}\n${tag(p)}\n${places[i][1]}\n✅ Score: ${p.score || 0}\n${hearts(p.tries)}`
  ).join('\n\n');
  const champ = ranking[0];

  return send(conn, chatId,
    `🏁 *BIBLE QUIZ HAS ENDED!*\n\n` +
    `${line}\n🏆 *FINAL RESULTS*\n${line}\n\n` +
    `${blocks}\n\n` +
    `${line}\n📌 *QUIZ SUMMARY*\n${line}\n\n` +
    `📖 Total Questions: ${total}\n` +
    `👤 Participants: ${everyone}\n` +
    `🥇 Overall Champion: ${champ.name || champ.num}\n\n` +
    `${line}\n✨ *QUIZ SESSION CLOSED!*\n\n` +
    `Thank you for participating.\n` +
    `Keep growing in faith and knowledge of God's Word.\n\n` +
    `❤️ God bless you all! 🙏`,
    ranking.slice(0, 3).map(p => p.jid));
}

// ── a player types "quit": out of the game, everybody else carries on ──
async function quitPlayer(conn, chatId, g, who, m) {
  const at = g.players.findIndex(p => sameUser(p, who));
  if (at === -1) return false;                       // not a player -> ignore the word "quit"
  const p = g.players[at];

  // still in the lobby: just leave it
  if (g.status === 'waiting') {
    g.players.splice(at, 1);
    await send(conn, chatId, `🚪 ${tag(p)} *left the lobby.*\n👥 Players in lobby: *${g.players.length}*`, [p.jid], m);
    return true;
  }

  const wasTurn = at === g.idx;
  g.players.splice(at, 1);
  p.quit = true;
  g.eliminated.push(p);
  if (at < g.idx) g.idx--;
  if (wasTurn && g.current) { g.current.done = true; clearTimeout(g.turnTimer); }
  if (g.idx >= g.players.length) g.idx = 0;

  await send(conn, chatId,
    `🚪 ${tag(p)} *quit the game* and is out!\n👥 Players left: *${g.players.length}*`, [p.jid], m);

  if (g.players.length <= 1) { await finish(conn, chatId); return true; }
  if (wasTurn) await askNext(conn, chatId);          // their question is cancelled, next player is asked
  return true;
}

// ── RAW HANDLER: "join" + A-E answers ──────────────────
async function rawHandler(m, conn, ctx) {
  try {
    const chatId = m?.chat || m?.key?.remoteJid;
    const g = chatId && global.bibleQuizGames[chatId];
    if (!g) return false;

    // ignore the bot's own automatic messages, but allow the linked account's typed messages
    if (m.key?.fromMe && global._botSentIds && global._botSentIds.has(m.key.id)) return false;

    const raw = getText(m);
    if (!raw) return false;
    const lower = raw.toLowerCase().replace(/^[.!/\\#]+/, '').trim();
    if (!lower) return false;

    // ── QUIT (lobby or game) ──
    if (lower === 'quit' || lower === 'bqquit' || lower === 'quit!' || lower === 'quit.') {
      const whoQ = await whoIs(m, ctx);
      return await quitPlayer(conn, chatId, g, whoQ, m);
    }

    // ── LOBBY: anybody typing join ──
    if (g.status === 'waiting') {
      if (!(lower === 'join' || /^join[\s!.]/.test(lower) || lower === 'bqjoin')) return false;

      const who = await whoIs(m, ctx);
      if (g.players.some(p => sameUser(p, who))) {
        await send(conn, chatId, `⚠️ @${who.num} you're already in the lobby!`, [who.jid], m);
        return true;
      }
      g.players.push({ jid: who.jid, num: who.num, name: who.name, keys: who.keys, tries: MAX_TRIES, asked: 0, score: 0 });
      await send(conn, chatId,
        `✅ @${who.num} *joined the Bible Quiz!*\n👥 Players in lobby: *${g.players.length}*`,
        [who.jid], m);
      return true;
    }

    // ── ACTIVE: answer from the current player only ──
    if (g.status !== 'active' || !g.current || g.current.done) return false;
    const mm = lower.match(/^(?:option\s*)?([a-e])[.)!]*$/i);
    if (!mm) return false;

    const cur = g.players[g.idx];
    if (!cur) return false;
    const who = await whoIs(m, ctx);
    if (!sameUser(cur, who)) return false;      // not your turn

    await resolveTurn(conn, chatId, g.current.qid, LETTERS.indexOf(mm[1].toUpperCase()), false, m);
    return true;
  } catch (e) {
    console.log('[BIBLEQUIZ RAW ERROR]', e.message);
    return false;
  }
}

// ── COMMANDS ───────────────────────────────────────────
module.exports = [
  {
    command: ['biblequiz'],
    alias: ['bq', 'bibletrivia'],
    category: 'games',
    description: 'Start a Bible quiz game (type join to enter)',
    use: '.biblequiz',
    group: true,

    async execute(m, { ednut, from, reply }) {
      const chatId = from || m.chat || m.key?.remoteJid;
      if (global.bibleQuizGames[chatId]) {
        return reply('⚠️ A Bible Quiz is already running! Type *.bqstop* to end it.');
      }

      const g = global.bibleQuizGames[chatId] = {
        status: 'waiting', players: [], eliminated: [], idx: 0,
        current: null, pool: null, qid: 0,
        host: digits(bestJid(m)), startTimer: null, turnTimer: null
      };

      await send(ednut, chatId,
        `📖 *BIBLE QUIZ STARTING!*\n\n` +
        `📌 Type *join* to enter the game\n` +
        `👥 Minimum players: *${MIN_PLAYERS}*\n` +
        `⏳ Lobby closes in *${JOIN_WINDOW / 1000} seconds*\n\n` +
        `📖 *Rules:*\n` +
        `• I ask one player at a time a Bible question\n` +
        `• Options are *A, B, C, D, E* — reply with the letter\n` +
        `• You have *${TURN_TIME / 1000} seconds* per question\n` +
        `• Wrong answer or no answer = *1 try used*\n` +
        `• You have *${MAX_TRIES} tries* — fail ${MAX_TRIES} times and you are *REMOVED* ❌\n` +
        `• Type *quit* anytime to leave the game\n` +
        `• Last one standing *WINS* 🏆`, [], m);

      g.startTimer = setTimeout(async () => {
        const s = global.bibleQuizGames[chatId];
        if (!s || s.status !== 'waiting') return;

        if (s.players.length < MIN_PLAYERS) {
          await send(ednut, chatId,
            `❌ *Bible Quiz cancelled!*\nNot enough players joined (${s.players.length}/${MIN_PLAYERS}).\nType *.biblequiz* to try again.`);
          return clean(chatId);
        }

        shuffle(s.players);
        s.status = 'active';
        s.idx = 0;
        await send(ednut, chatId,
          `🚀 *BIBLE QUIZ IS STARTING NOW!*\n\n👥 *Players (${s.players.length}):*\n` +
          s.players.map((p, i) => `${i + 1}. ${tag(p)}`).join('\n') +
          `\n\n🍀 Good luck everyone!`,
          s.players.map(p => p.jid));
        await askNext(ednut, chatId);
      }, JOIN_WINDOW);
    }
  },

  {
    command: ['bqstop'],
    alias: ['stopbq', 'endbq', 'stopbiblequiz'],
    category: 'games',
    description: 'Stop the current Bible quiz',
    use: '.bqstop',
    group: true,

    async execute(m, ctx) {
      const { from, reply } = ctx;
      const chatId = from || m.chat || m.key?.remoteJid;
      const g = global.bibleQuizGames[chatId];
      if (!g) return reply('❌ No Bible Quiz is currently running.');

      // only players who are still in this game can stop it; everybody else is ignored
      const who = await whoIs(m, ctx);
      if (!g.players.some(p => sameUser(p, who))) return;

      const p = g.players.find(x => sameUser(x, who));
      clean(chatId);
      return send(ctx.ednut, chatId, `🛑 *Bible Quiz stopped by ${tag(p)}.*`, [p.jid], m);
    }
  },

  {
    command: ['bqplayers'],
    alias: ['bqlist'],
    category: 'games',
    description: 'Show Bible quiz players and tries left',
    use: '.bqplayers',
    group: true,

    async execute(m, { ednut, from, reply }) {
      const chatId = from || m.chat || m.key?.remoteJid;
      const g = global.bibleQuizGames[chatId];
      if (!g) return reply('❌ No Bible Quiz is currently running.');
      const list = g.players.length
        ? g.players.map((p, i) => `${i + 1}. ${tag(p)} — ❤️ ${p.tries}/${MAX_TRIES}`).join('\n')
        : '_No players yet — type *join* to enter!_';
      return send(ednut, chatId,
        `📖 *Bible Quiz Players* [${g.status === 'waiting' ? '⏳ Lobby open' : '🎮 In progress'}]\n\n${list}`,
        g.players.map(p => p.jid), m);
    }
  }
];

// handler.js uses this directly (same pattern as afk.js)
Object.defineProperty(module.exports, 'rawHandler', { value: rawHandler, enumerable: false });