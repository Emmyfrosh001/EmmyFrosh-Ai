require('../config');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Client } = require('pg');

let DataBase;
const dbUrl = process.env.DATABASE_URL;

if (dbUrl?.startsWith('mongodb')) {
  // ✅ MongoDB Version
  DataBase = class MongoDB {
    constructor(url = dbUrl, options = { useNewUrlParser: true, useUnifiedTopology: true }) {
      this.url = url;
      this.options = options;
      this.data = {};
      this.isMongo = true;
      this.isPostgres = false;
      this.isJson = false;
    }

    async read() {
      await mongoose.connect(this.url, this.options);
      const schema = new mongoose.Schema({ data: Object }, { versionKey: false });
      this._model = mongoose.models.db || mongoose.model('db', schema);
      let record = await this._model.findOne();
      if (!record) record = await new this._model({ data: {} }).save();
      this.data = record;
      return this.data.data || {};
    }

    async write(data) {
      if (!this.data || !this.data._id) return;
      await this._model.findByIdAndUpdate(this.data._id, { data });
    }

    async close() {
      await mongoose.connection?.close();
    }
  };

} else if (dbUrl?.startsWith('postgres')) {
  // ✅ PostgreSQL Version
  DataBase = class PostgresDB {
    constructor(url = dbUrl) {
      this.url = url;
      this.client = new Client({
        connectionString: url,
        ssl: { rejectUnauthorized: false }
      });
      this.connected = false;
      this.table = 'bot_data';
      this.isMongo = false;
      this.isPostgres = true;
      this.isJson = false;
    }

    async connectOnce() {
      if (!this.connected) {
        await this.client.connect();
        this.connected = true;
        await this.client.query(`
          CREATE TABLE IF NOT EXISTS ${this.table} (
            id SERIAL PRIMARY KEY,
            data JSONB
          );
        `);
      }
    }

    async read() {
      await this.connectOnce();
      const res = await this.client.query(`SELECT data FROM ${this.table} ORDER BY id LIMIT 1`);
      if (res.rows.length === 0) {
        await this.client.query(`INSERT INTO ${this.table}(data) VALUES ($1)`, [{}]);
        return {};
      }
      return res.rows[0].data || {};
    }

    async write(data) {
      await this.connectOnce();
      await this.client.query(
        `UPDATE ${this.table} SET data = $1 WHERE id = (SELECT id FROM ${this.table} ORDER BY id LIMIT 1)`,
        [data]
      );
    }

    async close() {
      if (this.connected) {
        await this.client.end();
        this.connected = false;
      }
    }
  };

} else {
  // ✅ JSON Fallback (crash-safe: survives empty/corrupt files)
  DataBase = class JsonDB {
    constructor() {
      this.file = path.join(process.cwd(), 'all/database/database.json');
      this.tmp = this.file + '.tmp';
      this.bak = this.file + '.bak';
      this.data = {};
      this.isMongo = false;
      this.isPostgres = false;
      this.isJson = true;
    }

    _tryParse(file) {
      try {
        if (!fs.existsSync(file)) return null;
        const raw = fs.readFileSync(file, 'utf8');
        if (!raw || !raw.trim()) return null; // empty file
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    }

    async read() {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });

      // 1) main file  2) backup  3) fresh empty db
      let data = this._tryParse(this.file);

      if (!data) {
        const fromBak = this._tryParse(this.bak);
        if (fromBak) {
          console.warn('[DB] database.json empty/corrupt - restored from backup');
          data = fromBak;
        } else {
          if (fs.existsSync(this.file)) {
            try { fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`); } catch {}
            console.warn('[DB] database.json empty/corrupt and no backup - starting fresh');
          }
          data = {};
        }
        fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
      }

      this.data = data;
      return this.data;
    }

    async write(data) {
      this.data = data;
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const json = JSON.stringify(this.data, null, 2);

        // keep last good copy before overwriting
        if (fs.existsSync(this.file) && this._tryParse(this.file)) {
          try { fs.copyFileSync(this.file, this.bak); } catch {}
        }

        // atomic write: write temp file then rename, so a crash can't leave a half-written db
        fs.writeFileSync(this.tmp, json);
        fs.renameSync(this.tmp, this.file);
      } catch (e) {
        console.error('[DB] write failed:', e.message);
      }
    }

    async close() {
      // No cleanup needed for local file
    }
  };
}

module.exports = DataBase;
