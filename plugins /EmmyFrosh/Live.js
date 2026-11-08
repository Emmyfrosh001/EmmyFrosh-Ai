// plugins/EmmyFrosh/football.js  (category: Sport)
// .live / .livescore  live scores + last match      .nextmatch / .match  fixtures
// .predict            predictions + odds slips      .corners             corner estimates
// .notify / .alert    goal / card / penalty alerts  (also: .live man u goals pk)
// .notify test        checks that alerts can reach this chat
// .env -> APISPORTS_KEY=... (optional)    npm i sharp (optional: both crests in one picture)

const axios = require("axios"), fs = require("fs"), path = require("path");
let sharp = null; try { sharp = require("sharp"); } catch {}

const KEY = process.env.APISPORTS_KEY || "d03caed1d242a129e00fb0e4eb557bfe"; // a key in .env (APISPORTS_KEY) wins over this one
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const TZ = "Africa/Lagos", DAY = 864e5, SEP = "━━━━━━━━━━━━━━", CHUNK = 3500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const http = axios.create({ timeout: 20000, headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });

// GET json with a retry (one hiccup must never hide a live match)
async function getJson(url, tries = 2, timeout = 9000) {
  for (let i = 0; i < tries; i++) {
    try { return (await http.get(url, { timeout })).data; }
    catch (e) {
      const st = e?.response?.status;
      if ((st && st < 500 && st !== 429) || i === tries - 1) return null;
      await sleep(500);
    }
  }
  return null;
}

// run fn on items, only `limit` at a time
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const k = next++; out[k] = await fn(items[k]); }
  }));
  return out;
}

// ============================== DATA ==============================
// id = API-Football league id, espn = ESPN slug
const L = {
  epl: { id: 39, espn: "eng.1" }, championship: { id: 40, espn: "eng.2" }, league1: { id: 41, espn: "eng.3" },
  league2: { id: 42, espn: "eng.4" }, facup: { id: 45, espn: "eng.fa" }, leaguecup: { id: 48, espn: "eng.league_cup" },
  laliga: { id: 140, espn: "esp.1" }, laliga2: { id: 141, espn: "esp.2" }, copadelrey: { id: 143, espn: "esp.copa_del_rey" },
  seriea: { id: 135, espn: "ita.1" }, serieb: { id: 136, espn: "ita.2" }, coppaitalia: { id: 137, espn: "ita.coppa_italia" },
  bundesliga: { id: 78, espn: "ger.1" }, bundesliga2: { id: 79, espn: "ger.2" }, dfbpokal: { id: 81, espn: "ger.dfb_pokal" },
  ligue1: { id: 61, espn: "fra.1" }, ligue2: { id: 62, espn: "fra.2" }, coupedefrance: { id: 66, espn: "fra.coupe_de_france" },
  eredivisie: { id: 88, espn: "ned.1" }, portugal: { id: 94, espn: "por.1" }, turkey: { id: 203, espn: "tur.1" },
  belgium: { id: 144, espn: "bel.1" }, scotland: { id: 179, espn: "sco.1" }, greece: { id: 197, espn: "gre.1" },
  russia: { id: 235, espn: "rus.1" }, ukraine: { id: 333, espn: "ukr.1" }, denmark: { id: 119, espn: "den.1" },
  sweden: { id: 113, espn: "swe.1" }, norway: { id: 103, espn: "nor.1" }, switzerland: { id: 207, espn: "sui.1" },
  austria: { id: 218, espn: "aut.1" }, ucl: { id: 2, espn: "uefa.champions" }, uel: { id: 3, espn: "uefa.europa" },
  uecl: { id: 848, espn: "uefa.europa.conf" }, nations: { id: 5, espn: "uefa.nations" }, mls: { id: 253, espn: "usa.1" },
  ligamx: { id: 262, espn: "mex.1" }, brazil: { id: 71, espn: "bra.1" }, brazilb: { id: 72, espn: "bra.2" },
  argentina: { id: 128, espn: "arg.1" }, colombia: { id: 239, espn: "col.1" }, chile: { id: 265, espn: "chi.1" },
  uruguay: { id: 268, espn: "uru.1" }, libertadores: { id: 13, espn: "conmebol.libertadores" },
  sudamericana: { id: 11, espn: "conmebol.sudamericana" }, saudi: { id: 307, espn: "sau.1" }, japan: { id: 98, espn: "jpn.1" },
  korea: { id: 292, espn: "kor.1" }, china: { id: 169, espn: "chn.1" }, australia: { id: 188, espn: "aus.1" },
  nigeria: { id: 399, espn: null }, egypt: { id: 233, espn: "egy.1" }, southafrica: { id: 288, espn: "rsa.1" },
  morocco: { id: 200, espn: "mar.1" }, cafcl: { id: 12, espn: "caf.champions" }, afcon: { id: 6, espn: "caf.nations" },
  worldcup: { id: 1, espn: "fifa.world" }, clubworldcup: { id: 15, espn: "fifa.cwc" }, friendlies: { id: 10, espn: "fifa.friendly" },
  brazilu20: { id: null, espn: null }, all: { id: null, espn: null }
};

// extra ESPN competitions searched for national teams / other clubs
const EXTRA_SLUGS = [
  "fifa.friendly", "caf.nations", "fifa.world", "fifa.worldq.caf", "uefa.nations", "fifa.worldq.uefa",
  "fifa.worldq.conmebol", "concacaf.gold", "afc.cup", "conmebol.america", "club.friendly", "eng.charity",
  "uefa.super_cup", "fifa.intercontinental.cup", "concacaf.champions", "afc.champions",
  // lower leagues / cups (a slug ESPN does not have is just skipped)
  "hon.1", "crc.1", "slv.1", "gua.1", "pan.1", "per.1", "ecu.1", "bol.1", "ven.1", "par.1", "concacaf.leagues.cup", "concacaf.central.american.cup", "ned.2", "ned.cup", "bel.2", "por.2", "sco.2", "sui.2", "aut.2", "den.2", "swe.2", "nor.2", "tur.2", "gre.2", "ger.3", "fra.3", "ita.3", "esp.3", "eng.5"
];

const COUNTRY = {
  nigeria: "nigeria", egypt: "egypt", morocco: "morocco", portugal: "portugal", turkey: "turkey", belgium: "belgium",
  scotland: "scotland", greece: "greece", russia: "russia", ukraine: "ukraine", denmark: "denmark", sweden: "sweden",
  norway: "norway", switzerland: "switzerland", austria: "austria", brazil: "brazil", argentina: "argentina",
  colombia: "colombia", chile: "chile", uruguay: "uruguay", saudi: "saudi arabia", japan: "japan", korea: "south korea",
  china: "china", australia: "australia", southafrica: "south africa", ghana: "ghana", senegal: "senegal",
  cameroon: "cameroon", ivorycoast: "ivory coast", algeria: "algeria", tunisia: "tunisia", england: "england",
  france: "france", germany: "germany", spain: "spain", italy: "italy", netherlands: "netherlands",
  slovenia: "slovenia", croatia: "croatia", serbia: "serbia", poland: "poland", czechrepublic: "czech republic", czech: "czech republic",
  hungary: "hungary", romania: "romania", bulgaria: "bulgaria", finland: "finland", iceland: "iceland", ireland: "ireland",
  wales: "wales", northernireland: "northern ireland", slovakia: "slovakia", bosnia: "bosnia", albania: "albania", kosovo: "kosovo",
  montenegro: "montenegro", northmacedonia: "north macedonia", israel: "israel", georgia: "georgia", armenia: "armenia",
  azerbaijan: "azerbaijan", kazakhstan: "kazakhstan", cyprus: "cyprus", luxembourg: "luxembourg", malta: "malta", belarus: "belarus",
  lithuania: "lithuania", latvia: "latvia", estonia: "estonia", mali: "mali", drcongo: "dr congo", angola: "angola", zambia: "zambia",
  zimbabwe: "zimbabwe", kenya: "kenya", uganda: "uganda", tanzania: "tanzania", ethiopia: "ethiopia", benin: "benin", togo: "togo",
  gabon: "gabon", guinea: "guinea", burkinafaso: "burkina faso", capeverde: "cape verde", mexico: "mexico", canada: "canada",
  peru: "peru", ecuador: "ecuador", paraguay: "paraguay", venezuela: "venezuela", bolivia: "bolivia", costarica: "costa rica",
  jamaica: "jamaica", iran: "iran", iraq: "iraq", qatar: "qatar", uae: "united arab emirates", jordan: "jordan", uzbekistan: "uzbekistan",
  india: "india", thailand: "thailand", vietnam: "vietnam", indonesia: "indonesia", newzealand: "new zealand"
};

// league words (keys have no spaces)
const ALIAS = {
  u20: "brazilu20", seriea2: "serieb", pl: "epl", premier: "epl", premierleague: "epl", englishpremierleague: "epl",
  liga: "laliga", championsleague: "ucl", champions: "ucl", cl: "ucl", europaleague: "uel", europa: "uel", el: "uel",
  conference: "uecl", conferenceleague: "uecl", ligaportugal: "portugal", primeira: "portugal", primeiraliga: "portugal",
  majorleaguesoccer: "mls", saudiproleague: "saudi", saudileague: "saudi", spl: "saudi"
};
// country words that mean a league for .predict / .match only (for .live they mean the national team)
const FB_ALIAS = {
  england: "epl", english: "epl", spain: "laliga", spanish: "laliga", germany: "bundesliga", german: "bundesliga",
  ger: "bundesliga", italy: "seriea", italian: "seriea", serie: "seriea", france: "ligue1", french: "ligue1",
  ligue: "ligue1", dutch: "eredivisie", netherlands: "eredivisie", portuguese: "portugal", usa: "mls"
};
// short team names (keys have no spaces)
const TEAM = {
  man: "manchester united", manu: "manchester united", manutd: "manchester united", manunited: "manchester united",
  mufc: "manchester united", manchesterunited: "manchester united", mancity: "manchester city", mcity: "manchester city",
  mcfc: "manchester city", spurs: "tottenham", barca: "barcelona", psg: "paris saint-germain", inter: "inter",
  intermilan: "inter", acmilan: "ac milan", juve: "juventus", wolves: "wolverhampton", westham: "west ham",
  palace: "crystal palace", forest: "nottingham forest", villa: "aston villa", gunners: "arsenal",
  atletico: "atletico madrid", real: "real madrid", realmadrid: "real madrid", bayern: "bayern munich",
  dortmund: "borussia dortmund", alhilal: "al hilal", hilal: "al hilal", alnassr: "al nassr", nassr: "al nassr",
  alahly: "al ahly", ahly: "al ahly", alittihad: "al ittihad", ittihad: "al ittihad", alahli: "al ahli", alshabab: "al shabab"
};
// "ai hilal" (lowercase L typed as i) → "al hilal"; "alhilal" / "hilal" → "al hilal"
const tAlias = (q) => {
  q = (q || "").replace(/(^|\s)ai(?=\s)/gi, "$1al").replace(/(^|\s)ai-/gi, "$1al-");
  const side = q.match(/^(.+?)\s+(w|women|womens|ladies|u-?\d{2}|ii|b)$/i);       // "man u w" → "manchester united w"
  if (side) { const base = TEAM[side[1].replace(/\s+/g, "")]; if (base) return `${base} ${side[2]}`; }
  return TEAM[q.replace(/\s+/g, "")] || q;
};

const PRETTY = {
  epl: "Premier League", championship: "Championship", facup: "FA Cup", leaguecup: "League Cup", laliga: "La Liga",
  copadelrey: "Copa del Rey", seriea: "Serie A", serieb: "Serie B", coppaitalia: "Coppa Italia", bundesliga: "Bundesliga",
  dfbpokal: "DFB Pokal", ligue1: "Ligue 1", coupedefrance: "Coupe de France", ucl: "Champions League",
  uel: "Europa League", uecl: "Conference League", nations: "Nations League", libertadores: "Libertadores",
  sudamericana: "Sudamericana", cafcl: "CAF Champions League", afcon: "AFCON", worldcup: "World Cup",
  clubworldcup: "Club World Cup", mls: "MLS"
};
const SLUG_LABEL = {
  "eng.1": "English Premier League", "eng.2": "English Championship", "eng.fa": "FA Cup", "eng.league_cup": "League Cup",
  "eng.charity": "Community Shield", "esp.1": "Spanish La Liga", "esp.copa_del_rey": "Copa del Rey",
  "ita.1": "Italian Serie A", "ita.coppa_italia": "Coppa Italia", "ger.1": "German Bundesliga",
  "ger.dfb_pokal": "DFB Pokal", "fra.1": "French Ligue 1", "fra.coupe_de_france": "Coupe de France",
  "uefa.champions": "UEFA Champions League", "uefa.europa": "UEFA Europa League",
  "uefa.europa.conf": "UEFA Conference League", "uefa.super_cup": "UEFA Super Cup", "uefa.nations": "UEFA Nations League",
  "fifa.friendly": "International Friendly", "club.friendly": "Club Friendly", "caf.nations": "Africa Cup of Nations",
  "fifa.world": "World Cup", "fifa.cwc": "Club World Cup", "usa.1": "MLS", "ned.1": "Eredivisie",
  "por.1": "Liga Portugal", "sau.1": "Saudi Pro League"
};

// leagues offered by .predict / .match / .corners
const FB_KEYS = ["epl", "laliga", "bundesliga", "seriea", "ligue1", "ucl", "uel", "uecl", "eredivisie", "portugal", "mls", "saudi"];
const FB = FB_KEYS.map((k) => ({ key: k, code: L[k].espn, name: SLUG_LABEL[L[k].espn] }));
const fbKey = (j) => FB_KEYS.includes(j) ? j : [ALIAS[j], FB_ALIAS[j]].find((k) => FB_KEYS.includes(k));

// ============================== SMALL HELPERS ==============================
const dtf = (d, o, loc = "en-GB") => new Intl.DateTimeFormat(loc, { timeZone: TZ, ...o }).format(d);
const lagosDay = (d) => dtf(d, {}, "en-CA");
const fullDate = (d) => dtf(d, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const timeLabel = (d) => dtf(d, { hour: "2-digit", minute: "2-digit", hour12: false });
const whenLine = (d) => `📅 ${fullDate(d)} • ⏰ ${timeLabel(d)}`;
const dec = (n) => (n ? n.toFixed(2) : "—");
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : w.endsWith("ch") ? "es" : "s"}`;

function teamHas(name, q) {
  const words = norm(q).split(/\s+/).filter((w) => w.length > 1);
  return !!words.length && words.every((w) => norm(name).includes(w));
}
const textFilter = (list, raw) => {
  const words = norm(raw).split(/\s+/).filter((w) => w.length > 1);
  return words.length ? list.filter((g) => { const h = norm(`${g.league} ${g.home} ${g.away}`); return words.every((w) => h.includes(w)); }) : [];
};
const pairFilter = (list, a, b) =>
  list.filter((g) => (teamHas(g.home, a) && teamHas(g.away, b)) || (teamHas(g.home, b) && teamHas(g.away, a)));

// Women / youth / reserve sides are NOT the first team unless the user typed it (".live sevilla women")
const SIDE_RE = /(^|\s)(w|women|womens|ladies|femenino|feminin|u-?\d{2}|ii|b|reserves?|youth|academy)(\s|$)/i;
function dropSide(rows, q) {
  if (SIDE_RE.test(q || "")) return rows;
  const keep = rows.filter((g) => {
    const mine = teamHas(g.home, q) ? g.home : teamHas(g.away, q) ? g.away : "";
    return !(mine && SIDE_RE.test(mine));
  });
  return keep.length ? keep : rows;
}

// ============================== ODDS ==============================
function parseAmerican(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") {
    const s = v.trim().toUpperCase();
    if (s === "EVEN" || s === "EV") return 100;
    const n = parseFloat(s.replace("+", ""));
    return Number.isFinite(n) && n !== 0 ? n : null;
  }
  return Number.isFinite(v) && v !== 0 ? v : null;
}
const toDec = (ml) => (ml === null ? null : ml > 0 ? 1 + ml / 100 : 1 + 100 / Math.abs(ml));

function extractOdds(comp) {
  const o = comp?.odds?.[0];
  if (!o) return null;
  const ml = (side, key) =>
    toDec(parseAmerican(o[key]?.moneyLine) ?? parseAmerican(o.moneyline?.[side]?.close?.odds) ?? parseAmerican(o.moneyline?.[side]?.open?.odds));
  const homeDec = ml("home", "homeTeamOdds"), awayDec = ml("away", "awayTeamOdds"), drawDec = ml("draw", "drawOdds");
  if (!homeDec || !awayDec) return null;
  const lineRaw = typeof o.overUnder === "number" ? o.overUnder
    : parseFloat(String(o.total?.over?.close?.line || o.total?.over?.open?.line || "").replace(/[^0-9.]/g, ""));
  const ou = (key, t) => toDec(parseAmerican(o[key] ?? o.total?.[t]?.close?.odds ?? o.total?.[t]?.open?.odds));
  return { homeDec, awayDec, drawDec, goalLine: Number.isFinite(lineRaw) && lineRaw > 0 ? lineRaw : null, overDec: ou("overOdds", "over"), underDec: ou("underOdds", "under") };
}

// decimal odds → win chances with the bookmaker margin removed
function toChances(o) {
  const ph = 1 / o.homeDec, pa = 1 / o.awayDec, pd = o.drawDec ? 1 / o.drawDec : 0, t = ph + pa + pd;
  return { home: (ph / t) * 100, draw: (pd / t) * 100, away: (pa / t) * 100 };
}
const pickName = (short, abbr) => (!short ? abbr || "Team" : short.length > 16 && abbr ? abbr : short);

function buildPrediction(ev) {
  const c = toChances(ev.odds), h = pickName(ev.homeShort, ev.homeAbbr), a = pickName(ev.awayShort, ev.awayAbbr);
  const opts = [
    { key: "home", label: h, pct: c.home, dc: `${h} or Draw` },
    { key: "draw", label: "Draw", pct: c.draw },
    { key: "away", label: a, pct: c.away, dc: `${a} or Draw` }
  ].filter((o) => o.key !== "draw" || ev.odds.drawDec).sort((x, y) => y.pct - x.pct);
  const top = opts[0];
  const safer = top.key !== "draw" && top.pct < 50 && ev.odds.drawDec ? `${top.dc} (${(top.pct + c.draw).toFixed(0)}%)` : null;
  const r = Math.round(top.pct);
  return { chances: c, top, safer, confidence: r >= 60 ? "High" : r >= 49 ? "Medium" : "Low" };
}

// normalised over / under chances when both sides are priced
function ouChances(o) {
  if (!(o.goalLine && o.overDec && o.underDec)) return null;
  const po = 1 / o.overDec, pu = 1 / o.underDec, t = po + pu;
  return { over: po / t, under: pu / t };
}
function goalsPick(o) {
  if (!o.goalLine) return null;
  const c = ouChances(o);
  if (!c) return `O/U ${o.goalLine}`;
  return c.over >= c.under
    ? `Over ${o.goalLine} (${(c.over * 100).toFixed(0)}%) @ ${dec(o.overDec)}`
    : `Under ${o.goalLine} (${(c.under * 100).toFixed(0)}%) @ ${dec(o.underDec)}`;
}

// ============================== FIXTURES (.nextmatch / .predict) ==============================
const LIMIT = { next: 3, team: 2, all: 40, day: 100, max: 100 };

async function fetchLeagueDay(l, dateStr) {
  const data = await getJson(`${ESPN}/${l.code}/scoreboard?dates=${dateStr}`, 1, 6000);
  return (data?.events || []).map((ev) => {
    const comp = ev.competitions?.[0] || {}, cs = comp.competitors || [];
    const H = cs.find((c) => c.homeAway === "home"), A = cs.find((c) => c.homeAway === "away");
    return {
      id: `${l.code}:${ev.id}`, date: new Date(ev.date), state: ev.status?.type?.state, league: l.name,
      home: H?.team?.displayName || ev.shortName || "TBD", away: A?.team?.displayName || "TBD",
      homeShort: H?.team?.shortDisplayName || H?.team?.displayName, awayShort: A?.team?.shortDisplayName || A?.team?.displayName,
      homeAbbr: H?.team?.abbreviation, awayAbbr: A?.team?.abbreviation, homeId: H?.team?.id, awayId: A?.team?.id,
      leagueCode: l.code, homeScore: H?.score, awayScore: A?.score,
      detail: ev.status?.type?.shortDetail || ev.status?.displayClock || "", odds: extractOdds(comp)
    };
  });
}

// ---------- predictions for games with NO bookmaker odds: recent form of both teams ----------
const _formCache = new Map();
async function teamForm(name) {
  const k = norm(name), hit = _formCache.get(k);
  if (hit && Date.now() - hit.t < 3 * 3600e3) return hit.v;
  let v = null;
  try {
    const t = await h2hTeam(name);
    if (t) {
      const rows = await collectResults(await teamEntries(t, searchSlugs()), 5, null, 2);
      if (rows.length) {
        let pts = 0, gf = 0, ga = 0, str = "";
        for (const r of rows) {
          const mine = String(r.homeId) === String(t.id) ? r.hg : r.ag, th = String(r.homeId) === String(t.id) ? r.ag : r.hg;
          gf += mine; ga += th;
          if (mine > th) { pts += 3; str += "W"; } else if (mine === th) { pts += 1; str += "D"; } else str += "L";
        }
        v = { n: rows.length, pts, gf, ga, str };
      }
    }
  } catch (e) { console.log("FORM ERROR:", name, e?.message); }
  _formCache.set(k, { t: Date.now(), v });
  return v;
}
async function formPick(ev) {
  const [h, a] = await Promise.all([teamForm(ev.home), teamForm(ev.away)]);
  if (!h || !a) return null;
  const strength = (f) => (f.pts / (3 * f.n)) * 0.6 + Math.min(1, Math.max(0, ((f.gf - f.ga) / f.n + 2) / 4)) * 0.4;
  const diff = strength(h) - strength(a) + 0.08;                       // +0.08 = home advantage
  const pd = Math.max(0.15, 0.28 - 0.5 * Math.abs(diff)), rem = 1 - pd, ph = rem / (1 + Math.exp(-5 * diff));
  return { home: ph * 100, draw: pd * 100, away: (rem - ph) * 100, hForm: h.str, aForm: a.str };
}

// add LiveScore games (competitions ESPN has no feed for, e.g. the EFL Cup) to a getMatches() result
async function mergeLsMatches(res, a, opts, leagueObj) {
  const test = lsStageTest(a.league);
  if (!test || opts.mode === "live") return res;
  try {
    const day = opts.mode === "day" ? opts.dayOffset : null, now = Date.now();
    const ls = await lsRange(day ?? 0, day ?? 14, test, null, leagueObj.name);
    const known = [...res.matches, ...res.live];
    const fresh = ls.filter((r) => !r.off).map((r) => ({
      id: r.id, date: r.date, state: r.state, league: r.league, home: r.home, away: r.away, homeShort: r.home, awayShort: r.away,
      homeScore: r.hg, awayScore: r.ag, detail: r.detail, odds: null
    })).filter((e) => !known.some((k) => likeName(k.home, e.home) && likeName(k.away, e.away) && Math.abs(k.date - e.date) < 36 * 3600e3));
    const targetDay = day === null ? null : lagosDay(new Date(now + day * DAY));
    const pre = fresh.filter((e) => e.state === "pre" && e.date.getTime() > now && (!targetDay || lagosDay(e.date) === targetDay));
    return { ...res, matches: [...res.matches, ...pre].sort((x, y) => x.date - y.date).slice(0, opts.limit), live: [...res.live, ...fresh.filter((e) => e.state === "in")] };
  } catch (e) { console.log("LS MERGE ERROR:", e?.message); return res; }
}

// opts: { mode: next | all | day | team | live, limit, dayOffset, team }
async function getMatches(leagues, opts) {
  const now = Date.now(), found = new Map(), live = new Map();
  const isDay = opts.mode === "day";
  const targetDay = isDay ? lagosDay(new Date(now + opts.dayOffset * DAY)) : null;
  const span = opts.mode === "team" ? 21 : opts.limit > 40 ? 14 : 8;
  const start = isDay ? opts.dayOffset - 1 : -1;
  const end = opts.mode === "live" ? 0 : isDay ? opts.dayOffset + 1 : span - 1;

  for (let off = start; off <= end; off++) {
    const dateStr = ymd(new Date(now + off * DAY));
    const results = await Promise.all(leagues.map((l) => fetchLeagueDay(l, dateStr)));
    for (const ev of results.flat()) {
      if (opts.team && ![ev.home, ev.away].some((n) => norm(n).includes(norm(opts.team)))) continue;
      if (ev.state === "in") {
        if (opts.mode === "live") found.set(ev.id, ev);
        else if (!isDay || targetDay === lagosDay(new Date(now))) live.set(ev.id, ev);
        continue;
      }
      if (opts.mode === "live" || ev.state !== "pre" || ev.date.getTime() <= now) continue; // only matches not started yet
      if (targetDay && lagosDay(ev.date) !== targetDay) continue;
      found.set(ev.id, ev);
    }
    if (!isDay && off >= 0 && found.size >= opts.limit) break;
  }
  return { matches: [...found.values()].sort((a, b) => a.date - b.date).slice(0, opts.limit), live: [...live.values()], span };
}

function parseArgs(raw) {
  const out = { menu: false, all: false, day: null, count: null, league: null, team: null, live: false, sporty: false, odds: null, corners: false };
  const words = (raw || "").toLowerCase().replace(/ligue\s*1/g, "ligue1").replace(/(\d+(?:\.\d+)?)\s+odds?\b/g, "$1odds").split(/\s+/).filter(Boolean);
  if (words.length === 1 && ["menu", "leagues", "league", "list", "codes", "help"].includes(words[0].replace(/[^a-z]/g, ""))) return { ...out, menu: true };

  const rest = [];
  for (const w0 of words) {
    const mo = w0.match(/^(\d+(?:\.\d+)?)odds?$/);
    if (mo) { out.odds = Math.min(100, Math.max(1.5, parseFloat(mo[1]))); continue; }
    const w = w0.replace(/[^a-z0-9]/g, "");
    if (!w) continue;
    if (w === "all") out.all = true;
    else if (w === "live") out.live = true;
    else if (["corners", "corner", "conner", "conners"].includes(w)) out.corners = true;
    else if (["sportybet", "sporty", "sportybetcode", "sportycode"].includes(w)) out.sporty = true;
    else if (/^\d{1,3}$/.test(w)) out.count = Math.min(LIMIT.max, Math.max(1, +w));
    else if (["today", "2day"].includes(w)) out.day = "today";
    else if (["tomorrow", "tomorow", "tommorow", "tmrw", "tmr", "2moro", "2morrow"].includes(w)) out.day = "tomorrow";
    else rest.push(w);
  }
  if (rest.length) {
    const j = rest.join(""), k = fbKey(j);
    if (k) out.league = k;
    else {
      const t = matchTarget(rest.join(" "));                       // efl cup / championship / fa cup / italy serie a ...
      if (t.league && !t.team) out.league = t.league;
      else out.team = TEAM[j] || rest.join(" ");
    }
  }
  return out;
}

// ---------- text ----------
const slipHelp = (p) =>
  `🎟️ *Odds slip (accumulator)*\n` +
  [`predict 5odds → games not started, total ≈ 5 odds`, `predict 10odds → any number works`, `predict live 5odds → built from live games`,
   `predict epl 5odds → one league only`, `predict tomorrow 8odds → tomorrow's games`, `predict live → live game predictions`,
   `live sportybet 5 odds → live slip + SportyBet steps`].map((x) => p + x).join("\n") + "\n\n";
