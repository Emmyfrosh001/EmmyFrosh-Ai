// plugins/EmmyFrosh/economy.js
// ================================================================
// 💰 COMPLETE ECONOMY SYSTEM — Real names everywhere
// ================================================================

const { SaveDataBase } = require('../../lib/Emmyfrosh');

// Mongo URL lives in lib/mongodb.js (MONGO_URLS list) — not in .env
function mongoReady() {
  try { return require('../../lib/mongodb').getMongoUrls().length > 0; }
  catch { return false; }
}

// ================================================================
// 🎨 UI FORMATTER
// ================================================================
const UI = (title, text = "") => `╭─❏〘 ${title} 〙━❒\n\n${text}\n\n╰───────────╯`;

// ================================================================
// 🔐 COUPON SITE CONFIG
// ================================================================
const COUPON_API_URL = 'https://emmyfrosh-economy.onrender.com';
const COUPON_API_KEY = 'Emmyfrosh19999@.com';

async function couponApi(path, body) {
  const base = String(COUPON_API_URL).trim().replace(/\/+$/, '');
  const key  = String(COUPON_API_KEY).trim();
  if (!base || !key) return { ok: false, error: 'not_configured' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const j = await res.json().catch(() => ({}));
    return { ...j, status: res.status };
  } catch {
    return { ok: false, error: 'unreachable' };
  } finally {
    clearTimeout(t);
  }
}

// ================================================================
// 🔧 HELPERS
// ================================================================
function getUser(jid) {
  if (!global.db.users)      global.db.users = {};
  if (!global.db.users[jid]) global.db.users[jid] = {};
  const u = global.db.users[jid];
  if (u.balance   === undefined) u.balance   = 0;
  if (u.wallet    === undefined) u.wallet    = 0;
  if (u.bank      === undefined) u.bank      = 0;
  if (u.gams      === undefined) u.gams      = 0;
  if (u.job       === undefined) u.job       = 'Unemployed';
  if (!u.inventory)              u.inventory = {};
  if (!u.lastDaily)              u.lastDaily = 0;
  if (!u.lastWork)               u.lastWork  = 0;
  if (!u.lastRob)                u.lastRob   = 0;
  if (!u.lastMine)               u.lastMine  = 0;
  if (u.minedGams === undefined) u.minedGams = 0;
  if (u.level     === undefined) u.level     = 1;
  if (u.exp       === undefined) u.exp       = 0;
  if (!u.image_url)              u.image_url = '';
  if (!u.itemValue)              u.itemValue = {};
  if (u.wallet === 0 && u.balance > 0) u.wallet  = u.balance;
  if (u.balance === 0 && u.wallet > 0) u.balance = u.wallet;
  return u;
}

function addExp(user, amount) {
  user.exp += amount;
  const needed = user.level * 1000;
  if (user.exp >= needed) {
    user.exp   -= needed;
    user.level += 1;
    return true;
  }
  return false;
}

function fmt(n) { return Number(n || 0).toLocaleString(); }

// 🔢 Amount parser: 5000, 10k, 1m, 2.5m, 1b, 1t, 1,000,000, all, max
function parseAmount(s, allValue) {
  const t = String(s ?? '').toLowerCase().replace(/[,$_\s]/g, '');
  if (t === 'all' || t === 'max') return allValue === undefined ? NaN : Math.floor(allValue);
  const mm = t.match(/^(\d+(?:\.\d+)?)([kmbt])?$/);
  if (!mm) return NaN;
  const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[mm[2]] || 1;
  return Math.floor(parseFloat(mm[1]) * mult);
}

