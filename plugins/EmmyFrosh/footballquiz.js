// =====================================================
// ⚽ FOOTBALL QUIZ GAME  (plugins/EmmyFrosh/footballquiz.js)
// =====================================================
// Commands : .footballquiz  (.fq)   start a lobby
//            .fqstop                stop the game (players only)
//            .fqplayers             show players + tries
// Join     : anybody types  join   |  leave with  quit
// Rules    : one player at a time, options A-E, 30s per question,
//            wrong/no answer = 1 try used, 3 tries = REMOVED,
//            last one standing WINS.
// Modes    : EASY first (50 questions per player, no repeats for the
//            same player). Only when ALL players still in the game had
//            their 50, everyone moves to HARD together, silently.
// Each question is sent with the player's profile picture
// (white avatar when WhatsApp doesn't give one).
//
// handler.js calls:  fq.rawHandler(m, ednut, { resolveLidDigits })
// =====================================================

if (!global.footballQuizGames) global.footballQuizGames = {};

const JOIN_WINDOW = Number(process.env.FQ_JOIN_MS) || 30_000;
const TURN_TIME   = Number(process.env.FQ_TURN_MS) || 30_000;
const MIN_PLAYERS = 2;
const MAX_TRIES   = 3;
const LETTERS     = ['A', 'B', 'C', 'D', 'E'];
const EASY_COUNT  = Number(process.env.FQ_EASY_COUNT) || 50;   // easy questions per player before hard mode