const cornersHelp = (p) =>
  `⛳ *Corner predictions*\n` +
  [`corners → next 3 matches`, `corners epl → one league`, `corners man u → that team's next match`, `corners tomorrow 5 → first 5 of tomorrow`]
    .map((x) => p + x).join("\n") + "\n\n";

function menuText(kind, p) {
  const pred = kind === "predict", c = pred ? "predict" : "match";
  const how = [
    "epl → next 3 in a league", "premier league all → up to 40 in that league", "10 → next 10 matches (max 100)",
    "epl 5 → next 5 in a league", "all → up to 40, all leagues", "today → every match left today (up to 100)",
    "tomorrow → every match tomorrow (or *2moro*)", "tomorrow 20 → first 20 of tomorrow", "epl tomorrow → one league, tomorrow",
    `man u → ${pred ? "that team's next match (not played yet)" : "who they play next (live / today too)"}`
  ].map((x) => `${p}${c} ${x}`).join("\n");
  return `${SEP}\n${pred ? "🔮 *EMMYFROSH-AI — PREDICT MENU*" : "⚽ *EMMYFROSH-AI — MATCH MENU*"}\n${SEP}\n\n` +
    `🏆 *League codes*\n${FB.map((l) => `• *${l.key}* — ${l.name}`).join("\n")}\n\n📌 *How to use*\n${how}\n\n` +
    (pred ? slipHelp(p) + cornersHelp(p) : "") + `${SEP}\n> EMMYFROSH-AI\n${SEP}`;
}

function gameBlock(ev, kind, showLeague) {
  const isLive = ev.state === "in";
  const lines = [`*⚽ ${ev.home} vs ${ev.away}*`];
  if (isLive) lines.push(`🔴 LIVE ${ev.homeScore ?? 0}-${ev.awayScore ?? 0}${ev.detail ? ` • ${ev.detail}` : ""}`);
  lines.push(whenLine(ev.date));
  if (showLeague) lines.push(`🏆 ${ev.league}`);
  if (kind === "predict") {
    if (!ev.odds && ev.formPred) {
      const f = ev.formPred, h = pickName(ev.homeShort, ev.homeAbbr), aw = pickName(ev.awayShort, ev.awayAbbr);
      const opts3 = [{ l: h, p: f.home, dc: `${h} or Draw` }, { l: "Draw", p: f.draw }, { l: aw, p: f.away, dc: `${aw} or Draw` }].sort((x, y) => y.p - x.p), top = opts3[0];
      lines.push(`📊 ${f.home.toFixed(0)}% / ${f.draw.toFixed(0)}% / ${f.away.toFixed(0)}%`, `🔥 Form (last 5): ${h} ${f.hForm} | ${aw} ${f.aForm}`,
        `🎯 ${top.l} — ${top.p >= 52 ? "Medium" : "Low"}`);
      if (top.dc && top.p < 50) lines.push(`🛡️ ${top.dc}`);
      lines.push(`📌 Based on recent form — no bookmaker odds for this game`);
    } else if (!ev.odds) lines.push(isLive ? `⚠️ No odds available for this live match` : `⚠️ Odds not available yet — no prediction`);
    else {
      const o = ev.odds, p = buildPrediction(ev), g = goalsPick(o);
      lines.push(
        `💰 1️⃣ ${dec(o.homeDec)}${o.drawDec ? ` | 🤝 ${dec(o.drawDec)}` : ""} | 2️⃣ ${dec(o.awayDec)}`,
        `📊 ${p.chances.home.toFixed(0)}%${o.drawDec ? ` / ${p.chances.draw.toFixed(0)}%` : ""} / ${p.chances.away.toFixed(0)}%`,
        `🎯 ${p.top.label} — ${p.confidence}`
      );
      if (p.safer) lines.push(`🛡️ ${p.safer}`);
      if (g) lines.push(`📈 ${g}`);
    }
  }
  return "\n" + lines.join("\n") + "\n\n" + SEP;
}

// send head + blocks + footer, splitting into several messages at block edges
async function sendParts(client, chatId, m, head, parts, footer) {
  const chunks = [];
  let cur = head;
  for (const part of parts) {
    if (cur && cur.length + part.length + 1 > CHUNK) { chunks.push(cur.trimEnd()); cur = ""; }
    cur += (cur ? "\n" : "") + part;
  }
  chunks.push((cur + "\n" + footer).trimEnd());
  for (let i = 0; i < chunks.length; i++) await client.sendMessage(chatId, { text: chunks[i] }, i === 0 ? { quoted: m } : {});
}

// ---------- odds slip (accumulator) ----------
function legOptions(ev) {
  const o = ev.odds;
  if (!o) return [];
  const c = toChances(o), h = pickName(ev.homeShort, ev.homeAbbr), a = pickName(ev.awayShort, ev.awayAbbr), ou = ouChances(o);
  const sels = [{ label: `${h} to win`, dec: o.homeDec, p: c.home / 100 }, { label: `${a} to win`, dec: o.awayDec, p: c.away / 100 }];
  if (o.drawDec) sels.push({ label: "Draw", dec: o.drawDec, p: c.draw / 100 });
  if (ou) sels.push({ label: `Over ${o.goalLine} goals`, dec: o.overDec, p: ou.over }, { label: `Under ${o.goalLine} goals`, dec: o.underDec, p: ou.under });
  return sels;
}
// the most likely leg that still pays something (odds ≥ 1.20)
const pickLeg = (ev) => legOptions(ev).sort((x, y) => y.p - x.p).find((x) => x.dec >= 1.2) || null;

// legs whose total odds land closest to the target, preferring the combination most likely to win
function buildSlip(cands, target) {
  const lo = target * 0.92, hi = target * 1.12, pool = [...cands].sort((a, b) => b.p - a.p).slice(0, 28);
  let bestIn = null, bestNear = null;
  const consider = (chosen, prod, joint) => {
    if (chosen.length < 2) return;
    if (prod >= lo && prod <= hi) { if (!bestIn || joint > bestIn.joint) bestIn = { legs: [...chosen], total: prod, joint }; }
    else {
      const diff = Math.abs(Math.log(prod / target));
      if (!bestNear || diff < bestNear.diff || (diff === bestNear.diff && joint > bestNear.joint)) bestNear = { legs: [...chosen], total: prod, joint, diff };
    }
  };
  const dfs = (start, chosen, prod, joint) => {
    consider(chosen, prod, joint);
    if (chosen.length >= 6) return;
    for (let i = start; i < pool.length; i++) {
      const next = prod * pool[i].dec;
      if (next > hi * 1.35) continue;
      chosen.push(pool[i]); dfs(i + 1, chosen, next, joint * pool[i].p); chosen.pop();
    }
  };
  dfs(0, [], 1, 1);
  const best = bestIn || bestNear;
  return best ? { ...best, inRange: !!bestIn } : null;
}

async function runSlip({ client, chatId, m, a, leagues, scope, send }) {
  const target = a.odds;
  const poolOpts = a.live ? { mode: "live", limit: 60 } : a.day ? { mode: "day", limit: LIMIT.day, dayOffset: a.day === "tomorrow" ? 1 : 0 } : { mode: "next", limit: 80 };
  let pool = (await getMatches(leagues, poolOpts)).matches;
  if (!a.live && !a.day) {
    const soon = pool.filter((ev) => ev.date.getTime() - Date.now() <= 48 * 3600 * 1000); // prefer the next 48 hours
    if (soon.length >= 4) pool = soon;
  }
  const cands = pool.map((ev) => ({ ev, ...pickLeg(ev) })).filter((x) => x.label);
  if (cands.length < 2) {
    await send(a.live ? `📡 Not enough live games with odds right now to build a ${target} odds slip.` : `⚽ Not enough games with odds to build a ${target} odds slip right now. Try again closer to kickoff.`);
    return false;
  }
  const slip = buildSlip(cands, target);
  if (!slip) { await send(`⚽ I couldn't build a slip near ${target} odds from the games available.`); return false; }

  const showLeague = !a.league;
  const head = `${SEP}\n🎟️ *${Number.isInteger(target) ? target : target.toFixed(1)} ODDS SLIP* — ${a.live ? "🔴 Live games" : "Not started yet"}${scope === "ALL LEAGUES" ? "" : ` • ${scope}`}\n${SEP}`;
  const parts = slip.legs.sort((x, y) => x.ev.date - y.ev.date).map((leg, i) => {
    const ev = leg.ev;
    const liveTxt = ev.state === "in" ? `🔴 LIVE ${ev.homeScore ?? 0}-${ev.awayScore ?? 0}${ev.detail ? ` • ${ev.detail}` : ""}\n` : "";
    return `\n*${i + 1}. ${ev.home} vs ${ev.away}*\n${liveTxt}${whenLine(ev.date)}\n${showLeague ? `🏆 ${ev.league}\n` : ""}✅ ${leg.label} @ ${dec(leg.dec)} (${Math.round(leg.p * 100)}%)\n\n${SEP}`;
  });
  const chance = slip.joint * 100, stake = 1000, money = (n) => `₦${Math.round(n).toLocaleString("en-US")}`;
  let footer =
    `💰 *Total odds: ${slip.total.toFixed(2)}*\n🎲 Chance all ${slip.legs.length} legs win: ~${chance < 10 ? chance.toFixed(1) : Math.round(chance)}%\n💵 ${money(stake)} stake → ${money(stake * slip.total)}\n`;
  if (!slip.inRange) footer += `ℹ️ Closest I could get to ${target} odds with the games available.\n`;
  footer += `ℹ️ Odds come from ESPN's bookmaker data — your bookie's odds will differ, so check your total before you play.\n`;
  if (a.live) footer += `⚡ Live odds move fast — confirm before you place it.\n`;
  if (a.sporty) footer += `\n🔖 *SPORTYBET CODE*\n❌ I can't create a real booking code — only SportyBet's own betslip can do that.\n👉 Add the games above on SportyBet, open your betslip, tap *Book Bet* and copy the code it gives you.\n`;
  footer += `\n⚠️ Not guaranteed. Accumulators lose more often than they win. Bet responsibly (18+)\n\n> 𝛯𝛭𝛭𝑌𝐹𝑅𝛩𝑆𝛨-AI\n${SEP}`;
  await sendParts(client, chatId, m, head, parts, footer);
  return true;
}

// ---------- corner predictions (ESTIMATE from each team's last games, no bookmaker corner odds) ----------
const cornerCache = new Map(); // "league:teamId" → { ts, data }
const cornerStat = (stats) => {
  for (const st of stats || []) if (["wonCorners", "cornerKicks", "corners"].includes(st.name)) { const v = parseFloat(st.displayValue ?? st.value); if (Number.isFinite(v)) return v; }
  return null;
};

async function teamCornerForm(code, id) {
  if (!code || !id) return null;
  const k = `${code}:${id}`, hit = cornerCache.get(k);
  if (hit && Date.now() - hit.ts < 6 * 3600e3) return hit.data;
  const sched = await getJson(`${ESPN}/${code}/teams/${id}/schedule`, 1, 6000);
  const done = (sched?.events || [])
    .filter((e) => (e.competitions?.[0]?.status?.type?.completed ?? e.status?.type?.completed) === true)
    .sort((x, y) => new Date(y.date) - new Date(x.date)).slice(0, 5);
  const rows = (await Promise.all(done.map(async (e) => {
    const teams = (await getJson(`${ESPN}/${code}/summary?event=${e.id}`, 1, 6000))?.boxscore?.teams || [];
    const c1 = cornerStat(teams.find((t) => String(t.team?.id) === String(id))?.statistics);
    const c2 = cornerStat(teams.find((t) => String(t.team?.id) !== String(id))?.statistics);
    return c1 === null || c2 === null ? null : { f: c1, a: c2 };
  }))).filter(Boolean);
  const data = rows.length ? { n: rows.length, forAvg: rows.reduce((t, r) => t + r.f, 0) / rows.length, agAvg: rows.reduce((t, r) => t + r.a, 0) / rows.length } : null;
  cornerCache.set(k, { ts: Date.now(), data });
  return data;
}

function poissonCdf(k, lam) {
  let term = Math.exp(-lam), sum = term;
  for (let i = 1; i <= k; i++) { term *= lam / i; sum += term; }
  return Math.min(1, sum);
}

function cornerBlock(ev, hf, af, showLeague) {
  const lines = [`*⚽ ${ev.home} vs ${ev.away}*`, whenLine(ev.date)];
  if (showLeague) lines.push(`🏆 ${ev.league}`);
  if (!hf || !af) lines.push(`⚠️ No corner data available for this match`);
  else {
    const homeExp = (hf.forAvg + af.agAvg) / 2, awayExp = (af.forAvg + hf.agAvg) / 2, total = homeExp + awayExp;
    const overLine = Math.max(4.5, Math.floor(total) - 0.5), underLine = Math.floor(total) + 1.5;
    const pOver = (1 - poissonCdf(Math.floor(overLine), total)) * 100, pUnder = poissonCdf(Math.floor(underLine), total) * 100;
    const h = pickName(ev.homeShort, ev.homeAbbr), a = pickName(ev.awayShort, ev.awayAbbr);
    const more = homeExp > awayExp + 0.4 ? h : awayExp > homeExp + 0.4 ? a : "Even";
    // ONE clear pick; fair odds = 100 / chance, so it is only worth taking if the bookie pays at least that much
    const best = pOver >= pUnder ? { label: `Over ${overLine}`, pct: pOver } : { label: `Under ${underLine}`, pct: pUnder };
    const bet = best.pct >= 58
      ? [`✅ *BET: ${best.label} corners* (${best.pct.toFixed(0)}%) — ${best.pct >= 65 ? "Strong" : "Medium"}`, `💡 Only worth it if your odds are ${(100 / best.pct).toFixed(2)} or higher`]
      : [`⏭️ *SKIP* — no clear edge on corners for this game`];
    lines.push(`⛳ Expected corners: ${total.toFixed(1)}`, `📊 ${h} ${homeExp.toFixed(1)} | ${a} ${awayExp.toFixed(1)}`,
      `📈 Over ${overLine} (${pOver.toFixed(0)}%)`, `📉 Under ${underLine} (${pUnder.toFixed(0)}%)`, `🥇 More corners: ${more}`, ...bet,
      `📌 Based on last ${Math.min(hf.n, af.n)} games each`);
  }
  return "\n" + lines.join("\n") + "\n\n" + SEP;
}

async function runCorners({ client, chatId, m, a, leagues, scope, opts, send }) {
  const { matches } = await getMatches(leagues, { ...opts, limit: Math.min(opts.limit, 10) });
  if (!matches.length) { await send(`⚽ No upcoming matches found for *${scope}*.`); return false; }
  const parts = [];
  for (const ev of matches) {
    const [hf, af] = await Promise.all([teamCornerForm(ev.leagueCode, ev.homeId), teamCornerForm(ev.leagueCode, ev.awayId)]);
    parts.push(cornerBlock(ev, hf, af, !a.league));
  }
  const head = `${SEP}\n⛳ *${scope} CORNER PICKS* — ${fullDate(matches[0].date)} • ${timeLabel(matches[0].date)}\n${SEP}`;
  const footer = `📊 *Total: ${plural(matches.length, "match")}*\nℹ️ Estimates from recent corner averages — no bookmaker corner odds here, so check the lines on your bookie.\n⚠️ Not guaranteed. Bet responsibly (18+)\n\n> EMMYFROSH-AI\n${SEP}`;
  await sendParts(client, chatId, m, head, parts, footer);
  return true;
}

