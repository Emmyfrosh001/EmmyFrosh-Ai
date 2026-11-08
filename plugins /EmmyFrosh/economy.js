// plugins/EmmyFrosh/economy.js
// ================================================================
// 💰 COMPLETE ECONOMY SYSTEM — Real names everywhere
// ================================================================

const { SaveDataBase } = require('../../lib/Emmyfrosh');

// ================================================================
// 🎨 UI FORMATTER
// ================================================================
const UI = (title, text = "") => `╭─❏〘 ${title} 〙━❒\n\n${text}\n\n╰───────────╯`;

// ================================================================
// 🔐 COUPON ADMIN CONFIG
// ================================================================
const COUPON_MASTER = '2349160224621';   // only this number
const COUPON_PASS   = '0916';            // fallback proof when WhatsApp gives a @lid

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

// ================================================================
// 💹 ITEM VALUE APPRECIATION
// An item's resale value quietly grows the longer a user holds it.
// Rate scales with the item's shop (buy) price: ~0.025% of buy price
// per 24h, e.g. a $1,000,000 item gains ~$250/day, a $12,000,000 item
// gains ~$3,000/day. Minimum gain is $1/day so cheap items still creep up.
// ================================================================
function dailyGainFor(buyPrice) {
  return Math.max(1, Math.floor(buyPrice * 0.00025));
}

function ensureItemValue(u, key) {
  if (!u.itemValue) u.itemValue = {};
  if (!u.itemValue[key]) {
    const base = SHOP[key] ? (SHOP[key].sell || Math.floor(SHOP[key].buy / 2)) : 0;
    u.itemValue[key] = { value: base, lastGain: Date.now() };
  }
  return u.itemValue[key];
}

