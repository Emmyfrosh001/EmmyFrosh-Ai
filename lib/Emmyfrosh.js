// lib/Emmyfrosh.js
// ================================================================
// by Elijah (EmmyFrosh) 
// nub: 2349160224621
// ================================================================

const {
  connectMongo,
  LoadMongoToMemory,
  SaveMongoFromMemory,
} = require('./mongodb');

let mongoose = null;
try { mongoose = require('mongoose'); } catch {}

let mongoReady   = false;
let mongoLoading = false;
let uris         = [];     // deduped list of all URLs
let activeIdx    = 0;      // index in `uris` that receives writes
let failover     = null;   // promise while a switch is running
let syncTimer    = null;

function ensureDefaults() {
  if (!global.db)                         global.db          = {};
  if (!global.db.users)                   global.db.users    = {};
  if (!global.db.groups)                  global.db.groups   = {};
  if (!global.db.settings)               global.db.settings = {};
  if (!Array.isArray(global.db.setmod))  global.db.setmod   = [];
  if (!Array.isArray(global.db.setsudo)) global.db.setsudo  = [];
  if (!global.db.sticker)                global.db.sticker  = {};
  if (!global.db.afk)                    global.db.afk      = {};
  if (!Array.isArray(global.db.disabled))global.db.disabled = [];
  if (!Array.isArray(global.db.ban))     global.db.ban      = [];
  if (!Array.isArray(global.db.gcban))   global.db.gcban    = [];
  if (!global.db.pfilters)               global.db.pfilters = {};
  if (!global.db.gfilters)               global.db.gfilters = {};
}

// ----------------------------------------------------------------
// helpers
// ----------------------------------------------------------------
const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// merge two data snapshots — values from `incoming` win, arrays are unioned
function deepMerge(base, incoming) {
  if (Array.isArray(base) && Array.isArray(incoming)) {
    const seen = new Set();
    const out  = [];
    for (const v of [...base, ...incoming]) {
      const k = typeof v === 'object' ? JSON.stringify(v) : v;
      if (!seen.has(k)) { seen.add(k); out.push(v); }
    }
    return out;
  }
  if (isObj(base) && isObj(incoming)) {
    const out = { ...base };
    for (const k of Object.keys(incoming))
      out[k] = k in base ? deepMerge(base[k], incoming[k]) : incoming[k];
    return out;
  }
  return incoming === undefined ? base : incoming;
}

// does this error mean the database is out of space?
function isFull(e) {
  if (!e) return false;
  if (e.code === 8000 || e.codeName === 'AtlasError') return true;
  return /space quota|over your .*quota|quota|no space left|disk full|storage limit/i
    .test(String(e.message || ''));
}

function getUris() {
  return [...new Set(
    [...(global.MONGO_URIS || []), process.env.MONGO_URI]
      .map(u => String(u || '').trim())
      .filter(Boolean)
  )];
}

async function connectSlot(uri) {
  process.env.MONGO_URI = uri;
  try { if (mongoose) await mongoose.disconnect(); } catch {}
  await connectMongo();
}

// ----------------------------------------------------------------
// startup: load + merge every database, then pick the active one
// ----------------------------------------------------------------
async function initMongo() {
  if (mongoReady || mongoLoading) return;
  mongoLoading = true;

  uris = getUris();
  if (!uris.length) {
    console.error('❌ MongoDB init failed: no URL set');
    mongoLoading = false;
    ensureDefaults();
    return;
  }

  let merged    = null;
  const working = [];   // indexes that connected

  for (let i = 0; i < uris.length; i++) {
    try {
      await connectSlot(uris[i]);
      await LoadMongoToMemory();
      merged = merged ? deepMerge(merged, clone(global.db)) : clone(global.db);
      working.push(i);
      console.log(`✅ MongoDB URL ${i + 1} of ${uris.length} loaded`);
    } catch (err) {
      console.error(`❌ MongoDB URL ${i + 1} failed:`, err.message);
    }
  }

  if (!working.length) {
    mongoLoading = false;      // allow a retry on the next message
    ensureDefaults();
    return;
  }

  // put the merged data back into global.db (same object, so references stay valid)
  if (!global.db) global.db = {};
  for (const k of Object.keys(global.db)) delete global.db[k];
  Object.assign(global.db, merged);
  ensureDefaults();

  // active database = the one remembered in settings, if it is reachable
  const wanted = (Number(global.db.settings.mongoActiveSlot) || 1) - 1;
  activeIdx    = working.includes(wanted) ? wanted : working[0];

  try {
    await connectSlot(uris[activeIdx]);
  } catch (err) {
    console.error('❌ Could not connect to the active database:', err.message);
    mongoLoading = false;
    return;
  }

  global.db.settings.mongoActiveSlot = activeIdx + 1;
  mongoReady = true;
  console.log(`🗄️ Writing to MongoDB URL ${activeIdx + 1}`);

  // our own auto-sync so a "database full" error is always caught
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    SaveDataBase().catch(e => console.error('❌ Auto-sync failed:', e.message));
  }, 30000);
  if (syncTimer.unref) syncTimer.unref();
}

// ----------------------------------------------------------------
// failover: current database is full → move to the next URL
// ----------------------------------------------------------------
function switchToNext() {
  if (failover) return failover;

  failover = (async () => {
    const from = activeIdx;
    console.error(`⚠️ MongoDB URL ${from + 1} is full — switching to the next one`);

    for (let i = from + 1; i < uris.length; i++) {
      try {
        await connectSlot(uris[i]);
        global.db.settings.mongoActiveSlot = i + 1;
        await SaveMongoFromMemory();           // writes ALL current data to the new database
        activeIdx = i;
        console.log(`✅ Now writing to MongoDB URL ${i + 1} — continued from URL ${from + 1}`);
        return true;
      } catch (err) {
        global.db.settings.mongoActiveSlot = from + 1;
        console.error(`❌ MongoDB URL ${i + 1} unusable:`, err.message);
      }
    }

    // nothing else available — reconnect to the old one so reads keep working
    try { await connectSlot(uris[from]); } catch {}
    console.error('🚨 All MongoDB databases are full or unreachable. Add another URL in economy.js.');
    return false;
  })().finally(() => { failover = null; });

  return failover;
}

// ----------------------------------------------------------------
// public API
// ----------------------------------------------------------------
async function LoadDataBase(ednut, m) {
  ensureDefaults();
  if (!mongoReady) await initMongo();
}

async function SaveDataBase() {
  if (!mongoReady) return;
  if (failover) await failover;          // wait if a switch is in progress

  try {
    await SaveMongoFromMemory();
  } catch (err) {
    if (!isFull(err)) throw err;
    await switchToNext();
  }
}

module.exports = { LoadDataBase, SaveDataBase };