// ---------- shared runner (.nextmatch / .predict / .corners / live slips) ----------
const CMD_NAMES = ["predict", "prediction", "predictions", "tip", "tips", "nextmatch", "nextmatches", "match", "matches", "nextgame", "fixtures", "whoplays"];

async function runFootball(kind, m, ctx, extra = {}) {
  const { ednut, from, prefix, args, text: argText } = ctx;
  const client = ednut || global.ednut, chatId = from || m.chat || m.key.remoteJid;
  const p = prefix || (Array.isArray(global.prefix) ? global.prefix[0] : global.prefix) || ".";
  const send = (t) => client.sendMessage(chatId, { text: t }, { quoted: m });
  const react = (e) => client.sendMessage(chatId, { react: { text: e, key: m.key } }).catch(() => {});
  const isPredict = kind === "predict";

  let rawArgs = (Array.isArray(args) && args.length ? args.join(" ") : "") || (typeof argText === "string" ? argText : "");
  if (!rawArgs) rawArgs = (m.text || m.body || m.message?.conversation || m.message?.extendedTextMessage?.text || "").replace(/^\S+\s*/, "");
  rawArgs = rawArgs.trim();
  const first = rawArgs.split(/\s+/)[0] || "";
  if (first && CMD_NAMES.includes(first.toLowerCase().replace(/[^a-z]/g, ""))) rawArgs = rawArgs.slice(first.length).trim(); // ".predict ..." passed whole

  const a = parseArgs(rawArgs);
  if (extra.forceLive) a.live = true;
  if (extra.forceCorners) a.corners = true;

  if (a.menu || (isPredict && !rawArgs && !extra.forceLive && !extra.forceCorners)) return send(menuText(kind, p));
  if (!isPredict && a.team) return send(`ℹ️ For a team's live or last match use *${p}live ${a.team}*`); // .match <team> → .live

  let leagues = FB, scope = "ALL LEAGUES";
  if (a.league) {
    leagues = FB.filter((l) => l.key === a.league);
    if (!leagues.length && L[a.league]?.espn) leagues = [{ key: a.league, code: L[a.league].espn, name: PRETTY[a.league] || SLUG_LABEL[L[a.league].espn] || a.league }];
    scope = leagues[0].name.toUpperCase();
  }
  else if (a.team) scope = a.team.toUpperCase();

  const opts = a.team ? { mode: "team", limit: a.count || LIMIT.team, team: a.team }
    : a.live ? { mode: "live", limit: a.count || 10 }
    : a.day ? { mode: "day", limit: a.count || LIMIT.day, dayOffset: a.day === "tomorrow" ? 1 : 0 }
    : a.all ? { mode: "all", limit: a.count || LIMIT.all }
    : { mode: "next", limit: a.count || LIMIT.next };

  react("⏳");
  try {
    if (a.corners) { react((await runCorners({ client, chatId, m, a, leagues, scope, opts, send })) ? "✅" : "❌"); return; }
    if (a.odds && !a.team) { react((await runSlip({ client, chatId, m, a, leagues, scope, send })) ? "✅" : "❌"); return; }

    let { matches, live, span } = await getMatches(leagues, opts);
    if (a.league && !a.team) ({ matches, live } = await mergeLsMatches({ matches, live }, a, opts, leagues[0]));
    if (isPredict && !a.corners) await mapLimit([...live, ...matches].filter((e) => !e.odds && e.state !== "in").slice(0, 10), 3, async (e) => { e.formPred = await formPick(e).catch(() => null); });
    if (!matches.length && !live.length) {
      react("❌");
      if (a.team) return send(`⚽ No upcoming match found for *${a.team}* in the next ${span} days.\nTry the full team name, or *${p}${kind} menu* for league codes.`);
      if (opts.mode === "live") return send(`📡 No live matches right now.`);
      return send(`⚽ No matches found for *${scope}* ${opts.mode === "day" ? (a.day === "tomorrow" ? "tomorrow" : "today") : `in the next ${span} days`}.`);
    }

    const teamMode = opts.mode === "team";
    const blocks = [...(teamMode ? live.slice(0, 3) : []), ...matches]; // team search: a live match comes first
    const f = blocks[0];
    const when = f.state === "in" ? " — 🔴 LIVE" : ` — ${fullDate(f.date)} • ${timeLabel(f.date)}`;
    const head = `${SEP}\n🏆 *${scope} ${isPredict ? "PICKS" : "MATCHES"}*${when}\n${SEP}`;
    const parts = [];
    if (live.length && !isPredict && !teamMode)
      parts.push(`\n🔴 *LIVE NOW*\n${live.slice(0, 8).map((ev) => `• ${ev.home} vs ${ev.away} (${ev.league})`).join("\n")}\n\n${SEP}`);
    for (const ev of blocks) parts.push(gameBlock(ev, kind, !a.league));
    const footer = `📊 *Total: ${plural(blocks.length, "match")}*\n${isPredict ? "⚠️ Not guaranteed. Bet responsibly (18+)\n" : ""}\n> EMMYFROSH-AI\n${SEP}`;
    await sendParts(client, chatId, m, head, parts, footer);
    react("✅");
  } catch (err) {
    console.error(`[${kind.toUpperCase()} ERROR]`, err);
    react("❌");
    await send(`❌ Could not fetch matches right now. Try again in a moment.`);
  }
}

// ============================== LIVE SCORES (.live) ==============================
const MAX_MATCHES = 250, LOGO_MAX = 4, SEASONS_BACK = 6;
const KIND_WORDS = { goal: "goal", goals: "goal", card: "card", cards: "card", pen: "pen", pens: "pen", pk: "pen", pks: "pen", penalty: "pen", penalties: "pen" };

const MENU =
`⚽ ꜱᴇʟᴇᴄᴛ ʟɪᴠᴇ ʟᴇᴀɢᴜᴇ:
ᴛʏᴘᴇ .ʟɪᴠᴇ + ɴᴀᴍᴇ

🏴󠁧󠁢󠁥󠁮󠁧󠁿 ᴇᴘʟ | ᴄʜᴀᴍᴘɪᴏɴꜱʜɪᴘ | ꜰᴀᴄᴜᴘ | ʟᴇᴀɢᴜᴇᴄᴜᴘ
🇪🇸 ʟᴀʟɪɢᴀ | ᴄᴏᴘᴀᴅᴇʟʀᴇʏ
🇮🇹 ꜱᴇʀɪᴇᴀ | ꜱᴇʀɪᴇʙ | ᴄᴏᴘᴘᴀɪᴛᴀʟɪᴀ
🇩🇪 ʙᴜɴᴅᴇꜱʟɪɢᴀ | ᴅꜰʙᴘᴏᴋᴀʟ
🇫🇷 ʟɪɢᴜᴇ1 | ᴄᴏᴜᴘᴇᴅᴇꜰʀᴀɴᴄᴇ
🇪🇺 ᴜᴄʟ | ᴜᴇʟ | ᴜᴇᴄʟ | ɴᴀᴛɪᴏɴꜱ
🌍 ᴇʀᴇᴅɪᴠɪꜱɪᴇ | ᴘᴏʀᴛᴜɢᴀʟ | ᴛᴜʀᴋᴇʏ | ꜱᴄᴏᴛʟᴀɴᴅ
🌎 ᴍʟꜱ | ʙʀᴀᴢɪʟ | ʙʀᴀᴢɪʟᴜ20 | ᴀʀɢᴇɴᴛɪɴᴀ | ʟɪʙᴇʀᴛᴀᴅᴏʀᴇꜱ
🌏 ꜱᴀᴜᴅɪ | ᴊᴀᴘᴀɴ | ᴋᴏʀᴇᴀ | ᴀᴜꜱᴛʀᴀʟɪᴀ
🌍 ɴɪɢᴇʀɪᴀ | ᴇɢʏᴘᴛ | ᴍᴏʀᴏᴄᴄᴏ | ᴀꜰᴄᴏɴ
🏆 ᴡᴏʀʟᴅᴄᴜᴘ | ꜰʀɪᴇɴᴅʟɪᴇꜱ

🔎 ᴀɴʏ ʟᴇᴀɢᴜᴇ, ᴄᴏᴜɴᴛʀʏ ᴏʀ ᴛᴇᴀᴍ:
.ʟɪᴠᴇ ɢʜᴀɴᴀ | .ʟɪᴠᴇ ᴀʀꜱᴇɴᴀʟ | .ʟɪᴠᴇ ᴍᴀɴ ᴜ

🤝 ᴛᴇᴀᴍ + ʟᴇᴀɢᴜᴇ:
.ʟɪᴠᴇ ᴍᴀɴ ᴜ ᴜᴇᴄʟ | .ʟɪᴠᴇ ᴀʀꜱᴇɴᴀʟ ᴜᴄʟ
.ʟɪᴠᴇ ɴɪɢᴇʀɪᴀ ꜰʀɪᴇɴᴅʟʏ | .ʟɪᴠᴇ ɴɪɢᴇʀɪᴀ ᴀꜰᴄᴏɴ

⚔️ ᴛᴡᴏ ᴛᴇᴀᴍꜱ:
.ʟɪᴠᴇ ᴀʀꜱᴇɴᴀʟ ᴠꜱ ᴄʜᴇʟꜱᴇᴀ

🌐 .ʟɪᴠᴇ ᴀʟʟ

🔔 ɢᴏᴀʟ / ᴄᴀʀᴅ / ᴘᴇɴᴀʟᴛʏ ᴀʟᴇʀᴛꜱ:
.ɴᴏᴛɪꜰʏ ᴀʟʟ | .ɴᴏᴛɪꜰʏ ᴇᴘʟ | .ɴᴏᴛɪꜰʏ ᴀʀꜱᴇɴᴀʟ ᴠꜱ ᴄʜᴇʟꜱᴇᴀ
.ʟɪᴠᴇ ᴍᴀɴ ᴜ ɢᴏᴀʟꜱ ᴘᴋ ᴄᴀʀᴅꜱ`;

const MSG_NEED_KEY = `⚠️ ᴛʜɪꜱ ʟᴇᴀɢᴜᴇ ɴᴇᴇᴅꜱ ᴀɴ ᴀᴘɪ-ꜰᴏᴏᴛʙᴀʟʟ ᴋᴇʏ (APISPORTS_KEY).`;
const MSG_LIMIT = `⚠️ ᴛʜɪꜱ ʟᴇᴀɢᴜᴇ ɴᴇᴇᴅꜱ ᴛʜᴇ ᴀᴘɪ ᴋᴇʏ, ʙᴜᴛ ᴛʜᴇ ᴀᴘɪ ʟɪᴍɪᴛ ɪꜱ ʀᴇᴀᴄʜᴇᴅ ꜰᴏʀ ɴᴏᴡ. ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ.`;
const MSG_NO_LIVE = `🔴 ɴᴏ ʟɪᴠᴇ ᴍᴀᴛᴄʜᴇꜱ ʀɪɢʜᴛ ɴᴏᴡ.\nℹ️ ꜱᴇᴀʀᴄʜ ᴀ ᴛᴇᴀᴍ ᴛᴏ ꜱᴇᴇ ɪᴛꜱ ʟᴀꜱᴛ ᴍᴀᴛᴄʜ, ᴇ.ɢ. .ʟɪᴠᴇ ᴀʀꜱᴇɴᴀʟ`;
const MSG_NO_TEAM = `🔴 ɴᴏ ʟɪᴠᴇ ᴍᴀᴛᴄʜ ᴀɴᴅ ɴᴏ ᴘᴀꜱᴛ ᴍᴀᴛᴄʜ ꜰᴏᴜɴᴅ ꜰᴏʀ ᴛʜɪꜱ ꜱᴇᴀʀᴄʜ.`;
const MSG_NO_COMP = `🔴 ɴᴏ ᴍᴀᴛᴄʜ ꜰᴏᴜɴᴅ ꜰᴏʀ ᴛʜɪꜱ ᴛᴇᴀᴍ ɪɴ ᴛʜᴀᴛ ᴄᴏᴍᴘᴇᴛɪᴛɪᴏɴ.`;
const MSG_NO_H2H = `🔴 ɴᴏ ᴍᴀᴛᴄʜ ꜰᴏᴜɴᴅ ʙᴇᴛᴡᴇᴇɴ ᴛʜᴇꜱᴇ ᴛᴡᴏ ᴛᴇᴀᴍꜱ.`;
const MSG_FAILED = `❌ ꜰᴀɪʟᴇᴅ ᴛᴏ ꜰᴇᴛᴄʜ ʟɪᴠᴇ ᴍᴀᴛᴄʜᴇꜱ.`;

// "champions league" → "ucl" so a team + league can be told apart
const COMP_PHRASES = [
  [/club world cup/g, "clubworldcup"], [/africa cup of nations/g, "afcon"], [/world cup/g, "worldcup"],
  [/champions league/g, "ucl"], [/europa league/g, "uel"], [/conference league/g, "uecl"], [/nations league/g, "nations"],
  [/premier league/g, "epl"], [/la liga/g, "laliga"], [/serie a/g, "seriea"], [/serie b/g, "serieb"], [/ligue 1/g, "ligue1"],
  [/fa cup/g, "facup"], [/(?:league|carabao) cup/g, "leaguecup"], [/copa del rey/g, "copadelrey"], [/coppa italia/g, "coppaitalia"],
  [/dfb pokal/g, "dfbpokal"], [/coupe de france/g, "coupedefrance"], [/community shield/g, "communityshield"], [/super cup/g, "supercup"]
];

function compInfo(tok) {
  if (["friendly", "friendlies", "friendlys"].includes(tok)) return { name: "Friendlies", ids: [10, 667], slugs: ["fifa.friendly", "club.friendly"] };
  if (tok === "afcon") return { name: "AFCON", ids: [6], slugs: ["caf.nations"] };
  if (tok === "worldcup") return { name: "World Cup", ids: [1], slugs: ["fifa.world"] };
  if (tok === "communityshield") return { name: "Community Shield", ids: [528], slugs: ["eng.charity"] };
  if (tok === "supercup") return { name: "UEFA Super Cup", ids: [531], slugs: ["uefa.super_cup"] };
  const k = ALIAS[tok] || tok;
  if (k !== "all" && k !== "brazilu20" && L[k]) return { name: PRETTY[k] || k.toUpperCase(), ids: L[k].id ? [L[k].id] : [], slugs: L[k].espn ? [L[k].espn] : [] };
  return null;
}

// "man u uecl" → { team: "manchester united", comp: Conference League }. Needs a team AND a competition word.
function parseComp(raw) {
  let s = norm(raw);
  for (const [re, to] of COMP_PHRASES) s = s.replace(re, to);
  const toks = s.split(/\s+/).filter(Boolean);
  let idx = -1, info = null;
  for (let i = toks.length - 1; i >= 0 && !info; i--) { if (toks[i] === "liga") continue; info = compInfo(toks[i]); idx = i; } // bare "liga" is part of a name ("prva liga"), not La Liga
  const rest = toks.filter((_, i) => i !== idx);
  if (!info || !rest.length) return null;
  const team = rest.join(" ");
  return { team: COUNTRY[team.replace(/\s+/g, "")] || tAlias(team), ids: info.ids, name: info.name, slugs: info.slugs };
}

// ---------- API-Football (one call) + automatic switch to free ESPN when its limit is reached ----------
let apiBlockedUntil = 0;
const msUntilUtcMidnight = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 10) - d.getTime(); };
function blockApi(ms, why) {
  const until = Date.now() + ms;
  if (until > apiBlockedUntil) { apiBlockedUntil = until; console.log(`API-FOOTBALL paused (${why}) until ${new Date(until).toISOString()} - using free ESPN source`); }
}
const apiUsable = () => !!KEY && Date.now() >= apiBlockedUntil;
const apiBlocked = () => !!KEY && Date.now() < apiBlockedUntil;

function apiStatus(s, min) {
  return ({ "1H": `🔴 1ST HALF ${min}'`, "2H": `🔴 2ND HALF ${min}'`, HT: "⏸ HALF TIME", ET: `🔥 EXTRA TIME ${min}'`, BT: "⏸ BREAK", P: "🎯 PENALTIES", INT: "⏸ INTERRUPTED" })[s]
    || `🔴 LIVE ${min ? min + "'" : ""}`;
}
function countApiCards(events, homeId) {
  const c = { yh: 0, ya: 0, rh: 0, ra: 0 };
  for (const e of events || []) {
    if (e?.type !== "Card") continue;
    const home = e?.team?.id === homeId, d = (e?.detail || "").toLowerCase();
    if (d === "yellow card") home ? c.yh++ : c.ya++;
    else if (d.includes("red") || d.includes("second yellow")) home ? c.rh++ : c.ra++;
  }
  return c;
}

let _apiLive = { t: 0, rows: null };
async function liveApi() {                                   // paid API, all live games (cached 15 s: faster + saves the daily quota)
  if (_apiLive.rows && Date.now() - _apiLive.t < 15000) return _apiLive.rows;
  const rows = await liveApiRaw();
  _apiLive = { t: Date.now(), rows };
  return rows;
}
async function liveApiRaw() {
  let r;
  try { r = await http.get("https://v3.football.api-sports.io/fixtures?live=all", { timeout: 8000, headers: { "x-apisports-key": KEY } }); }
  catch (e) { if (e?.response?.status === 429) blockApi(65e3, "HTTP 429 rate limit"); throw e; }

  const errs = r.data?.errors;
  if (errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length)) {
    const msg = JSON.stringify(errs).toLowerCase();
    if (errs.rateLimit || /too many requests|per minute|rate limit/.test(msg)) blockApi(65e3, "rate limit");
    else if (errs.requests || /request limit|limit for the day|daily|quota|reached/.test(msg)) blockApi(msUntilUtcMidnight(), "daily limit");
    else if (errs.token || errs.access || /token|key|suspend|subscription|plan/.test(msg)) blockApi(30 * 60e3, "key problem");
    throw new Error("API-Football: " + JSON.stringify(errs));
  }
  // the request worked, but if it was the last one allowed, pause the key right away
  const h = r.headers || {};
  if (parseInt(h["x-ratelimit-requests-remaining"], 10) === 0) blockApi(msUntilUtcMidnight(), "daily limit used up");
  else if (parseInt(h["x-ratelimit-remaining"], 10) === 0) blockApi(65e3, "per-minute limit used up");

  return (r.data?.response || []).map((g) => ({
    leagueId: g?.league?.id, country: g?.league?.country || "", leagueName: g?.league?.name || "",
    league: `${g?.league?.country || ""} - ${g?.league?.name || ""}`,
    home: g?.teams?.home?.name || "Unknown", away: g?.teams?.away?.name || "Unknown",
    homeLogo: g?.teams?.home?.logo || null, awayLogo: g?.teams?.away?.logo || null,
    homeApiId: g?.teams?.home?.id || null, awayApiId: g?.teams?.away?.id || null,
    hg: g?.goals?.home ?? 0, ag: g?.goals?.away ?? 0, status: apiStatus(g?.fixture?.status?.short, g?.fixture?.status?.elapsed),
    state: "in", cards: countApiCards(g?.events, g?.teams?.home?.id)
  }));
}