// ── EASY QUESTION BANK: [question, correct answer, [4 wrong answers]] ──
const BANK = [
  ['How many players does each team have on the pitch?', '11', ['9', '10', '12', '7']],
  ['How long is a standard football match, without extra time?', '90 minutes', ['80 minutes', '100 minutes', '60 minutes', '120 minutes']],
  ['Which country won the 2022 World Cup?', 'Argentina', ['France', 'Brazil', 'Croatia', 'Morocco']],
  ['Which country won the 2018 World Cup?', 'France', ['Croatia', 'Belgium', 'Germany', 'Brazil']],
  ['Which country has won the most World Cups?', 'Brazil', ['Germany', 'Italy', 'Argentina', 'France']],
  ['Which country hosted the 2022 World Cup?', 'Qatar', ['Russia', 'Brazil', 'South Africa', 'Germany']],
  ['Which colour card sends a player off immediately?', 'Red', ['Yellow', 'Blue', 'Green', 'Orange']],
  ['How many yellow cards in one match lead to a sending off?', '2', ['1', '3', '4', '5']],
  ['What do you call it when a player scores three goals in one match?', 'Hat-trick', ['Brace', 'Double', 'Grand slam', 'Triple play']],
  ['Which player is nicknamed "CR7"?', 'Cristiano Ronaldo', ['Neymar', 'Karim Benzema', 'Kylian Mbappé', 'Lionel Messi']],
  ['Which club plays Real Madrid in "El Clásico"?', 'Barcelona', ['Atlético Madrid', 'Sevilla', 'Valencia', 'Villarreal']],
  ['In which country is the Premier League played?', 'England', ['Spain', 'Italy', 'Germany', 'France']],
  ['Who captained Argentina to the 2022 World Cup?', 'Lionel Messi', ['Ángel Di María', 'Paulo Dybala', 'Lautaro Martínez', 'Sergio Agüero']],
  ['Which club is nicknamed "The Red Devils"?', 'Manchester United', ['Liverpool', 'Arsenal', 'Chelsea', 'Manchester City']],
  ['Which club plays at Anfield?', 'Liverpool', ['Everton', 'Arsenal', 'Chelsea', 'Tottenham']],
  ['Which club plays at Old Trafford?', 'Manchester United', ['Manchester City', 'Liverpool', 'Leeds United', 'Everton']],
  ['Which club plays at the Santiago Bernabéu?', 'Real Madrid', ['Barcelona', 'Atlético Madrid', 'Sevilla', 'Valencia']],
  ['Which club plays at the Emirates Stadium?', 'Arsenal', ['Chelsea', 'Tottenham', 'West Ham', 'Fulham']],
  ['Which club plays at Stamford Bridge?', 'Chelsea', ['Arsenal', 'Fulham', 'QPR', 'Brentford']],
  ['Which club plays at the Etihad Stadium?', 'Manchester City', ['Manchester United', 'Everton', 'Leicester City', 'Burnley']],
  ['Which country won Euro 2020 (played in 2021)?', 'Italy', ['England', 'Spain', 'France', 'Portugal']],
  ['Which country won Euro 2024?', 'Spain', ['England', 'France', 'Germany', 'Portugal']],
  ['Who won the Golden Ball at the 2022 World Cup?', 'Lionel Messi', ['Kylian Mbappé', 'Luka Modrić', 'Julián Álvarez', 'Antoine Griezmann']],
  ['Which country won the 2010 World Cup?', 'Spain', ['Netherlands', 'Germany', 'Uruguay', 'Brazil']],
  ['Which country won the 2014 World Cup?', 'Germany', ['Argentina', 'Netherlands', 'Brazil', 'Spain']],
  ['Which country won the 2002 World Cup?', 'Brazil', ['Germany', 'Turkey', 'South Korea', 'Italy']],
  ['Which country won the 2006 World Cup?', 'Italy', ['France', 'Germany', 'Portugal', 'Brazil']],
  ['Which country do the modern rules of football come from?', 'England', ['Brazil', 'Italy', 'Germany', 'France']],
  ['Which African team reached the 2022 World Cup semi-finals?', 'Morocco', ['Senegal', 'Ghana', 'Cameroon', 'Nigeria']],
  ['Which country is Mohamed Salah from?', 'Egypt', ['Morocco', 'Algeria', 'Senegal', 'Nigeria']],
  ['Which country is Sadio Mané from?', 'Senegal', ['Mali', 'Ghana', 'Ivory Coast', 'Nigeria']],
  ['Which country is Victor Osimhen from?', 'Nigeria', ['Ghana', 'Cameroon', 'Senegal', 'Ivory Coast']],
  ['Which country is Erling Haaland from?', 'Norway', ['Sweden', 'Denmark', 'Finland', 'Iceland']],
  ['Which country is Kylian Mbappé from?', 'France', ['Belgium', 'Spain', 'Italy', 'Portugal']],
  ['Which country is Neymar from?', 'Brazil', ['Argentina', 'Portugal', 'Colombia', 'Uruguay']],
  ['Which country is Luka Modrić from?', 'Croatia', ['Serbia', 'Slovenia', 'Poland', 'Bosnia']],
  ['Which country is Kevin De Bruyne from?', 'Belgium', ['Netherlands', 'Germany', 'France', 'Switzerland']],
  ['Which country is Robert Lewandowski from?', 'Poland', ['Czech Republic', 'Ukraine', 'Croatia', 'Russia']],
  ['Which country is Harry Kane from?', 'England', ['Scotland', 'Wales', 'Ireland', 'Australia']],
  ['Which country is Vinícius Júnior from?', 'Brazil', ['Portugal', 'Argentina', 'Spain', 'Uruguay']],
  ['Which club did Lionel Messi leave in 2021 to join Paris Saint-Germain?', 'Barcelona', ['Real Madrid', 'Inter Miami', 'Manchester City', 'Juventus']],
  ['Which club did Cristiano Ronaldo join from Manchester United in 2009?', 'Real Madrid', ['Barcelona', 'Juventus', 'Bayern Munich', 'Chelsea']],
  ['Which club is nicknamed "The Gunners"?', 'Arsenal', ['Chelsea', 'West Ham', 'Tottenham', 'Everton']],
  ['Which club is nicknamed "The Toffees"?', 'Everton', ['Burnley', 'Wolves', 'Fulham', 'Brighton']],
  ['Which club is nicknamed "Los Blancos"?', 'Real Madrid', ['Barcelona', 'Atlético Madrid', 'Valencia', 'Sevilla']],
  ['Which Italian club is nicknamed "The Old Lady"?', 'Juventus', ['AC Milan', 'Inter Milan', 'Roma', 'Napoli']],
  ['Which German club is nicknamed "Die Roten"?', 'Bayern Munich', ['Borussia Dortmund', 'Bayer Leverkusen', 'Schalke 04', 'RB Leipzig']],
  ['Which is Europe\'s top club competition?', 'UEFA Champions League', ['Europa League', 'Copa Libertadores', 'FA Cup', 'Conference League']],
  ['Which national team is known as "The Three Lions"?', 'England', ['Italy', 'Germany', 'Brazil', 'Spain']],
  ['What is the player called who guards the goal?', 'Goalkeeper', ['Striker', 'Defender', 'Winger', 'Midfielder']],
  ['What does FIFA stand for?', 'Fédération Internationale de Football Association', ['Federal International Football Association', 'Football International Federation of Associations', 'Federation of International Football Alliances', 'World Football International Federation Association']],
  ['"La Liga" is the top league of which country?', 'Spain', ['Italy', 'Portugal', 'Mexico', 'Argentina']],
  ['"Serie A" is the top league of which country?', 'Italy', ['Spain', 'Brazil', 'France', 'Portugal']],
  ['"Bundesliga" is the top league of which country?', 'Germany', ['Austria', 'Switzerland', 'Netherlands', 'Belgium']],
  ['"Ligue 1" is the top league of which country?', 'France', ['Belgium', 'Switzerland', 'Canada', 'Portugal']],
  ['Who won the 2023 Ballon d\'Or?', 'Lionel Messi', ['Erling Haaland', 'Kylian Mbappé', 'Karim Benzema', 'Kevin De Bruyne']],
  ['Who won the 2022 Ballon d\'Or?', 'Karim Benzema', ['Sadio Mané', 'Robert Lewandowski', 'Kylian Mbappé', 'Luka Modrić']],
  ['Who won the 2024 Ballon d\'Or?', 'Rodri', ['Vinícius Júnior', 'Jude Bellingham', 'Lamine Yamal', 'Erling Haaland']],
  ['Who won the 2018 Ballon d\'Or?', 'Luka Modrić', ['Cristiano Ronaldo', 'Lionel Messi', 'Kylian Mbappé', 'Antoine Griezmann']],
  ['Which country won the Africa Cup of Nations in 2024 (the 2023 edition)?', 'Ivory Coast', ['Nigeria', 'Senegal', 'Egypt', 'Ghana']],
  ['Which country won the 2019 Africa Cup of Nations?', 'Algeria', ['Senegal', 'Nigeria', 'Egypt', 'Cameroon']],
  ['Which country won the 2021 Africa Cup of Nations (played in 2022)?', 'Senegal', ['Egypt', 'Cameroon', 'Nigeria', 'Ghana']],
  ['What is the nickname of the Nigerian national team?', 'Super Eagles', ['Black Stars', 'Indomitable Lions', 'Pharaohs', 'Lions of Teranga']],
  ['What is the nickname of the Ghanaian national team?', 'Black Stars', ['Super Eagles', 'Elephants', 'Pharaohs', 'Desert Foxes']],
  ['What is the nickname of the Cameroon national team?', 'Indomitable Lions', ['Super Eagles', 'Black Stars', 'Atlas Lions', 'Elephants']],
  ['How many World Cups did Pelé win?', '3', ['1', '2', '4', '5']],
  ['Who is the all-time top scorer in the Champions League?', 'Cristiano Ronaldo', ['Lionel Messi', 'Robert Lewandowski', 'Karim Benzema', 'Raúl']],
  ['Who scored the "Hand of God" goal?', 'Diego Maradona', ['Pelé', 'Zinedine Zidane', 'Roberto Baggio', 'Johan Cruyff']],
  ['Who was sent off for headbutting Materazzi in the 2006 World Cup final?', 'Zinedine Zidane', ['Thierry Henry', 'Patrick Vieira', 'Franck Ribéry', 'Lilian Thuram']],
  ['Which manager is known as "The Special One"?', 'José Mourinho', ['Pep Guardiola', 'Carlo Ancelotti', 'Jürgen Klopp', 'Arsène Wenger']],
  ['Which manager won 13 Premier League titles with Manchester United?', 'Sir Alex Ferguson', ['Arsène Wenger', 'José Mourinho', 'Matt Busby', 'David Moyes']],
  ['Which manager led Arsenal\'s unbeaten 2003–04 season?', 'Arsène Wenger', ['Unai Emery', 'Mikel Arteta', 'George Graham', 'Bruce Rioch']]
];