// call before reading/using an item's value — applies any missed 24h ticks
function tickItemValue(u, key) {
  const iv  = ensureItemValue(u, key);
  const buy = SHOP[key]?.buy || 0;
  const gain = dailyGainFor(buy);
  const day  = 86400000;
  const now  = Date.now();
  const ticks = Math.floor((now - iv.lastGain) / day);
  if (ticks > 0) {
    iv.value    += ticks * gain;
    iv.lastGain += ticks * day;
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
// 🔐 COUPON ADMIN CHECK (works with @lid)
// Returns { ok, args } — args has the admin password removed if it was used
// ================================================================
async function couponAdminCheck(m, ednut, args) {
  const sender = cleanJid(m.sender);

  // 1) any field that might carry the real phone number
  const candidates = [
    m.sender,
    m.key?.participant,
    m.key?.participantPn,
    m.key?.remoteJidAlt,
    m.key?.participantAlt,
    m.participantPn,
    m.senderPn
  ].filter(Boolean);
  if (candidates.some(j => idDigits(j) === COUPON_MASTER)) return { ok: true, args };

  // 2) already proven before (lid saved)
  if (!global.db.couponAdmins) global.db.couponAdmins = [];
  if (global.db.couponAdmins.includes(sender)) return { ok: true, args };

  // 3) look the sender up in the group participants
  try {
    if (m.isGroup || String(m.chat).endsWith('@g.us')) {
      const meta = await ednut.groupMetadata(m.chat);
      const p = meta.participants.find(x => cleanJid(x.id) === sender || cleanJid(x.lid) === sender);
      if (p) {
        const ids = [p.id, p.lid, p.jid, p.phoneNumber, p.pn].filter(Boolean);
        if (ids.some(j => idDigits(j) === COUPON_MASTER)) {
          global.db.couponAdmins.push(sender);
          await SaveDataBase();
          return { ok: true, args };
        }
      }
    }
  } catch {}

  // 4) password fallback: .gencoupon 0916 <amount> <persons> [pass]
  if (args[0] === COUPON_PASS) {
    global.db.couponAdmins.push(sender);
    await SaveDataBase();
    try { await ednut.sendMessage(m.chat, { delete: m.key }); } catch {}
    return { ok: true, args: args.slice(1) };
  }

  return { ok: false, args };
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
// 🏪 SHOP (30 items)
// ================================================================
const SHOP = {
  bread:          { name:'🍞 Bread',             buy:200,       sell:100 },
  fish:           { name:'🐟 Fish',               buy:300,       sell:150 },
  water:          { name:'💧 Pure Water',         buy:50,        sell:20 },
  coffee:         { name:'☕ Coffee',             buy:500,       sell:250 },
  burger:         { name:'🍔 Burger',             buy:1200,      sell:600 },
  pizza:          { name:'🍕 Pizza',              buy:3000,      sell:1500 },
  fishing_rod:    { name:'🎣 Fishing Rod',        buy:5000,      sell:2500 },
  pickaxe:        { name:'⛏️ Pickaxe',            buy:7500,      sell:3750 },
  laptop:         { name:'💻 Old Laptop',         buy:45000,     sell:20000 },
  iphone:         { name:'📱 iPhone 15',          buy:850000,    sell:450000 },
  motorcycle:     { name:'🏍️ Motorcycle',         buy:600000,    sell:300000 },
  car:            { name:'🚗 Used Sedan',          buy:3500000,   sell:1800000 },
  mansion:        { name:'🏰 Luxury Villa',        buy:85000000,  sell:40000000 },
  iron:           { name:'🔩 Iron Ore',            buy:1000,      sell:500 },
  gold:           { name:'✨ Gold Ingot',          buy:25000,     sell:15000 },
  diamond:        { name:'💎 Diamond',             buy:150000,    sell:90000 },
  watch:          { name:'⌚ Rolex Watch',         buy:5000000,   sell:2500000 },
  ring:           { name:'💍 Diamond Ring',        buy:1200000,   sell:600000 },
  bitcoin:        { name:'🪙 Bitcoin Fragment',    buy:450000,    sell:420000 },
  shield:         { name:'🛡️ Anti-Rob Shield',     buy:15000,     sell:5000 },
  lucky_dice:     { name:'🎲 Lucky Dice Charm',    buy:8000,      sell:3000 },
  laser_drill:    { name:'⚡ Laser Drill Rig',     buy:1250000,   sell:680000 },
  tractor:        { name:'🚜 Heavy Tractor',       buy:5500000,   sell:2900000 },
  server_rack:    { name:'🖥️ Mainframe Server',    buy:8200000,   sell:4500000 },
  chef_station:   { name:'🍳 Pro Kitchen Line',    buy:4000000,   sell:2100000 },
  cargo_truck:    { name:'🚛 18-Wheeler Cargo',    buy:18500000,  sell:9500000 },
  livestock:      { name:'🐄 Premium Livestock',   buy:75000,     sell:40000 },
  gpu_rig:        { name:'⚙️ AI Crypto Miner',     buy:14000000,  sell:8000000 },
  drone:          { name:'🛸 Quad-Copter Drone',   buy:250000,    sell:115000 },
  mic_studio:     { name:'🎙️ Pro Studio Setup',    buy:650000,    sell:310000 },
  super_computer: { name:'🌌 Quantum Station',     buy:195000000, sell:110000000 }
};

// ================================================================
// 🎲 PVP DICE pending challenges
// ================================================================
const diceChallenge = new Map();

// ================================================================
// 🏪 PLAYER MARKET listings — stored in global.db.market: { id: {...} }
// 🤝 F2F pending offers (in-memory, like diceChallenge)
// ================================================================
const f2fTrades = new Map();
const marketTimers = new Map(); // listing id -> timeout handle, for 60s auto-refund

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

  // 🦹 ROB
  {
    command:     ['rob'],
    alias:       ['steal'],
    category:    'economy',
    description: 'Attempt to rob another user',
    execute: async (m, { reply, args, ednut }) => {
      const target = m.quoted?.sender || m.mentionedJid?.[0] ||
        (args[0]?.replace(/\D/g,'') ? args[0].replace(/\D/g,'')+'@s.whatsapp.net' : null);

      if (!target || target === m.sender)
        return reply(UI('❌ ERROR', 'Reply to or mention a user to rob.'));

      const atk  = getUser(m.sender);
      const def  = getUser(target);
      const now  = Date.now();
      const cool = 1200000;

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
        reply(UI('⚔️ ROB SUCCESS', `🦹 Robber  : ${atkName}\n🎯 Victim  : ${defName}\n\n💰 Stolen  : $${fmt(stolen)}\n💵 Wallet  : $${fmt(atk.wallet)}\n✨ EXP     : +100${lu ? `\n\n🎉 LEVEL UP → Level ${atk.level}!` : ''}`));
      } else {
        atk.balance  = Math.max(0, atk.balance - 1000);
        atk.wallet   = atk.balance;
        def.balance += 1000; def.wallet = def.balance;
        addExp(atk, 20);
        await SaveDataBase();
        reply(UI('🚨 CAUGHT!', `${atkName} got caught trying to rob ${defName}!\n\n💸 Fine   : -$1,000\n💵 Wallet : $${fmt(atk.wallet)}\n✨ EXP    : +20`));
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

  // 🏪 SHOP
  {
    command:     ['shop'],
    alias:       ['store'],
    category:    'economy',
    description: 'Browse the item shop',
    execute: async (m, { reply, args }) => {
      const page  = Math.max(1, parseInt(args[0]) || 1);
      const keys  = Object.keys(SHOP);
      const pages = Math.ceil(keys.length / 10);
      const slice = keys.slice((page - 1) * 10, page * 10);
      let txt     = `Page ${page}/${pages} — Use .buy <id> [qty]\n\n`;
      for (const k of slice)
        txt += `• \`${k}\` — ${SHOP[k].name}\n  💰 Buy: $${fmt(SHOP[k].buy)}\n\n`;
      txt += `Next page: .shop ${Math.min(page + 1, pages)}`;
      reply(UI('🏪 SHOP', txt.trim()));
    }
  },

  // 🛒 BUY
  {
    command:     ['buy'],
    alias:       ['purchase', 'order'],
    category:    'economy',
    description: 'Buy an item from the shop',
    execute: async (m, { reply, args }) => {
      const k    = args[0]?.toLowerCase();
      const qty  = Math.max(1, parseInt(args[1]) || 1);
      const name = m.pushName || numTag(m.sender);
      if (!k || !SHOP[k])
        return reply(UI('❌ ERROR', 'Invalid item. Use .shop to browse.'));
      const u    = getUser(m.sender);
      const cost = SHOP[k].buy * qty;
      if (u.balance < cost)
        return reply(UI('❌ INSUFFICIENT', `${name} needs $${fmt(cost)}, you have $${fmt(u.balance)}`));
      u.balance -= cost; u.wallet = u.balance;
      u.inventory[k] = (u.inventory[k] || 0) + qty;
      ensureItemValue(u, k);           // start value-appreciation tracking on first purchase
      addExp(u, 40 * qty);
      await SaveDataBase();
      reply(UI('✅ PURCHASED', `👤 Buyer       : ${name}\n🛒 Item        : ${SHOP[k].name} x${qty}\n💲 Unit Price  : $${fmt(SHOP[k].buy)}\n💸 Total Cost  : $${fmt(cost)}\n💵 Wallet      : $${fmt(u.wallet)}`));
    }
  },

  // 💹 SELL
  // .sell <item> <qty>          → instant sell at current appreciated value, 15% tax
  // .sell <item> <qty> <price>  → list on the player market for others to buy, no tax
  {
    command:     ['sell'],
    alias:       ['sellitem'],
    category:    'economy',
    description: 'Sell items instantly (small tax) or list them on the player market',
    execute: async (m, { reply, args, ednut }) => {
      const k    = args[0]?.toLowerCase();
      const qty  = Math.max(1, parseInt(args[1]) || 1);
      const u    = getUser(m.sender);
      const name = m.pushName || numTag(m.sender);

      if (!k || !SHOP[k])
        return reply(UI('❌ ERROR', 'Invalid item. Use .shop to browse.\n\nUsage:\n.sell <item> <qty>          — sell instantly (15% tax)\n.sell <item> <qty> <price>  — list on the market'));
      if ((u.inventory[k] || 0) < qty)
        return reply(UI('❌ ERROR', `You don't have ${qty} ${SHOP[k].name} to sell.`));

      // ── LIST ON MARKET (price given) ──────────────────────────────
      if (args[2]) {
        const price = parseAmount(args[2]);
        if (!price || price <= 0 || isNaN(price))
          return reply(UI('❌ ERROR', 'Invalid asking price.\n\nUsage: .sell <item> <qty> <price>'));

        u.inventory[k] -= qty;
        await SaveDataBase();

        if (!global.db.market) global.db.market = {};
        const id = 'LST-' + Math.random().toString(36).substring(2, 6).toUpperCase() +
                   '-'   + Math.random().toString(36).substring(2, 6).toUpperCase();
        global.db.market[id] = {
          seller: m.sender, sellerName: name, item: k, qty, price, createdAt: Date.now()
        };
        await SaveDataBase();

        // auto-refund: if nobody buys within 60s, give the item back to the seller
        const timer = setTimeout(async () => {
          marketTimers.delete(id);
          const lst = global.db.market?.[id];
          if (!lst) return; // already sold / removed
          delete global.db.market[id];
          const sellerU = getUser(lst.seller);
          sellerU.inventory[lst.item] = (sellerU.inventory[lst.item] || 0) + lst.qty;
          await SaveDataBase();
          try {
            await ednut.sendMessage(m.chat, {
              text: UI('⏰ LISTING EXPIRED', `*${lst.sellerName}*'s listing timed out with no buyer.\n\n📦 ${SHOP[lst.item]?.name || lst.item} x${lst.qty} refunded back to inventory.`),
              mentions: [lst.seller]
            });
          } catch {}
        }, 60000);
        marketTimers.set(id, timer);

        return reply(UI('🏪 LISTED ON MARKET', `👤 Seller    : ${name}\n📦 Item      : ${SHOP[k].name} x${qty}\n💰 Asking    : $${fmt(price)}\n🆔 ID        : ${id}\n\n⏳ Expires in 60s if nobody buys — item refunded automatically.\nView listings with .market\nAnyone can buy it with:\n.buylisting ${id}`));
      }

      // ── INSTANT SELL (no price given) ─────────────────────────────
      const iv     = tickItemValue(u, k);   // apply any missed daily appreciation first
      const gross  = iv.value * qty;
      const tax    = Math.floor(gross * 0.15);
      const payout = gross - tax;

      u.inventory[k] -= qty;
      u.balance      += payout; u.wallet = u.balance;
      addExp(u, 20 * qty);
      await SaveDataBase();

      reply(UI('✅ SOLD (INSTANT)', `👤 Seller      : ${name}\n📦 Item        : ${SHOP[k].name} x${qty}\n💵 Value       : $${fmt(gross)}\n🏛️ Tax (15%)   : -$${fmt(tax)}\n💰 You Got     : $${fmt(payout)}\n💰 Wallet      : $${fmt(u.wallet)}`));
    }
  },

  // 🏪 MARKET — browse open player listings
  {
    command:     ['market'],
    alias:       ['listings', 'p2p'],
    category:    'economy',
    description: 'View items other players have listed for sale',
    execute: async (m, { reply }) => {
      const entries = Object.entries(global.db.market || {});
      if (!entries.length)
        return reply(UI('🏪 MARKET', 'No listings yet.\n\nList an item with:\n.sell <item> <qty> <price>'));

      let msg = '';
      for (const [id, l] of entries.slice(0, 15)) {
        const leftMs = Math.max(0, 60000 - (Date.now() - l.createdAt));
        msg += `🆔 ${id}\n📦 ${SHOP[l.item]?.name || l.item} x${l.qty}\n💰 $${fmt(l.price)} — by ${l.sellerName}\n⏳ ${Math.ceil(leftMs / 1000)}s left\n\n`;
      }

      reply(UI('🏪 MARKET', msg.trim() + '\n\nBuy with: .buylisting <ID>'));
    }
  },

  // 🛒 BUYLISTING — buy a player's market listing
  {
    command:     ['buylisting'],
    alias:       ['marketbuy'],
    category:    'economy',
    description: "Buy another player's market listing by ID",
    execute: async (m, { reply, args }) => {
      const id = args[0]?.toUpperCase();
      if (!id || !global.db.market?.[id])
        return reply(UI('❌ ERROR', 'Listing not found. Use .market to view open listings.'));

      const listing = global.db.market[id];
      if (listing.seller === m.sender)
        return reply(UI('❌ ERROR', 'You cannot buy your own listing.'));

      const buyer = getUser(m.sender);
      if (buyer.balance < listing.price)
        return reply(UI('❌ INSUFFICIENT', `You need $${fmt(listing.price)} but have $${fmt(buyer.balance)}.`));

      const seller = getUser(listing.seller);

      buyer.balance -= listing.price; buyer.wallet = buyer.balance;
      seller.balance += listing.price; seller.wallet = seller.balance;
      buyer.inventory[listing.item] = (buyer.inventory[listing.item] || 0) + listing.qty;

      // hand over appreciation tracking if the buyer never held this item before
      if (!buyer.itemValue) buyer.itemValue = {};
      if (!buyer.itemValue[listing.item]) {
        const sellerIv = seller.itemValue?.[listing.item];
        buyer.itemValue[listing.item] = sellerIv ? { ...sellerIv } : ensureItemValue(buyer, listing.item);
      }

      if (marketTimers.has(id)) { clearTimeout(marketTimers.get(id)); marketTimers.delete(id); }
      delete global.db.market[id];
      await SaveDataBase();

      reply(UI('✅ PURCHASED FROM MARKET', `🆔 Listing : ${id}\n📦 Item    : ${SHOP[listing.item]?.name || listing.item} x${listing.qty}\n💸 Paid    : $${fmt(listing.price)}\n👤 Seller  : ${listing.sellerName}\n💵 Wallet  : $${fmt(buyer.wallet)}`));
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
      const items  = Object.entries(u.inventory || {}).filter(([_, q]) => q > 0);
      if (!items.length)
        return reply(UI('🎒 INVENTORY', `${name}'s bag is empty.\nUse .buy to get items.`));
      let msg = `${name}'s Inventory:\n\n`;
      for (const [k, q] of items) {
        const iv = tickItemValue(u, k);
        msg += `• ${SHOP[k]?.name || k} x${q}\n   💰 Worth $${fmt(iv.value)} each ($${fmt(iv.value * q)} total)\n`;
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
      const qty = Math.max(1, parseInt(args[1]) || 1);
      if (!k || !SHOP[k])
        return reply(UI('❌ ERROR', 'Invalid item. Use .shop to browse.'));

      const s = getUser(m.sender);
      if ((s.inventory[k] || 0) < qty)
        return reply(UI('❌ ERROR', `You don't have ${qty} ${SHOP[k].name}.`));

      const r = getUser(target);
      s.inventory[k] -= qty;
      r.inventory[k]  = (r.inventory[k] || 0) + qty;

      // hand over value tracking if the receiver never held this item before
      if (!r.itemValue) r.itemValue = {};
      if (!r.itemValue[k] && s.itemValue?.[k]) r.itemValue[k] = { ...s.itemValue[k] };

      await SaveDataBase();

      const senderName = m.pushName || numTag(m.sender);
      const targetName = await getName(target, null, ednut, m.chat);
      reply(UI('📦 ITEM SENT', `📤 From : ${senderName}\n📥 To   : ${targetName}\n🎁 Item : ${SHOP[k].name} x${qty}`));
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

        if (!buyer.itemValue) buyer.itemValue = {};
        if (!buyer.itemValue[t.item] && seller.itemValue?.[t.item])
          buyer.itemValue[t.item] = { ...seller.itemValue[t.item] };

        await SaveDataBase();

        return ednut.sendMessage(m.chat, {
          text: UI('✅ F2F DEAL COMPLETE', `📦 Item   : ${SHOP[t.item]?.name || t.item} x${t.qty}\n💰 Paid   : $${fmt(t.price)}\n👤 Seller : ${t.sellerName}\n👤 Buyer  : ${t.buyerName}`),
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
      const qty   = Math.max(1, parseInt(args[1]) || 1);
      const price = parseAmount(args[2]);

      if (!k || !SHOP[k])
        return reply(UI('❌ ERROR', 'Invalid item. Use .shop to browse.'));
      if (!price || price <= 0 || isNaN(price))
        return reply(UI('❌ ERROR', 'Invalid price.\n\nUsage: .f2f <item> <qty> <price> @buyer'));

      const seller = getUser(m.sender);
      if ((seller.inventory[k] || 0) < qty)
        return reply(UI('❌ ERROR', `You don't have ${qty} ${SHOP[k].name}.`));

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
        text: UI('🤝 F2F OFFER', `*${sellerName}* wants to sell *${buyerName}*:\n📦 ${SHOP[k].name} x${qty}\n💰 Price : $${fmt(price)}\n\n*${buyerName}*, type *.f2f accept* within 60 seconds!`),
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

  // ⛏️ MINE  (fixed: args was missing from the destructure)
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

  // 🎟️ GEN COUPON  (fixed: works with @lid — number lookup, saved-lid, or password 0916)
  {
    command:     ['gencoupon'],
    alias:       ['makecoupon', 'createcoupon'],
    category:    'economy',
    description: 'Generate a redeemable coupon voucher (admin only)',
    execute: async (m, { reply, args, ednut }) => {

      const auth = await couponAdminCheck(m, ednut, args);
      if (!auth.ok)
        return reply(UI('🚫 ACCESS DENIED', `❌ You are not authorized to use this command.\n\nThis feature is restricted to the bot administrator only.`));

      const a         = auth.args;
      const amount    = parseAmount(a[0]);
      const maxClaims = parseInt(a[1]) || 1;
      const name      = m.pushName || numTag(m.sender);

      if (!amount || amount <= 0 || isNaN(amount))
        return reply(UI('🎟️ GENCOUPON', `❌ Invalid amount.\n\n📌 Usage:\n.gencoupon <amount> <total_persons>\n\nExamples:\n.gencoupon 5000 1\n.gencoupon 10m 5\n.gencoupon 500k 10`));

      const seg = () => Math.random().toString(36).substring(2, 6).toUpperCase().padEnd(4, 'X');
      const code = `CPN-${seg()}-${seg()}-${seg()}`;

      if (!global.db.coupons) global.db.coupons = {};
      global.db.coupons[code] = {
        amount,
        maxClaims,
        claims:    0,
        claimedBy: [],
        createdAt: Date.now(),
        createdBy: m.sender
      };

      await SaveDataBase();

      await reply(UI('🎟️ COUPON CREATED', `✅ Voucher minted by *${name}*!\n\n🎫 Code          : ${code}\n💰 Value         : $${fmt(amount)}\n👥 Total Persons : ${maxClaims} person(s)\n📅 Created       : ${new Date().toLocaleString()}\n\nRedeem with:\n.redeemcoupon ${code}`));

      // plain-text code only (copy-friendly, not styled)
      try { await ednut.sendMessage(m.chat, { text: code }); } catch {}
    }
  },

  // 🎟️ REDEEM COUPON
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

      if (!global.db.coupons || !global.db.coupons[code])
        return reply(UI('❌ INVALID CODE', `The code *${code}* does not exist.\n\n• Check for typos\n• The code may have expired`));

      const coupon = global.db.coupons[code];

      if (coupon.claims >= coupon.maxClaims)
        return reply(UI('❌ FULLY CLAIMED', `This coupon has already been claimed by ${coupon.maxClaims} person(s).\n\nMaximum redemptions reached.`));

      if (coupon.claimedBy.includes(m.sender))
        return reply(UI('❌ ALREADY CLAIMED', `${name} has already redeemed this coupon.\n\nEach person can only claim once.`));

      const u        = getUser(m.sender);
      u.balance     += coupon.amount;
      u.wallet       = u.balance;
      coupon.claims += 1;
      coupon.claimedBy.push(m.sender);

      const lu = addExp(u, 100);
      await SaveDataBase();

      const remaining = coupon.maxClaims - coupon.claims;
      let msg = `✅ *${name}* redeemed successfully!\n\n🎫 Code      : ${code}\n💰 Credited  : +$${fmt(coupon.amount)}\n💵 Wallet    : $${fmt(u.wallet)}\n✨ EXP       : +100\n👥 Remaining : ${remaining} claim(s) left`;

      if (lu) msg += `\n\n🎉 *LEVEL UP!* ${name} is now Level *${u.level}*!`;

      reply(UI('🎉 REDEMPTION SUCCESS', msg.trim()));
    }
  },

  // 👤 PROFILE / .me  (fixed: safe image send with text fallback, no lid mentions)
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
// 🔐 MONGO GATE
// ================================================================
module.exports = rawCommands.map(cmd => {
  const orig = cmd.execute;
  cmd.execute = async (m, ctx) => {
    const bypass = ['gencoupon','redeemcoupon','aviator','sporty']
      .some(c => cmd.command.includes(c));
    if (!bypass && (!process.env.MONGO_URI || !process.env.MONGO_URI.trim()))
      return ctx.reply(UI('🚨 SYSTEM LOCK',
        'Economy is locked. Set MONGO_URI in your .env file first.'));
    rememberName(m);
    try { return await orig(m, ctx); }
    finally { rememberName(m); }
  };
  return cmd;
});