// ---------- API-Football (paid key): last match + head-to-head. Always tried FIRST; empty / not allowed → free sources ----------
const apiFeatureBlock = {};
async function apiCall(endpoint, params, feature) {
  if (!apiUsable() || Date.now() < (apiFeatureBlock[feature] || 0)) return null;
  try {
    const r = await http.get(`https://v3.football.api-sports.io/${endpoint}`, { params, timeout: 6000, headers: { "x-apisports-key": KEY } });
    const errs = r.data?.errors;
    if (errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length)) {
      const msg = JSON.stringify(errs).toLowerCase();
      if (errs.rateLimit || /too many requests|per minute|rate limit/.test(msg)) blockApi(65e3, "rate limit");
      else if (errs.requests || /request limit|limit for the day|daily|quota|reached/.test(msg)) blockApi(msUntilUtcMidnight(), "daily limit");
      else if (errs.token || errs.access || /token|key|suspend|subscription/.test(msg)) blockApi(30 * 60e3, "key problem");
      else { apiFeatureBlock[feature] = Date.now() + 3600e3; console.log(`API-FOOTBALL "${feature}" not available on this plan - using free sources:`, msg.slice(0, 140)); }
      return null;
    }
    const h = r.headers || {};
    if (parseInt(h["x-ratelimit-requests-remaining"], 10) === 0) blockApi(msUntilUtcMidnight(), "daily limit used up");
    else if (parseInt(h["x-ratelimit-remaining"], 10) === 0) blockApi(65e3, "per-minute limit used up");
    return r.data?.response || [];
  } catch (e) {
    if (e?.response?.status === 429) blockApi(65e3, "HTTP 429");
    console.log(`API-FOOTBALL ${feature} ERROR:`, e?.response?.status, e?.message);
    return null;
  }
}
const apiTeamCache = new Map();
async function apiTeamId(q, national) {
  const key = norm(q) + (national ? "|n" : "");
  if (apiTeamCache.has(key)) return apiTeamCache.get(key);
  const search = norm(q).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (search.length < 3) return null;
  const res = await apiCall("teams", { search }, "teams");
  if (!res) return null;
  const cands = res.filter((x) => teamStrict(x.team?.name || "", q) && !SIDE_RE.test(x.team?.name || ""));
  const pick = (national && cands.find((x) => x.team?.national)) || cands.find((x) => nameKey(x.team?.name) === nameKey(q) && !x.team?.national) || cands.find((x) => !x.team?.national) || cands[0];
  const id = pick?.team?.id || null;
  if (id) apiTeamCache.set(key, id);
  return id;
}
function apiFixtureRow(g) {
  const fx = g?.fixture;
  if (!/^(?:FT|AET|PEN)$/.test(fx?.status?.short || "")) return null;
  return {
    league: `${g?.league?.country || ""} - ${g?.league?.name || ""}`.replace(/^ - /, ""), home: g?.teams?.home?.name || "Unknown", away: g?.teams?.away?.name || "Unknown",
    homeLogo: g?.teams?.home?.logo || null, awayLogo: g?.teams?.away?.logo || null,
    homeApiId: g?.teams?.home?.id || null, awayApiId: g?.teams?.away?.id || null,
    hg: g?.goals?.home ?? 0, ag: g?.goals?.away ?? 0,
    state: "post", status: "✅ FULL TIME", cards: Array.isArray(g?.events) ? countApiCards(g.events, g?.teams?.home?.id) : null,
    iso: fx.date, ts: fx.timestamp || Date.parse(fx.date) / 1000, showTime: true, src: "api"
  };
}
const apiNewest = (res) => (res || []).map(apiFixtureRow).filter(Boolean).sort((x, y) => y.ts - x.ts).slice(0, 1);
async function apiLastTeam(q, national) {
  const id = await apiTeamId(q, national);
  return id ? apiNewest(await apiCall("fixtures", { team: id, last: 5 }, "last")) : [];
}
async function apiLastH2H(x, y) {
  const [ia, ib] = await Promise.all([apiTeamId(x), apiTeamId(y)]);
  return ia && ib ? apiNewest(await apiCall("fixtures/headtohead", { h2h: `${ia}-${ib}`, last: 5 }, "h2h")) : [];
}

// PAID API ONLY: last match if it is recent enough to trust. null = not found → go to the free sources
async function apiOnlyLast(q, national) {
  if (!apiUsable()) return null;
  try {
    const r = await apiLastTeam(q, national);
    return r.length && Date.now() / 1000 - r[0].ts < 120 * 86400 ? r : null;
  } catch (e) { console.log("API ONLY LAST ERROR:", e?.message); return null; }
}
async function apiOnlyH2H(x, y) {
  if (!apiUsable()) return null;
  try {
    const r = await apiLastH2H(x, y);
    return r.length && Date.now() / 1000 - r[0].ts < 400 * 86400 ? r : null;
  } catch (e) { console.log("API ONLY H2H ERROR:", e?.message); return null; }
}

// a result this old from the key (free plans only see old seasons) is double-checked with the free sources and the newest wins
const newestOf = (rows) => rows.filter((r) => r && r.ts).sort((a, b) => b.ts - a.ts).slice(0, 1);
async function apiFirstLast(q, national) {
  if (apiUsable()) {
    try { const r = await apiLastTeam(q, national); if (r.length && Date.now() / 1000 - r[0].ts < 120 * 86400) return r; if (r.length) return newestOf([...r, ...(await bestLast(q))]); }
    catch (e) { console.log("API LAST ERROR:", e?.message); }
  }
  return bestLast(q);
}
async function apiFirstH2H(x, y) {
  if (apiUsable()) {
    try { const r = await apiLastH2H(x, y); if (r.length && Date.now() / 1000 - r[0].ts < 400 * 86400) return r; if (r.length) return newestOf([...r, ...(await bestH2H(x, y))]); }
    catch (e) { console.log("API H2H ERROR:", e?.message); }
  }
  return bestH2H(x, y);
}

// ---------- ESPN ----------
function espnStatus(st) {
  const name = st?.type?.name || "", clock = st?.displayClock || "";
  if (name === "STATUS_HALFTIME") return "⏸ HALF TIME";
  if (name === "STATUS_FIRST_HALF") return `🔴 1ST HALF ${clock}`;
  if (name === "STATUS_SECOND_HALF") return `🔴 2ND HALF ${clock}`;
  if (name.includes("EXTRA")) return `🔥 EXTRA TIME ${clock}`;
  if (name.includes("SHOOTOUT")) return "🎯 PENALTIES";
  return st?.type?.completed ? "✅ FULL TIME" : `🔴 LIVE ${clock}`;
}
const scoreOf = (c) => { const s = c?.score; return s && typeof s === "object" ? Number(s.value ?? s.displayValue) || 0 : Number(s) || 0; };
const espnLogo = (t) => {
  const logos = t?.logos || [], rel = (l) => l.rel || [];
  return t?.logo || (logos.find((l) => rel(l).includes("default") && !rel(l).includes("dark")) || logos.find((l) => !rel(l).includes("dark")) || logos[0])?.href || null;
};
const domesticSlugs = () => [...new Set(Object.values(L).map((x) => x.espn).filter(Boolean))];
const searchSlugs = () => [...new Set([...domesticSlugs(), ...EXTRA_SLUGS])];

const _espnLiveCache = new Map();
async function liveEspn(slugs) {                             // cached 30 s per set of competitions
  const ck = slugs.join(","), hit = _espnLiveCache.get(ck);
  if (hit && Date.now() - hit.t < 30000) return hit.rows;
  const rows = await liveEspnRaw(slugs);
  if (_espnLiveCache.size > 20) _espnLiveCache.delete(_espnLiveCache.keys().next().value);
  _espnLiveCache.set(ck, { t: Date.now(), rows });
  return rows;
}
async function liveEspnRaw(slugs) {
  const now = new Date(), range = `${ymd(new Date(now - DAY))}-${ymd(now)}`;
  const res = await mapLimit(slugs, 10, async (s) => {
    const data = await getJson(`${ESPN}/${s}/scoreboard?dates=${range}&limit=300`);
    return (data?.events || []).map((e) => ({ e, lg: data?.leagues?.[0]?.name || s, slug: s }));
  });
  const seen = new Set();
  return res.flat().filter(({ e }) => e?.status?.type?.state === "in" && !seen.has(e.id) && seen.add(e.id)).map(({ e, lg, slug }) => {
    const cs = e.competitions?.[0]?.competitors, h = cs?.find((c) => c.homeAway === "home"), a = cs?.find((c) => c.homeAway === "away");
    return {
      league: lg, home: h?.team?.displayName || "Unknown", away: a?.team?.displayName || "Unknown",
      homeLogo: espnLogo(h?.team), awayLogo: espnLogo(a?.team), homeEspnId: h?.team?.id, awayEspnId: a?.team?.id,
      hg: scoreOf(h), ag: scoreOf(a), status: espnStatus(e.status), state: "in", cards: null,
      id: e.id, slug, homeId: h?.team?.id
    };
  });
}

// ---------- LiveScore.com: EVERY competition (lower leagues, cups, Asia, Africa ...) - no key needed ----------
const LS_HOSTS = ["https://prod-cdn-public-api.livescore.com", "https://prod-public-api.livescore.com"];
const LS_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", Origin: "https://www.livescore.com", Referer: "https://www.livescore.com/" };
function lsStatus(eps) {
  const e = String(eps || "").trim();
  if (/^(?:HT)$/i.test(e)) return "⏸ HALF TIME";
  if (/^(?:ET|AET)$/i.test(e)) return "🔥 EXTRA TIME";
  if (/^(?:PEN|AP)$/i.test(e)) return "🎯 PENALTIES";
  if (/^\d+(?:\+\d+)?'?$/.test(e)) return `🔴 LIVE ${e.replace(/'?$/, "'")}`;
  return null; // NS / FT / Postp. / Canc. ... → not live
}
// team crest urls on LiveScore.com (the first one that downloads is used)
const lsLogos = (t) => {
  const img = String(t?.Img || t?.img || "").replace(/^\/+/, "");
  return img ? [`https://lsm-static-prod.livescore.com/high/${img}`, `https://lsm-static-prod.livescore.com/medium/${img}`, `https://static.livescore.com/i2/fh/${img}`] : null;
};
// returns an array of live games, or null if LiveScore.com could not be reached
let _lsLive = { t: 0, p: null };
function liveScoreCom() {                                    // cached 20 s (shared by every search, can be started early)
  if (_lsLive.p && Date.now() - _lsLive.t < 20000) return _lsLive.p;
  const entry = { t: Date.now(), p: null };
  entry.p = liveScoreComRaw().then((r) => { if (r === null) entry.t = 0; return r; }, () => { entry.t = 0; return null; });
  _lsLive = entry;
  return entry.p;
}
async function liveScoreComRaw() {
  const offset = 1; // Lagos = UTC+1
  for (const host of LS_HOSTS) {
    let data = null;
    for (let i = 0; i < 2 && !data; i++) {
      try { data = (await http.get(`${host}/v1/api/app/live/soccer/${offset}?MD=1`, { timeout: 12000, headers: LS_HEADERS })).data; }
      catch (e) { const st = e?.response?.status; if (st && st < 500 && st !== 429) break; await sleep(500); }
    }
    if (!data || !Array.isArray(data.Stages)) continue;
    const rows = [], seen = new Set();
    for (const st of data.Stages) {
      for (const ev of st?.Events || []) {
        const h = ev?.T1?.[0], a = ev?.T2?.[0], status = lsStatus(ev?.Eps);
        if (!h?.Nm || !a?.Nm || !status || seen.has(ev?.Eid)) continue;
        seen.add(ev?.Eid);
        rows.push({
          league: [st?.Cnm, st?.Snm].filter(Boolean).join(" - ") || "Football",
          home: h.Nm, away: a.Nm, homeLogo: lsLogos(h), awayLogo: lsLogos(a),
          hg: Number(ev?.Tr1) || 0, ag: Number(ev?.Tr2) || 0, status, state: "in", cards: null, src: "ls"
        });
      }
    }
    return rows;
  }
  return null;
}
const nameKey = (x) => norm(x).replace(/[^a-z0-9 ]/g, " ").replace(/\b(?:fc|cf|afc|sc|ac|as|ss|us|calcio|club|de|cd|ud|sv|fk|if|bk|vv|sk)\b/g, " ").replace(/\s+/g, " ").trim();
const likeName = (a, b) => {
  a = nameKey(a); b = nameKey(b);
  if (!a || !b) return false;
  const fa = a.split(" ")[0], fb = b.split(" ")[0];
  return a === b || a.includes(b) || b.includes(a) || (fa === fb && fa.length >= 4);
};
const sameGame = (x, y) => likeName(x.home, y.home) && likeName(x.away, y.away);
// add the games the other sources missed (same game from two sources is kept once)
const mergeLive = (base, extra) => [...base, ...(extra || []).filter((e) => !base.some((b) => sameGame(b, e)))];

// strict team-name match: "manchester united" = Manchester United / Man Utd, but NOT "FC United of Manchester"
const NAME_CONNECT = new Set(["of", "and", "the", "for"]);
function teamStrict(name, q) {
  const n = nameKey(name).split(" ").filter(Boolean), w = nameKey(q).split(" ").filter(Boolean);
  if (!n.length || !w.length) return false;
  if (n.join(" ") === w.join(" ")) return true;
  if (!w.every((x) => n.includes(x)) || n[0] !== w[0]) return false;      // same words, same first word
  const extra = n.filter((x) => !w.includes(x));
  return extra.length <= 2 && !extra.some((x) => NAME_CONNECT.has(x));      // "Tottenham Hotspur" ok, "United of Manchester" no
}
const teamOnly = (list, q) => list.filter((g) => teamStrict(g.home, q) || teamStrict(g.away, q));

const pairStrict = (list, x, y) => list.filter((g) => (teamStrict(g.home, x) && teamStrict(g.away, y)) || (teamStrict(g.home, y) && teamStrict(g.away, x)));
// women / youth / reserve sides are NEVER shown unless the user typed one (strict: no "show them if nothing else is left")
const SIDE_ONLY = (rows, ...typed) => typed.some((t) => SIDE_RE.test(t || "")) ? rows : rows.filter((r) => !SIDE_RE.test(r.home) && !SIDE_RE.test(r.away));

// one day of LiveScore.com games (cached: today 5 min, older days 6 h) → the day's Stages, or null if unreachable
const lsDayCache = new Map();
async function getLsDay(day) {
  const hit = lsDayCache.get(day), today = lagosDay(new Date()).replace(/-/g, "");
  if (hit && Date.now() - hit.t < (day === today ? 5 * 60e3 : 6 * 3600e3)) return hit.stages;
  for (const host of LS_HOSTS) {
    const data = await getJson(`${host}/v1/api/app/date/soccer/${day}/1?MD=1`, 2, 15000).catch(() => null);
    if (Array.isArray(data?.Stages)) {
      if (lsDayCache.size > 40) lsDayCache.delete(lsDayCache.keys().next().value);
      lsDayCache.set(day, { t: Date.now(), stages: data.Stages });
      return data.Stages;
    }
  }
  return null;
}
const lsDays = (n) => Array.from({ length: n }, (_, i) => lagosDay(new Date(Date.now() - i * DAY)).replace(/-/g, ""));
function lsFinishedRow(st, ev, day) {
  const h = ev?.T1?.[0], a = ev?.T2?.[0];
  if (!h?.Nm || !a?.Nm || !/^(?:FT|AET|AP)$/i.test(String(ev?.Eps || "").trim())) return null;
  const d = String(ev?.Esd || ""), iso = d.length >= 12 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:00Z` : null;
  return {
    league: [st?.Cnm, st?.Snm].filter(Boolean).join(" - ") || "Football", home: h.Nm, away: a.Nm, homeLogo: lsLogos(h), awayLogo: lsLogos(a),
    hg: Number(ev?.Tr1) || 0, ag: Number(ev?.Tr2) || 0, state: "post", status: "✅ FULL TIME", cards: null, src: "ls",
    iso, ts: iso ? Date.parse(iso) / 1000 : Number(day), showTime: !!iso, dateOnly: true, day
  };
}
// finished games of the last `n` days that pass test(row)
async function scanLs(n, test) {
  const found = [];
  await mapLimit(lsDays(n), 5, async (day) => {
    for (const st of (await getLsDay(day)) || []) for (const ev of st?.Events || []) { const r = lsFinishedRow(st, ev, day); if (r && test(r)) found.push(r); }
  });
  return found;
}
const newest = (rows) => rows.sort((x, y) => y.ts - x.ts);

// last FINISHED game of a team in ANY competition (last 10 days)
async function lastFromLiveScore(q) {
  const rows = newest(SIDE_ONLY(await scanLs(10, (r) => teamStrict(r.home, q) || teamStrict(r.away, q)), q));
  return rows.length ? [rows[0]] : [];
}
// last FINISHED game between two teams (last 3 weeks)
async function lastH2HFromLiveScore(x, y) {
  const rows = newest(SIDE_ONLY(await scanLs(21, (r) => pairStrict([r], x, y).length > 0), x, y));
  return rows.length ? [rows[0]] : [];
}

// "slovenia prva liga" / "slovenia vs prva liga" → a LEAGUE: every word must be in the league line (country - league)
const leagueHas = (g, q) => { const words = norm(q).replace(/\b(?:vs|v|versus)\b/g, " ").split(/\s+/).filter((w) => w.length > 1); return !!words.length && words.every((w) => norm(g.league).includes(w)); };

// the newest finished games of a league (the latest day that had any). q = words, or a test function
async function lastLeagueFromLiveScore(q) {
  const test = typeof q === "function" ? q : (r) => leagueHas(r, q);
  const rows = await scanLs(10, test);
  const latest = rows.map((r) => r.day).sort().pop();
  return latest ? newest(rows.filter((r) => r.day === latest)).slice(0, 12) : [];
}
// newest finished game from ESPN and LiveScore.com
async function bestLast(q) {
  const [a, b] = await Promise.all([lastTeam(q).catch(() => []), lastFromLiveScore(q).catch(() => [])]);
  const all = [...a, ...b].filter((r) => r && r.ts).sort((x, y) => y.ts - x.ts);
  return all.length ? [all[0]] : [...a, ...b].slice(0, 1);
}

// newest finished game between two teams: ESPN (any season) and LiveScore.com (last 3 weeks) → the newer one wins
async function bestH2H(x, y) {
  const [a, b] = await Promise.all([lastH2H(x, y).catch(() => []), lastH2HFromLiveScore(x, y).catch(() => [])]);
  const all = [...a, ...b].filter((r) => r && r.ts).sort((p, q) => q.ts - p.ts);
  return all.length ? [all[0]] : [...a, ...b].slice(0, 1);
}

// ---------- ESPN teams + schedules (any season) ----------
const teamLists = new Map(); // slug → [{ id, name, short, abbr, slug }]
async function loadTeams(slug) {
  if (teamLists.has(slug)) return teamLists.get(slug);
  for (let i = 0; i < 2; i++) {
    try {
      const { data } = await http.get(`${ESPN}/${slug}/teams?limit=500`, { timeout: 12000 });
      const list = (data?.sports?.[0]?.leagues?.[0]?.teams || []).map((t) => ({ id: t.team.id, name: t.team.displayName || "", short: t.team.shortDisplayName || "", abbr: t.team.abbreviation || "", slug }));
      teamLists.set(slug, list);
      return list;
    } catch (e) {
      const st = e?.response?.status;
      if (st && st >= 400 && st < 500 && st !== 429) { teamLists.set(slug, []); return []; } // competition does not exist
      if (i === 0) await sleep(500);
    }
  }
  return []; // temporary failure: do NOT remember an empty list
}

// best match first: first team before women/youth, exact name before partial, shorter before longer
const teamRank = (t, q) =>
  (!SIDE_RE.test(q) && SIDE_RE.test(t.name) ? 1e6 : 0) + ([t.name, t.short, t.abbr].some((x) => norm(x) === norm(q)) ? 0 : 1e3) + t.name.length;
const pickTeam = (list, q) =>
  list.filter((t) => [t.name, t.short, t.abbr].some((x) => norm(x) === norm(q)) || teamHas(t.name, q) || teamHas(t.short, q))
    .sort((a, b) => teamRank(a, q) - teamRank(b, q))[0] || null;

// searches slug lists in batches; the best match inside the first batch that has one wins
async function findTeam(q, slugs) {
  for (let i = 0; i < slugs.length; i += 8) {
    const lists = await mapLimit(slugs.slice(i, i + 8), 8, loadTeams);
    const picks = lists.map((l) => pickTeam(l, q)).filter(Boolean);
    if (picks.length) return picks.sort((a, b) => teamRank(a, q) - teamRank(b, q))[0];
  }
  return null;
}

// one ESPN event (schedule OR scoreboard) → one row
function schedRow(e, slug, leagueName) {
  const comp = e.competitions?.[0], h = comp?.competitors?.find((c) => c.homeAway === "home"), a = comp?.competitors?.find((c) => c.homeAway === "away");
  const stObj = e.status?.type ? e.status : comp?.status, state = stObj?.type?.state; // pre | in | post
  const done = stObj?.type?.completed === true || state === "post";
  return {
    id: e.id, slug, homeId: h?.team?.id, awayId: a?.team?.id, ts: new Date(e.date).getTime() / 1000, iso: e.date, showTime: state !== "in",
    league: e.league?.name || e.leagueName || leagueName || slug, home: h?.team?.displayName || "Unknown", away: a?.team?.displayName || "Unknown",
    homeLogo: espnLogo(h?.team), awayLogo: espnLogo(a?.team), homeEspnId: h?.team?.id, awayEspnId: a?.team?.id,
    hg: scoreOf(h), ag: scoreOf(a), state, status: state === "in" ? espnStatus(stObj) : done ? "✅ FULL TIME" : "🕒 NOT STARTED", cards: null
  };
}

async function schedule(team, season) {
  const data = await getJson(`${ESPN}/${team.slug}/teams/${team.id}/schedule${season ? `?season=${season}` : ""}`);
  const lg = SLUG_LABEL[team.slug] || data?.league?.name || team.slug;
  return (data?.events || []).filter((e) => (e.competitions?.[0]?.status?.type || e.status?.type)?.completed === true)
    .map((e) => schedRow(e, team.slug, lg)).sort((a, b) => b.ts - a.ts);
}

// this team's matches from the competition SCOREBOARD (last 3 days → tomorrow); it updates faster than the schedule
async function teamScoreboard(t) {
  const data = await getJson(`${ESPN}/${t.slug}/scoreboard?dates=${ymd(new Date(Date.now() - 3 * DAY))}-${ymd(new Date(Date.now() + DAY))}&limit=300`);
  const lg = SLUG_LABEL[t.slug] || data?.leagues?.[0]?.name || t.slug;
  return (data?.events || []).filter((e) => (e.competitions?.[0]?.competitors || []).some((c) => String(c.team?.id) === String(t.id))).map((e) => schedRow(e, t.slug, lg));
}

// every competition a team plays in (same ESPN team id in each list)
async function teamEntries(first, slugs) {
  const out = (await mapLimit(slugs, 10, loadTeams)).map((l) =>
    l.find((x) => String(x.id) === String(first.id) && (teamHas(x.name, first.name) || teamHas(first.name, x.name)))).filter(Boolean);
  if (!out.some((t) => t.slug === first.slug)) out.unshift(first);
  return out;
}
const uniqById = (rows) => { const seen = new Set(); return rows.filter((r) => !seen.has(r.id) && seen.add(r.id)); };

// LIVE match of one team in ANY competition (scoreboard first, then the schedule). slugs = optional limit
async function liveFromTeam(q, slugs) {
  try {
    const pool = slugs?.length ? slugs : searchSlugs(), first = await findTeam(q, pool);
    if (!first) return [];
    const got = await mapLimit(await teamEntries(first, pool), 6, async (t) => {
      const [sb, sched] = await Promise.all([teamScoreboard(t), getJson(`${ESPN}/${t.slug}/teams/${t.id}/schedule`)]);
      const lg = SLUG_LABEL[t.slug] || sched?.league?.name || t.slug;
      const fromSched = (sched?.events || []).filter((e) => (e.competitions?.[0]?.status?.type || e.status?.type)?.state === "in").map((e) => schedRow(e, t.slug, lg));
      return [...sb.filter((r) => r.state === "in"), ...fromSched];
    });
    return uniqById(got.flat());
  } catch (e) { console.log("ESPN TEAM LIVE", q, e?.message); return []; }
}

// cards for one finished match (ESPN match summary)
async function addCards(row) {
  const data = await getJson(`${ESPN}/${row.slug}/summary?event=${row.id}`, 1);
  if (!data) return row;
  const c = { yh: 0, ya: 0, rh: 0, ra: 0 };
  let found = false;
  for (const k of data.keyEvents || []) {
    const t = norm(k?.type?.text || k?.type?.type || ""), home = String(k?.team?.id) === String(row.homeId);
    if (t.includes("yellow")) { home ? c.yh++ : c.ya++; found = true; }
    else if (t.includes("red")) { home ? c.rh++ : c.ra++; found = true; }
  }
  if (!found) for (const d of data.header?.competitions?.[0]?.details || []) {
    const home = String(d?.team?.id) === String(row.homeId);
    if (d.yellowCard) { home ? c.yh++ : c.ya++; }
    if (d.redCard) { home ? c.rh++ : c.ra++; }
  }
  row.cards = c; // no card events found = 0-0
  return row;
}

const curSeason = () => { const d = new Date(); return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; };

// newest finished match of a team across ALL its competitions (slugs = limit to one competition)
async function lastTeam(q, slugs) {
  const pool = slugs?.length ? slugs : searchSlugs(), first = await findTeam(q, pool);
  if (!first) return [];
  const entries = await teamEntries(first, pool), cur = curSeason();
  for (let i = 0; i <= SEASONS_BACK; i++) {
    let rows = (await mapLimit(entries, 6, (t) => schedule(t, i === 0 ? null : cur - i + 1))).flat();
    if (i === 0) rows = rows.concat((await mapLimit(entries, 6, teamScoreboard)).flat().filter((r) => r.state === "post")); // finished in the last 3 days
    rows = uniqById(rows).sort((a, b) => b.ts - a.ts);
    if (rows.length) return [await addCards(rows[0])];
  }
  return [];
}

// newest finished match between two teams (any competition), searching back through seasons
async function lastH2H(a, b) {
  const pool = searchSlugs(), ta = await findTeam(a, pool), tb = await findTeam(b, pool);
  if (!ta || !tb) return [];
  const entries = await teamEntries(ta, pool), cur = curSeason();
  for (let i = 0; i <= SEASONS_BACK; i++) {
    const rows = (await mapLimit(entries, 6, (t) => schedule(t, i === 0 ? null : cur - i + 1))).flat().sort((x, y) => y.ts - x.ts);
    const hit = rows.find((r) => String(r.homeId) === String(tb.id) || String(r.awayId) === String(tb.id));
    if (hit) return [await addCards(hit)];
  }
  return [];
}

// ---------- real club crests: the match's own logo url → API-Football crest → ESPN logo by id → ESPN resizer ----------
const logoCache = new Map(); // url → Buffer (only successful downloads)
const isImage = (b) => !!b && b.length > 100 && (
  (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || (b[0] === 0xff && b[1] === 0xd8) || b.slice(0, 3).toString() === "GIF" ||
  (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") || b.slice(0, 1200).toString().includes("<svg"));

async function fetchBuf(url) {
  if (!url) return null;
  if (logoCache.has(url)) return logoCache.get(url);
  for (let i = 0; i < 2; i++) {
    try {
      const r = await axios.get(url, { responseType: "arraybuffer", timeout: 10000, headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "image/png,image/*;q=0.8,*/*;q=0.5",
        ...(i === 0 ? { Referer: /livescore\.com/.test(url) ? "https://www.livescore.com/" : /espn/.test(url) ? "https://www.espn.com/" : undefined } : {}) } });
      const buf = Buffer.from(r.data);
      if (!isImage(buf)) { console.log("LOGO NOT AN IMAGE:", url); return null; }
      if (logoCache.size >= 300) logoCache.delete(logoCache.keys().next().value);
      logoCache.set(url, buf);
      return buf;
    } catch (e) {
      const st = e?.response?.status;
      if (st && st < 500 && st !== 429) { console.log("LOGO HTTP", st, url); return null; }
      if (i === 0) await sleep(400); else console.log("LOGO FAILED:", url, e?.message);
    }
  }
  return null;
}
const logoUrls = (logo, id, apiId) => [...new Set([
  id && `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`,
  id && `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${id}.png&w=500&h=500`,
  ...[].concat(logo || []),
  apiId && `https://media.api-sports.io/football/teams/${apiId}.png`
].filter(Boolean))];