// ── HARD QUESTION BANK (used silently once everybody finished their easy questions) ──
const HARD = [
  ['Which country won the very first World Cup in 1930?', 'Uruguay', ['Argentina', 'Brazil', 'Italy', 'Germany']],
  ['Who scored a hat-trick in the 1966 World Cup final?', 'Geoff Hurst', ['Bobby Charlton', 'Bobby Moore', 'Roger Hunt', 'Martin Peters']],
  ['Who is the all-time top scorer in World Cup history with 16 goals?', 'Miroslav Klose', ['Ronaldo Nazário', 'Gerd Müller', 'Just Fontaine', 'Pelé']],
  ['Who scored 13 goals at the 1958 World Cup?', 'Just Fontaine', ['Pelé', 'Gerd Müller', 'Eusébio', 'Sándor Kocsis']],
  ['Which club won the first European Cup in 1956?', 'Real Madrid', ['Benfica', 'AC Milan', 'Stade de Reims', 'Manchester United']],
  ['Which club won the 2005 Champions League final on penalties after trailing AC Milan 3–0?', 'Liverpool', ['Manchester United', 'Chelsea', 'Barcelona', 'Arsenal']],
  ['Who scored the golden goal in the Euro 1996 final?', 'Oliver Bierhoff', ['Jürgen Klinsmann', 'Matthias Sammer', 'Stefan Kuntz', 'Mehmet Scholl']],
  ['Which country won Euro 2004 in one of football\'s biggest upsets?', 'Greece', ['Portugal', 'Czech Republic', 'Netherlands', 'Denmark']],
  ['Which country won Euro 1992 after being called in late as a replacement?', 'Denmark', ['Sweden', 'Netherlands', 'Germany', 'Norway']],
  ['Which goalkeeper won the Golden Glove at the 2022 World Cup?', 'Emiliano Martínez', ['Hugo Lloris', 'Yassine Bounou', 'Dominik Livaković', 'Thibaut Courtois']],
  ['Who is the Premier League\'s all-time top scorer?', 'Alan Shearer', ['Harry Kane', 'Wayne Rooney', 'Andrew Cole', 'Sergio Agüero']],
  ['Which club won the 2015–16 Premier League title at odds of 5000–1?', 'Leicester City', ['Tottenham', 'Arsenal', 'Manchester City', 'West Ham']],
  ['Who managed Leicester City to the 2015–16 title?', 'Claudio Ranieri', ['Brendan Rodgers', 'Nigel Pearson', 'Roberto Martínez', 'Sam Allardyce']],
  ['Which club won the treble in 2008–09 under Pep Guardiola?', 'Barcelona', ['Real Madrid', 'Manchester United', 'Inter Milan', 'Bayern Munich']],
  ['Which club won the treble in 2009–10 under José Mourinho?', 'Inter Milan', ['Bayern Munich', 'Chelsea', 'Real Madrid', 'Porto']],
  ['Which club won the treble in 2012–13?', 'Bayern Munich', ['Barcelona', 'Manchester City', 'Juventus', 'Real Madrid']],
  ['Which club won the 2018–19 Champions League, beating Tottenham in the final?', 'Liverpool', ['Barcelona', 'Ajax', 'Manchester City', 'Real Madrid']],
  ['Which club won the 2020–21 Champions League?', 'Chelsea', ['Manchester City', 'Paris Saint-Germain', 'Real Madrid', 'Bayern Munich']],
  ['Which club won the 2022–23 Champions League?', 'Manchester City', ['Inter Milan', 'Real Madrid', 'Bayern Munich', 'AC Milan']],
  ['Which club won the 2023–24 Champions League?', 'Real Madrid', ['Borussia Dortmund', 'Bayern Munich', 'Paris Saint-Germain', 'Manchester City']],
  ['Which club won the 2024–25 Champions League?', 'Paris Saint-Germain', ['Inter Milan', 'Arsenal', 'Barcelona', 'Bayern Munich']],
  ['Who scored the winning goal in the 2010 World Cup final?', 'Andrés Iniesta', ['Xavi', 'David Villa', 'Fernando Torres', 'Cesc Fàbregas']],
  ['Who scored the winning goal in the 2014 World Cup final?', 'Mario Götze', ['Thomas Müller', 'Miroslav Klose', 'André Schürrle', 'Mesut Özil']],
  ['Who scored the winning goal for Portugal in the Euro 2016 final?', 'Éder', ['Cristiano Ronaldo', 'Nani', 'Renato Sanches', 'João Mário']],
  ['Who won the Golden Boot at the 2018 World Cup?', 'Harry Kane', ['Antoine Griezmann', 'Romelu Lukaku', 'Kylian Mbappé', 'Cristiano Ronaldo']],
  ['Who won the Golden Boot at the 2022 World Cup?', 'Kylian Mbappé', ['Lionel Messi', 'Olivier Giroud', 'Julián Álvarez', 'Marcus Rashford']],
  ['Which team did Zinedine Zidane score two headed goals against in the 1998 World Cup final?', 'Brazil', ['Italy', 'Netherlands', 'Croatia', 'Argentina']],
  ['How many Ballon d\'Or awards has Lionel Messi won?', '8', ['6', '7', '5', '9']],
  ['Which Dutch legend won the Ballon d\'Or in 1971, 1973 and 1974?', 'Johan Cruyff', ['Marco van Basten', 'Ruud Gullit', 'Dennis Bergkamp', 'Johan Neeskens']],
  ['Who scored 91 goals in a single calendar year in 2012?', 'Lionel Messi', ['Cristiano Ronaldo', 'Gerd Müller', 'Pelé', 'Zlatan Ibrahimović']],
  ['Who broke Gerd Müller\'s Bundesliga record with 41 goals in 2020–21?', 'Robert Lewandowski', ['Erling Haaland', 'Harry Kane', 'Thomas Müller', 'Pierre-Emerick Aubameyang']],
  ['Which stadium hosted the 2022 World Cup final?', 'Lusail Stadium', ['Al Bayt Stadium', 'Khalifa International Stadium', 'Education City Stadium', 'Al Janoub Stadium']],
  ['Which stadium hosted the 2018 World Cup final?', 'Luzhniki Stadium', ['Krestovsky Stadium', 'Spartak Stadium', 'Fisht Stadium', 'Kazan Arena']],
  ['Which club shares the San Siro stadium with Inter Milan?', 'AC Milan', ['Juventus', 'Roma', 'Napoli', 'Lazio']],
  ['Which club went unbeaten through the entire 2003–04 Premier League season?', 'Arsenal', ['Chelsea', 'Manchester United', 'Liverpool', 'Manchester City']],
  ['Which club won four Premier League titles in a row from 2020–21 to 2023–24?', 'Manchester City', ['Liverpool', 'Chelsea', 'Manchester United', 'Arsenal']],
  ['Which country has won the most Africa Cup of Nations titles?', 'Egypt', ['Cameroon', 'Ghana', 'Nigeria', 'Ivory Coast']],
  ['Which African player won the Ballon d\'Or in 1995?', 'George Weah', ['Samuel Eto\'o', 'Abedi Pele', 'Didier Drogba', 'Roger Milla']],
  ['Which Cameroonian forward became famous for his corner-flag dance at the 1990 World Cup?', 'Roger Milla', ['Samuel Eto\'o', 'Rigobert Song', 'Thomas N\'Kono', 'Patrick Mboma']],
  ['Which team beat Brazil 7–1 in the 2014 World Cup semi-final?', 'Germany', ['Netherlands', 'Argentina', 'France', 'Spain']],
  ['Who scored the fastest goal in World Cup history (11 seconds) in 2002?', 'Hakan Şükür', ['Ilhan Mansiz', 'Rüştü Reçber', 'Hasan Şaş', 'Emre Belözoğlu']],
  ['Which club did Thierry Henry join from Juventus in 1999?', 'Arsenal', ['Monaco', 'Barcelona', 'Chelsea', 'Liverpool']],
  ['Which club did Diego Maradona lead to two Serie A titles?', 'Napoli', ['Boca Juniors', 'Barcelona', 'Sevilla', 'Juventus']],
  ['Which club has won the most Copa Libertadores titles?', 'Independiente', ['Boca Juniors', 'River Plate', 'Peñarol', 'Estudiantes']],
  ['Who scored the "Goal of the Century" against England at the 1986 World Cup?', 'Diego Maradona', ['Jorge Valdano', 'Gary Lineker', 'Mario Kempes', 'Claudio Caniggia']],
  ['Which club did Ronaldo Nazário join from Inter Milan in 2002?', 'Real Madrid', ['Barcelona', 'AC Milan', 'Corinthians', 'Valencia']],
  ['How many World Cup finals has the Netherlands lost?', '3', ['1', '2', '4', '5']],
  ['Who managed Spain to the 2010 World Cup title?', 'Vicente del Bosque', ['Luis Aragonés', 'Julen Lopetegui', 'Luis Enrique', 'Fernando Hierro']],
  ['Who managed Argentina to the 2022 World Cup title?', 'Lionel Scaloni', ['Gerardo Martino', 'Jorge Sampaoli', 'Diego Simeone', 'Marcelo Bielsa']],
  ['Who managed France to the 2018 World Cup title?', 'Didier Deschamps', ['Zinedine Zidane', 'Laurent Blanc', 'Raymond Domenech', 'Arsène Wenger']],
  ['Who managed Italy to the Euro 2020 title?', 'Roberto Mancini', ['Carlo Ancelotti', 'Antonio Conte', 'Gian Piero Ventura', 'Cesare Prandelli']],
  ['Who managed England to the 1966 World Cup title?', 'Alf Ramsey', ['Bobby Robson', 'Don Revie', 'Ron Greenwood', 'Terry Venables']],
  ['Which club did Jürgen Klopp win the Bundesliga with in 2011 and 2012?', 'Borussia Dortmund', ['Mainz 05', 'Bayern Munich', 'Schalke 04', 'Bayer Leverkusen']],
  ['Which club did Pep Guardiola join as manager in 2016?', 'Manchester City', ['Chelsea', 'Manchester United', 'Arsenal', 'Liverpool']]
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

// ── HARD MODE: harder questions, no limit; never repeats until the whole hard bank was used ──
function hardQuestion(g) {
  const seen = g.hardSeen || (g.hardSeen = new Set());
  let cand = HARD.map((_, i) => i).filter(i => !seen.has(i));
  if (!cand.length) { seen.clear(); cand = HARD.map((_, i) => i); }
  const idx = cand[Math.floor(Math.random() * cand.length)];
  seen.add(idx);
  const [q, right, wrong] = HARD[idx];
  const options = shuffle([right, ...wrong]);
  return { q, options, answer: options.indexOf(right) };
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

const ppFail = global.__bqPpFail || (global.__bqPpFail = new Map());  // ids WhatsApp refused recently
const PP_FAIL_TTL = 10 * 60 * 1000;

async function avatarBuffer(conn, p) {
  const ids = [...new Set([p.jid, p.num && `${p.num}@s.whatsapp.net`].filter(Boolean))];
  for (const j of ids) {                                   // 1) cached (a lookup that worked before)
    const hit = ppCache.get(ppKey(j));
    if (hit && Date.now() - hit.t < PP_TTL) return hit.buf;
  }
  // 2) WhatsApp refused this person a moment ago -> don't hammer it again, use the white avatar
  if (ids.every(j => (ppFail.get(ppKey(j)) || 0) > Date.now() - PP_FAIL_TTL)) return await whiteAvatar();

  let axios = null;
  try { axios = require('axios'); } catch {}
  let refused = false;
  for (const j of (axios ? ids : [])) {                    // 3) ask WhatsApp (one try per id, full size then small)
    for (const type of ['image', 'preview']) {
      try {
        const url = await Promise.race([
          conn.profilePictureUrl(j, type),
          new Promise((_, rej) => setTimeout(() => rej(new Error('pp timeout')), 6000))
        ]);
        if (!url) break;
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        const buf = Buffer.from(res.data);
        for (const k of ids) { ppCache.set(ppKey(k), { buf, t: Date.now() }); ppFail.delete(ppKey(k)); }
        return buf;
      } catch (e) {
        const code = e?.data || e?.output?.statusCode;
        if (code === 401 || code === 404 || /not-authorized|item-not-found/i.test(e?.message || '')) { refused = true; break; }  // same answer for the small size, skip it
      }
    }
  }
  if (refused) for (const k of ids) ppFail.set(ppKey(k), Date.now());
  return await whiteAvatar();                              // 4) no picture / hidden -> white avatar
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
  const g = global.footballQuizGames[chatId];
  if (g) { clearTimeout(g.startTimer); clearTimeout(g.turnTimer); }
  delete global.footballQuizGames[chatId];
}

const send = (conn, chatId, text, mentions, quoted) =>
  conn.sendMessage(chatId, { text, mentions: mentions || [] }, quoted ? { quoted } : undefined);

// ── game flow ──────────────────────────────────────────
async function askNext(conn, chatId) {
  const g = global.footballQuizGames[chatId];
  if (!g || g.status !== 'active') return;
  if (g.players.length <= 1) return finish(conn, chatId);

  if (g.idx >= g.players.length) g.idx = 0;
  const p = g.players[g.idx];

  // Everybody stays on EASY until EVERY player still in the game has had EASY_COUNT easy questions.
  // Then the whole game moves to HARD together (never announced).
  const everyoneDone = g.players.every(x => (x.asked || 0) >= EASY_COUNT);
  const qa = everyoneDone ? hardQuestion(g) : pickQuestion(g, p);
  p.asked = (p.asked || 0) + 1;
  g.qnum = (g.qnum || 0) + 1;
  g.current = { ...qa, qid: (g.qid = (g.qid || 0) + 1), done: false };

  const opts = qa.options.map((o, i) => `*${LETTERS[i]}.* ${o}`).join('\n');
  const caption =
    `⚽ *FOOTBALL QUIZ — Question ${g.qnum}*\n\n` +
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
  const g = global.footballQuizGames[chatId];
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
  const g = global.footballQuizGames[chatId];
  if (!g) return;

  // 1st = last one standing, then the most recently removed, and so on
  const ranking = [...g.players, ...[...g.eliminated].reverse()];
  const total = g.qnum || 0;
  const everyone = ranking.length;
  clean(chatId);

  if (!ranking.length) return send(conn, chatId, '🏁 *FOOTBALL QUIZ HAS ENDED!*\n\nNobody is left standing.');

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
    `🏁 *FOOTBALL QUIZ HAS ENDED!*\n\n` +
    `${line}\n🏆 *FINAL RESULTS*\n${line}\n\n` +
    `${blocks}\n\n` +
    `${line}\n📌 *QUIZ SUMMARY*\n${line}\n\n` +
    `⚽ Total Questions: ${total}\n` +
    `👤 Participants: ${everyone}\n` +
    `🥇 Overall Champion: ${champ.name || champ.num}\n\n` +
    `${line}\n✨ *QUIZ SESSION CLOSED!*\n\n` +
    `Thank you for participating.\n` +
    `Keep the passion for the beautiful game alive.\n\n` +
    `⚽ See you on the pitch! 🏆`,
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
    const g = chatId && global.footballQuizGames[chatId];
    if (!g) return false;

    // ignore the bot's own automatic messages, but allow the linked account's typed messages
    if (m.key?.fromMe && global._botSentIds && global._botSentIds.has(m.key.id)) return false;

    const raw = getText(m);
    if (!raw) return false;
    const lower = raw.toLowerCase().replace(/^[.!/\\#]+/, '').trim();
    if (!lower) return false;

    // ── QUIT (lobby or game) ──
    if (lower === 'quit' || lower === 'fqquit' || lower === 'quit!' || lower === 'quit.') {
      const whoQ = await whoIs(m, ctx);
      return await quitPlayer(conn, chatId, g, whoQ, m);
    }

    // ── LOBBY: anybody typing join ──
    if (g.status === 'waiting') {
      if (!(lower === 'join' || /^join[\s!.]/.test(lower) || lower === 'fqjoin')) return false;

      const who = await whoIs(m, ctx);
      if (g.players.some(p => sameUser(p, who))) {
        await send(conn, chatId, `⚠️ @${who.num} you're already in the lobby!`, [who.jid], m);
        return true;
      }
      g.players.push({ jid: who.jid, num: who.num, name: who.name, keys: who.keys, tries: MAX_TRIES, asked: 0, score: 0 });
      await send(conn, chatId,
        `✅ @${who.num} *joined the Football Quiz!*\n👥 Players in lobby: *${g.players.length}*`,
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
    console.log('[FOOTBALLQUIZ RAW ERROR]', e.message);
    return false;
  }
}

// ── COMMANDS ───────────────────────────────────────────
module.exports = [
  {
    command: ['footballquiz'],
    alias: ['fq', 'footballtrivia', 'soccerquiz'],
    category: 'games',
    description: 'Start a football quiz game (type join to enter)',
    use: '.footballquiz',
    group: true,

    async execute(m, { ednut, from, reply }) {
      const chatId = from || m.chat || m.key?.remoteJid;
      if (global.bibleQuizGames && global.bibleQuizGames[chatId]) {
        return reply('⚠️ A Bible Quiz is running in this group. Wait until it ends.');
      }
      if (global.footballQuizGames[chatId]) {
        return reply('⚠️ A Football Quiz is already running! Type *.fqstop* to end it.');
      }

      const g = global.footballQuizGames[chatId] = {
        status: 'waiting', players: [], eliminated: [], idx: 0,
        current: null, pool: null, qid: 0,
        host: digits(bestJid(m)), startTimer: null, turnTimer: null
      };

      await send(ednut, chatId,
        `⚽ *FOOTBALL QUIZ STARTING!*\n\n` +
        `📌 Type *join* to enter the game\n` +
        `👥 Minimum players: *${MIN_PLAYERS}*\n` +
        `⏳ Lobby closes in *${JOIN_WINDOW / 1000} seconds*\n\n` +
        `📖 *Rules:*\n` +
        `• I ask one player at a time a football question\n` +
        `• Options are *A, B, C, D, E* — reply with the letter\n` +
        `• You have *${TURN_TIME / 1000} seconds* per question\n` +
        `• Wrong answer or no answer = *1 try used*\n` +
        `• You have *${MAX_TRIES} tries* — fail ${MAX_TRIES} times and you are *REMOVED* ❌\n` +
        `• Type *quit* anytime to leave the game\n` +
        `• Last one standing *WINS* 🏆`, [], m);

      g.startTimer = setTimeout(async () => {
        const s = global.footballQuizGames[chatId];
        if (!s || s.status !== 'waiting') return;

        if (s.players.length < MIN_PLAYERS) {
          await send(ednut, chatId,
            `❌ *Football Quiz cancelled!*\nNot enough players joined (${s.players.length}/${MIN_PLAYERS}).\nType *.footballquiz* to try again.`);
          return clean(chatId);
        }

        shuffle(s.players);
        s.status = 'active';
        s.idx = 0;
        await send(ednut, chatId,
          `🚀 *FOOTBALL QUIZ IS STARTING NOW!*\n\n👥 *Players (${s.players.length}):*\n` +
          s.players.map((p, i) => `${i + 1}. ${tag(p)}`).join('\n') +
          `\n\n🍀 Good luck everyone!`,
          s.players.map(p => p.jid));
        await askNext(ednut, chatId);
      }, JOIN_WINDOW);
    }
  },

  {
    command: ['fqstop'],
    alias: ['stopfq', 'endfq', 'stopfootballquiz'],
    category: 'games',
    description: 'Stop the current football quiz',
    use: '.fqstop',
    group: true,

    async execute(m, ctx) {
      const { from, reply } = ctx;
      const chatId = from || m.chat || m.key?.remoteJid;
      const g = global.footballQuizGames[chatId];
      if (!g) return reply('❌ No Football Quiz is currently running.');

      // only players who are still in this game can stop it; everybody else is ignored
      const who = await whoIs(m, ctx);
      if (!g.players.some(p => sameUser(p, who))) return;

      const p = g.players.find(x => sameUser(x, who));
      clean(chatId);
      return send(ctx.ednut, chatId, `🛑 *Football Quiz stopped by ${tag(p)}.*`, [p.jid], m);
    }
  },

  {
    command: ['fqplayers'],
    alias: ['fqlist'],
    category: 'games',
    description: 'Show football quiz players and tries left',
    use: '.fqplayers',
    group: true,

    async execute(m, { ednut, from, reply }) {
      const chatId = from || m.chat || m.key?.remoteJid;
      const g = global.footballQuizGames[chatId];
      if (!g) return reply('❌ No Football Quiz is currently running.');
      const list = g.players.length
        ? g.players.map((p, i) => `${i + 1}. ${tag(p)} — ❤️ ${p.tries}/${MAX_TRIES}`).join('\n')
        : '_No players yet — type *join* to enter!_';
      return send(ednut, chatId,
        `⚽ *Football Quiz Players* [${g.status === 'waiting' ? '⏳ Lobby open' : '🎮 In progress'}]\n\n${list}`,
        g.players.map(p => p.jid), m);
    }
  }
];

// handler.js uses this directly (same pattern as afk.js)
Object.defineProperty(module.exports, 'rawHandler', { value: rawHandler, enumerable: false });