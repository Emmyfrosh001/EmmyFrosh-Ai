// lib/mongodb.js
// ================================================================
// 🗄️ MONGODB PERSISTENT DATABASE LAYER — uses Mongoose (already installed)
// ================================================================

const mongoose = require('mongoose');

// ================================================================
// 📋 SCHEMAS
// ================================================================

const userSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  data:      { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Number, default: Date.now }
});

const groupSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  data:      { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Number, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  data:      { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Number, default: Date.now }
});

const listSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  values:    { type: mongoose.Schema.Types.Mixed, default: [] },
  updatedAt: { type: Number, default: Date.now }
});

const stickerSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  data:      { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Number, default: Date.now }
});

const afkSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  data:      { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Number, default: Date.now }
});

const filterSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  trigger:   { type: String },
  response:  { type: String },
  type:      { type: String, enum: ['private', 'group'] },
  updatedAt: { type: Number, default: Date.now }
});

// ================================================================
// 📦 MODELS — safe re-use if already compiled
// ================================================================

const User     = mongoose.models.User     || mongoose.model('User',     userSchema);
const Group    = mongoose.models.Group    || mongoose.model('Group',    groupSchema);
const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
const List     = mongoose.models.List     || mongoose.model('List',     listSchema);
const Sticker  = mongoose.models.Sticker  || mongoose.model('Sticker',  stickerSchema);
const Afk      = mongoose.models.Afk      || mongoose.model('Afk',      afkSchema);
const Filter   = mongoose.models.Filter   || mongoose.model('Filter',   filterSchema);

// ================================================================
// 🔌 CONNECT
// ================================================================

let isConnected = false;

async function connectMongo() {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set in your .env file!');

  await mongoose.connect(uri, {
    dbName:                   process.env.MONGO_DB || 'emmyfrosh_bot',
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS:          45000,
  });

  isConnected = true;
  console.log('✅ MongoDB connected:', mongoose.connection.name);
}

// ================================================================
// 🔄 LOAD ALL DATA INTO global.db
// ================================================================

async function LoadMongoToMemory() {
  if (!global.db) global.db = {};

  // Users — { jid: { balance, bank, xp, ... } }
  const users = await User.find({}).lean();
  global.db.users = global.db.users || {};
  for (const doc of users) {
    global.db.users[doc.id] = doc.data || {};
  }

  // Groups — { jid: { antilink, antibadword, warns, ... } }
  const groups = await Group.find({}).lean();
  global.db.groups = global.db.groups || {};
  for (const doc of groups) {
    global.db.groups[doc.id] = doc.data || {};
  }

  // Settings — chatbot, mentionReact, mode, autoread, etc.
  const settings = await Settings.findOne({ id: 'global' }).lean();
  if (settings?.data) {
    global.db.settings = { ...global.db.settings, ...settings.data };
  }

  // Lists
  const mods = await List.findOne({ id: 'setmod' }).lean();
  if (mods?.values) global.db.setmod = mods.values;

  const sudos = await List.findOne({ id: 'setsudo' }).lean();
  if (sudos?.values) global.db.setsudo = sudos.values;

  const disabled = await List.findOne({ id: 'disabled' }).lean();
  if (disabled?.values) global.db.disabled = disabled.values;

  const ban = await List.findOne({ id: 'ban' }).lean();
  if (ban?.values) global.db.ban = ban.values;

  const gcban = await List.findOne({ id: 'gcban' }).lean();
  if (gcban?.values) global.db.gcban = gcban.values;

  // Sticker command map — { hash: { text, mentionedJid } }
  const stickers = await Sticker.find({}).lean();
  global.db.sticker = global.db.sticker || {};
  for (const doc of stickers) {
    global.db.sticker[doc.id] = doc.data || {};
  }

  // AFK is NOT stored in MongoDB any more: it lives in memory only, so after a restart
  // nobody is AFK. (Nothing is loaded from the old AFK collection.)
  global.db.afk = {};

  // Filters
  const filters = await Filter.find({}).lean();
  global.db.pfilters = global.db.pfilters || {};
  global.db.gfilters = global.db.gfilters || {};
  for (const doc of filters) {
    if (doc.type === 'private') global.db.pfilters[doc.trigger] = doc.response;
    if (doc.type === 'group')   global.db.gfilters[doc.trigger] = doc.response;
  }

  console.log('✅ global.db loaded from MongoDB');
}

// ================================================================
// 💾 SAVE global.db BACK TO MONGODB
// ================================================================

async function SaveMongoFromMemory() {
  if (!isConnected) return;

  try {
    const ops = [];

    // Users
    for (const [id, data] of Object.entries(global.db.users || {})) {
      ops.push(
        User.updateOne(
          { id },
          { $set: { id, data, updatedAt: Date.now() } },
          { upsert: true }
        )
      );
    }

    // Groups
    for (const [id, data] of Object.entries(global.db.groups || {})) {
      ops.push(
        Group.updateOne(
          { id },
          { $set: { id, data, updatedAt: Date.now() } },
          { upsert: true }
        )
      );
    }

    // Settings
    if (global.db.settings) {
      ops.push(
        Settings.updateOne(
          { id: 'global' },
          { $set: { id: 'global', data: global.db.settings, updatedAt: Date.now() } },
          { upsert: true }
        )
      );
    }

    // Lists
    for (const key of ['setmod', 'setsudo', 'disabled', 'ban', 'gcban']) {
      if (Array.isArray(global.db[key])) {
        ops.push(
          List.updateOne(
            { id: key },
            { $set: { id: key, values: global.db[key], updatedAt: Date.now() } },
            { upsert: true }
          )
        );
      }
    }

    // Stickers
    for (const [id, data] of Object.entries(global.db.sticker || {})) {
      ops.push(
        Sticker.updateOne(
          { id },
          { $set: { id, data, updatedAt: Date.now() } },
          { upsert: true }
        )
      );
    }

    // AFK: intentionally not saved to MongoDB (memory only)

    // Private filters
    for (const [trigger, response] of Object.entries(global.db.pfilters || {})) {
      ops.push(
        Filter.updateOne(
          { id: `p_${trigger}` },
          { $set: { id: `p_${trigger}`, trigger, response, type: 'private', updatedAt: Date.now() } },
          { upsert: true }
        )
      );
    }

    // Group filters
    for (const [trigger, response] of Object.entries(global.db.gfilters || {})) {
      ops.push(
        Filter.updateOne(
          { id: `g_${trigger}` },
          { $set: { id: `g_${trigger}`, trigger, response, type: 'group', updatedAt: Date.now() } },
          { upsert: true }
        )
      );
    }

    await Promise.all(ops);
  } catch (err) {
    console.error('❌ MongoDB sync error:', err.message);
  }
}

// ================================================================
// ⏰ AUTO-SYNC every N milliseconds
// ================================================================

function startAutoSync(intervalMs = 30000) {
  setInterval(async () => {
    await SaveMongoFromMemory();
  }, intervalMs);
  console.log(`🔄 MongoDB auto-sync started (every ${intervalMs / 1000}s)`);
}

module.exports = {
  connectMongo,
  LoadMongoToMemory,
  SaveMongoFromMemory,
  startAutoSync,
};
