// lib/message.js
// ================================================================
// 🗄️ DATABASE BRIDGE — Mongoose ↔ global.db
// ================================================================

const {
  connectMongo,
  LoadMongoToMemory,
  SaveMongoFromMemory,
  startAutoSync,
} = require('./mongodb');

let mongoReady   = false;
let mongoLoading = false;

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

async function initMongo() {
  if (mongoReady || mongoLoading) return;
  mongoLoading = true;
  try {
    await connectMongo();
    await LoadMongoToMemory();
    startAutoSync(30000);
    mongoReady = true;
  } catch (err) {
    mongoLoading = false;
    console.error('❌ MongoDB init failed:', err.message);
    ensureDefaults();
  }
}

async function LoadDataBase(ednut, m) {
  ensureDefaults();
  if (!mongoReady) await initMongo();
}

async function SaveDataBase() {
  if (!mongoReady) return;
  await SaveMongoFromMemory();
}

module.exports = { LoadDataBase, SaveDataBase };