// ESPN team for a plain team name (gives the big 500px crest even when the match came from API-Football / LiveScore)
const espnTeamCache = new Map();
async function espnTeamFor(name) {
  const k = norm(name);
  if (!k) return null;
  if (espnTeamCache.has(k)) return espnTeamCache.get(k);
  let t = null;
  try { t = await findTeam(name, domesticSlugs()) || await findTeam(name, searchSlugs()); } catch {}
  if (t && !likeName(t.name, name) && !likeName(t.short, name)) t = null; // wrong club → no logo is better than a wrong logo
  if (t) espnTeamCache.set(k, t);
  return t;
}
const imgWidth = async (b) => { if (!sharp) return 500; try { return (await sharp(b).metadata()).width || 0; } catch { return 0; } };

// first crest that is big enough (>= 300px); otherwise the biggest one found
async function getLogo(logo, id, apiId, name) {
  if (!id && name) { const t = await espnTeamFor(name); if (t) id = t.id; }
  let best = null, bestW = -1;
  for (const u of logoUrls(logo, id, apiId)) {
    const b = await fetchBuf(u);
    if (!b) continue;
    const w = await imgWidth(b);
    if (w >= 300) return b;
    if (w > bestW) { best = b; bestW = w; }
  }
  return best;
}

// one picture for a match: [home crest] (VS) [away crest]
async function matchImage(g) {
  const [a, b] = await Promise.all([getLogo(g.homeLogo, g.homeEspnId, g.homeApiId, g.home), getLogo(g.awayLogo, g.awayEspnId, g.awayApiId, g.away)]);
  if (!a && !b) console.log("NO LOGOS FOUND for", g.home, "vs", g.away);
  if ((a || b) && sharp) {      // one crest missing → a letter badge is drawn instead, the picture still looks complete
    try {
      // big, sharp crests on a clean white background with a dark VS circle between them
      // (rendered at 2x so WhatsApp keeps it crisp). Only a crest that is almost all white gets a dark disc behind it.
      const W = 1680, BOX = 580;
      const H = 800, top = Math.round((H - BOX) / 2);

      const crest = async (buf) => {
        let src = sharp(buf, { density: 300 }).ensureAlpha();
        try {                                              // cut the empty margin so the crest fills its space
          const t = await src.clone().trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
          if (t.info.width >= 40 && t.info.height >= 40) src = sharp(t.data);
        } catch {}
        const img = await src.resize(BOX, BOX, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" }).png().toBuffer();
        const { data } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
        let sum = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 40) { sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; n++; }
        const mostlyWhite = n > 0 && sum / n > 205;
        if (!mostlyWhite) return img;
        const inner = Math.round(BOX * 0.68), off = Math.round((BOX - inner) / 2);
        const small = await sharp(img).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        const disc = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${BOX}" height="${BOX}"><circle cx="${BOX / 2}" cy="${BOX / 2}" r="${BOX / 2}" fill="#1e293b"/></svg>`);
        return sharp(disc).composite([{ input: small, left: off, top: off }]).png().toBuffer();
      };
      const badge = (name) => {
        const ini = (nameKey(name).split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
        return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${BOX}" height="${BOX}"><circle cx="${BOX / 2}" cy="${BOX / 2}" r="${BOX / 2}" fill="#1e293b"/><text x="50%" y="50%" font-size="${Math.round(BOX * 0.36)}" font-family="Arial,Helvetica,sans-serif" font-weight="bold" fill="#fff" text-anchor="middle" dominant-baseline="central">${ini}</text></svg>`)).png().toBuffer();
      };
      const [ia, ib] = await Promise.all([a ? crest(a) : badge(g.home), b ? crest(b) : badge(g.away)]);
      const cy = top + BOX / 2;
      const vs = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g transform="translate(${W / 2} ${cy})"><circle r="104" fill="#111827"/><g fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"><path d="M-62,-38 L-34,38 L-6,-38"/><path d="M62,-24 C62,-44 12,-44 12,-18 C12,6 62,-4 62,22 C62,46 12,46 12,22"/></g></g></svg>`);
      const layers = [{ input: ia, left: Math.round(W * 0.25 - BOX / 2), top }, { input: ib, left: Math.round(W * 0.75 - BOX / 2), top }, { input: vs, left: 0, top: 0 }];
      return await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
        .composite(layers).png({ compressionLevel: 9 }).toBuffer();
    } catch (e) { console.log("LOGO IMAGE ERROR:", e?.message); }
  }
  return a || b || null; // no sharp: at least one real crest
}

// ---------- message builder ----------
function buildBlock(g) {
  let t = `🏆 ${g.league}\n⚽ ${g.home} vs ${g.away}\n📊 ${g.hg} - ${g.ag}\n`;
  if (g.cards) t += `🟨 ${g.cards.yh} - ${g.cards.ya}\n🟥 ${g.cards.rh} - ${g.cards.ra}\n`;
  if (g.showTime && g.iso) {
    const d = new Date(g.iso);
    t += `📅 ${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ })}\n`;
    if (!g.dateOnly) t += `🕒 ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ })} (WAT)\n`;
  }
  return `${t}⏱ ${g.status}\n${SEP}\n\n`;
}

const shortLive = (st) => {
  st = String(st || "");
  if (/HALF TIME/.test(st)) return "⏸ HT";
  if (/FULL TIME/.test(st)) return "✅ FT";
  if (/PENALT/.test(st)) return "🎯 PEN";
  const mm = st.match(/(\d+)(?::\d+)?'?(?:\s*\+\s*(\d+)'?)?\s*$/);
  return mm ? `🔴 ${mm[1]}${mm[2] ? "+" + mm[2] : ""}'` : "🔴 LIVE";
};

// 🟨🟥 for a match that came without cards (LiveScore-only games): find the same game on ESPN by team names
async function cardsViaEspn(g) {
  try {
    const t = (await espnTeamFor(g.home)) || (await espnTeamFor(g.away));
    if (!t) return;
    const entries = await teamEntries(t, searchSlugs());
    const same = (r) => (likeName(r.home, g.home) && likeName(r.away, g.away)) || (likeName(r.home, g.away) && likeName(r.away, g.home));
    let hit = (await mapLimit(entries, 6, teamScoreboard)).flat().find(same);
    if (!hit) hit = (await mapLimit(entries, 6, (e) => schedule(e, null))).flat().find(same);
    if (!hit) return;
    await addCards(hit);
    if (!hit.cards) return;
    const c = hit.cards;
    g.cards = likeName(hit.home, g.home) ? c : { yh: c.ya, ya: c.yh, rh: c.ra, ra: c.rh };
  } catch (e) { console.log("CARDS FALLBACK ERROR:", e?.message); }
}
async function ensureCards(rows) {
  const need = rows.filter((g) => !g.cards).slice(0, rows.length <= LOGO_MAX ? LOGO_MAX : 25);
  if (need.length) await mapLimit(need, 4, cardsViaEspn);
}

// few matches → each one with its crests; many → compact list so the chat is not flooded
async function sendRows(ednut, m, title, rows) {
  await ensureCards(rows).catch(() => {});
  if (rows.length && rows.length <= LOGO_MAX) {
    for (let i = 0; i < rows.length; i++) {
      const caption = ((i === 0 ? `${title}\n${SEP}\n\n` : "") + buildBlock(rows[i])).trimEnd(), opt = i === 0 ? { quoted: m } : {};
      const img = await matchImage(rows[i]);
      if (img) { try { await ednut.sendMessage(m.chat, { image: img, caption }, opt); continue; } catch (e) { console.log("LOGO SEND ERROR:", e?.message); } }
      await ednut.sendMessage(m.chat, { text: caption }, opt);
    }
    return;
  }
  // many matches → the same block for every match (league / teams / score / cards / status), split into several messages
  const parts = [];
  let cur = `${title}\n${SEP}\n\n`;
  for (const g of rows) {
    const b = buildBlock(g);
    if (cur.length + b.length > CHUNK) { parts.push(cur.trimEnd()); cur = ""; }
    cur += b;
  }
  if (cur.trim()) parts.push(cur.trimEnd());
  for (let i = 0; i < parts.length; i++) await ednut.sendMessage(m.chat, { text: parts[i] }, i === 0 ? { quoted: m } : {});
}