// "2h 5m" style duration
function dur(ms) {
  ms = Math.max(0, ms);
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

const DAY = 86400000;

// ================================================================
// 🏪 SHOP ITEMS
// ================================================================
const SHOP = {
  // 🍽️ food & groceries
  bread:          { name:'🍞 Bread',             buy:200 },
  fish:           { name:'🐟 Fish',               buy:300 },
  water:          { name:'💧 Pure Water',         buy:50 },
  coffee:         { name:'☕ Coffee',             buy:500 },
  burger:         { name:'🍔 Burger',             buy:1200 },
  pizza:          { name:'🍕 Pizza',              buy:3000 },
  rice:           { name:'🍚 Bag of Rice',        buy:1800 },
  beans:          { name:'🫘 Beans',              buy:1200 },
  yam:            { name:'🍠 Yam Tuber',          buy:800 },
  garri:          { name:'🥣 Garri',              buy:600 },
  indomie:        { name:'🍜 Indomie Carton',     buy:250 },
  egg:            { name:'🥚 Crate of Eggs',      buy:150 },
  chicken:        { name:'🍗 Chicken',            buy:3500 },
  milk:           { name:'🥛 Milk',               buy:900 },
  sugar:          { name:'🍬 Sugar',              buy:700 },
  palm_oil:       { name:'🛢️ Palm Oil',           buy:2200 },
  suya:           { name:'🍢 Suya Pack',          buy:1500 },
  jollof:         { name:'🍛 Jollof Party Pack',  buy:4500 },
  shawarma:       { name:'🌯 Shawarma',           buy:2500 },
  soda:           { name:'🥤 Soda Crate',         buy:1800 },
  ice_cream:      { name:'🍦 Ice Cream Tub',      buy:2000 },
  plantain:       { name:'🍌 Plantain Bunch',     buy:900 },
  tomato:         { name:'🍅 Tomato Basket',      buy:1100 },
  // 🔧 tools & gear
  fishing_rod:    { name:'🎣 Fishing Rod',        buy:5000 },
  pickaxe:        { name:'⛏️ Pickaxe',            buy:7500 },
  gun:            { name:'🔫 Gun',                buy:200000 },
  shield:         { name:'🛡️ Anti-Rob Shield',     buy:15000 },
  lucky_dice:     { name:'🎲 Lucky Dice Charm',    buy:8000 },
  axe:            { name:'🪓 Lumber Axe',         buy:9000 },
  shovel:         { name:'🪏 Shovel',             buy:6000 },
  backpack:       { name:'🎒 Travel Backpack',    buy:12000 },
  toolbox:        { name:'🧰 Toolbox',            buy:18000 },
  fishing_net:    { name:'🕸️ Fishing Net',        buy:14000 },
  // 📱 gadgets & vehicles
  laptop:         { name:'💻 Old Laptop',         buy:45000 },
  sneakers:       { name:'👟 Sneakers',           buy:25000 },
  headphones:     { name:'🎧 Headphones',         buy:35000 },
  bicycle:        { name:'🚲 Bicycle',            buy:90000 },
  generator:      { name:'🔌 Generator',          buy:120000 },
  drone:          { name:'🛸 Quad-Copter Drone',   buy:250000 },
  solar_panel:    { name:'☀️ Solar Panel Kit',    buy:350000 },
  tv:             { name:'📺 Smart TV',           buy:380000 },
  fridge:         { name:'🧊 Fridge',             buy:450000 },
  bitcoin:        { name:'🪙 Bitcoin Fragment',    buy:450000 },
  motorcycle:     { name:'🏍️ Motorcycle',         buy:600000 },
  mic_studio:     { name:'🎙️ Pro Studio Setup',    buy:650000 },
  ps5:            { name:'🎮 PlayStation 5',      buy:700000 },
  iphone:         { name:'📱 iPhone 15',          buy:850000 },
  macbook:        { name:'💻 MacBook Pro',        buy:1800000 },
  car:            { name:'🚗 Used Sedan',          buy:3500000 },
  power_bank:     { name:'🔋 Power Bank',         buy:15000 },
  speaker:        { name:'🔊 Bluetooth Speaker',  buy:40000 },
  smartwatch:     { name:'⌚ Smart Watch',        buy:120000 },
  tablet:         { name:'📲 Tablet',             buy:260000 },
  camera:         { name:'📷 Pro Camera',         buy:520000 },
  keke:           { name:'🛺 Tricycle (Keke)',     buy:1600000 },
  suv:            { name:'🚙 Luxury SUV',          buy:14000000 },
  bus:            { name:'🚌 Passenger Bus',       buy:22000000 },
  speedboat:      { name:'🚤 Speedboat',           buy:48000000 },
  helicopter:     { name:'🚁 Helicopter',          buy:160000000 },
  yacht:          { name:'🛥️ Luxury Yacht',        buy:280000000 },
  jet:            { name:'🛩️ Private Jet',         buy:520000000 },
  // ⛏️ minerals & luxury
  iron:           { name:'🔩 Iron Ore',            buy:1000 },
  copper:         { name:'🟤 Copper Bar',          buy:3000 },
  silver:         { name:'🥈 Silver Bar',          buy:9000 },
  gold:           { name:'✨ Gold Ingot',          buy:25000 },
  platinum:       { name:'⚪ Platinum Bar',        buy:90000 },
  diamond:        { name:'💎 Diamond',             buy:150000 },
  emerald:        { name:'🟢 Emerald',             buy:350000 },
  ruby:           { name:'🔴 Ruby',                buy:420000 },
  crude_oil:      { name:'🛢️ Crude Oil Barrel',    buy:13000 },
  ring:           { name:'💍 Diamond Ring',        buy:1200000 },
  watch:          { name:'⌚ Rolex Watch',         buy:5000000 },
  // 🏭 business & property
  livestock:      { name:'🐄 Premium Livestock',   buy:75000 },
  laser_drill:    { name:'⚡ Laser Drill Rig',     buy:1250000 },
  chef_station:   { name:'🍳 Pro Kitchen Line',    buy:4000000 },
  tractor:        { name:'🚜 Heavy Tractor',       buy:5500000 },
  server_rack:    { name:'🖥️ Mainframe Server',    buy:8200000 },
  gpu_rig:        { name:'⚙️ AI Crypto Miner',     buy:14000000 },
  cargo_truck:    { name:'🚛 18-Wheeler Cargo',    buy:18500000 },
  shop_stall:     { name:'🏬 Market Shop Stall',   buy:6500000 },
  land:           { name:'🌍 Plot of Land',        buy:24000000 },
  farm:           { name:'🌾 Commercial Farm',     buy:38000000 },
  mansion:        { name:'🏰 Luxury Villa',        buy:85000000 },
  hotel:          { name:'🏨 Boutique Hotel',      buy:150000000 },
  super_computer: { name:'🌌 Quantum Station',     buy:195000000 },
  oil_rig:        { name:'🏗️ Offshore Oil Rig',    buy:480000000 }
};

// ================================================================
// 🪙 COINS — only traded in the market (price = current rate)
// Rates drift a little every 10 minutes.
// ================================================================
const COINS = {
  usdt: { name:'💵 USDT (Tether)',    rate:1600 },
  usdc: { name:'🔵 USDC',             rate:1600 },
  btc:  { name:'₿ Bitcoin (BTC)',     rate:150000000 },
  eth:  { name:'⟠ Ethereum (ETH)',    rate:8000000 },
  bnb:  { name:'🔶 BNB',              rate:1500000 },
  bch:  { name:'🟢 Bitcoin Cash (BCH)', rate:600000 },
  ltc:  { name:'🥈 Litecoin (LTC)',   rate:150000 },
  sol:  { name:'◎ Solana (SOL)',      rate:350000 },
  avax: { name:'🔺 Avalanche (AVAX)', rate:40000 },
  link: { name:'🔗 Chainlink (LINK)', rate:22000 },
  atom: { name:'⚛️ Cosmos (ATOM)',    rate:9000 },
  dot:  { name:'⚫ Polkadot (DOT)',   rate:7000 },
  near: { name:'🌐 NEAR Protocol',    rate:6000 },
  sui:  { name:'💧 Sui (SUI)',        rate:5000 },
  ton:  { name:'💠 Toncoin (TON)',    rate:8000 },
  ada:  { name:'🔷 Cardano (ADA)',    rate:900 },
  xrp:  { name:'✖️ XRP',              rate:900 },
  pol:  { name:'🟣 Polygon (POL)',    rate:700 },
  trx:  { name:'🔺 TRON (TRX)',       rate:180 },
  doge: { name:'🐕 Dogecoin (DOGE)',  rate:250 }
};

const isItem = (k) => !!(SHOP[k] || COINS[k]);
const nameOf = (k) => (SHOP[k] || COINS[k])?.name || k;

// ================================================================
// 💹 ITEM VALUE APPRECIATION
// Items quietly gain a small bonus for every 24h you hold them
// (~0.025% of the shop price per day). The bonus is added on top
// of the instant-sell price. Coins don't appreciate (their rate moves).
// ================================================================
function dailyGainFor(buyPrice) {
  return Math.max(1, Math.floor(buyPrice * 0.00025));
}

function tickItemValue(u, key) {
  if (!u.itemValue) u.itemValue = {};
  let iv = u.itemValue[key];
  if (!iv || typeof iv.bonus !== 'number') {
    iv = u.itemValue[key] = { bonus: 0, lastGain: (iv && iv.lastGain) || Date.now() };
  }
  if (COINS[key] || !SHOP[key]) { iv.lastGain = Date.now(); return iv; }
  const gain  = dailyGainFor(SHOP[key].buy);
  const now   = Date.now();
  const ticks = Math.floor((now - iv.lastGain) / DAY);
  if (ticks > 0) {
    iv.bonus    += ticks * gain;
    iv.lastGain += ticks * DAY;
  }
  return iv;
}

// ✅ NAMES, never numbers / @lid ids.
const idDigits = (j) => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const cleanJid = (j) => String(j || '').replace(/:\d+@/, '@');

function nameFor(jid) {
  const clean = cleanJid(jid);
  const u = global.db?.users?.[clean];
  if (u?.name) return u.name;
  const nb = global.nameBook || {};
  return nb[clean] || nb[idDigits(clean)] || null;
}

function rememberName(m) {
  try {
    if (!m?.pushName || !m.sender) return;
    const clean = cleanJid(m.sender);
    const nb = (global.nameBook = global.nameBook || {});
    nb[clean] = m.pushName;
    const u = global.db?.users?.[clean];
    if (u && u.name !== m.pushName) u.name = m.pushName;
  } catch {}
}

function numTag(jid) {
  return nameFor(jid) || 'Unknown user';
}

async function getName(jid, pushNameFromMsg, conn, chat) {
  if (pushNameFromMsg) return pushNameFromMsg;
  const known = nameFor(jid);
  if (known) return known;
  try {
    const meta = await conn.groupMetadata(chat);
    const p    = meta.participants.find(x => x.id === jid || x.lid === jid);
    if (p?.notify || p?.name) return p.notify || p.name;
  } catch {}
  return 'Unknown user';
}

// ================================================================
// 💼 JOBS (15 jobs)
// ================================================================
const JOBS = {
  beggar:    { name:'Beggar',           min:50,    max:200,   tax:0,  minGams:0,  maxGams:1,  exp:15,  tasks:["You sang for spare change at a busy junction.","You held a funny sign and made commuters laugh.","You searched park benches for loose coins.","You cleaned windshields at traffic lights.","You sat outside a mall telling stories.","You set up a cup near a transit station."] },
  cleaner:   { name:'Street Cleaner',   min:500,   max:1200,  tax:3,  minGams:1,  maxGams:2,  exp:30,  tasks:["You swept autumn leaves from the main sidewalk.","You emptied public recycling bins downtown.","You power-washed stadium walkways after a concert.","You cleared branches from the road after a storm.","You scrubbed graffiti off downtown walls.","You picked up plastic bottles along the park route."] },
  waiter:    { name:'Waiter',           min:500,   max:2000,  tax:4,  minGams:1,  maxGams:2,  exp:30,  tasks:["You balanced a heavy tray perfectly during dinner rush.","A family left you a generous tip for great service.","You helped clear tables after a wedding party.","You memorized a complex VIP order flawlessly.","You kept beverage stations fully stocked.","You polished silverware and reorganized the plates."] },
  delivery:  { name:'Delivery Rider',   min:800,   max:2500,  tax:6,  minGams:2,  maxGams:4,  exp:60,  tasks:["You dodged traffic to deliver hot food on time.","You braved a downpour to keep a parcel dry.","A customer gave you a warm drink and bonus tip.","You navigated a maze-like apartment complex.","You completed 5 express courier drops in one hour.","You safely secured a fragile catering order."] },
  farmer:    { name:'Farmer',           min:700,   max:2000,  tax:8,  minGams:1,  maxGams:3,  exp:35,  tasks:["You harvested ripe tomatoes from the green fields.","You fed cattle and cleaned the dairy barns.","You tilled soil beds to prepare for corn seeds.","You fixed a leak in the irrigation pipeline.","You drove the tractor to clear weed growth.","You collected fresh eggs from the poultry coop."] },
  mechanic:  { name:'Mechanic',         min:800,   max:2000,  tax:10, minGams:3,  maxGams:6,  exp:30,  tasks:["You diagnosed a tricky electrical short circuit.","You installed a high-performance exhaust pipe.","You performed a flawless tire alignment for a truck.","You rebuilt a vintage engine block from scratch.","You replaced a worn-out clutch before a road trip.","You flushed an overheating radiator system."] },
  chef:      { name:'Head Chef',        min:700,   max:2200,  tax:12, minGams:4,  maxGams:8,  exp:30,  tasks:["You designed a 5-course menu that sold out.","You managed a chaotic kitchen during an inspection.","Your signature dessert impressed a food critic.","You perfectly seared steaks for a corporate gala.","You taught your apprentice to make a mother sauce.","You sourced rare herbs to elevate your plating."] },
  streamer:  { name:'Content Creator',  min:8000,  max:16000, tax:14, minGams:5,  maxGams:10, exp:160, tasks:["Your clip went viral gaining thousands of subscribers.","You hosted a 6-hour charity livestream successfully.","A generous subscriber dropped a massive donation.","You secured a sponsorship deal with a gaming brand.","You edited a video that racked up massive watch time.","You held an engaging live Q&A with your community."] },
  miner:     { name:'Deep Miner',       min:10000, max:22000, tax:15, minGams:6,  maxGams:12, exp:200, tasks:["You swung your pickaxe and struck an iron vein.","You navigated a narrow cavern to map new deposits.","You loaded a full cart of raw glittering coal.","Your team reinforced a weak cave wall ceiling.","You discovered geodes hidden inside a granite wall.","You operated a drill to break through bedrock."] },
  coder:     { name:'Developer',        min:14000, max:28000, tax:16, minGams:8,  maxGams:15, exp:250, tasks:["You tracked down a critical memory leak.","You refactored a legacy codebase into clean classes.","You designed a high-converting landing page.","You pushed a feature update to production safely.","You fixed styling breakages on mobile viewports.","You automated a tedious data pipeline with scripts."] },
  pilot:     { name:'Commercial Pilot', min:18000, max:35000, tax:18, minGams:10, maxGams:18, exp:300, tasks:["You safely guided a plane through a lightning storm.","You executed a flawless buttery-smooth landing.","You completed a long-haul flight ahead of schedule.","You performed a thorough pre-flight cockpit check.","You calculated fuel weights for maximum efficiency.","You taxied smoothly after receiving ATC clearance."] },
  doctor:    { name:'Surgeon',          min:22000, max:45000, tax:20, minGams:12, maxGams:22, exp:380, tasks:["You performed a complex delicate microsurgery.","You diagnosed a rare condition and saved a patient.","You led a trauma unit through an emergency shift.","You published a paper in a major medical journal.","You walked a family through a treatment plan.","You stabilized a critical patient in the ICU."] },
  lawyer:    { name:'Defense Attorney', min:26000, max:55000, tax:22, minGams:14, maxGams:25, exp:460, tasks:["You delivered a brilliant closing argument.","You found a loophole to protect your client.","You cross-examined a witness until truth emerged.","You settled a high-profile suit out of court.","You reviewed casework to build an airtight defense.","You filed an injunction that halted a corporate action."] },
  agent:     { name:'Secret Agent',     min:32000, max:70000, tax:24, minGams:18, maxGams:30, exp:550, tasks:["You infiltrated a secure base with false credentials.","You intercepted an encrypted classified transmission.","You slipped past laser sensors without triggering alarms.","You tracked a target through a crowd unseen.","You cracked an advanced biometric safe.","You staged a daring midnight extraction by speedboat."] },
  ceo:       { name:'Company CEO',      min:45000, max:95000, tax:25, minGams:15, maxGams:50, exp:200, tasks:["You signed a massive market distribution deal.","You pitched an expansion model to venture capitalists.","You approved the annual budget funding requests.","You hosted an emergency board alignment meeting.","You gave a keynote presentation at a tech summit.","You restructured brand values using market analytics."] }
};

// ================================================================
// 🎲 PVP DICE pending challenges
// ================================================================
const diceChallenge = new Map();

// ================================================================
// 🤝 F2F pending offers (in-memory, like diceChallenge)
// ================================================================
const f2fTrades = new Map();

// ================================================================
// 🏪 MARKET ENGINE
// global.db.market[id] = {
//   id, seller, sellerName, bot, item, qty, price (PER UNIT),
//   createdAt, expiresAt (players only, 24h), closedUntil (bot stalls), unit:true
// }
// global.db.economy = { hidden, coinRates, lastTick, lastCoin, restock[], seeded }
//
//  • Player listings expire after 24h and the items go back to the seller.
//  • Bot sellers hold 10,000 units each. When one SELLS OUT it leaves the
//    market and COMES BACK with fresh stock exactly 24 hours later.
//  • Brand-new sellers with different goods/coins ALSO arrive at random
//    times (any minute, any hour) — so the market keeps changing.
//  • Bot prices: item in shop  → a bit BELOW shop price
//                item NOT in shop → well ABOVE shop price
//  • Bot stalls randomly close for 5 minutes up to several hours.
//  • Some shop items vanish from the shop for 1-3 days (market still has them).
// ================================================================
const BOT_STOCK      = 10000;
const BOT_TARGET     = 30;     // sellers created the very first time the market is seeded
const BOT_MAX        = 50;     // hard cap for random new arrivals
const ARRIVAL_CHANCE = 0.012;  // per minute → a new seller roughly every ~80 minutes
const RESTOCK_MS     = DAY;    // sold-out sellers return after 24h
const MAX_USER_LISTS = 10;

const SELLERS = [
  'Mama Ngozi Foods','Alhaji Musa Ventures','Chidi Traders','Blessing Mart','Tunde Supplies',
  'Aisha Stores','Emeka Wholesale','Funke Fresh Market','Ibrahim & Sons','Ngozi Crypto Hub',
  'Kelvin P2P Exchange','Mr Biggs Deals','Sandra Collections','Yusuf Gadgets','Oga Peter Auto',
  'Madam Joy Foodstuff','Bright Electronics','Zainab Provisions','Obinna Mega Store','Tolu Coin Desk',
  'Lagos Plug','PH Trade Center','Abuja Bulk Mart','Kano Grains','Ada Fashion House',
  'Samuel Armoury','Dele Dealz','Fatima Fresh','Gold Coast Traders','Naija Crypto Desk',
  'Ejike Auto Hub','Halima Gold House','Biodun Tech Zone','Chioma Crypto Corner','Garba Livestock',
  'Ifeanyi Motors','Kemi Gadget Hub','Uche Mining Co','Rashida Imports','Wale Property Deals'
];

const rnd  = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function eco() {
  const db = global.db;
  if (!db.market) db.market = {};
  if (!db.economy) db.economy = {};
  const e = db.economy;
  if (!e.hidden)    e.hidden    = {};
  if (!e.coinRates) e.coinRates = {};
  if (!e.restock)   e.restock   = [];
  if (!e.lastTick)  e.lastTick  = 0;
  if (!e.lastCoin)  e.lastCoin  = 0;
  return e;
}

function coinRate(k) {
  const e = eco();
  const r = e.coinRates[k] ?? COINS[k].rate;
  return Math.max(1, Math.round(r));
}

// real "shop" value of anything (coins use their live rate)
function unitPrice(k) { return COINS[k] ? coinRate(k) : (SHOP[k]?.buy || 0); }

function isHidden(k) {
  if (!SHOP[k]) return false;
  const t = eco().hidden[k];
  return !!t && t > Date.now();
}

// short listing IDs: always the smallest free number (1, 2, 3 ...)
function genId() {
  const m = global.db.market;
  let n = 1;
  while (m[String(n)]) n++;
  return String(n);
}

// price a BOT seller asks per unit
function botPrice(k) {
  const base = unitPrice(k);
  let f;
  if (COINS[k])        f = rnd(0.97, 1.03);          // coins: ~ live rate
  else if (isHidden(k)) f = rnd(1.35, 2.05);          // not in shop → 70/80/100 style
  else                  f = rnd(0.90, 0.98);          // in shop → 45/46/48 style
  let p = Math.round(base * f);
  if (!COINS[k] && !isHidden(k)) p = Math.min(p, base - 1);
  return Math.max(1, p);
}

function spawnBot(k, sellerName) {
  const m    = global.db.market;
  const used = new Set(Object.values(m).filter(l => l.item === k).map(l => l.sellerName));
  const pool = SELLERS.filter(s => !used.has(s));
  const id   = genId();
  m[id] = {
    id, seller: 'bot', sellerName: sellerName || pick(pool.length ? pool : SELLERS), bot: true,
    item: k, qty: BOT_STOCK, price: botPrice(k),
    createdAt: Date.now(), closedUntil: 0, unit: true
  };
  return id;
}

// choose a good that currently has the fewest bot sellers (so types keep rotating)
function pickNewItem(exclude) {
  const keys = [...Object.keys(SHOP), ...Object.keys(COINS)].filter(k => k !== exclude);
  const cnt  = {};
  Object.values(global.db.market).forEach(l => { if (l.bot) cnt[l.item] = (cnt[l.item] || 0) + 1; });
  (eco().restock || []).forEach(r => { cnt[r.item] = (cnt[r.item] || 0) + 1; });
  const min  = Math.min(...keys.map(k => cnt[k] || 0));
  return pick(keys.filter(k => (cnt[k] || 0) === min));
}

function repriceBot(k) {
  Object.values(global.db.market).forEach(l => { if (l.bot && l.item === k) l.price = botPrice(k); });
}

function botCount() { return Object.values(global.db.market).filter(l => l.bot).length; }

// a bot seller sold out → he disappears and returns in 24h with fresh stock
function scheduleRestock(l) {
  eco().restock.push({ sellerName: l.sellerName, item: l.item, at: Date.now() + RESTOCK_MS });
}

function hideItem(k) {
  eco().hidden[k] = Date.now() + pick([1, 2, 3]) * DAY;   // gone from the shop for 1-3 days
  repriceBot(k);                                            // market sellers now charge more
  // make sure the market has a few sellers for something the shop no longer sells
  let n = Object.values(global.db.market).filter(l => l.bot && l.item === k).length;
  while (n < 3) { spawnBot(k); n++; }
}

// first-time seeding only — after that the market lives on restocks + random arrivals
function ensureStock() {
  const e = eco();
  if (e.seeded) return;
  if (!botCount()) ['gun', 'rice', 'fish', 'usdt', 'btc'].forEach(k => spawnBot(k));
  while (botCount() < BOT_TARGET) spawnBot(pickNewItem(null));
  e.seeded = true;
}

// Runs lazily (every command) and every 60s. Returns true if anything changed.
function economyTick() {
  if (!global.db) return false;
  const e   = eco();
  const m   = global.db.market;
  const now = Date.now();
  let changed = false;

  // 0) old long ids (LST-XXXX) → short numbers
  for (const oldId of Object.keys(m)) {
    if (!oldId.startsWith('LST-')) continue;
    const l = m[oldId];
    delete m[oldId];
    const nid = genId();
    l.id = nid;
    m[nid] = l;
    changed = true;
  }

  // 1) migrate old listings (price used to be a TOTAL, no ids, no expiry)
  for (const [id, l] of Object.entries(m)) {
    if (!l.id)   { l.id = id; changed = true; }
    if (!l.unit) { l.price = Math.max(1, Math.ceil(l.price / Math.max(1, l.qty))); l.unit = true; changed = true; }
    if (!l.bot && !l.expiresAt) { l.expiresAt = (l.createdAt || now) + DAY; changed = true; }
  }
  // old databases already have a full market → don't re-seed it
  if (!e.seeded && botCount() > 0) { e.seeded = true; changed = true; }

  // 2) expire player listings after 24h → give the items back
  for (const [id, l] of Object.entries(m)) {
    if (l.bot || !l.expiresAt || l.expiresAt > now) continue;
    const su = getUser(l.seller);
    su.inventory[l.item] = (su.inventory[l.item] || 0) + l.qty;
    delete m[id];
    changed = true;
  }

  // 3) shop rotation + stall closures + random new sellers, one step per elapsed minute
  if (!e.lastTick) {
    e.lastTick = now;
    const pool = Object.keys(SHOP).filter(k => k !== 'gun');
    for (let i = 0; i < 4; i++) { const k = pick(pool.filter(x => !isHidden(x))); if (k) hideItem(k); }
    changed = true;
  }
  const mins = Math.min(240, Math.floor((now - e.lastTick) / 60000));
  if (mins >= 1) {
    const cap = Math.floor(Object.keys(SHOP).length * 0.25);
    for (let i = 0; i < mins; i++) {
      // hide a random shop item for 1-3 days (never the gun)
      const hiddenNow = Object.keys(SHOP).filter(isHidden).length;
      if (hiddenNow < cap && Math.random() < 0.005) {
        const k = pick(Object.keys(SHOP).filter(x => x !== 'gun' && !isHidden(x)));
        if (k) hideItem(k);
      }
      // 🆕 a brand-new seller shows up with a different good/coin at a random time
      if (botCount() < BOT_MAX && Math.random() < ARRIVAL_CHANCE) {
        spawnBot(pickNewItem(null));
      }
      // close a bot stall for 5 minutes → ~8 hours
      const bots = Object.values(m).filter(l => l.bot);
      const closedNow = bots.filter(l => l.closedUntil > now).length;
      bots.forEach(l => {
        if (l.closedUntil > now) return;
        if (closedNow < Math.floor(bots.length * 0.2) && Math.random() < 0.003) {
          l.closedUntil = now + 300000 + Math.pow(Math.random(), 2) * (8 * 3600000 - 300000);
        }
      });
    }
    e.lastTick = now;
    changed = true;
  }

  // 4) items that finished their 1-3 day absence come back to the shop
  for (const k of Object.keys(e.hidden)) {
    if (e.hidden[k] <= now) { delete e.hidden[k]; repriceBot(k); changed = true; }
  }

  // 5) coin rates drift every 10 minutes
  if (now - e.lastCoin >= 600000) {
    for (const k of Object.keys(COINS)) {
      const cur = e.coinRates[k] ?? COINS[k].rate;
      const next = cur * (1 + rnd(-0.03, 0.03));
      e.coinRates[k] = Math.min(COINS[k].rate * 1.6, Math.max(COINS[k].rate * 0.6, next));
      repriceBot(k);
    }
    e.lastCoin = now;
    changed = true;
  }

  // 6) 🔄 sold-out sellers return after 24h with a fresh 10,000 stock
  if (e.restock.length) {
    const keep = [];
    for (const r of e.restock) {
      if (r.at <= now) { spawnBot(r.item, r.sellerName); changed = true; }
      else keep.push(r);
    }
    e.restock = keep;
  }

  // 7) first-time seeding only
  const before = Object.keys(m).length;
  ensureStock();
  if (Object.keys(m).length !== before) changed = true;

  return changed;
}

// background sweep so 24h listings refund + sellers restock even if nobody types
try {
  const iv = setInterval(async () => {
    try { if (economyTick()) await SaveDataBase(); } catch {}
  }, 60000);
  if (iv.unref) iv.unref();
} catch {}

// ================================================================
// 🌐 COUPON SITE SYNC
// • every 30s: pick up money edits made by the admin on the site and apply them
// • every 5 min (and right after an edit): send the standings to the site
// Needs COUPON_API_URL + COUPON_API_KEY in .env (same ones used for coupons).
// ================================================================
let siteBusy = false;
let siteLastPush = 0;

async function siteSync() {
  if (siteBusy || !global.db?.users) return;
  if (!COUPON_API_URL || !COUPON_API_KEY) return;
  siteBusy = true;
  try {
    // 1) apply edits from the admin dashboard
    const p = await couponApi('/api/pending', {});
    if (p.ok && Array.isArray(p.jobs) && p.jobs.length) {
      if (!Array.isArray(global.db.appliedAdj)) global.db.appliedAdj = [];
      const results = [];
      for (const j of p.jobs) {
        // already applied before (ack got lost)? don't apply twice
        if (global.db.appliedAdj.includes(j.id)) { results.push({ id: j.id, ok: true }); continue; }
        if (!global.db.users[j.user]) { results.push({ id: j.id, ok: false, error: 'player_not_found' }); continue; }
        const amt = Math.floor(Number(j.amount));
        const f   = ['balance', 'bank', 'gams'].includes(j.field) ? j.field : null;
        if (!f || !Number.isFinite(amt) || amt < 0 || !['add', 'remove', 'set'].includes(j.op)) {
          results.push({ id: j.id, ok: false, error: 'bad_edit' });
          continue;
        }
        const u = getUser(j.user);
        if (j.op === 'add')         u[f] = (u[f] || 0) + amt;
        else if (j.op === 'remove') u[f] = Math.max(0, (u[f] || 0) - amt);
        else                        u[f] = amt;
        if (f === 'balance') u.wallet = u.balance;
        global.db.appliedAdj.push(j.id);
        results.push({ id: j.id, ok: true });
      }
      if (global.db.appliedAdj.length > 500) global.db.appliedAdj = global.db.appliedAdj.slice(-500);
      await SaveDataBase();
      await couponApi('/api/ack', { results });
      siteLastPush = 0;   // send fresh standings right away
    }

    // 2) send standings
    if (Date.now() - siteLastPush >= 300000) {
      const users = Object.entries(global.db.users)
        .map(([id, d]) => ({
          id,
          name:    nameFor(id) || 'Unknown user',
          balance: d.balance || 0,
          bank:    d.bank    || 0,
          gams:    d.gams    || 0,
          level:   d.level   || 1,
          job:     d.job     || 'Unemployed'
        }))
        .filter(x => x.balance + x.bank + x.gams > 0)
        .sort((a, b) => (b.balance + b.bank) - (a.balance + a.bank))
        .slice(0, 3000);
      const r = await couponApi('/api/sync', { users });
      if (r.ok) siteLastPush = Date.now();
    }
  } catch {}
  siteBusy = false;
}

try {
  const iv2 = setInterval(siteSync, 30000);
  if (iv2.unref) iv2.unref();
  const t2 = setTimeout(siteSync, 15000);   // first push shortly after the bot starts
  if (t2.unref) t2.unref();
} catch {}

// ================================================================
// 📋 COMMANDS
// ================================================================
const rawCommands = [

  // 💰 BALANCE
  {
    command:     ['balance'],
    alias:       ['bal'],
    category:    'economy',
    description: 'Check your balance',
    execute: async (m, { reply, args, ednut }) => {
      const target = m.quoted?.sender || m.mentionedJid?.[0] || m.sender;
      const u      = getUser(target);
      const isMe   = target === m.sender;
      const name   = isMe
        ? (m.pushName || numTag(target))
        : await getName(target, null, ednut, m.chat);

      const all    = Object.entries(global.db.users || {})
        .map(([j, d]) => ({ j, t: (d.balance||0) + (d.bank||0) }))
        .sort((a, b) => b.t - a.t);
      const rank   = (all.findIndex(x => x.j === target) + 1) || '?';
      const tick   = rank <= 3 ? ' 🔵' : '';
      const medal  = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

      reply(UI(`🏦 ${name}'s ACCOUNT`, `🏆 Rank   : ${medal}${tick}

🏅 Level  : ${u.level}
✨ EXP    : ${fmt(u.exp)} / ${fmt(u.level * 1000)}
💼 Job    : ${u.job}

💵 Wallet : $${fmt(u.balance)}
🏦 Bank   : $${fmt(u.bank)}
💎 Gams   : ${fmt(u.gams)}

📊 Total  : $${fmt(u.balance + u.bank)}`));
    }
  },

  // 🏦 DEPOSIT
  {
    command:     ['deposit'],
    alias:       ['dep'],
    category:    'economy',
    description: 'Deposit money from wallet into your bank',
    execute: async (m, { reply, args }) => {
      const user = getUser(m.sender);
      const raw  = args[0]?.toLowerCase();
      const amt  = parseAmount(raw, user.balance);
      const name = m.pushName || numTag(m.sender);

      if (!amt || amt <= 0 || isNaN(amt))
        return reply(UI('🏦 DEPOSIT', `Usage:\n  .deposit <amount>\n  .deposit all\n\n💵 Wallet: $${fmt(user.balance)}`));

      if (user.balance < amt)
        return reply(UI('❌ INSUFFICIENT', `${name}, you only have $${fmt(user.balance)} in your wallet.`));

      user.balance -= amt;
      user.wallet   = user.balance;
      user.bank    += amt;
      await SaveDataBase();

      return reply(UI('🏦 DEPOSIT SUCCESS', `👤 User       : ${name}\n💰 Deposited  : $${fmt(amt)}\n\n📊 Wallet : $${fmt(user.wallet)}\n🏦 Bank   : $${fmt(user.bank)}`));
    }
  },

  // 💳 WITHDRAW
  {
    command:     ['withdraw'],
    alias:       ['with'],
    category:    'economy',
    description: 'Withdraw money from bank to wallet',
    execute: async (m, { reply, args }) => {
      const user = getUser(m.sender);
      const raw  = args[0]?.toLowerCase();
      const amt  = parseAmount(raw, user.bank);
      const name = m.pushName || numTag(m.sender);

      if (!amt || amt <= 0 || isNaN(amt))
        return reply(UI('💳 WITHDRAW', `Usage:\n  .withdraw <amount>\n  .withdraw all\n\n🏦 Bank: $${fmt(user.bank)}`));

      if (user.bank < amt)
        return reply(UI('❌ INSUFFICIENT', `${name}, you only have $${fmt(user.bank)} in your bank.`));

      user.bank    -= amt;
      user.balance += amt;
      user.wallet   = user.balance;
      await SaveDataBase();

      return reply(UI('🏦 WITHDRAW SUCCESS', `👤 User      : ${name}\n💰 Withdrawn : $${fmt(amt)}\n\n🏦 Bank   : $${fmt(user.bank)}\n💵 Wallet : $${fmt(user.wallet)}`));
    }
  },

  // 💸 PAY
  {
    command:     ['pay'],
    alias:       ['transfer', 'give'],
    category:    'economy',
    description: 'Send money to another user (min $10)',
    execute: async (m, { reply, args, ednut }) => {
      const viaTag = m.quoted?.sender || m.mentionedJid?.[0];
      const target = viaTag
        || (args.length > 1 && args[0]?.replace(/\D/g, '').length >= 7 ? args[0].replace(/\D/g, '') + '@s.whatsapp.net' : null);
      const amount = parseAmount(args[viaTag ? args.length - 1 : 1], getUser(m.sender).balance);

      if (!target)
        return reply(UI('❌ ERROR', 'Please tag or quote the user you want to pay.\n\nUsage: .pay @user 5000 (or 10k, 1m, all)'));
      if (!amount || amount < 10)
        return reply(UI('❌ ERROR', 'Invalid amount. Minimum pay is $10.\n\nUsage: .pay @user 5000'));
      if (target === m.sender)
        return reply(UI('❌ ERROR', 'You cannot pay yourself.'));

      const s = getUser(m.sender);
      const r = getUser(target);

      if (s.balance < amount)
        return reply(UI('❌ INSUFFICIENT', `You need $${fmt(amount)} but only have $${fmt(s.balance)} in your wallet.`));

      const senderName = m.pushName || numTag(m.sender);
      const targetName = await getName(target, null, ednut, m.chat);

      s.balance -= amount; s.wallet = s.balance;
      r.balance += amount; r.wallet = r.balance;
      await SaveDataBase();

      reply(UI('✅ PAYMENT SENT', `💸 Amount  : $${fmt(amount)}\n📤 From    : ${senderName}\n📥 To      : ${targetName}\n\n💵 Your Wallet : $${fmt(s.wallet)}`));
    }
  },

  // 🦹 ROB — needs a gun. If you get caught you lose 1 gun.
  {
    command:     ['rob'],
    alias:       ['steal', 'rub'],
    category:    'economy',
    description: 'Attempt to rob another user (needs a gun)',
    execute: async (m, { reply, args, ednut }) => {
      const target = m.quoted?.sender || m.mentionedJid?.[0] ||
        (args[0]?.replace(/\D/g,'') ? args[0].replace(/\D/g,'')+'@s.whatsapp.net' : null);

      if (!target || target === m.sender)
        return reply(UI('❌ ERROR', 'Reply to or mention a user to rob.'));

      const atk  = getUser(m.sender);
      const def  = getUser(target);
      const now  = Date.now();
      const cool = 1200000;

      // 🔫 no gun, no robbery
      if ((atk.inventory.gun || 0) < 1)
        return reply(UI('🔫 NO GUN', `You need a gun to rob someone!\n\nBuy one in the shop or the market:\n🏪 .buy gun   — $${fmt(SHOP.gun.buy)}\n🛒 .market gun`));

      if (now - atk.lastRob < cool) {
        const left = cool - (now - atk.lastRob);
        const mm   = Math.floor(left / 60000);
        const ss   = Math.floor((left % 60000) / 1000);
        return reply(UI('🚔 COOLDOWN', `Police are still tracking you.\n\n⏳ Come back in ${mm}m ${ss}s`));
      }

      if (def.balance < 500)
        return reply(UI('❌ ERROR', 'Target is too broke to rob!'));

      const atkName = m.pushName || numTag(m.sender);
      const defName = await getName(target, null, ednut, m.chat);

      atk.lastRob = now;

      if (Math.random() > 0.5) {
        const stolen = Math.floor(def.balance * 0.20);
        def.balance -= stolen; def.wallet = def.balance;
        atk.balance += stolen; atk.wallet = atk.balance;
        const lu     = addExp(atk, 100);
        await SaveDataBase();
        reply(UI('⚔️ ROB SUCCESS', `🦹 Robber  : ${atkName}\n🎯 Victim  : ${defName}\n\n💰 Stolen  : $${fmt(stolen)}\n💵 Wallet  : $${fmt(atk.wallet)}\n🔫 Guns    : ${fmt(atk.inventory.gun)} left\n✨ EXP     : +100${lu ? `\n\n🎉 LEVEL UP → Level ${atk.level}!` : ''}`));
      } else {
        atk.balance  = Math.max(0, atk.balance - 1000);
        atk.wallet   = atk.balance;
        def.balance += 1000; def.wallet = def.balance;
        atk.inventory.gun = Math.max(0, (atk.inventory.gun || 0) - 1);   // police confiscate 1 gun
        addExp(atk, 20);
        await SaveDataBase();
        reply(UI('🚨 CAUGHT!', `${atkName} got caught trying to rob ${defName}!\n\n💸 Fine   : -$1,000\n🔫 Gun    : -1 (police took it) — ${fmt(atk.inventory.gun)} left\n💵 Wallet : $${fmt(atk.wallet)}\n✨ EXP    : +20`));
      }
    }
  },

  // 💼 WORK
  {
    command:     ['work'],
    alias:       ['w', 'grind', 'hustle'],
    category:    'economy',
    description: 'Work your job to earn money (1 hour cooldown)',
    execute: async (m, { reply }) => {
      const user = getUser(m.sender);
      const now  = Date.now();
      const hour = 3600000;
      const name = m.pushName || numTag(m.sender);

      if (now - user.lastWork < hour) {
        const left = hour - (now - user.lastWork);
        const mm   = Math.floor(left / 60000);
        const ss   = Math.floor((left % 60000) / 1000);
        return reply(UI('💼 NO WORK AVAILABLE', `🏠 ${name}, you are tired, go and rest\n\n⏳ Come back in ${mm}m ${ss}s`));
      }

      const jK      = Object.keys(JOBS).find(k => JOBS[k].name === user.job) || 'beggar';
      const j       = JOBS[jK];
      const task    = j.tasks[Math.floor(Math.random() * j.tasks.length)];
      const gross   = Math.floor(Math.random() * (j.max - j.min + 1)) + j.min;
      const tax     = Math.floor(gross * j.tax / 100);
      const earn    = gross - tax;
      const gams    = Math.floor(Math.random() * (j.maxGams - j.minGams + 1)) + j.minGams;

      user.balance += earn;
      user.wallet   = user.balance;
      user.gams    += gams;
      user.lastWork = now;

      const lu = addExp(user, j.exp);
      await SaveDataBase();

      return reply(UI('💼 WORK SUCCESS', `👤 Worker           : ${name}\n👷 Job              : ${user.job}\n📋 Task             : ${task}\n\n💰 Earned           : +$${fmt(earn)}\n💎 Gams Earned      : +${gams}\n⏳ Next Work        : 1 hour${lu ? `\n\n🎉 LEVEL UP → Level ${user.level}!` : ''}`));
    }
  },

  // 📋 JOB LIST
  {
    command:     ['joblist'],
    alias:       ['jobs', 'careers'],
    category:    'economy',
    description: 'View all available jobs',
    execute: async (m, { reply }) => {
      let msg = 'Use `.setjob <id>` to apply\n\n';
      for (const [k, v] of Object.entries(JOBS))
        msg += `💼 *${v.name}* (\`${k}\`)\n  └ $${fmt(v.min)}-$${fmt(v.max)} | Tax:${v.tax}% | EXP:+${v.exp}\n\n`;
      reply(UI('💼 JOB LIST', msg.trim()));
    }
  },

  // 🔖 SET JOB
  {
    command:     ['setjob'],
    alias:       ['applyjob', 'joinjob', 'getjob'],
    category:    'economy',
    description: 'Set your job',
    execute: async (m, { reply, args }) => {
      const k    = args[0]?.toLowerCase();
      const name = m.pushName || numTag(m.sender);
      if (!k || !JOBS[k])
        return reply(UI('❌ ERROR', 'Invalid job ID. Use .joblist to see all jobs.'));
      getUser(m.sender).job = JOBS[k].name;
      await SaveDataBase();
      reply(UI('✅ JOB SET', `${name} is now a *${JOBS[k].name}*!\n\n💵 Pay  : $${fmt(JOBS[k].min)} – $${fmt(JOBS[k].max)}\n🏛️ Tax  : ${JOBS[k].tax}%\n✨ EXP  : +${JOBS[k].exp} per shift\n\nUse .work to start earning!`));
    }
  },

  // ⚙️ SET WORK (owner)
  {
    command:     ['setwork'],
    alias:       ['assignjob'],
    category:    'economy',
    description: "Force-set a user's job (owner only)",
    owner:       true,
    execute: async (m, { reply, args, ednut }) => {
      const target = m.mentionedJid?.[0];
      const k      = args.find(a => JOBS[a?.toLowerCase()])?.toLowerCase();
      if (!target || !k)
        return reply(UI('❌ ERROR', 'Usage: .setwork @user <jobid>'));
      const targetName = await getName(target, null, ednut, m.chat);
      getUser(target).job = JOBS[k].name;
      await SaveDataBase();
      reply(UI('✅ DONE', `Set *${targetName}*'s job to *${JOBS[k].name}*`));
    }
  },

  // 🎁 DAILY
  {
    command:     ['daily'],
    alias:       ['claim', 'checkin'],
    category:    'economy',
    description: 'Claim your daily reward',
    execute: async (m, { reply }) => {
      const user = getUser(m.sender);
      const now  = Date.now();
      const day  = 86400000;
      const name = m.pushName || numTag(m.sender);

      if (now - user.lastDaily < day) {
        const left = day - (now - user.lastDaily);
        const hh   = Math.floor(left / 3600000);
        const mm   = Math.floor((left % 3600000) / 60000);
        return reply(UI('⏳ DAILY COOLDOWN', `${name} already claimed today!\n\n⏳ Come back in ${hh}h ${mm}m`));
      }

      const reward   = 5000 + user.level * 100;
      user.balance  += reward;
      user.wallet    = user.balance;
      user.lastDaily = now;
      const lu       = addExp(user, 250);
      await SaveDataBase();

      reply(UI('🎁 DAILY CLAIMED', `👤 User        : ${name}\n💵 Reward      : $${fmt(reward)}\n💰 Wallet      : $${fmt(user.wallet)}\n✨ EXP         : +250${lu ? `\n\n🎉 LEVEL UP → Level ${user.level}!` : ''}\n\nCome back in 24 hours!`));
    }
  },

  // 🏪 SHOP — items that are "out of stock" are hidden for 1-3 days (market still sells them)
  {
    command:     ['shop'],
    alias:       ['store'],
    category:    'economy',
    description: 'Browse the item shop',
    execute: async (m, { reply, args }) => {
      const keys  = Object.keys(SHOP).filter(k => !isHidden(k));
      const gone  = Object.keys(SHOP).length - keys.length;
      const pages = Math.max(1, Math.ceil(keys.length / 10));
      const page  = Math.min(pages, Math.max(1, parseInt(args[0]) || 1));
      const slice = keys.slice((page - 1) * 10, page * 10);
      let txt     = `Page ${page}/${pages} — Use .buy <id> [qty]\n\n`;
      for (const k of slice)
        txt += `• \`${k}\` — ${SHOP[k].name}\n  💰 Buy: $${fmt(SHOP[k].buy)}\n\n`;
      txt += `Next page: .shop ${Math.min(page + 1, pages)}`;
      if (gone > 0) txt += `\n\n📦 ${gone} item(s) are out of stock right now — check .market`;
      txt += `\n🪙 Coins & more sellers: .market  |  Rates: .rates`;
      reply(UI('🏪 SHOP', txt.trim()));
    }
  },

  // 🛒 BUY — shop item  OR  market listing
  //   .buy fish 5            → 5 fish from the shop
  //   .buy 2 5               → exactly 5 units from market listing 2
  //   .buy 2                 → ALL units of listing 2
  //   .buy 2 all             → ALL units of listing 2
  {
    command:     ['buy'],
    alias:       ['purchase', 'order', 'buylisting', 'marketbuy'],
    category:    'economy',
    description: 'Buy from the shop (.buy fish 3) or the market (.buy <ID> [qty])',
    execute: async (m, { reply, args }) => {
      const first = (args[0] || '').trim();
      const name  = m.pushName || numTag(m.sender);
      const u     = getUser(m.sender);
      const now   = Date.now();

      if (!first)
        return reply(UI('🛒 BUY', 'Shop   : .buy <item> [qty]\nMarket : .buy <ID> <qty>   (no qty = buy ALL)\n\nSee .shop and .market'));

      const market = global.db.market || {};
      const lower  = first.toLowerCase();
      // listing IDs are short numbers: .buy 2 5  → 5 units from listing 2
      const id     = (/^\d+$/.test(first) && market[String(parseInt(first, 10))])
        ? String(parseInt(first, 10)) : null;
      if (/^\d+$/.test(first) && !id)
        return reply(UI('❌ NOT FOUND', `No listing with ID ${first}.\n\nIt may be sold out or expired. See .market`));

      // ──────────────── MARKET PURCHASE ────────────────
      if (id) {
        const l = market[id];
        if (l.seller === m.sender)
          return reply(UI('❌ ERROR', 'You cannot buy your own listing. Use .unlist <ID> to take it back.'));
        if (l.closedUntil && l.closedUntil > now)
          return reply(UI('🔒 STALL CLOSED', `${l.sellerName} has closed for now.\n⏳ Opens in ${dur(l.closedUntil - now)}\n\nTry another seller: .market ${l.item}`));

        // .buy ID      → buy everything in the listing
        // .buy ID 5    → buy exactly 5
        // .buy ID all  → buy everything in the listing
        let qty;
        const q = String(args[1] ?? '').toLowerCase();
        if (args[1] === undefined || q === 'all' || q === 'max') qty = l.qty;
        else qty = parseAmount(args[1]);

        if (!qty || isNaN(qty) || qty < 1)
          return reply(UI('❌ ERROR', `Invalid amount.\n\nUsage: .buy ${id} <qty>   (or just .buy ${id} to buy all ${fmt(l.qty)})`));
        if (qty > l.qty)
          return reply(UI('❌ NOT ENOUGH STOCK', `Only ${fmt(l.qty)} left in this listing.`));

        const cost = l.price * qty;
        if (u.balance < cost) {
          const afford = Math.floor(u.balance / l.price);
          return reply(UI('❌ INSUFFICIENT', `${fmt(qty)} × $${fmt(l.price)} = $${fmt(cost)}\nYou have $${fmt(u.balance)}.\n\n${afford > 0 ? `💡 You can afford ${fmt(afford)}: .buy ${id} ${afford}` : '💡 You cannot afford even 1 unit.'}`));
        }

        u.balance -= cost; u.wallet = u.balance;
        if (!l.bot) {
          const seller = getUser(l.seller);
          seller.balance += cost; seller.wallet = seller.balance;    // 💯 no charges for sellers
        }
        u.inventory[l.item] = (u.inventory[l.item] || 0) + qty;
        tickItemValue(u, l.item);          // value follows the SHOP price, not what you paid here
        addExp(u, Math.min(500, 40 * qty));
        l.qty -= qty;

        let extra = '';
        if (l.qty <= 0) {
          delete market[id];
          if (l.bot) {
            scheduleRestock(l);
            extra = `\n\n📢 *${l.sellerName}* sold out of ${nameOf(l.item)}!\n🔄 They will be back with fresh stock in 24 hours.`;
          } else {
            extra = `\n\n📢 *${l.sellerName}* sold out!`;
          }
        } else {
          extra = `\n📦 Left in listing : ${fmt(l.qty)}`;
        }
        await SaveDataBase();

        return reply(UI('✅ PURCHASED FROM MARKET', `🆔 Listing : ${id}\n📦 Item    : ${nameOf(l.item)} x${fmt(qty)}\n💲 Unit    : $${fmt(l.price)}\n💸 Paid    : $${fmt(cost)}\n👤 Seller  : ${l.sellerName}\n💵 Wallet  : $${fmt(u.wallet)}${extra}`));
      }

      // ──────────────── SHOP PURCHASE ────────────────
      if (COINS[lower])
        return reply(UI('🪙 MARKET ONLY', `${COINS[lower].name} is not sold in the shop.\n\nFind sellers: .market ${lower}\nCurrent rate: $${fmt(coinRate(lower))}`));
      if (!SHOP[lower])
        return reply(UI('❌ ERROR', 'Invalid item or listing ID.\n\nUse .shop or .market to browse.'));
      if (isHidden(lower))
        return reply(UI('📦 OUT OF STOCK', `${SHOP[lower].name} is not available in the shop right now.\n\nMarket sellers still have it: .market ${lower}`));

      const price = SHOP[lower].buy;
      const qty   = args[1] === undefined ? 1 : parseAmount(args[1], Math.floor(u.balance / price));
      if (!qty || isNaN(qty) || qty < 1)
        return reply(UI('❌ ERROR', 'Invalid amount.\n\nUsage: .buy <item> [qty]'));
      const cost = price * qty;
      if (u.balance < cost)
        return reply(UI('❌ INSUFFICIENT', `${name} needs $${fmt(cost)}, you have $${fmt(u.balance)}`));

      u.balance -= cost; u.wallet = u.balance;
      u.inventory[lower] = (u.inventory[lower] || 0) + qty;
      tickItemValue(u, lower);             // start value-appreciation tracking on first purchase
      addExp(u, Math.min(500, 40 * qty));
      await SaveDataBase();
      reply(UI('✅ PURCHASED', `👤 Buyer       : ${name}\n🛒 Item        : ${SHOP[lower].name} x${fmt(qty)}\n💲 Unit Price  : $${fmt(price)}\n💸 Total Cost  : $${fmt(cost)}\n💵 Wallet      : $${fmt(u.wallet)}`));
    }
  },

  // 💹 SELL
  //  .sell <item> <qty>          → sell instantly to the dealers (they keep a small cut)
  //  .sell <item> <qty> <price>  → list on the market at <price> EACH — NO charges, lasts 24h
  {
    command:     ['sell'],
    alias:       ['sellitem'],
    category:    'economy',
    description: 'Sell instantly (.sell fish 6) or list on the market (.sell fish 8 600)',
    execute: async (m, { reply, args }) => {
      const k    = args[0]?.toLowerCase();
      const u    = getUser(m.sender);
      const name = m.pushName || numTag(m.sender);

      if (!k || !isItem(k))
        return reply(UI('❌ ERROR', 'Invalid item. Use .shop or .inventory.\n\nUsage:\n.sell <item> <qty>          — sell instantly\n.sell <item> <qty> <price>  — list on the market (price is EACH, lasts 24h, no charges)'));

      const have = u.inventory[k] || 0;
      const qty  = args[1] === undefined ? 1 : parseAmount(args[1], have);
      if (!qty || isNaN(qty) || qty < 1)
        return reply(UI('❌ ERROR', 'Invalid quantity.\n\nUsage: .sell <item> <qty> [price]'));
      if (have < qty)
        return reply(UI('❌ ERROR', `You don't have ${fmt(qty)} ${nameOf(k)}. You only have ${fmt(have)}.`));

      // ── LIST ON MARKET (price given) ──────────────────────────────
      if (args[2] !== undefined) {
        const price = parseAmount(args[2]);
        if (!price || price <= 0 || isNaN(price))
          return reply(UI('❌ ERROR', 'Invalid asking price.\n\nUsage: .sell <item> <qty> <price each>'));

        const mine = Object.values(global.db.market || {}).filter(l => !l.bot && l.seller === m.sender).length;
        if (mine >= MAX_USER_LISTS)
          return reply(UI('❌ LIMIT', `You already have ${MAX_USER_LISTS} active listings. Use .mylistings or .unlist <ID>.`));

        const now = Date.now();
        const id  = genId();
        u.inventory[k] -= qty;
        global.db.market[id] = {
          id, seller: m.sender, sellerName: name, bot: false, item: k, qty, price, unit: true,
          createdAt: now, expiresAt: now + DAY
        };
        await SaveDataBase();

        return reply(UI('🏪 LISTED ON MARKET', `👤 Seller   : ${name}\n📦 Item     : ${nameOf(k)} x${fmt(qty)}\n💰 Price    : $${fmt(price)} each ($${fmt(price * qty)} for all)\n🆔 ID       : ${id}\n\n⏳ Stays up for 24 hours. If nobody buys, the items return to your bag.\n💯 No selling charges.\n\nBuyers use: .buy ${id} <qty>\nTake it down: .unlist ${id}`));
      }

      // ── INSTANT SELL (no price given) ─────────────────────────────
      const base = unitPrice(k);
      if (!base) return reply(UI('❌ ERROR', 'This item cannot be sold right now.'));
      // dealers keep a small cut: items 10-20%, coins 1-3%
      const pct   = COINS[k] ? rnd(0.01, 0.03) : rnd(0.10, 0.20);
      const cut   = Math.max(1, Math.round(base * pct));
      const bonus = COINS[k] ? 0 : tickItemValue(u, k).bonus;
      const unit  = Math.max(1, base - cut + bonus);
      const payout = unit * qty;

      u.inventory[k] -= qty;
      u.balance      += payout; u.wallet = u.balance;
      addExp(u, Math.min(500, 20 * qty));
      await SaveDataBase();

      reply(UI('✅ SOLD (INSTANT)', `👤 Seller      : ${name}\n📦 Item        : ${nameOf(k)} x${fmt(qty)}\n💲 Shop Price  : $${fmt(base)} each\n✂️ Dealer Cut  : -$${fmt(cut)} each\n${bonus ? `📈 Hold Bonus  : +$${fmt(bonus)} each\n` : ''}💰 You Got     : $${fmt(unit)} each → $${fmt(payout)}\n💵 Wallet      : $${fmt(u.wallet)}\n\n💡 Want full price? List it: .sell ${k} ${qty} <price>`));
    }
  },

  // 🏪 MARKET — browse listings
  //  .market            → page 1
  //  .market 2          → page 2
  //  .market fish       → only fish sellers
  {
    command:     ['market'],
    alias:       ['listings', 'p2p'],
    category:    'economy',
    description: 'View the market: .market [page] [item]',
    execute: async (m, { reply, args }) => {
      const now = Date.now();
      let list  = Object.values(global.db.market || {});
      let page  = 1, filt = null;
      for (const a of args) { if (/^\d+$/.test(a)) page = parseInt(a); else filt = a.toLowerCase(); }

      const waiting = (eco().restock || []).filter(r => !filt || r.item.includes(filt) || nameOf(r.item).toLowerCase().includes(filt));

      if (filt) list = list.filter(l => l.item.includes(filt) || nameOf(l.item).toLowerCase().includes(filt));
      if (!list.length) {
        let txt = filt ? `No sellers for "${filt}" right now.` : 'No listings yet.';
        if (waiting.length) {
          const soon = Math.min(...waiting.map(r => r.at));
          txt += `\n\n🔄 ${waiting.length} seller(s) are restocking — first one back in ${dur(soon - now)}.`;
        }
        txt += '\n\nList yours: .sell <item> <qty> <price>';
        return reply(UI('🏪 MARKET', txt));
      }

      list.sort((a, b) => a.item === b.item ? a.price - b.price : a.item.localeCompare(b.item));
      const per   = 8;
      const pages = Math.ceil(list.length / per);
      page        = Math.min(pages, Math.max(1, page));

      let msg = `Page ${page}/${pages} • ${list.length} listing(s)\n\n`;
      for (const l of list.slice((page - 1) * per, page * per)) {
        const closed = l.closedUntil && l.closedUntil > now;
        msg += `🆔 ${l.id}\n📦 ${nameOf(l.item)} — ${fmt(l.qty)} left\n💰 $${fmt(l.price)} each • ${l.sellerName}\n`;
        if (closed)       msg += `🔒 Closed — opens in ${dur(l.closedUntil - now)}\n`;
        else if (!l.bot)  msg += `⏳ Expires in ${dur((l.expiresAt || now) - now)}\n`;
        msg += '\n';
      }
      msg += `Buy : .buy <ID> <qty>   (no qty = buy all)\nSell: .sell <item> <qty> <price>\nNext: .market ${Math.min(pages, page + 1)}${filt ? ' ' + filt : ''}`;
      if (waiting.length) msg += `\n\n🔄 ${waiting.length} sold-out seller(s) returning within 24h`;
      reply(UI('🏪 MARKET', msg.trim()));
    }
  },

  // 📋 MY LISTINGS
  {
    command:     ['mylistings'],
    alias:       ['mylist', 'mystall'],
    category:    'economy',
    description: 'See your own market listings',
    execute: async (m, { reply }) => {
      const now  = Date.now();
      const mine = Object.values(global.db.market || {}).filter(l => !l.bot && l.seller === m.sender);
      if (!mine.length) return reply(UI('📋 MY LISTINGS', 'You have no active listings.\n\nList something: .sell <item> <qty> <price>'));
      let msg = '';
      for (const l of mine)
        msg += `🆔 ${l.id}\n📦 ${nameOf(l.item)} x${fmt(l.qty)} @ $${fmt(l.price)} each\n⏳ Expires in ${dur(l.expiresAt - now)}\n\n`;
      reply(UI('📋 MY LISTINGS', msg.trim() + '\n\nRemove one: .unlist <ID>'));
    }
  },

  // ❌ UNLIST
  {
    command:     ['unlist'],
    alias:       ['delist', 'cancellisting'],
    category:    'economy',
    description: 'Take your listing off the market and get the items back',
    execute: async (m, { reply, args }) => {
      const raw = String(parseInt(args[0], 10));
      const id  = global.db.market?.[raw] ? raw : null;
      if (!id) return reply(UI('❌ ERROR', 'Listing not found.\n\nUsage: .unlist <ID>   (see .mylistings)'));
      const l = global.db.market[id];
      if (l.bot || l.seller !== m.sender) return reply(UI('❌ ERROR', 'That is not your listing.'));
      const u = getUser(m.sender);
      u.inventory[l.item] = (u.inventory[l.item] || 0) + l.qty;
      delete global.db.market[id];
      await SaveDataBase();
      reply(UI('✅ UNLISTED', `${nameOf(l.item)} x${fmt(l.qty)} returned to your bag.`));
    }
  },

  // 🪙 COIN RATES
  {
    command:     ['rates'],
    alias:       ['coins', 'coinrates'],
    category:    'economy',
    description: 'View current coin rates',
    execute: async (m, { reply }) => {
      let msg = 'Coins are only traded in the market.\n\n';
      for (const k of Object.keys(COINS)) {
        const r = coinRate(k), base = COINS[k].rate;
        const diff = ((r - base) / base * 100);
        msg += `• \`${k}\` — ${COINS[k].name}\n  💰 $${fmt(r)}  ${diff >= 0 ? '📈 +' : '📉 '}${diff.toFixed(1)}%\n\n`;
      }
      reply(UI('🪙 COIN RATES', msg.trim() + '\n\nBuy: .market usdt  →  .buy <ID> <qty>'));
    }
  },

  // 🎒 INVENTORY
  {
    command:     ['inventory'],
    alias:       ['inv', 'bag', 'items'],
    category:    'economy',
    description: 'View your inventory',
    execute: async (m, { reply, ednut }) => {
      const target = m.mentionedJid?.[0] || m.sender;
      const u      = getUser(target);
      const isMe   = target === m.sender;
      const name   = isMe
        ? (m.pushName || numTag(target))
        : await getName(target, null, ednut, m.chat);
      const items  = Object.entries(u.inventory || {}).filter(([k, q]) => q > 0 && isItem(k));
      if (!items.length)
        return reply(UI('🎒 INVENTORY', `${name}'s bag is empty.\nUse .buy to get items.`));
      let msg = `${name}'s Inventory:\n\n`;
      for (const [k, q] of items) {
        const worth = unitPrice(k) + (COINS[k] ? 0 : tickItemValue(u, k).bonus);
        msg += `• ${nameOf(k)} x${fmt(q)}\n   💰 Worth $${fmt(worth)} each ($${fmt(worth * q)} total)\n`;
      }
      await SaveDataBase();
      reply(UI('🎒 INVENTORY', msg.trim()));
    }
  },

  // 📦 SEND — give inventory items to another user (reply to them or tag them)
  {
    command:     ['send'],
    alias:       ['senditem', 'giveitem'],
    category:    'economy',
    description: 'Send inventory items to another user',
    execute: async (m, { reply, args, ednut }) => {
      const target = m.quoted?.sender || m.mentionedJid?.[0];
      if (!target)
        return reply(UI('❌ ERROR', 'Reply to or tag the receiver.\n\nUsage: .send <item> <qty>  (reply/tag the receiver)'));
      if (target === m.sender)
        return reply(UI('❌ ERROR', 'You cannot send items to yourself.'));

      const k   = args[0]?.toLowerCase();
      if (!k || !isItem(k))
        return reply(UI('❌ ERROR', 'Invalid item. Use .shop to browse.'));

      const s   = getUser(m.sender);
      const qty = args[1] === undefined ? 1 : parseAmount(args[1], s.inventory[k] || 0);
      if (!qty || isNaN(qty) || qty < 1)
        return reply(UI('❌ ERROR', 'Invalid quantity.'));
      if ((s.inventory[k] || 0) < qty)
        return reply(UI('❌ ERROR', `You don't have ${fmt(qty)} ${nameOf(k)}.`));

      const r = getUser(target);
      s.inventory[k] -= qty;
      r.inventory[k]  = (r.inventory[k] || 0) + qty;
      await SaveDataBase();

      const senderName = m.pushName || numTag(m.sender);
      const targetName = await getName(target, null, ednut, m.chat);
      reply(UI('📦 ITEM SENT', `📤 From : ${senderName}\n📥 To   : ${targetName}\n🎁 Item : ${nameOf(k)} x${fmt(qty)}`));
    }
  },

  // 🤝 F2F — offer to sell an item directly to a tagged user; they must .f2f accept
  {
    command:     ['f2f'],
    alias:       ['facetoface'],
    category:    'economy',
    description: 'Offer an item for sale directly to a tagged user (they confirm with .f2f accept)',
    execute: async (m, { reply, args, ednut }) => {
      const sub = args[0]?.toLowerCase();

      // ── ACCEPT ─────────────────────────────────────────────────
      if (sub === 'accept') {
        const key = m.chat + m.sender;
        const t   = f2fTrades.get(key);
        if (!t) return reply(UI('❌ ERROR', 'No pending F2F offer for you.'));

        clearTimeout(t.to);
        f2fTrades.delete(key);

        const buyer = getUser(m.sender);
        if (buyer.balance < t.price)
          return reply(UI('❌ INSUFFICIENT FUNDS', `You need $${fmt(t.price)} but have $${fmt(buyer.balance)}.`));

        const seller = getUser(t.seller);
        if ((seller.inventory[t.item] || 0) < t.qty) {
          return reply(UI('❌ ERROR', 'Seller no longer has this item. Deal cancelled.'));
        }

        buyer.balance  -= t.price; buyer.wallet  = buyer.balance;
        seller.balance += t.price; seller.wallet = seller.balance;
        seller.inventory[t.item] -= t.qty;
        buyer.inventory[t.item]   = (buyer.inventory[t.item] || 0) + t.qty;

        await SaveDataBase();

        return ednut.sendMessage(m.chat, {
          text: UI('✅ F2F DEAL COMPLETE', `📦 Item   : ${nameOf(t.item)} x${fmt(t.qty)}\n💰 Paid   : $${fmt(t.price)}\n👤 Seller : ${t.sellerName}\n👤 Buyer  : ${t.buyerName}`),
          mentions: [t.seller, m.sender]
        });
      }

      // ── OFFER: .f2f <item> <qty> <price> @buyer ──────────────────
      const target = m.mentionedJid?.[0] || m.quoted?.sender;
      if (!target)
        return reply(UI('❌ ERROR', 'Tag or reply to the buyer.\n\nUsage: .f2f <item> <qty> <price> @buyer'));
      if (target === m.sender)
        return reply(UI('❌ ERROR', 'You cannot trade with yourself.'));

      const k     = args[0]?.toLowerCase();
      const qty   = Math.max(1, parseAmount(args[1]) || 1);
      const price = parseAmount(args[2]);

      if (!k || !isItem(k))
        return reply(UI('❌ ERROR', 'Invalid item. Use .shop to browse.'));
      if (!price || price <= 0 || isNaN(price))
        return reply(UI('❌ ERROR', 'Invalid price.\n\nUsage: .f2f <item> <qty> <price> @buyer'));

      const seller = getUser(m.sender);
      if ((seller.inventory[k] || 0) < qty)
        return reply(UI('❌ ERROR', `You don't have ${fmt(qty)} ${nameOf(k)}.`));

      const sellerName = m.pushName || numTag(m.sender);
      const buyerName  = await getName(target, null, ednut, m.chat);

      const key = m.chat + target;
      if (f2fTrades.has(key)) clearTimeout(f2fTrades.get(key).to);

      const to = setTimeout(() => {
        if (!f2fTrades.has(key)) return;
        f2fTrades.delete(key);
        ednut.sendMessage(m.chat, { text: `⏰ F2F offer to *${buyerName}* expired.` });
      }, 60000);

      f2fTrades.set(key, { seller: m.sender, item: k, qty, price, sellerName, buyerName, to });

      await ednut.sendMessage(m.chat, {
        text: UI('🤝 F2F OFFER', `*${sellerName}* wants to sell *${buyerName}*:\n📦 ${nameOf(k)} x${fmt(qty)}\n💰 Price : $${fmt(price)}\n\n*${buyerName}*, type *.f2f accept* within 60 seconds!`),
        mentions: [m.sender, target]
      }, { quoted: m });
    }
  },

  // 🏆 LEADERBOARD
  {
    command:     ['leaderboard'],
    alias:       ['lb', 'top', 'richlist'],
    category:    'economy',
    description: 'View the richest users',
    execute: async (m, { reply, ednut }) => {
      const list = Object.entries(global.db.users || {})
        .map(([j, d]) => ({
          j,
          t:   (d.balance||0) + (d.bank||0),
          lvl: d.level || 1,
          job: d.job   || 'Unemployed'
        }))
        .filter(x => x.t > 0)
        .sort((a, b) => b.t - a.t)
        .slice(0, 10);

      if (!list.length)
        return reply(UI('🏆 ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ', 'No rich users yet. Start earning!'));

      let participantMap = {};
      try {
        const meta = await ednut.groupMetadata(m.chat);
        for (const p of meta.participants)
          participantMap[p.id] = p.notify || p.name || null;
      } catch {}

      const medals   = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
      let msg        = '';

      list.forEach((u, i) => {
        const tick    = i < 3 ? ' 🔵' : '';
        const display = nameFor(u.j) || participantMap[u.j] || 'Unknown user';
        msg +=
          `${medals[i]} *${display}*${tick}\n` +
          `   💵 $${fmt(u.t)} | 🏅 Lvl ${u.lvl} | 💼 ${u.job}\n\n`;
      });

      await ednut.sendMessage(m.chat, {
        text: UI('🏆 ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ', msg.trim())
      }, { quoted: m });
    }
  },

  // 🎲 DICE (vs House)
  {
    command:     ['dice'],
    alias:       ['betdice', 'roll'],
    category:    'economy',
    description: 'Roll dice against the house',
    execute: async (m, { reply, args }) => {
      const bet  = parseAmount(args[0], getUser(m.sender).balance);
      const user = getUser(m.sender);
      const name = m.pushName || numTag(m.sender);

      if (!bet || bet <= 0 || isNaN(bet))
        return reply(UI('❌ ERROR', 'Usage: .dice <amount>\nExample: .dice 5000'));
      if (bet > 1000000)
        return reply(UI('❌ MAX BET', 'Maximum bet is $1,000,000'));
      if (user.balance < bet)
        return reply(UI('❌ INSUFFICIENT', `${name} has $${fmt(user.balance)}`));

      const userRoll   = Math.floor(Math.random() * 6) + 1;
      const botRoll    = Math.floor(Math.random() * 6) + 1;
      const dice       = ['','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'];
      let   resultText = '';

      if (userRoll > botRoll) {
        user.balance += bet; user.wallet = user.balance;
        addExp(user, 60);
        resultText = `🟢 ${name} Wins! +$${fmt(bet)}`;
      } else if (userRoll < botRoll) {
        user.balance -= bet; user.wallet = user.balance;
        addExp(user, 15);
        resultText = `🔴 ${name} Loses! -$${fmt(bet)}`;
      } else {
        resultText = `🟡 Tie! Stake refunded.`;
      }

      await SaveDataBase();

      return reply(UI('🎲 DICE RESULT', `👤 Player : ${name}\n🎲 You : ${dice[userRoll]} (${userRoll})\n🤖 Bot : ${dice[botRoll]}  (${botRoll})\n\n${resultText}\n💵 Wallet : $${fmt(user.wallet)}`));
    }
  },

  // ⚔️ PVP DICE
  {
    command:     ['pvpdice'],
    alias:       ['dicepvp', 'challenge'],
    category:    'economy',
    description: 'Challenge another user to a dice battle',
    execute: async (m, { reply, args, ednut }) => {
      const target = m.mentionedJid?.[0];
      const bet    = parseAmount(args[args.length - 1], getUser(m.sender).balance);

      if (!target)         return reply(UI('❌ ERROR', 'Tag someone. Example: .pvpdice @user 1000'));
      if (!bet || bet<100) return reply(UI('❌ ERROR', 'Minimum bet is $100'));
      if (bet > 1000000)   return reply(UI('❌ MAX BET', 'Maximum bet is $1,000,000'));
      if (target === m.sender) return reply(UI('❌ ERROR', 'You cannot challenge yourself.'));

      const atk = getUser(m.sender);
      const def = getUser(target);

      if (def.wallet > def.balance) def.balance = def.wallet;
      if (def.balance > def.wallet) def.wallet  = def.balance;
      const defActual = def.balance;

      if (atk.balance < bet)
        return reply(UI('❌ INSUFFICIENT', `You need $${fmt(bet)} to challenge.\n💵 Your wallet: $${fmt(atk.balance)}`));

      if (defActual < bet)
        return reply(UI('❌ CANNOT CHALLENGE', `That user only has $${fmt(defActual)} in their wallet.\n💡 Lower your bet or choose someone else.`));

      const atkName = m.pushName || numTag(m.sender);
      const defName = await getName(target, null, ednut, m.chat);

      atk.balance -= bet; atk.wallet = atk.balance;
      await SaveDataBase();

      const key = m.chat + target;
      if (diceChallenge.has(key)) clearTimeout(diceChallenge.get(key).to);

      const to = setTimeout(async () => {
        if (!diceChallenge.has(key)) return;
        diceChallenge.delete(key);
        const a    = getUser(m.sender);
        a.balance += bet; a.wallet = a.balance;
        await SaveDataBase();
        await ednut.sendMessage(m.chat, {
          text:     `⏰ *${defName}* didn't accept in time.\n💵 $${fmt(bet)} refunded to *${atkName}*.`,
          mentions: [target, m.sender]
        });
      }, 20000);

      diceChallenge.set(key, { challenger: m.sender, bet, to, atkName, defName });

      await ednut.sendMessage(m.chat, {
        text: UI('⚔️ PVP DICE CHALLENGE',
          `*${atkName}* challenged *${defName}*!\n💵 Bet : $${fmt(bet)}\n\n*${defName}*, type *.accept* within 20 seconds!\n⏰ Auto-refund if no response.`),
        mentions: [m.sender, target]
      }, { quoted: m });
    }
  },

  // ✅ ACCEPT (PVP Dice)
  {
    command:     ['accept'],
    alias:       [],
    category:    'economy',
    description: 'Accept a PVP dice challenge',
    execute: async (m, { reply, ednut }) => {
      const key = m.chat + m.sender;
      const ch  = diceChallenge.get(key);

      if (!ch) return reply(UI('❌ ERROR', 'No pending dice challenge for you.'));

      clearTimeout(ch.to);
      diceChallenge.delete(key);

      const { challenger, bet, atkName, defName } = ch;
      const def = getUser(m.sender);
      const atk = getUser(challenger);

      if (def.wallet > def.balance) def.balance = def.wallet;
      if (def.balance > def.wallet) def.wallet  = def.balance;

      if (def.balance < bet) {
        atk.balance += bet; atk.wallet = atk.balance;
        await SaveDataBase();
        return reply(UI('❌ CANCELLED', `*${defName}* doesn't have enough balance.\n$${fmt(bet)} refunded to *${atkName}*.`));
      }

      def.balance -= bet; def.wallet = def.balance;

      const dice = ['','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'];
      const r1   = Math.ceil(Math.random() * 6);
      const r2   = Math.ceil(Math.random() * 6);

      if (r1 === r2) {
        atk.balance += bet; atk.wallet = atk.balance;
        def.balance += bet; def.wallet = def.balance;
        await SaveDataBase();
        return ednut.sendMessage(m.chat, {
          text:     UI('🎲 TIE!', `*${atkName}* : ${dice[r1]} (${r1})\n*${defName}* : ${dice[r2]} (${r2})\n\n🟡 Both bets refunded.`),
          mentions: [challenger, m.sender]
        });
      }

      const isAtkWinner = r1 > r2;
      const winnerName  = isAtkWinner ? atkName : defName;
      const loserName   = isAtkWinner ? defName : atkName;
      const winnerU     = isAtkWinner ? atk : def;
      winnerU.balance  += bet * 2; winnerU.wallet = winnerU.balance;
      addExp(winnerU, 25);
      await SaveDataBase();

      await ednut.sendMessage(m.chat, {
        text: UI('🎲 PVP RESULT',
          `*${atkName}* : ${dice[r1]} (${r1})\n*${defName}* : ${dice[r2]} (${r2})\n\n🏆 Winner : *${winnerName}*\n😔 Loser  : *${loserName}*\n💵 Prize  : $${fmt(bet * 2)}`),
        mentions: [challenger, m.sender]
      });
    }
  },

  // 🎰 SLOT MACHINE
  {
    command:     ['slot'],
    alias:       ['slots', 'spin'],
    category:    'economy',
    description: 'Spin the slot machine',
    execute: async (m, { reply, args }) => {
      const bet  = parseAmount(args[0], getUser(m.sender).balance);
      const user = getUser(m.sender);
      const name = m.pushName || numTag(m.sender);

      if (!bet || bet < 50)
        return reply(UI('❌ ERROR', 'Minimum bet $50. Example: .slot 500'));
      if (bet > 1000000)
        return reply(UI('❌ MAX BET', 'Maximum bet is $1,000,000'));
      if (user.balance < bet)
        return reply(UI('❌ INSUFFICIENT', `${name} has $${fmt(user.balance)}`));

      const S  = ['🍒','🍋','💎','🔔','🍇','⭐','7️⃣','🃏'];
      const s1 = S[Math.floor(Math.random() * S.length)];
      const s2 = S[Math.floor(Math.random() * S.length)];
      const s3 = S[Math.floor(Math.random() * S.length)];

      user.balance -= bet;
      let header = '', mult = 0, net = 0;

      if (s1 === s2 && s2 === s3) {
        mult = 4; net = bet * mult; user.balance += net;
        addExp(user, 150); header = '🎉 JACKPOT! TRIPLE MATCH';
      } else if (s1 === s2 || s2 === s3 || s1 === s3) {
        mult = 2; net = bet * mult; user.balance += net;
        addExp(user, 50);  header = '🌟 WINNER! DOUBLE MATCH';
      } else {
        addExp(user, 10);  header = '💀 NO MATCH — HOUSE WINS';
      }

      user.wallet = user.balance;
      await SaveDataBase();

      reply(UI(header, `👤 Player : ${name}\n[  ${s1}  |  ${s2}  |  ${s3}  ]\n\n${mult > 0 ? `🟢 x${mult} Multiplier\n💰 +$${fmt(net)}` : `🔴 Lost $${fmt(bet)}`}\n\n💵 Wallet : $${fmt(user.wallet)}`));
    }
  },

  // ✈️ AVIATOR
  {
    command:     ['aviator'],
    alias:       ['fly', 'sporty'],
    category:    'economy',
    description: 'Bet on a multiplier before the plane crashes',
    execute: async (m, { reply, args }) => {
      const user = getUser(m.sender);
      const bet  = parseAmount(args[0], getUser(m.sender).balance);
      const name = m.pushName || numTag(m.sender);

      if (!bet || bet < 100)
        return reply(UI('✈️ AVIATOR', `Bet before the plane crashes!\n\nUsage   : .aviator <amount>\nExample : .aviator 1000\nMinimum : $100`));
      if (bet > 1000000)
        return reply(UI('❌ MAX BET', 'Maximum bet is $1,000,000'));
      if (user.balance < bet)
        return reply(UI('❌ INSUFFICIENT', `${name} has $${fmt(user.balance)}`));

      user.balance -= bet;

      const odds     = [1.03,2.07,2.01,4.16,3.2,2.3,2.4,2.5,3.6,2.7,1.8,2,2.2,2.5,2.9,3,3.2,3.9,3.7,4,4.5,5,3.2,10];
      const cashouts = [2.01,2.05,2.1,2.15,3.2,2.3,2.4,2.5,2.6,2.7,2.8,2,2.2,2.5,2.9,3,3.1,3.5,3.9,4,4.5,5,3.2,7];
      const cashout  = cashouts[Math.floor(Math.random() * cashouts.length)];
      const roll     = Math.random();
      const crash    = roll < 0.70 ? odds[Math.floor(Math.random() * 8)]
                     : roll < 0.95 ? odds[Math.floor(Math.random() * 18)]
                     :               odds[Math.floor(Math.random() * odds.length)];

      if (crash >= cashout) {
        const win     = Math.floor(bet * cashout);
        user.balance += win;
        addExp(user, 100);
        user.wallet   = user.balance;
        await SaveDataBase();
        reply(UI('✈️ AVIATOR WIN', `👤 Player      : ${name}\n📈 Crash Point : ${crash}x\n🎯 Cashed Out  : ${cashout}x\n💰 Won         : +$${fmt(win)}\n💵 Wallet      : $${fmt(user.wallet)}`));
      } else {
        addExp(user, 15);
        user.wallet = user.balance;
        await SaveDataBase();
        reply(UI('💥 PLANE CRASHED!', `👤 Player      : ${name}\n📉 Crash Point : ${crash}x\n🎯 Cashout Was : ${cashout}x\n💸 Lost        : -$${fmt(bet)}\n💵 Wallet      : $${fmt(user.wallet)}`));
      }
    }
  },

  // 📈 TRADE
  {
    command:     ['trade'],
    alias:       ['forex', 'updown'],
    category:    'economy',
    description: 'Speculate on market movements',
    execute: async (m, { reply, args }) => {
      const pick = args[0]?.toLowerCase();
      const bet  = parseAmount(args[1], getUser(m.sender).balance);
      const user = getUser(m.sender);
      const name = m.pushName || numTag(m.sender);

      if (!pick || !['up','down','heads','tails'].includes(pick) || !bet || bet <= 0)
        return reply(UI('❌ ERROR', 'Usage: .trade <up/down> <amount>\nExample: .trade up 5000'));
      if (bet > 1000000)
        return reply(UI('❌ MAX BET', 'Maximum bet is $1,000,000'));
      if (user.balance < bet)
        return reply(UI('❌ INSUFFICIENT', `${name} has $${fmt(user.balance)}`));

      const start  = (900 + Math.floor(Math.random() * 200)).toFixed(2);
      const change = (Math.random() * 20 - 10).toFixed(2);
      const end    = (parseFloat(start) + parseFloat(change)).toFixed(2);
      const result = parseFloat(end) > parseFloat(start) ? 'up' : 'down';

      user.balance -= bet;
      const correct = (pick === result) ||
        (pick === 'heads' && result === 'up') ||
        (pick === 'tails' && result === 'down');
      let outcome = '';

      if (correct) {
        const reward  = Math.floor(bet * 1.9);
        user.balance += reward;
        addExp(user, 80);
        outcome = `🟢 Correct! ${name} won +$${fmt(reward)}`;
      } else {
        addExp(user, 25);
        outcome = `🔴 Wrong! ${name} lost -$${fmt(bet)}`;
      }

      user.wallet = user.balance;
      await SaveDataBase();

      return reply(UI('💹 ᴛʀᴀᴅᴇ ʀᴇsᴜʟᴛ', `👤 Trader    : ${name}\n📊 Start     : ${start}\n📊 End       : ${end}\n📈 Market    : ${result.toUpperCase()}\n🎯 Your Pick : ${pick.toUpperCase()}\n\n${outcome}\n💵 Wallet    : $${fmt(user.wallet)}`));
    }
  },

  // 🪙 GAMBLE (coin flip)
  {
    command:     ['gamble'],
    alias:       ['flip', 'coinflip'],
    category:    'economy',
    description: 'Flip a coin and bet on heads or tails',
    execute: async (m, { reply, args }) => {
      const user  = getUser(m.sender);
      const bet   = parseAmount(args[0], getUser(m.sender).balance);
      const valid = ['heads', 'tails'];
      let   pick  = (args[1] || '').toLowerCase();
      const name  = m.pushName || numTag(m.sender);

      if (!bet || bet < 50)
        return reply(UI('🪙 COIN FLIP', `Bet on heads or tails!\n\nUsage   : .gamble <amount> [heads/tails]\nExample : .gamble 1000 heads\nMinimum : $50\n\n💵 Wallet : $${fmt(user.balance)}`));
      if (bet > 1000000)
        return reply(UI('❌ MAX BET', 'Maximum bet is $1,000,000'));
      if (user.balance < bet)
        return reply(UI('❌ INSUFFICIENT', `${name} needs $${fmt(bet)}.\n💵 Wallet : $${fmt(user.balance)}`));

      if (!valid.includes(pick))
        pick = valid[Math.floor(Math.random() * 2)];

      const result = valid[Math.floor(Math.random() * 2)];
      const coin   = result === 'heads' ? '🟡 HEADS' : '⚪ TAILS';
      const chose  = pick   === 'heads' ? '🟡 HEADS' : '⚪ TAILS';
      const won    = pick === result;
      let   outcome = '';

      if (won) {
        const win     = bet * 2;
        user.balance += win;
        addExp(user, 60);
        outcome = `🏆 ${name} WINS!\n💰 +$${fmt(win)}`;
      } else {
        user.balance -= bet;
        addExp(user, 15);
        outcome = `💀 ${name} LOSES!\n💸 -$${fmt(bet)}`;
      }

      user.wallet = user.balance;
      await SaveDataBase();

      return reply(UI('🪙 COIN FLIP', `👤 Player     : ${name}\n🎯 You Picked : ${chose}\n🪙 Result     : ${coin}\n\n${outcome}\n💵 Wallet     : $${fmt(user.wallet)}`));
    }
  },

  // ⛏️ MINE
  {
    command:     ['mine'],
    alias:       ['minestart', 'startmine'],
    category:    'economy',
    description: 'Deposit gams to mine — claim doubled after 24 hours',
    execute: async (m, { reply, args }) => {
      const user = getUser(m.sender);
      const now  = Date.now();
      const day  = 86400000;
      const name = m.pushName || numTag(m.sender);

      if (!args[0] && user.minedGams > 0) {
        const elapsed = now - user.lastMine;
        if (elapsed < day) {
          const left = day - elapsed;
          const hh   = Math.floor(left / 3600000);
          const mm   = Math.floor((left % 3600000) / 60000);
          return reply(UI('⛏️ MINE IN PROGRESS', `👤 Miner    : ${name}\n💎 Mining   : ${fmt(user.minedGams)} gams\n⏳ Ready in : ${hh}h ${mm}m\n\nCome back to claim your doubled reward!`));
        }

        const reward    = user.minedGams * 2;
        user.gams      += reward;
        const deposited = user.minedGams;
        user.minedGams  = 0;
        user.lastMine   = 0;
        const lu        = addExp(user, 200);
        await SaveDataBase();

        return reply(UI('⛏️ MINE COMPLETE', `👤 Miner     : ${name}\n✅ Mining finished!\n\n💎 Deposited : ${fmt(deposited)} gams\n💎 Received  : ${fmt(reward)} gams (2x)\n💎 Total     : ${fmt(user.gams)} gams\n✨ EXP       : +200${lu ? `\n\n🎉 LEVEL UP → Level ${user.level}!` : ''}`));
      }

      if (user.minedGams > 0) {
        const elapsed = now - user.lastMine;
        const left    = Math.max(0, day - elapsed);
        const hh      = Math.floor(left / 3600000);
        const mm      = Math.floor((left % 3600000) / 60000);
        return reply(UI('⛏️ ALREADY MINING', `👤 Miner    : ${name}\n💎 Mining   : ${fmt(user.minedGams)} gams\n⏳ Ready in : ${hh}h ${mm}m\n\nType *.mine* again when ready to claim!`));
      }

      const amount = parseAmount(args[0], user.gams);
      if (!amount || amount <= 0 || isNaN(amount))
        return reply(UI('⛏️ MINE', `Deposit gams now, claim doubled in 24h!\n\nUsage   : .mine <amount>\nExample : .mine 100\n\n💎 Your Gams : ${fmt(user.gams)}`));

      if (user.gams < amount)
        return reply(UI('❌ NOT ENOUGH GAMS', `${name} only has 💎 ${fmt(user.gams)} gams.`));

      user.gams      -= amount;
      user.minedGams  = amount;
      user.lastMine   = now;
      await SaveDataBase();

      return reply(UI('⛏️ MINE STARTED', `👤 Miner     : ${name}\n💎 Deposited : ${fmt(amount)} gams\n🕐 Ready in  : 24 hours\n💰 You get   : ${fmt(amount * 2)} gams (2x)\n\nType *.mine* after 24h to claim!`));
    }
  },

  // 💱 CONVERT GAMS → CASH
  {
    command:     ['convertgams'],
    alias:       ['gams2cash', 'gemcash'],
    category:    'economy',
    description: 'Convert gams to cash — 1 gam = $50',
    execute: async (m, { reply, args }) => {
      const user   = getUser(m.sender);
      const raw    = args[0]?.toLowerCase();
      const amount = parseAmount(raw, user.gams);
      const name   = m.pushName || numTag(m.sender);

      if (!amount || amount <= 0 || isNaN(amount))
        return reply(UI('💱 CONVERT GAMS', `Rate    : 💎 1 gam = $50\nUsage   : .convertgams <amount>\n          .convertgams all\n\n💎 Your Gams : ${fmt(user.gams)}`));

      if (user.gams < amount)
        return reply(UI('❌ NOT ENOUGH GAMS', `${name} only has 💎 ${fmt(user.gams)} gams.`));

      const earned   = amount * 50;
      user.gams     -= amount;
      user.balance  += earned;
      user.wallet    = user.balance;
      const lu       = addExp(user, Math.floor(amount / 10));
      await SaveDataBase();

      return reply(UI('💱 CONVERT SUCCESS', `👤 User       : ${name}\n💎 Gams Used  : ${fmt(amount)}\n💵 Cash Got   : +$${fmt(earned)}\n💎 Gams Left  : ${fmt(user.gams)}\n💵 Wallet     : $${fmt(user.wallet)}${lu ? `\n\n🎉 LEVEL UP → Level ${user.level}!` : ''}`));
    }
  },

  // 🎟️ GEN COUPON — minted on the coupon API server (secure)
  //   .gencoupon <amount> <total_persons>
  {
    command:     ['gencoupon'],
    alias:       ['makecoupon', 'createcoupon'],
    category:    'economy',
    description: 'Generate a redeemable coupon voucher via the coupon API',
    execute: async (m, { reply, args, ednut }) => {

      const a         = args;
      const amount    = parseAmount(a[0]);
      const maxClaims = parseInt(a[1]) || 1;
      const name      = m.pushName || numTag(m.sender);

      if (!amount || amount <= 0 || isNaN(amount))
        return reply(UI('🎟️ GENCOUPON', `❌ Invalid amount.\n\n📌 Usage:\n.gencoupon <amount> <total_persons>\n\nExamples:\n.gencoupon 5000 1\n.gencoupon 10m 5\n.gencoupon 500k 10`));

      const res = await couponApi('/coupon/create', {
        amount,
        maxClaims,
        createdBy: cleanJid(m.sender)
      });

      if (res.error === 'not_configured')
        return reply(UI('⚙️ API NOT SET', `Coupon site is not configured in economy.js.`));
      if (res.error === 'unreachable')
        return reply(UI('🔌 API OFFLINE', `Could not reach the coupon server. Make sure it is running.`));
      if (!res.ok || !res.code)
        return reply(UI('❌ API ERROR', `The coupon server refused the request (${res.status || '?'}).\n${res.error || ''}`));

      const code = res.code;

      await reply(UI('🎟️ COUPON CREATED', `✅ Voucher minted by *${name}*!\n\n🎫 Code          : ${code}\n💰 Value         : $${fmt(amount)}\n👥 Total Persons : ${maxClaims} person(s)\n📅 Created       : ${new Date().toLocaleString()}\n\nRedeem with:\n.redeemcoupon ${code}`));

      // plain-text code only (copy-friendly, not styled)
      try { await ednut.sendMessage(m.chat, { text: code }); } catch {}
    }
  },

  // 🎟️ REDEEM COUPON — validated on the coupon API server (secure)
  {
    command:     ['redeemcoupon'],
    alias:       ['claimcoupon', 'redeem'],
    category:    'economy',
    description: 'Claim balance using a coupon code',
    execute: async (m, { reply, args }) => {
      const code = args[0]?.toUpperCase().trim();
      const name = m.pushName || numTag(m.sender);

      if (!code)
        return reply(UI('🎟️ REDEEMCOUPON', `❌ No code provided.\n\n📌 Usage:\n.redeemcoupon <CODE>\n\nExample:\n.redeemcoupon CPN-AB12-CD34-EF56`));

      const res = await couponApi('/coupon/redeem', { code, user: cleanJid(m.sender) });

      if (res.error === 'not_configured')
        return reply(UI('⚙️ API NOT SET', `Coupons are not set up on this bot yet. Tell the admin.`));
      if (res.error === 'unreachable')
        return reply(UI('🔌 API OFFLINE', `Could not reach the coupon server. Try again in a moment.`));

      if (!res.ok) {
        if (res.error === 'invalid')
          return reply(UI('❌ INVALID CODE', `The code *${code}* does not exist.\n\n• Check for typos\n• The code may have expired`));
        if (res.error === 'fully_claimed')
          return reply(UI('❌ FULLY CLAIMED', `This coupon has already been claimed by all its ${res.maxClaims || ''} person(s).\n\nMaximum redemptions reached.`));
        if (res.error === 'already_claimed')
          return reply(UI('❌ ALREADY CLAIMED', `${name} has already redeemed this coupon.\n\nEach person can only claim once.`));
        if (res.error === 'rate_limited')
          return reply(UI('⏳ SLOW DOWN', `Too many attempts. Wait a minute and try again.`));
        return reply(UI('❌ API ERROR', `Could not redeem this coupon right now.`));
      }

      // ✅ server approved → pay the user
      const u    = getUser(m.sender);
      u.balance += res.amount;
      u.wallet   = u.balance;
      const lu   = addExp(u, 100);
      await SaveDataBase();

      let msg = `✅ *${name}* redeemed successfully!\n\n🎫 Code      : ${code}\n💰 Credited  : +$${fmt(res.amount)}\n💵 Wallet    : $${fmt(u.wallet)}\n✨ EXP       : +100\n👥 Remaining : ${res.remaining} claim(s) left`;
      if (lu) msg += `\n\n🎉 *LEVEL UP!* ${name} is now Level *${u.level}*!`;

      reply(UI('🎉 REDEMPTION SUCCESS', msg.trim()));
    }
  },

  // 👤 PROFILE / .me
  {
    command:     ['profile'],
    alias:       ['me', 'userprofile'],
    category:    'economy',
    description: 'View your economy profile card',
    execute: async (m, { ednut, reply }) => {
      const target = m.quoted?.sender || m.mentionedJid?.[0] || m.sender;
      const u      = getUser(target);
      const isMe   = target === m.sender;
      const name   = isMe
        ? (m.pushName || numTag(target))
        : await getName(target, null, ednut, m.chat);

      const all     = Object.entries(global.db.users || {})
        .map(([j, d]) => ({ j, t: (d.balance||0)+(d.bank||0) }))
        .sort((a, b) => b.t - a.t);
      const rankIdx = all.findIndex(x => x.j === target);
      const rank    = rankIdx === -1 ? all.length + 1 : rankIdx + 1;
      const medal   = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      const tick    = rank <= 3 ? ' 🔵' : '';

      const lvl      = u.level || 1;
      const pct      = Math.max(0, Math.min((u.exp || 0) / (lvl * 1000), 1));
      const filled   = Math.round(pct * 10);
      const bar      = '█'.repeat(filled) + '░'.repeat(10 - filled);
      const xpPct    = Math.round(pct * 100);
      const invCount = Object.values(u.inventory || {}).reduce((s, v) => s + (Number(v) || 0), 0);
      const net      = (u.balance || 0) + (u.bank || 0);

      const card =
        `╭─❏〘 👤 ${name}'s PROFILE${tick} 〙━❒\n\n` +
        ` 🏆 Rank       : ${medal}\n` +
        ` 🏅 Level      : ${lvl}\n` +
        ` ✨ EXP        : [${bar}] ${xpPct}%\n` +
        `               ${fmt(u.exp)} / ${fmt(lvl * 1000)}\n\n` +
        ` 💼 Job        : ${u.job || 'Unemployed'}\n` +
        ` 🎒 Items      : ${invCount} item(s)\n\n` +
        ` 💵 Wallet     : $${fmt(u.balance)}\n` +
        ` 🏦 Bank       : $${fmt(u.bank)}\n` +
        ` 💎 Gams       : ${fmt(u.gams)}\n` +
        ` 📊 Net        : $${fmt(net)}\n\n` +
        `╰───────────╯`;

      let ppUrl = u.image_url || '';
      if (!ppUrl) {
        try { ppUrl = await ednut.profilePictureUrl(target, 'image'); }
        catch { ppUrl = ''; }
      }

      if (ppUrl) {
        try {
          await ednut.sendMessage(m.chat, { image: { url: ppUrl }, caption: card }, { quoted: m });
          return;
        } catch {}
      }

      // fallback: always works
      try {
        await ednut.sendMessage(m.chat, { text: card }, { quoted: m });
      } catch {
        await reply(card);
      }
    }
  },

  // 🖼️ SET IMAGE URL
  {
    command:     ['setimage'],
    alias:       ['seturl'],
    category:    'economy',
    description: 'Override your profile image URL',
    execute: async (m, { reply, args }) => {
      const link = args[0];
      const name = m.pushName || numTag(m.sender);
      if (!link?.startsWith('http'))
        return reply(UI('❌ ERROR', 'Provide a valid http URL.'));
      getUser(m.sender).image_url = link;
      await SaveDataBase();
      reply(UI('✅ SET', `*${name}*'s profile image URL saved successfully.`));
    }
  }

];

// ================================================================
// 🔐 MONGO GATE (reads lib/mongodb.js) + market upkeep before every command
// ================================================================
module.exports = rawCommands.map(cmd => {
  const orig = cmd.execute;
  cmd.execute = async (m, ctx) => {
    if (!mongoReady())
      return ctx.reply(UI('🚨 SYSTEM LOCK',
        'Economy is locked. Add a Mongo URL in the MONGO_URLS list in lib/mongodb.js first.'));
    rememberName(m);
    try { if (economyTick()) await SaveDataBase(); } catch {}
    try { return await orig(m, ctx); }
    finally { rememberName(m); }
  };
  return cmd;
});