const main = {
  command: ["livescore"], alias: ["live"], category: "Sport",
  description: "Live scores worldwide with team logos, cards; add goals / cards / pk to get alerts",
  execute: async (m, ctx) => {
    const { ednut, reply, args } = ctx;
    try {
      if (ednut) G.client = ednut;              // keep the freshest bot connection for the alert engine
      const typed = (args.join(" ") || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (typed) liveScoreCom();                // start the free LiveScore.com download right away (runs while the other sources are asked)

      // ".live man u goals pk cards" → show the live / last match now, then switch on alerts (same rules as .notify)
      const words = typed.split(" ");
      if (words.some((w) => KIND_WORDS[w])) {
        const rest = words.filter((w) => !KIND_WORDS[w]).join(" ").trim();
        if (rest && !/[,+&]/.test(rest) && !/\bodds?\b/.test(rest)) await main.execute(m, { ...ctx, args: rest.split(" ") });
        return notify.execute(m, { ...ctx, args: words });
      }
      // ".live sportybet 5 odds" / ".live 5odds" → live odds slip
      if (/\d+(?:\.\d+)?\s*odds?\b/.test(typed) || /\bsporty(?:bet)?\b/.test(typed)) return runFootball("predict", m, ctx, { forceLive: true });

      let vs = null;
      const sides = typed.split(/\s+(?:vs\.?|v|versus)\s+/);
      if (sides.length === 2 && sides[0].trim() && sides[1].trim()) vs = { a: tAlias(sides[0].trim()), b: tAlias(sides[1].trim()) };

      const raw = vs ? `${vs.a} vs ${vs.b}` : tAlias(typed);
      let filter = vs ? "vs" : raw.replace(/\s+/g, "");
      if (ALIAS[filter]) filter = ALIAS[filter];
      if (!filter) return reply(MENU);

      const isKnown = !vs && filter in L;
      const countryName = !vs && COUNTRY[filter] ? COUNTRY[filter] : null;
      const tc = !vs && !isKnown ? parseComp(raw) : null;
      const label = (vs ? `${vs.a} VS ${vs.b}` : tc ? `${tc.team} - ${tc.name}` : filter === "brazilu20" ? "BRAZIL U20" : isKnown ? filter : raw).toUpperCase();

      let events = [], usedApi = false;
      const needsKey = isKnown && filter !== "all" && !L[filter].espn && !countryName;
      const teamish = !vs && !tc && !isKnown && filter !== "all"; // a single team: its LIVE match comes first, always
      const teamName = countryName || raw;

      const espnLive = async () => {
        if (isKnown && filter !== "all" && !countryName) return L[filter].espn ? liveEspn([L[filter].espn]) : [];
        if (tc) return textFilter(await liveEspn(tc.slugs.length ? tc.slugs : searchSlugs()), tc.team);
        const all = await liveEspn(searchSlugs());
        return vs ? pairFilter(all, vs.a, vs.b) : filter === "all" ? all : textFilter(all, countryName || raw);
      };

      if (teamish) {
        if (apiUsable()) {
          try { events = dropSide(textFilter(await liveApi(), teamName), teamName); usedApi = true; }
          catch (e) { console.log("API-FOOTBALL ERROR:", e?.response?.status, e?.message); }
        }
        // paid API worked but this team is not live → its LAST match from the paid API comes first
        if (!events.length && usedApi) {
          const r = await apiOnlyLast(teamName, !!countryName);
          if (r) return sendRows(ednut, m, `🔎 ⚽ LAST MATCH: ${label}`, r);
        }
        if (!events.length) {                      // paid API had nothing → free sources
          const [own, every] = await Promise.all([liveFromTeam(teamName).catch(() => []), espnLive().catch(() => [])]);
          events = dropSide(own.length ? own : every, teamName);
        }
      } else {
        if (apiUsable()) {
          try {
            let list = await liveApi();
            if (vs) list = pairFilter(list, vs.a, vs.b);
            else if (tc) list = list.filter((g) => (!tc.ids.length || tc.ids.includes(g.leagueId)) && (teamHas(g.home, tc.team) || teamHas(g.away, tc.team)));
            else if (filter === "brazilu20") list = list.filter((g) => g.country === "Brazil" && /u-?20|under.?20|sub-?20/i.test(g.leagueName));
            else if (countryName) list = list.filter((g) => g.leagueId === L[filter]?.id || norm(g.home) === norm(countryName) || norm(g.away) === norm(countryName));
            else if (isKnown && filter !== "all") list = list.filter((g) => g.leagueId === L[filter].id);
            else if (!isKnown && filter !== "all") list = textFilter(list, raw);
            events = list; usedApi = true;
          } catch (e) {
            console.log("API-FOOTBALL ERROR:", e?.response?.status, e?.message);
            if (!needsKey) events = await espnLive(); // limit reached (or any API error) → free source (LiveScore.com is added below)
          }
        } else {
          if (!needsKey) events = await espnLive(); // no key, or its limit is reached → free source (LiveScore.com is added below)
        }
        // "a vs b": paid API has no live game → their last meeting from the paid API first
        if (vs && !events.length && usedApi) {
          const r = await apiOnlyH2H(vs.a, vs.b);
          if (r) return sendRows(ednut, m, `⚔️ ⚽ LAST MATCH: ${label}`, r);
        }
        if (!events.length && usedApi && !needsKey) { try { events = await espnLive(); } catch (e) {} } // the API can lag behind
        // still nothing → read the team's own scoreboard / schedule for a live game
        if (!events.length && !needsKey && filter !== "all" && (!isKnown || countryName))
          events = vs ? pairFilter(await liveFromTeam(vs.a), vs.a, vs.b) : tc ? await liveFromTeam(tc.team, tc.slugs) : await liveFromTeam(countryName || raw);
      }

      // league that only the paid API covers (e.g. Brazil U20): the free LiveScore.com source answers instead
      const needsLeagueTest = (g) => filter === "brazilu20" ? (norm(g.league).includes("brazil") && /u-?20|under.?20|sub-?20/i.test(g.league)) : leagueHas(g, PRETTY[filter] || filter);
      let lsDown = false;

      // LiveScore.com lists every competition → add the live games the other sources missed
      {
        try {
          const all = await liveScoreCom();
          if (all === null) lsDown = true;
          if (all?.length) {
            let extra;
            if (needsKey) extra = all.filter(needsLeagueTest);
            else if (vs) extra = SIDE_ONLY(pairStrict(all, vs.a, vs.b), vs.a, vs.b);
            else if (tc) extra = textFilter(all, tc.team);
            else if (filter === "all") extra = all;
            else if (isKnown && !countryName) extra = textFilter(all, PRETTY[filter] || filter);
            else {
              extra = SIDE_ONLY(teamOnly(all, teamName), teamName);                      // a team / country → ONLY its own first-team games
              if (!extra.length && !countryName && !events.length) extra = all.filter((g) => leagueHas(g, teamName)); // league words like "eerste divisie" (league line only, never team names)
            }
            events = mergeLive(events, extra);
          }
        } catch (e) { console.log("LIVESCORE ERROR:", e?.message); }
      }

      // "slovenia vs prva liga" = a country + league, not two teams → show that league's live games
      let leagueMode = false;
      if (!events.length && vs && !needsKey) {
        try {
          const all = await liveScoreCom();
          const hit = (all || []).filter((g) => leagueHas(g, `${vs.a} ${vs.b}`));
          if (hit.length) { events = hit; leagueMode = true; }
        } catch (e) { console.log("LIVESCORE LEAGUE ERROR:", e?.message); }
      }

      // paid-API-only league and no free source reachable → say so
      if (needsKey && !events.length && lsDown) return reply(apiBlocked() ? MSG_LIMIT : KEY ? MSG_FAILED : MSG_NEED_KEY);

      // nothing live → last match
      if (!events.length) {
        let r;
        if (vs) {
          r = await apiFirstH2H(vs.a, vs.b);
          if (r.length) return sendRows(ednut, m, `⚔️ ⚽ LAST MATCH: ${label}`, r);
          const ll = await lastLeagueFromLiveScore(`${vs.a} ${vs.b}`).catch(() => []);   // country + league → its latest results
          return ll.length ? sendRows(ednut, m, `🔎 ⚽ LAST MATCHES: ${`${vs.a} ${vs.b}`.toUpperCase()}`, ll) : reply(MSG_NO_H2H);
        }
        if (tc) {
          if (!tc.slugs.length) return reply(MSG_NO_COMP);
          r = await lastTeam(tc.team, tc.slugs);
          return r.length ? sendRows(ednut, m, `🔎 ⚽ LAST MATCH: ${label}`, r) : reply(MSG_NO_COMP);
        }
        if (countryName || !isKnown) {
          r = await apiFirstLast(countryName || raw, !!countryName);
          if (r.length) return sendRows(ednut, m, `🔎 ⚽ LAST MATCH: ${label}`, r);
          const ll = countryName ? [] : await lastLeagueFromLiveScore(raw).catch(() => []);   // league words → its latest results
          return ll.length ? sendRows(ednut, m, `🔎 ⚽ LAST MATCHES: ${label}`, ll) : reply(MSG_NO_TEAM);
        }
        if (needsKey) {
          const ll = await lastLeagueFromLiveScore(needsLeagueTest).catch(() => []);         // paid-API-only league → its latest results from the free source
          if (ll.length) return sendRows(ednut, m, `🔎 ⚽ LAST MATCHES: ${label}`, ll);
        }
        return reply(MSG_NO_LIVE);
      }

      const total = events.length;
      events = events.sort((a, b) => a.league.localeCompare(b.league)).slice(0, MAX_MATCHES);
      // 🟨🟥 for every ESPN game (API-Football games already have them); LiveScore-only games have no card source
      try { await mapLimit(events.filter((g) => !g.cards && g.slug && g.id).slice(0, 60), 6, addCards); } catch (e) { console.log("CARDS ERROR:", e?.message); }
      const count = `${events.length}${total > events.length ? "/" + total : ""}`;
      await sendRows(ednut, m, filter === "all" ? `🌍 ⚽ GLOBAL LIVE SCORES (${count})` : leagueMode ? `🔎 ⚽ LIVE SCORES: ${`${vs.a} ${vs.b}`.toUpperCase()} (${count})` : vs ? `⚔️ ⚽ LIVE SCORES: ${label} (${count})` : isKnown ? `⚽ LIVE SCORES ${label} (${count})` : `🔎 ⚽ LIVE SCORES: ${label} (${count})`, events);
    } catch (e) { console.log("LIVE ERROR:", e?.response?.status, e?.message); reply(MSG_FAILED); }
  }
};

// .logotest [team] → shows if the REAL logos can be downloaded on this server
const logotest = {
  command: ["logotest"], alias: ["testlogo"], category: "Sport", description: "Check that real team logos download on this bot (.logotest man u)",
  execute: async (m, ctx) => {
    const { ednut, reply, args } = ctx;
    try {
      const q = tAlias((args.join(" ") || "man u").toLowerCase().replace(/\s+/g, " ").trim());
      const team = await findTeam(q, domesticSlugs());
      if (!team) return reply(`❌ Team not found: ${q}`);
      let first = null;
      const lines = [];
      for (const u of logoUrls(null, team.id)) {
        const b = await fetchBuf(u);
        lines.push(`${b ? "✅" : "❌"} ${u}${b ? ` (${Math.max(1, Math.round(b.length / 1024))} KB)` : ""}`);
        if (b && !first) first = b;
      }
      const text = `🧪 LOGO TEST: ${team.name}\n${SEP}\n${lines.join("\n")}\n${SEP}\n🖼 sharp: ${sharp ? "installed ✅ (both logos in one picture)" : "NOT installed ❌ → run: npm i sharp"}`;
      if (first) { try { return await ednut.sendMessage(m.chat, { image: first, caption: text }, { quoted: m }); } catch (e) {} }
      return reply(text);
    } catch (e) { console.log("LOGOTEST ERROR:", e?.message); reply("❌ Logo test failed: " + (e?.message || "unknown error")); }
  }
};

// ============================== ALERTS (.notify) — REBUILT ==============================
// .notify all | epl | arsenal | arsenal vs chelsea | man u, arsenal | man u ucl     + goals / cards / pens (default all)
// .notify list | .notify test | .notify off [name]      Per chat, saved in goalalerts.json (survives a restart)
//
// What was fixed:
//  • "one game" follows were deleted 6 h after you set them (even if kick-off was tomorrow) → now kept until full time
//  • state was kept per module load → a plugin reload started a 2nd timer / lost the baseline → one shared engine now
//  • a goal seen only in the score (details late) was announced twice → now announced once
//  • tracked games were forgotten after 12 h → their baseline is refreshed every check
//  • one stuck check (network / WhatsApp send) froze alerts forever → watchdog restarts it
//  • sending used a possibly stale connection → freshest connection first, then fallback
//  • cup games (League Cup, FA Cup, Europe...) were not watched for team follows → they are now
//  • games that ESPN does not list (lower leagues, Africa, Asia) now give goal alerts through LiveScore.com
//  • .notify test shows if alerts can reach the chat and what the engine is doing
const ALERT_FILE = process.env.ALERT_FILE || path.join(__dirname, "goalalerts.json");
const ALERT_EVERY = 30e3, MAX_SUBS = 10, GAME_TTL = 8 * 86400e3, POLL_STUCK = 4 * 60e3;

// ONE shared engine state (survives a plugin reload, so no second timer / lost baseline)
const G = global.__emmyAlerts || (global.__emmyAlerts = {});
G.ev = G.ev || new Map();     // "slug:eventId" → { total, seen:Set, pend, t }           (ESPN games)
G.ls = G.ls || new Map();     // "home|away"    → { hg, ag, home, away, league, miss }   (LiveScore.com games)
G.espn = G.espn || new Map(); // ESPN games seen live lately (so LiveScore does not double-alert them)
const evState = G.ev;
if (G.timer) { clearInterval(G.timer); G.timer = null; } // plugin was reloaded: drop the old timer
G.polling = 0;

let subs = {};
try { subs = JSON.parse(fs.readFileSync(ALERT_FILE, "utf8")) || {}; } catch { subs = {}; }
const saveSubs = () => { try { fs.writeFileSync(ALERT_FILE, JSON.stringify(subs)); } catch (e) { console.log("ALERT SAVE ERROR:", e?.message); } };

// send with the freshest connection first, then any other one
async function pushMsg(chat, content) {
  const clients = [G.client, global.ednut].filter((c, i, a) => c && a.indexOf(c) === i);
  for (const c of clients) {
    try { await c.sendMessage(chat, content); return true; }
    catch (e) { console.log("ALERT SEND ERROR:", e?.message); }
  }
  return false;
}

function dropSubs(pred) {
  let n = 0;
  for (const chat of Object.keys(subs)) {
    const keep = subs[chat].filter((s) => !pred(chat, s));
    n += subs[chat].length - keep.length;
    if (keep.length) subs[chat] = keep; else delete subs[chat];
  }
  if (n) saveSubs();
  return n;
}

const sideTeam = (name, q) => teamHas(name, q) && (SIDE_RE.test(q) || !SIDE_RE.test(name));
function subMatches(s, slug, home, away) {
  if (s.type === "all") return true;
  if (s.type === "league") return (s.slugs || []).includes(slug);
  if (s.type === "team") return sideTeam(home, s.q) || sideTeam(away, s.q);
  return s.type === "game" && ((sideTeam(home, s.a) && sideTeam(away, s.b)) || (sideTeam(home, s.b) && sideTeam(away, s.a)));
}
// same test for a LiveScore.com game (no slug there, only names + league line)
function lsSubMatches(s, g) {
  if (s.type === "all") return true;
  if (s.type === "team") return sideTeam(g.home, s.q) || sideTeam(g.away, s.q);
  if (s.type === "game") return (sideTeam(g.home, s.a) && sideTeam(g.away, s.b)) || (sideTeam(g.home, s.b) && sideTeam(g.away, s.a));
  if (s.type === "lsgame") return (likeName(g.home, s.a) && likeName(g.away, s.b)) || (likeName(g.home, s.b) && likeName(g.away, s.a));
  if (s.type === "league") return leagueHas(g, s.label);
  return false;
}

const detKey = (d) => [d?.type?.id || d?.type?.text || "", d?.clock?.value ?? d?.clock?.displayValue ?? "", d?.team?.id || "", d?.athletesInvolved?.[0]?.id || ""].join("|");

// one ESPN "detail" (goal / card / penalty) → { kinds, head } or null
function classify(d) {
  const t = norm(d?.type?.text || d?.type?.type || "");
  const pen = d?.penaltyKick === true || t.includes("penalty"), own = d?.ownGoal === true || t.includes("own goal");
  const goal = d?.scoringPlay === true || (t.includes("goal") && !/no goal|disallow/.test(t));
  if (goal) return own ? { kinds: ["goal"], head: "⚽ OWN GOAL!" } : pen ? { kinds: ["goal", "pen"], head: "🎯⚽ PENALTY GOAL!" } : { kinds: ["goal"], head: "⚽ GOAL!" };
  if (pen) return { kinds: ["pen"], head: /save/.test(t) ? "🧤 PENALTY SAVED!" : "❌ PENALTY MISSED!" };
  if (d?.redCard === true || /\bred\b/.test(t)) return { kinds: ["card"], head: "🟥 RED CARD!" };
  if (d?.yellowCard === true || t.includes("yellow")) return { kinds: ["card"], head: "🟨 YELLOW CARD" };
  return null;
}

async function pollAlerts() {
  if (G.polling && Date.now() - G.polling < POLL_STUCK) return; // a check is still running
  G.polling = Date.now();
  const stat = { t: Date.now(), err: "" };
  try {
    dropSubs((c, s) => (s.type === "game" || s.type === "lsgame") && Date.now() - (s.ts || 0) > GAME_TTL);
    const entries = Object.entries(subs).flatMap(([chat, list]) => list.map((s) => ({ chat, s })));
    if (!entries.length) { if (G.timer) { clearInterval(G.timer); G.timer = null; } return; }
    if (!(G.client || global.ednut)) { stat.err = "bot connection not ready yet"; return; }

    const now = Date.now();
    for (const [k, v] of G.espn) if (now - v.t > 3 * 3600e3) G.espn.delete(k);

    const slugs = entries.some((x) => x.s.type === "all") ? searchSlugs() : [...new Set(entries.flatMap((x) => x.s.slugs || []))];
    const range = `${ymd(new Date(now - DAY))}-${ymd(new Date(now + DAY))}`; // yesterday → tomorrow (UTC), so games are seen BEFORE kick-off
    const res = await mapLimit(slugs, 10, async (slug) => {
      const data = await getJson(`${ESPN}/${slug}/scoreboard?dates=${range}&limit=300`);
      return (data?.events || []).map((e) => ({ e, slug, lgEsp: data?.leagues?.[0]?.name || "", lg: SLUG_LABEL[slug] || data?.leagues?.[0]?.name || slug }));
    });

    const doneIds = new Set();
    for (const { e, slug, lg, lgEsp } of res.flat()) {
      if (doneIds.has(e.id)) continue;
      doneIds.add(e.id);

      const key = `${slug}:${e.id}`, st = e.status?.type?.state; // pre | in | post
      const cs = e.competitions?.[0]?.competitors, h = cs?.find((c) => c.homeAway === "home"), a = cs?.find((c) => c.homeAway === "away");
      const home = h?.team?.displayName || "Home", away = a?.team?.displayName || "Away";
      const hg = scoreOf(h), ag = scoreOf(a), total = hg + ag, dets = e.competitions?.[0]?.details || [];
      if (st === "in") G.espn.set(key, { home, away, t: now });

      let rec = evState.get(key);
      if (!rec) {
        if (st === "post") continue; // finished before we ever saw it
        // pre: start from zero · already running: remember what happened so far, no spam
        evState.set(key, st === "pre" ? { total: 0, seen: new Set(), pend: 0, t: now } : { total, seen: new Set(dets.map(detKey)), pend: 0, t: now });
        continue;
      }
      rec.t = now; // seen again: keep its baseline alive
      if (st === "pre") continue;

      const shootout = /SHOOTOUT/.test(e.status?.type?.name || ""), fresh = [];
      let newGoals = 0;
      for (const d of dets) {
        const k = detKey(d);
        if (rec.seen.has(k)) continue;
        rec.seen.add(k);
        const c = shootout ? null : classify(d); // no alert for every shootout kick
        if (!c) continue;
        const isGoal = c.kinds.includes("goal");
        let skipGoal = false;
        if (isGoal) { if (rec.pend > 0) { rec.pend--; skipGoal = true; } else newGoals++; } // this goal was already announced from the score
        const tid = String(d?.team?.id || ""), p = d?.athletesInvolved?.[0];
        const teamName = tid && tid === String(h?.team?.id) ? home : tid && tid === String(a?.team?.id) ? away : "";
        fresh.push({ kinds: c.kinds, skipGoal, text: `${c.head}\n${home} ${hg} - ${ag} ${away}\n⏱ ${d?.clock?.displayValue || ""}${p?.displayName ? ` • ${p.displayName}` : ""}${teamName ? ` (${teamName})` : ""}\n🏆 ${lg}` });
      }
      // the score went up but the feed has no goal detail yet → announce from the score now (the late detail is not announced twice)
      const unexplained = total - rec.total - newGoals;
      if (!shootout && unexplained > 0) {
        for (let i = 0; i < unexplained; i++) fresh.push({ kinds: ["goal"], skipGoal: false, text: `⚽ GOAL!\n${home} ${hg} - ${ag} ${away}\n🏆 ${lg}` });
        rec.pend += unexplained;
      }
      if (total < rec.total) { rec.pend = 0; fresh.push({ kinds: ["goal"], skipGoal: false, text: `🚫 GOAL DISALLOWED / SCORE CORRECTED\n${home} ${hg} - ${ag} ${away}\n🏆 ${lg}` }); }
      rec.total = total;

      for (const ev of fresh) {
        const sent = new Set(), kinds = ev.skipGoal ? ev.kinds.filter((k) => k !== "goal") : ev.kinds;
        for (const { chat, s } of entries) {
          if (sent.has(chat) || !subMatches(s, slug, home, away) || !kinds.some((k) => (s.kinds || []).includes(k))) continue;
          sent.add(chat);
          if (await pushMsg(chat, { text: ev.text })) stat.sent = (stat.sent || 0) + 1;
        }
      }

      // full time: same card as .live (both crests, score, cards, date, time). Not for "all" (would flood); a single-game follow ends here
      if (st === "post") {
        const targets = entries.filter(({ s }) => s.type !== "all" && subMatches(s, slug, home, away));
        if (targets.length) {
          const row = await addCards(schedRow(e, slug, lgEsp || lg));
          const caption = `🏁 FULL TIME\n${SEP}\n\n${buildBlock(row)}`.trimEnd(), img = await matchImage(row);
          for (const chat of new Set(targets.map((x) => x.chat))) {
            let ok = false;
            if (img) ok = await pushMsg(chat, { image: img, caption });
            if (!ok) await pushMsg(chat, { text: caption });
          }
          const gone = targets.filter((x) => x.s.type === "game").map((x) => x.s);
          if (gone.length) dropSubs((c, s) => gone.includes(s));
        }
        evState.delete(key);
      }
    }

    // games that ESPN does not have (lower leagues, Africa, Asia...): goal alerts from LiveScore.com (score changes)
    const lsRows = await liveScoreCom().catch(() => null);
    if (lsRows) {
      const lsSeen = new Set();
      for (const g of lsRows) {
        const k = `${norm(g.home)}|${norm(g.away)}`;
        lsSeen.add(k);
        if ([...G.espn.values()].some((x) => sameGame(x, g))) { G.ls.delete(k); continue; } // ESPN already covers this one (with cards)
        const targets = entries.filter(({ s }) => lsSubMatches(s, g) && (s.kinds || []).includes("goal"));
        if (!targets.length) continue;
        const rec = G.ls.get(k);
        if (!rec) { G.ls.set(k, { hg: g.hg, ag: g.ag, home: g.home, away: g.away, league: g.league, miss: 0 }); continue; }
        rec.miss = 0; rec.home = g.home; rec.away = g.away; rec.league = g.league;
        const before = rec.hg + rec.ag, after = g.hg + g.ag;
        rec.hg = g.hg; rec.ag = g.ag;
        if (after === before) continue;
        const text = after > before ? `⚽ GOAL!\n${g.home} ${g.hg} - ${g.ag} ${g.away}\n⏱ ${g.status}\n🏆 ${g.league}` : `🚫 GOAL DISALLOWED / SCORE CORRECTED\n${g.home} ${g.hg} - ${g.ag} ${g.away}\n🏆 ${g.league}`;
        for (const chat of new Set(targets.map((x) => x.chat))) if (await pushMsg(chat, { text })) stat.sent = (stat.sent || 0) + 1;
      }
      // gone from the live list twice in a row = full time
      for (const [k, rec] of G.ls) {
        if (lsSeen.has(k)) continue;
        if (++rec.miss < 2) continue;
        const targets = entries.filter(({ s }) => s.type !== "all" && s.type !== "league" && lsSubMatches(s, rec));
        const text = `🏁 FULL TIME\n${SEP}\n\n🏆 ${rec.league}\n⚽ ${rec.home} vs ${rec.away}\n📊 ${rec.hg} - ${rec.ag}\n${SEP}`;
        for (const chat of new Set(targets.map((x) => x.chat))) await pushMsg(chat, { text });
        const gone = targets.filter((x) => x.s.type === "game" || x.s.type === "lsgame").map((x) => x.s);
        if (gone.length) dropSubs((c, s) => gone.includes(s));
        G.ls.delete(k);
      }
    }

    for (const [k, r] of evState) if (Date.now() - r.t > 12 * 3600e3) evState.delete(k);
    stat.games = evState.size + G.ls.size;
  } catch (e) { stat.err = e?.message || "error"; console.log("ALERT POLL ERROR:", e?.message); }
  finally { G.last = stat; G.polling = 0; }
}

function ensureTimer() {
  if (G.timer) return;
  G.timer = setInterval(() => pollAlerts().catch(() => {}), ALERT_EVERY);
  G.timer.unref?.();
}
function kickPoll(ms = 1500) { const t = setTimeout(() => pollAlerts().catch(() => {}), ms); t.unref?.(); } // first check = baseline of what is happening right now
if (Object.keys(subs).length) { ensureTimer(); kickPoll(8000); } // resume after a restart

// ---------- what the user typed → a follow ----------
const withCups = (arr) => [...new Set([...(arr || []), ...CUP_SLUGS])]; // a team's cup games are not in its league list
async function resolveTeam(q) {
  const name = COUNTRY[q.replace(/\s+/g, "")] || tAlias(q), pool = searchSlugs();
  let first = await findTeam(name, pool);
  if (!first) { const k = nameKey(name); if (k && k !== norm(name)) first = await findTeam(k, pool); } // "cd marathon" → "marathon" (ESPN: "Marathón")
  if (!first) return null;
  return { name: first.name, slugs: [...new Set((await teamEntries(first, pool)).map((t) => t.slug))] };
}
function leagueOnly(txt) {
  let s = norm(txt);
  for (const [re, to] of EXTRA_PHRASES) s = s.replace(re, to);
  for (const [re, to] of COMP_PHRASES) s = s.replace(re, to);
  const key = s.replace(/\s+/g, "");
  return !key || key === "all" ? null : compInfo(ALIAS[key] || key);
}

// game that ESPN does not list: look for it on LiveScore.com (yesterday, today, tomorrow)
async function lsFindGame(x, y) {
  for (const off of [0, 1, -1]) {
    const day = lagosDay(new Date(Date.now() + off * DAY)).replace(/-/g, "");
    for (const st of (await getLsDay(day)) || []) for (const ev of st?.Events || []) {
      const h = ev?.T1?.[0]?.Nm, a = ev?.T2?.[0]?.Nm;
      if (!h || !a) continue;
      if (((likeName(h, x) && likeName(a, y)) || (likeName(h, y) && likeName(a, x))) && (!(SIDE_RE.test(h) || SIDE_RE.test(a)) || SIDE_RE.test(`${x} ${y}`))) return { home: h, away: a };
    }
  }
  return null;
}

// ONE piece of text (all / a vs b / team / league) → a follow object, or an error string
async function buildSub(typed) {
  if (["all", "live", "all live"].includes(typed)) return { type: "all", label: "ALL LIVE GAMES" };

  const sides = typed.split(/\s+(?:vs\.?|v|versus)\s+/);
  if (sides.length === 2 && sides[0].trim() && sides[1].trim()) {
    const [ta, tb] = await Promise.all([resolveTeam(sides[0].trim()), resolveTeam(sides[1].trim())]);
    if (!ta || !tb) {
      const g = await lsFindGame(tAlias(sides[0].trim()), tAlias(sides[1].trim())).catch(() => null);
      if (g) return { type: "lsgame", a: g.home, b: g.away, ts: Date.now(), slugs: [], label: `${g.home} vs ${g.away}`.toUpperCase() };
      return `❌ Could not find ${!ta ? sides[0] : sides[1]}. Try the full team name.`;
    }
    const both = ta.slugs.filter((x) => tb.slugs.includes(x));
    return { type: "game", a: ta.name, b: tb.name, ts: Date.now(), slugs: withCups(both.length ? both : [...ta.slugs, ...tb.slugs]), label: `${ta.name} vs ${tb.name}`.toUpperCase() };
  }
  const team = (t) => ({ type: "team", q: t.name, slugs: withCups(t.slugs), label: t.name.toUpperCase() });
  if (COUNTRY[typed.replace(/\s+/g, "")]) { // national team (nigeria, ghana...) before league names
    const t = await resolveTeam(typed);
    return t ? team(t) : `❌ Team not found: ${typed}`;
  }
  const tc = parseComp(typed); // team inside one competition: "man u ucl"
  if (tc?.slugs.length) return { type: "team", q: tc.team, slugs: tc.slugs, label: `${tc.team} - ${tc.name}`.toUpperCase() };
  const lg = leagueOnly(typed); // a whole league / competition
  if (lg) return lg.slugs.length ? { type: "league", slugs: lg.slugs, label: lg.name.toUpperCase() } : `⚠️ ${typed} is not available for alerts (no free live feed).`;
  const t = await resolveTeam(typed); // a single team
  return t ? team(t) : `❌ Could not find "${typed}". Try the full team name or a league (.notify epl).`;
}

const NOTIFY_HELP =
`🔔 GOAL / CARD / PENALTY ALERTS
${SEP}
.notify all → every live game
.notify epl → a league (premier league, ucl, laliga...)
.notify arsenal → all games of a team
.notify arsenal vs chelsea → one game
.notify man u ucl → team in one competition
.notify man u, arsenal → several at once (use , or +)
.live man u goals pk cards → same thing from .live

Pick what you want (default = all):
goals | cards | pens
e.g. .notify epl goals   |   .notify all pens

.notify list → what you follow
.notify test → check that alerts reach this chat
.notify off → stop everything
.notify off arsenal → stop one
${SEP}`;

const kindsLabel = (k) => (k.length === 3 ? "goals, cards, pens" : k.map((x) => ({ goal: "goals", card: "cards", pen: "pens" })[x]).join(", "));

const notify = {
  command: ["notify"], alias: ["alert", "alerts", "goalalert"], category: "Sport",
  description: "Get alerts for goals, cards and penalties (all games, a league, a team or one game)",
  execute: async (m, ctx) => {
    const { ednut, reply, args } = ctx;
    try {
      if (ednut) G.client = ednut;
      const chat = m.chat, mine = subs[chat] || [];
      let typed = (args.join(" ") || "").toLowerCase().replace(/\s+/g, " ").trim();
      const engine = G.timer ? "🟢 running" : "🔴 stopped";

      if (typed === "test") {
        const ok = await pushMsg(chat, { text: "✅ TEST ALERT — if you can read this, alerts can reach this chat." });
        const l = G.last || {};
        return reply(
          `🧪 NOTIFY TEST\n${SEP}\n📨 Send to this chat: ${ok ? "✅ works" : "❌ failed"}\n⏱ Engine: ${engine}\n📋 You follow: ${mine.length}\n` +
          `🎮 Games tracked: ${evState.size + G.ls.size}\n🔄 Last check: ${l.t ? `${Math.round((Date.now() - l.t) / 1000)}s ago` : "not yet"}${l.err ? `\n⚠️ ${l.err}` : ""}\n` +
          `${mine.length ? "" : "ℹ️ You follow nothing yet — try .notify all\n"}${SEP}`
        );
      }

      if (!typed || ["list", "status", "help"].includes(typed))
        return reply(`${NOTIFY_HELP}\n\n📋 *You follow:*\n${mine.length ? mine.map((s, i) => `${i + 1}. ${s.label} — ${kindsLabel(s.kinds)}`).join("\n") : "Nothing yet."}\n\n⏱ Alert engine: ${engine}`);

      const stop = typed.match(/^(off|stop|remove|cancel|unsub|unsubscribe)\b\s*(.*)$/);
      if (stop) {
        const target = stop[2].trim();
        if (!mine.length) return reply("🔕 You are not following anything.");
        if (!target || target === "all") { dropSubs((c) => c === chat); return reply("🔕 All alerts stopped."); }
        const tq = norm(COUNTRY[target.replace(/\s+/g, "")] || tAlias(target));
        const n = dropSubs((c, s) => c === chat && (norm(s.label).includes(tq) || norm(s.label).includes(norm(target))));
        return reply(n ? `🔕 Stopped ${plural(n, "alert")} for "${target}".` : `❌ Nothing matching "${target}". Use .notify list`);
      }

      // what to alert on (goals / cards / pens words), the rest is WHAT to follow
      const kinds = new Set();
      typed = typed.split(" ").filter((w) => !(KIND_WORDS[w] && kinds.add(KIND_WORDS[w]))).join(" ").trim();
      if (!typed) return reply(NOTIFY_HELP);
      const kindList = kinds.size ? [...kinds] : ["goal", "card", "pen"];

      // several things in one command: "man u, arsenal" / "man u + arsenal"
      const added = [], failed = [];
      for (const part of typed.split(/\s*(?:,|\+|&)\s*/).map((x) => x.trim()).filter(Boolean)) {
        if ((subs[chat] || []).length >= MAX_SUBS) { failed.push(`⚠️ Limit of ${MAX_SUBS} reached, "${part}" not added.`); continue; }
        const r = await buildSub(part);
        if (typeof r === "string") { failed.push(r); continue; }
        r.kinds = r.type === "lsgame" ? ["goal"] : kindList;
        if (r.type === "lsgame") failed.push(`ℹ️ ${r.label} is not on ESPN, so I can only send goal alerts for it (no cards or penalties).`);
        r.ts = r.ts || Date.now();
        subs[chat] = (subs[chat] || []).filter((x) => x.label !== r.label); // same thing again = update it
        subs[chat].push(r);
        added.push(r);
      }
      if (!added.length) return reply(failed.join("\n"));
      saveSubs();
      ensureTimer();
      kickPoll(); // take the "what is happening right now" snapshot straight away
      return reply(
        `🔔 ALERTS ON\n${SEP}\n${added.map((r) => `📌 ${r.label}${r.type === "game" || r.type === "lsgame" ? " (ends at full time)" : ""}`).join("\n")}\n📣 ${kindsLabel(kindList)}\n` +
        `🕐 Checks every ${ALERT_EVERY / 1000}s — alerts start from now\n` +
        `${SEP}\nStop with: .notify off ${added[0].label.toLowerCase()}\nCheck it works: .notify test${failed.length ? `\n\n${failed.join("\n")}` : ""}`
      );
    } catch (e) { console.log("NOTIFY ERROR:", e?.message); reply("❌ Could not set up the alert: " + (e?.message || "unknown error")); }
  }
};

// ============================== .match (rewritten) + .h2h ==============================
// .match man u | epl | england | efl cup | italy serie a | today | 2moro | 3 days | man u today | epl tomorrow
// .h2h man u | .h2h man u vs man city | .h2h man u vs man city 3
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const EXTRA_PHRASES = [
  [/english football league cup|efl league cup|efl cup|carabao cup|eflcup/g, "leaguecup"],
  [/efl championship|sky bet championship|english championship/g, "championship"],
  [/\b(?:efl|elf|carabao|capital one)(?: league)?(?: cup)?\b(?! championship)/g, "leaguecup"],
  [/english premier league|premier league/g, "epl"],
  [/league one/g, "league1"], [/league two/g, "league2"],
  [/2\.? ?bundesliga|bundesliga ?2/g, "bundesliga2"], [/la ?liga ?2|segunda division/g, "laliga2"], [/ligue 2/g, "ligue2"],
  [/saudi pro league|roshn saudi league/g, "saudi"], [/major league soccer/g, "mls"], [/primeira liga|liga portugal/g, "portugal"],
  [/europa conference league/g, "uecl"]
];
const FILLER_RE = /\b(next|game|games|match|matches|fixture|fixtures|for|the|plays?|playing|who|when|is|are|do|does|will)\b/g;

// "epl" / "england" / "efl cup" / "italy serie a"  →  { league }   |   "man u ucl" → { league, team }   |   "man u" → { team }
function matchTarget(text) {
  let s = norm(text).replace(/[^a-z0-9 ]/g, " ");
  for (const [re, to] of EXTRA_PHRASES) s = s.replace(re, to);
  for (const [re, to] of COMP_PHRASES) s = s.replace(re, to);
  const toks = s.split(/\s+/).filter(Boolean);
  if (!toks.length) return {};
  // a country that is also a national team (nigeria, brazil...) stays a TEAM here; only real league words count
  const ok = (k) => (k && L[k] && L[k].espn && k !== "all" && (!COUNTRY[k] || FB_KEYS.includes(k)) ? k : null);
  const whole = toks.join("");
  const wk = ok(ALIAS[whole]) || ok(whole) || ok(FB_ALIAS[whole]);
  if (wk) return { league: wk };
  for (let i = toks.length - 1; i >= 0; i--) {
    if (toks[i].length <= 2) continue;
    const k = ok(ALIAS[toks[i]]) || ok(toks[i]);
    if (!k) continue;
    const rest = toks.filter((_, j) => j !== i);
    if (!rest.length || rest.every((w) => FB_ALIAS[w] || ["football", "league", "uefa", "cup"].includes(w))) return { league: k };
    return { league: k, team: rest.join(" ") };
  }
  return { team: toks.join(" ") };
}

function parseMatchArgs(raw) {
  let s = norm(raw).replace(/[^a-z0-9\/ .-]/g, " ").replace(/\s+/g, " ").trim();
  const out = { menu: false, all: false, count: null, from: null, to: null, label: "", league: null, team: "", opp: "" };
  if (/^(menu|leagues?|list|codes|help)$/.test(s)) return { ...out, menu: true };
  const todayStr = lagosDay(new Date());
  const cut = (re) => { const m = s.match(re); if (m) s = (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim(); return m; };
  const set = (a, b, l) => { out.from = a; out.to = b; out.label = l; };
  let m;
  if ((m = cut(/\b(?:in|after)\s+(\d{1,2})\s*days?\b/))) set(+m[1], +m[1], `in ${m[1]} days`);
  else if (cut(/\b(?:day after tomorrow|after tomorrow|aftertomorrow|next (?:tomorrow|tomorow|tommorow|tmrw|2moro|2morrow))\b/)) set(2, 2, "the day after tomorrow");
  else if (cut(/\b(?:today|2day|tonight)\b/)) set(0, 0, "today");
  else if (cut(/\b(?:tomorrow|tomorow|tommorow|tmrw|tmr|2moro|2morrow)\b/)) set(1, 1, "tomorrow");
  else if ((m = cut(/\b(?:next\s+)?(\d{1,2})\s*days?\b/))) { const n = Math.min(7, Math.max(1, +m[1])); set(0, n - 1, `the next ${n} days`); }
  else if ((m = cut(new RegExp(`\\b(${WEEKDAYS.join("|")})\\b`)))) {
    const cur = new Date(`${todayStr}T12:00:00Z`).getUTCDay(), off = (WEEKDAYS.indexOf(m[1]) - cur + 7) % 7;
    set(off, off, m[1]);
  } else if ((m = cut(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/))) {
    const d = +m[1], mo = +m[2];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : +todayStr.slice(0, 4);
      let off = Math.round((Date.UTC(y, mo - 1, d) - Date.parse(todayStr)) / DAY);
      if (!m[3] && off < 0) off = Math.round((Date.UTC(y + 1, mo - 1, d) - Date.parse(todayStr)) / DAY);
      set(off, off, `${d}/${mo}`);
    }
  }
  if ((m = cut(/\b(\d{1,3})\b/))) out.count = Math.min(LIMIT.max, Math.max(1, +m[1]));
  if (cut(/\ball\b/)) out.all = true;
  s = s.replace(FILLER_RE, " ").replace(/\s+/g, " ").trim();

  let teamPart = s;
  const vs = s.split(/\s+(?:vs\.?|v|versus)\s+/);
  if (vs.length === 2 && vs[0] && vs[1]) { teamPart = vs[0]; out.opp = vs[1]; }
  const t = matchTarget(teamPart);
  out.league = t.league || null;
  out.team = t.team || "";
  return out;
}

// ---------- LiveScore.com backup (when ESPN has no feed for a competition / a cup) ----------
const LS_COMP = {
  epl: ["England", "Premier League"], championship: ["England", "Championship"], league1: ["England", "League One"], league2: ["England", "League Two"],
  facup: ["England", "FA Cup"], leaguecup: ["England", "EFL Cup|Carabao|League Cup"], laliga: ["Spain", "LaLiga$|La Liga$|Primera"], copadelrey: ["Spain", "Copa del Rey"],
  seriea: ["Italy", "Serie A"], serieb: ["Italy", "Serie B"], coppaitalia: ["Italy", "Coppa Italia"], bundesliga: ["Germany", "^(1\\. )?Bundesliga$"],
  dfbpokal: ["Germany", "DFB"], ligue1: ["France", "Ligue 1"], ligue2: ["France", "Ligue 2"], coupedefrance: ["France", "Coupe de France"],
  eredivisie: ["Netherlands", "Eredivisie"], portugal: ["Portugal", "Liga Portugal|Primeira"], mls: ["USA", "MLS|Major League"], saudi: ["Saudi", "Pro League|Saudi"],
  ucl: ["", "Champions League"], uel: ["", "Europa League"], uecl: ["", "Conference League"]
};
const lsStageTest = (key) => {
  const c = LS_COMP[key];
  if (!c) return null;
  const cr = c[0] ? new RegExp(c[0], "i") : null, sr = new RegExp(c[1], "i");
  return (st) => (!cr || cr.test(st?.Cnm || "")) && sr.test(st?.Snm || "") && !/women|youth|u-?\d{2}|reserve|trophy/i.test(st?.Snm || "");
};
// matches between two day-offsets from LiveScore.com (optionally only one competition / one team)
async function lsRange(fromOff, toOff, stageTest, teamName, leagueLabel) {
  const days = [];
  for (let o = fromOff; o <= toOff; o++) days.push(lagosDay(new Date(Date.now() + o * DAY)).replace(/-/g, ""));
  const out = [];
  await mapLimit(days, 5, async (day) => {
    for (const st of (await getLsDay(day).catch(() => null)) || []) {
      if (stageTest && !stageTest(st)) continue;
      for (const ev of st?.Events || []) {
        const h = ev?.T1?.[0]?.Nm, a = ev?.T2?.[0]?.Nm;
        if (!h || !a) continue;
        if (teamName && !(teamStrict(h, teamName) || teamStrict(a, teamName))) continue;
        const eps = String(ev?.Eps || "").trim(), d = String(ev?.Esd || "");
        if (d.length < 12) continue;
        const state = /^(?:FT|AET|AP|PEN)$/i.test(eps) ? "post" : /^(?:HT|ET)$/i.test(eps) || /^\d+(?:\+\d+)?'?$/.test(eps) ? "in" : /^NS$|^$/i.test(eps) ? "pre" : null;
        out.push({
          id: `ls:${ev.Eid}`, evId: ev.Eid, slug: null, date: new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:00+01:00`),
          state: state || "post", completed: state === "post", off: !state,
          league: leagueLabel || [st?.Cnm, st?.Snm].filter(Boolean).join(" - "), home: h, away: a,
          hg: Number(ev?.Tr1) || 0, ag: Number(ev?.Tr2) || 0, detail: state === "in" ? (eps === "HT" ? "HT" : eps.replace(/'?$/, "'")) : ""
        });
      }
    }
  });
  return out;
}
// add LiveScore games that the main list does not have yet (same two teams within 36 h = same game)
const addMissing = (base, extra) => [...base, ...extra.filter((e) => !base.some((b) => likeName(b.home, e.home) && likeName(b.away, e.away) && Math.abs(b.date - e.date) < 36 * 3600e3))];

// ---------- ESPN rows ----------
function evRow(ev, slug, lgName) {
  const comp = ev.competitions?.[0] || {}, cs = comp.competitors || [];
  const H = cs.find((c) => c.homeAway === "home"), A = cs.find((c) => c.homeAway === "away");
  const st = ev.status?.type || comp.status?.type || {};
  return {
    id: `${slug}:${ev.id}`, evId: ev.id, slug, date: new Date(ev.date), state: st.state, completed: st.completed === true,
    off: /postpon|cancel|suspend|abandon|delay/i.test(`${st.name || ""} ${st.description || ""}`),
    league: SLUG_LABEL[slug] || lgName || slug, home: H?.team?.displayName || "TBD", away: A?.team?.displayName || "TBD",
    homeId: H?.team?.id, awayId: A?.team?.id, hg: scoreOf(H), ag: scoreOf(A),
    detail: ev.status?.displayClock || st.shortDetail || ""
  };
}
// same game twice (same id, or same two teams on the same day from two feeds) is kept once
const uniqRows = (rows) => {
  const seen = new Set();
  return rows.filter((r) => { const k2 = r.homeId && r.awayId ? `${r.homeId}-${r.awayId}-${r.date.toISOString().slice(0, 10)}` : r.id; if (seen.has(r.id) || seen.has(k2)) return false; seen.add(r.id); seen.add(k2); return true; });
};

const _rangeCache = new Map();
const CUP_SLUGS = ["eng.fa", "eng.league_cup", "eng.charity", "esp.copa_del_rey", "ita.coppa_italia", "ger.dfb_pokal", "fra.coupe_de_france",
  "uefa.champions", "uefa.europa", "uefa.europa.conf", "uefa.super_cup", "conmebol.libertadores", "conmebol.sudamericana", "caf.champions",
  "fifa.cwc", "fifa.friendly", "club.friendly", "concacaf.champions"];

// ESPN scoreboard for one competition between two day-offsets, asked in 7-day windows (long ranges are unreliable on ESPN)
async function sbWindow(slug, fromOff, toOff) {
  const wins = [];
  for (let o = fromOff; o <= toOff; o += 7) wins.push([o, Math.min(toOff, o + 6)]);
  const res = await Promise.all(wins.map(([a, b]) => getJson(
    `${ESPN}/${slug}/scoreboard?dates=${ymd(new Date(Date.now() + (a - 1) * DAY))}-${ymd(new Date(Date.now() + (b + 1) * DAY))}&limit=500`, 2, 8000)));
  return { events: res.flatMap((d) => d?.events || []), name: res.find((d) => d?.leagues?.[0]?.name)?.leagues[0].name };
}

// every match of these competitions between day-offset `fromOff` and `toOff` (Lagos days), cached for 60 s
async function rangeRows(slugs, fromOff, toOff) {
  const key = `${slugs.join(",")}|${fromOff}-${toOff}|${lagosDay(new Date())}`, hit = _rangeCache.get(key);
  if (hit && Date.now() - hit.t < 60e3) return hit.rows;
  const res = await mapLimit(slugs, 8, async (slug) => {
    const { events, name } = await sbWindow(slug, fromOff, toOff);
    return events.map((e) => evRow(e, slug, SLUG_LABEL[slug] || name || slug));
  });
  const rows = uniqRows(res.flat());
  if (_rangeCache.size > 30) _rangeCache.delete(_rangeCache.keys().next().value);
  _rangeCache.set(key, { t: Date.now(), rows });
  return rows;
}

// all matches (live + coming up + this week's results) of ONE team in every competition it plays (league AND cups)
async function teamFixtures(q, slugsLimit, lsTest) {
  const name = COUNTRY[q.replace(/\s+/g, "")] || tAlias(q), pool = slugsLimit?.length ? slugsLimit : searchSlugs();
  let first = await findTeam(name, pool);
  if (!first) { const k = nameKey(name); if (k && k !== norm(name)) first = await findTeam(k, pool); }
  if (!first) return { team: null, rows: [] };
  const entries = await teamEntries(first, pool);
  const mine = (e) => (e.competitions?.[0]?.competitors || []).some((c) => String(c.team?.id) === String(first.id) || (c.team?.displayName && teamStrict(c.team.displayName, first.name)));
  const scan = async (slugs, a, b) => (await mapLimit(slugs, 8, async (slug) => {
    const { events, name: n } = await sbWindow(slug, a, b);
    return events.filter(mine).map((e) => evRow(e, slug, SLUG_LABEL[slug] || n || slug));
  })).flat();

  // ESPN lists cups (EFL Cup, FA Cup, Europe...) under no team, so the cup scoreboards are searched too
  const cupSlugs = slugsLimit?.length ? [] : CUP_SLUGS.filter((c) => !entries.some((t) => t.slug === c));
  const allSlugs = [...entries.map((t) => t.slug), ...cupSlugs];
  const fromSched = (await mapLimit(entries, 6, async (t) => {
    const sched = await getJson(`${ESPN}/${t.slug}/teams/${t.id}/schedule`);
    const lg = SLUG_LABEL[t.slug] || sched?.league?.name || t.slug;
    return (sched?.events || []).map((e) => evRow(e, t.slug, lg));
  })).flat();
  let rows = uniqRows([...(await scan(allSlugs, -1, 21)), ...fromSched]);
  try { rows = addMissing(rows, await lsRange(0, 14, lsTest || null, first.name)); } catch (e) { console.log("LS TEAM ERROR:", e?.message); }
  const upcoming = (r) => !r.off && (r.state === "in" || (r.state === "pre" && r.date.getTime() > Date.now()));
  if (!rows.some(upcoming)) rows = uniqRows([...rows, ...(await scan(entries.map((t) => t.slug), 22, 70))]); // nothing for 3 weeks → look further (league only)
  return { team: first, rows };
}

const dayDiff = (d) => Math.round((Date.parse(lagosDay(d)) - Date.parse(lagosDay(new Date()))) / DAY);
const relDay = (d) => { const n = dayDiff(d); return n === 0 ? "🔥 TODAY" : n === 1 ? "⏭️ TOMORROW" : n > 1 ? `🗓️ in ${n} days` : ""; };

function teamBlock(ev, team) {
  const isHome = ev.homeId ? String(ev.homeId) === String(team.id) : teamStrict(ev.home, team.name);
  const lines = [`*⚽ ${ev.home} vs ${ev.away}*`];
  if (ev.state === "in") lines.push(`🔴 LIVE ${ev.hg}-${ev.ag}${ev.detail ? ` • ${ev.detail}` : ""}`);
  else if (ev.state === "post") lines.push(`✅ FULL TIME ${ev.hg}-${ev.ag}`);
  lines.push(whenLine(ev.date));
  const rel = relDay(ev.date);
  if (rel && ev.state !== "post") lines.push(rel);
  lines.push(`🏆 ${ev.league}`, `🆚 Opponent: ${isHome ? ev.away : ev.home} (${isHome ? "Home" : "Away"})`);
  return "\n" + lines.join("\n") + "\n\n" + SEP;
}

async function matchTeamMode({ a, send, client, chatId, m }) {
  const lg = a.league ? L[a.league] : null;
  const { team, rows } = await teamFixtures(a.team, lg ? [lg.espn] : null, a.league ? lsStageTest(a.league) : null);
  if (!team) return { ok: false, msg: `❌ I could not find *${a.team}*${lg ? ` in ${PRETTY[a.league] || a.league}` : ""}.\nTry the full team name.` };

  const dated = a.from !== null;
  const inRange = (r) => { const n = dayDiff(r.date); return n >= a.from && n <= a.to; };
  let list = rows.filter((r) => !r.off && (r.state === "in" || r.state === "pre" || (dated && r.state === "post")));
  if (dated) list = list.filter((r) => r.state === "in" ? a.from <= 0 && a.to >= 0 : inRange(r));
  else list = list.filter((r) => r.state === "in" || r.date.getTime() > Date.now() - 5 * 60e3);
  if (a.opp) list = list.filter((r) => teamHas(r.home, a.opp) || teamHas(r.away, a.opp) || teamHas(r.home, tAlias(a.opp)) || teamHas(r.away, tAlias(a.opp)));
  list.sort((x, y) => (y.state === "in") - (x.state === "in") || x.date - y.date);
  list = list.slice(0, a.count || (dated ? 10 : 3));

  const title = team.name.toUpperCase();
  if (!list.length) {
    return { ok: false, msg: dated
      ? `⚽ *${team.name}* has no match ${a.label === "today" || a.label === "tomorrow" ? a.label : `in ${a.label}`}${lg ? ` in ${PRETTY[a.league] || a.league}` : ""}.`
      : `⚽ No upcoming match found for *${team.name}*${lg ? ` in ${PRETTY[a.league] || a.league}` : ""} in the next 70 days.\nThe season may be over or on a break.` };
  }
  const f = list[0], isHome = f.homeId ? String(f.homeId) === String(team.id) : teamStrict(f.home, team.name), opp = isHome ? f.away : f.home;
  const intro = f.state === "in" ? `🔴 *Playing NOW vs ${opp}*` : f.state === "post" ? `✅ *Played ${isHome ? "vs" : "at"} ${opp}*` : `🆚 *Next opponent: ${opp}* (${isHome ? "Home" : "Away"})`;
  const head = `${SEP}\n⚽ *${title}* — ${dated ? a.label.toUpperCase() : "NEXT MATCH"}${lg ? ` • ${(PRETTY[a.league] || a.league).toUpperCase()}` : ""}\n${SEP}\n${intro}`;
  const footer = `📊 *Total: ${plural(list.length, "match")}*\n\n> EMMYFROSH-AI\n${SEP}`;
  await sendParts(client, chatId, m, head, list.map((ev) => teamBlock(ev, team)), footer);
  return { ok: true };
}

const matchLine = (ev) =>
  ev.state === "in" ? `🔴 ${ev.detail || "LIVE"}  ${ev.home} ${ev.hg}-${ev.ag} ${ev.away}`
    : ev.state === "post" ? `✅ FT  ${ev.home} ${ev.hg}-${ev.ag} ${ev.away}`
    : `⏰ ${timeLabel(ev.date)}  ${ev.home} vs ${ev.away}`;

async function matchRangeMode({ a, client, chatId, m }) {
  const lg = a.league ? L[a.league] : null;
  const slugs = lg ? [lg.espn] : domesticSlugs();
  const dated = a.from !== null;
  let from = dated ? a.from : 0, to = dated ? a.to : 7, note = "";
  const pick = (rows) => rows.filter((r) => {
    if (r.off) return false;
    const n = dayDiff(r.date);
    if (n < from || n > to) return false;
    return r.state === "in" || r.state === "pre" || (dated && r.state === "post");
  });
  const lsTest = lg ? lsStageTest(a.league) : null, lsLabel = lg ? (SLUG_LABEL[lg.espn] || PRETTY[a.league]) : null;
  const withLs = async (rows, f, t) => { if (!lsTest) return rows; try { return addMissing(rows, await lsRange(f, t, lsTest, null, lsLabel)); } catch (e) { console.log("LS RANGE ERROR:", e?.message); return rows; } };
  let rows = pick(await withLs(await rangeRows(slugs, from, to), from, to));
  if (!rows.length && lg && !dated) {                       // nothing this week → show the next matchday of that league
    from = 0; to = 45;
    const later = pick(await withLs(await rangeRows(slugs, 0, 45), 0, 45)).sort((x, y) => x.date - y.date);
    if (later.length) { const d0 = lagosDay(later[0].date); rows = later.filter((r) => lagosDay(r.date) === d0); note = "ℹ️ Nothing in the next 7 days — this is the next matchday.\n"; }
  }
  const scope = lg ? (PRETTY[a.league] || SLUG_LABEL[lg.espn] || a.league).toUpperCase() : "ALL LEAGUES";
  if (!rows.length) {
    return { ok: false, msg: `⚽ No matches found for *${scope}* ${dated ? (a.label === "today" || a.label === "tomorrow" ? a.label : `in ${a.label}`) : "in the next 45 days"}.\nIt may be an international break or the competition is not playing.` };
  }
  rows.sort((x, y) => x.date - y.date || x.league.localeCompare(y.league));
  const total = rows.length;
  if (a.count) rows = rows.slice(0, a.count); else rows = rows.slice(0, 150);

  // group: day → competition → lines
  const days = new Map();
  for (const ev of rows) { const k = lagosDay(ev.date); if (!days.has(k)) days.set(k, []); days.get(k).push(ev); }
  const parts = [];
  for (const evs of days.values()) {
    const byLg = new Map();
    for (const ev of evs) { if (!byLg.has(ev.league)) byLg.set(ev.league, []); byLg.get(ev.league).push(ev); }
    let first = true;
    for (const [lgName, list] of byLg) {
      const dayHead = first ? `\n📅 *${fullDate(list[0].date)}* ${relDay(list[0].date)}\n` : "\n";
      first = false;
      parts.push(`${dayHead}🏆 *${lgName}*\n${list.sort((x, y) => x.date - y.date).map(matchLine).join("\n")}`);
    }
  }
  const when = dated ? a.label.toUpperCase() : "UPCOMING";
  const head = `${SEP}\n🏆 *${scope}* — ${when}\n${SEP}${note ? `\n${note.trim()}` : ""}`;
  const shown = rows.length < total ? ` (showing ${rows.length} of ${total})` : "";
  const footer = `\n${SEP}\n📊 *Total: ${plural(total, "match")}*${shown}\n\n> EMMYFROSH-AI\n${SEP}`;
  await sendParts(client, chatId, m, head, parts, footer);
  return { ok: true };
}

const matchHelp = (p) =>
  `${SEP}\n⚽ *EMMYFROSH-AI — MATCH*\n${SEP}\n\n` +
  [`man u → who they play next (or live / today)`, `man u today → do they play today?`, `epl → all Premier League fixtures`, `england → same as epl`,
    `efl cup → all League Cup fixtures`, `italy serie a → all Serie A fixtures`, `today → every match today`, `2moro → every match tomorrow`,
    `3 days → next 3 days`, `epl tomorrow → one league, tomorrow`, `man u ucl → team in one competition`, `menu → league codes`]
    .map((x) => `${p}match ${x}`).join("\n") + `\n\n${p}h2h man u vs man city → last 5 meetings + goals\n${SEP}`;

async function runMatch(m, ctx) {
  const { ednut, from, prefix, args, text: argText } = ctx;
  const client = ednut || global.ednut, chatId = from || m.chat || m.key.remoteJid;
  const send = (t) => client.sendMessage(chatId, { text: t }, { quoted: m });
  const react = (e) => client.sendMessage(chatId, { react: { text: e, key: m.key } }).catch(() => {});

  let rawArgs = (Array.isArray(args) && args.length ? args.join(" ") : "") || (typeof argText === "string" ? argText : "");
  if (!rawArgs) rawArgs = (m.text || m.body || m.message?.conversation || m.message?.extendedTextMessage?.text || "").replace(/^\S+\s*/, "");
  rawArgs = rawArgs.trim();
  const first = rawArgs.split(/\s+/)[0] || "";
  if (first && CMD_NAMES.includes(first.toLowerCase().replace(/[^a-z]/g, ""))) rawArgs = rawArgs.slice(first.length).trim();

  const a = parseMatchArgs(rawArgs);
  if (a.menu || (!a.team && !a.league && a.from === null)) return runFootball("nextmatch", m, ctx); // ".match", ".match all", ".match 10", ".match menu"

  react("⏳");
  try {
    const r = a.team ? await matchTeamMode({ a, client, chatId, m }) : await matchRangeMode({ a, client, chatId, m });
    if (!r.ok) { react("❌"); return send(r.msg); }
    react("✅");
  } catch (err) {
    console.error("[MATCH ERROR]", err);
    react("❌");
    await send(`❌ Could not fetch matches right now. Try again in a moment.`);
  }
}

// ---------- .h2h ----------
// the newest `want` finished games of a team (optionally only against `oppId`), searching back season by season
async function collectResults(entries, want, oppId, seasons = 8) {
  const cur = curSeason();
  let acc = [];
  for (let i = 0; i < seasons; i++) {
    let rows = (await mapLimit(entries, 6, (t) => schedule(t, i === 0 ? null : cur - i))).flat();
    if (i === 0) rows = rows.concat((await mapLimit(entries, 6, teamScoreboard)).flat().filter((r) => r.state === "post")); // finished in the last 3 days
    if (oppId) rows = rows.filter((r) => String(r.homeId) === String(oppId) || String(r.awayId) === String(oppId));
    acc = uniqById(acc.concat(rows)).sort((x, y) => y.ts - x.ts);
    if (acc.length >= want) break;
  }
  return acc.slice(0, want);
}

// goal scorers of one finished ESPN game → row.goals = [{ team, who, min, og, pen }]
async function addScorers(row) {
  row.goals = [];
  if (!row.slug || !row.id) return row;
  const data = await getJson(`${ESPN}/${row.slug}/summary?event=${row.id}`, 1, 8000);
  if (!data) return row;
  for (const d of data.header?.competitions?.[0]?.details || []) {
    if (!d.scoringPlay) continue;
    const p = d.athletesInvolved?.[0];
    row.goals.push({ team: String(d.team?.id), who: p?.displayName || p?.shortName || "Unknown", min: d.clock?.displayValue || "", og: !!d.ownGoal, pen: !!d.penaltyKick });
  }
  if (!row.goals.length) for (const k of data.keyEvents || []) {
    if (!k.scoringPlay) continue;
    const t = norm(k.type?.text || k.type?.type || ""), p = k.participants?.[0]?.athlete;
    row.goals.push({ team: String(k.team?.id), who: p?.displayName || p?.shortName || "Unknown", min: k.clock?.displayValue || "", og: t.includes("own"), pen: t.includes("penalty") });
  }
  return row;
}

function scorerLines(r) {
  if (!r.goals) return "";
  if (!r.goals.length) return r.hg + r.ag > 0 ? `   ⚽ Scorers not available\n` : "";
  const side = (id, name) => {
    const g = r.goals.filter((x) => x.team === String(id));
    if (!g.length) return "";
    const by = new Map();
    for (const x of g) { const k = `${x.who}${x.og ? "|og" : ""}`; if (!by.has(k)) by.set(k, { who: x.who, mins: [], og: x.og }); by.get(k).mins.push(`${x.min}${x.pen ? " (P)" : ""}`); }
    return `   ⚽ ${name}: ${[...by.values()].map((x) => `${x.who}${x.og ? " (OG)" : ""} ${x.mins.join(", ")}`.trim()).join(" • ")}\n`;
  };
  return side(r.homeId, r.home) + side(r.awayId, r.away);
}

async function h2hTeam(q) {
  const name = COUNTRY[q.replace(/\s+/g, "")] || tAlias(q), pool = searchSlugs();
  let t = await findTeam(name, pool);
  if (!t) { const k = nameKey(name); if (k && k !== norm(name)) t = await findTeam(k, pool); }
  return t;
}

const H2H_HELP = (p) =>
  `${SEP}\n🤝 *EMMYFROSH-AI — HEAD TO HEAD*\n${SEP}\n` +
  [`man u → last 5 matches of a team`, `man u vs man city → last 5 meetings + goals`, `man u vs man city 3 → last 3 meetings`, `real madrid vs barca 2`]
    .map((x) => `${p}h2h ${x}`).join("\n") + `\n${SEP}`;

async function runH2H(m, ctx) {
  const { ednut, from, prefix, args, text: argText } = ctx;
  const client = ednut || global.ednut, chatId = from || m.chat || m.key.remoteJid;
  const p = prefix || (Array.isArray(global.prefix) ? global.prefix[0] : global.prefix) || ".";
  const send = (t) => client.sendMessage(chatId, { text: t }, { quoted: m });
  const react = (e) => client.sendMessage(chatId, { react: { text: e, key: m.key } }).catch(() => {});

  let rawArgs = (Array.isArray(args) && args.length ? args.join(" ") : "") || (typeof argText === "string" ? argText : "");
  if (!rawArgs) rawArgs = (m.text || m.body || m.message?.conversation || m.message?.extendedTextMessage?.text || "").replace(/^\S+\s*/, "");
  rawArgs = rawArgs.trim();
  const first = rawArgs.split(/\s+/)[0] || "";
  if (first && ["h2h", "headtohead", "h2hmatch"].includes(first.toLowerCase().replace(/[^a-z0-9]/g, ""))) rawArgs = rawArgs.slice(first.length).trim();

  let s = norm(rawArgs).replace(/\s+/g, " ").trim(), want = 5, mc;
  if ((mc = s.match(/(?:^|\s)(\d{1,2})$/))) { want = Math.min(10, Math.max(1, +mc[1])); s = s.slice(0, mc.index).trim(); }
  else if ((mc = s.match(/^(\d{1,2})\s+/))) { want = Math.min(10, Math.max(1, +mc[1])); s = s.slice(mc[0].length).trim(); }
  if (!s || s === "help" || s === "menu") return send(H2H_HELP(p));

  const sides = s.split(/\s+(?:vs\.?|v|versus)\s+/).map((x) => x.trim()).filter(Boolean);
  if (sides.length > 2) return send(H2H_HELP(p));

  react("⏳");
  try {
    const [ta, tb] = await Promise.all([h2hTeam(sides[0]), sides[1] ? h2hTeam(sides[1]) : null]);
    if (!ta) { react("❌"); return send(`❌ I could not find *${sides[0]}*. Try the full team name.`); }
    if (sides[1] && !tb) { react("❌"); return send(`❌ I could not find *${sides[1]}*. Try the full team name.`); }

    const pool = searchSlugs(), entries = await teamEntries(ta, pool);
    let rows = await collectResults(entries, want, tb ? tb.id : null);

    // ESPN has too few old meetings → add what the API-Football key knows (score only)
    if (tb && rows.length < want && apiUsable()) {
      try {
        const [ia, ib] = await Promise.all([apiTeamId(ta.name), apiTeamId(tb.name)]);
        const res = ia && ib ? await apiCall("fixtures/headtohead", { h2h: `${ia}-${ib}`, last: want }, "h2h") : null;
        for (const g of res || []) {
          const r = apiFixtureRow(g);
          if (r && !rows.some((x) => Math.abs(x.ts - r.ts) < 36 * 3600 && likeName(x.home, r.home))) rows.push(r);
        }
        rows = rows.sort((x, y) => y.ts - x.ts).slice(0, want);
      } catch (e) { console.log("H2H API ERROR:", e?.message); }
    }
    if (!rows.length) { react("❌"); return send(tb ? `🤝 No finished match found between *${ta.name}* and *${tb.name}*.` : `🤝 No finished match found for *${ta.name}*.`); }

    await mapLimit(rows, 4, (r) => addScorers(r).catch(() => r));

    const isA = (r) => (r.homeId ? String(r.homeId) === String(ta.id) : likeName(r.home, ta.name));
    let w = 0, d = 0, l = 0, gf = 0, ga = 0;
    const parts = rows.map((r, i) => {
      const mine = isA(r) ? r.hg : r.ag, theirs = isA(r) ? r.ag : r.hg;
      gf += mine; ga += theirs;
      let tag;
      if (mine > theirs) { w++; tag = tb ? `🏅 ${ta.name} won` : "✅ Win"; }
      else if (mine < theirs) { l++; tag = tb ? `🏅 ${tb.name} won` : "❌ Loss"; }
      else { d++; tag = "🤝 Draw"; }
      const when = r.iso ? new Date(r.iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : "";
      const hn = r.hg > r.ag ? `*${r.home}*` : r.home, an = r.ag > r.hg ? `*${r.away}*` : r.away;
      return `\n*${i + 1}.* 🏆 ${r.league}${when ? ` • 📅 ${when}` : ""}\n⚽ ${hn} ${r.hg} - ${r.ag} ${an}\n${tag}\n${scorerLines(r)}${SEP}`;
    });

    const title = tb ? `${ta.name} vs ${tb.name}` : `${ta.name} — LAST ${rows.length}`;
    const head = `${SEP}\n🤝 *${title.toUpperCase()}*\n${tb ? `📜 Last ${plural(rows.length, "meeting")}` : "📜 Latest results"}\n${SEP}`;
    const form = !tb ? `\n🔥 Form (newest first): ${rows.map((r) => (isA(r) ? r.hg - r.ag : r.ag - r.hg)).map((x) => (x > 0 ? "W" : x < 0 ? "L" : "D")).join(" ")}` : "";
    const footer = `📊 *${ta.name}:* ${w}W • ${d}D • ${l}L\n⚽ Goals: ${gf}-${ga}${tb ? `  (${ta.name} ${gf} • ${tb.name} ${ga})` : ""}${form}\n\n> EMMYFROSH-AI\n${SEP}`;
    await sendParts(client, chatId, m, head, parts, footer);
    react("✅");
  } catch (err) {
    console.error("[H2H ERROR]", err);
    react("❌");
    await send(`❌ Could not fetch head-to-head right now. Try again in a moment.`);
  }
}

// ============================== EXPORTS ==============================
module.exports = [
  main, logotest, notify,
  { command: "nextmatch", alias: ["match", "matches", "nextmatches", "nextgame", "fixtures", "whoplays"], category: "Sport",
    description: "Who is playing next — team, league, today, tomorrow, 3 days (.match man u | .match epl | .match today)", use: "[team|league|today|tomorrow|3 days]",
    async execute(m, ctx) { return runMatch(m, ctx); } },
  { command: "h2h", alias: ["headtohead", "h2hmatch"], category: "Sport",
    description: "Head to head — last 1-5 meetings of two teams (or a team's last results) with goals", use: "<team> [vs <team>] [1-10]",
    async execute(m, ctx) { return runH2H(m, ctx); } },
  { command: "corners", alias: ["corner", "predictcorners"], category: "Sport",
    description: "Corner predictions (estimated from recent games)", use: "[league|team|tomorrow] [number]",
    async execute(m, ctx) { return runFootball("predict", m, ctx, { forceCorners: true }); } },
  { command: "predict", alias: ["prediction", "predictions", "tip", "tips"], category: "Sport",
    description: "Predict football matches with odds — .predict shows the league menu", use: "[number|all|today|tomorrow] [league|team]",
    async execute(m, ctx) { return runFootball("predict", m, ctx); } }
];