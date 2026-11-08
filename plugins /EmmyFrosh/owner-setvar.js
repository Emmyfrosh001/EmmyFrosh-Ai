const axios = require("axios");

const HEROKU_API_KEY = process.env.HEROKU_API_KEY;
const HEROKU_APP_NAME = process.env.HEROKU_APP_NAME;

async function herokuSetVar(key, value) {
  await axios.patch(`https://api.heroku.com/apps/${HEROKU_APP_NAME}/config-vars`, 
    { [key]: value },
    {
      headers: {
        Authorization: `Bearer ${HEROKU_API_KEY}`,
        Accept: "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
      },
    }
  );
}

async function herokuDelVar(key) {
  await axios.patch(`https://api.heroku.com/apps/${HEROKU_APP_NAME}/config-vars`, 
    { [key]: null },
    {
      headers: {
        Authorization: `Bearer ${HEROKU_API_KEY}`,
        Accept: "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
      },
    }
  );
}

async function herokuGetVars() {
  const res = await axios.get(`https://api.heroku.com/apps/${HEROKU_APP_NAME}/config-vars`, {
    headers: {
      Authorization: `Bearer ${HEROKU_API_KEY}`,
      Accept: "application/vnd.heroku+json; version=3",
    },
  });
  return res.data;
}

module.exports = [
  {
    command: ["setvar"],
    description: "Set environment variable (Heroku only)",
    category: "External",
    owner: true,
    execute: async (m, { text }) => {
      const [key, ...rest] = text.split("=");
      const value = rest.join("=").trim();

      if (!key || !value) return m.reply("Usage: setvar KEY=value");

      if (!HEROKU_API_KEY || !HEROKU_APP_NAME) {
        return m.reply("Heroku API credentials not set.");
      }

      try {
        await herokuSetVar(key.trim(), value);
        m.reply(`Set \`${key.trim()}\` on Heroku.`);
      } catch {
        m.reply("Failed to set variable on Heroku.");
      }
    }
  },
  {
    command: ["getvar"], 
    alias: ["listvar"],
    description: "List environment variables (Heroku only)",
    category: "External",
    owner: true,
    execute: async (m) => {
      if (!HEROKU_API_KEY || !HEROKU_APP_NAME) {
        return m.reply("Heroku API credentials not set.");
      }

      try {
        const vars = await herokuGetVars();
        const out = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n");
        m.reply(out || "No Heroku vars found.");
      } catch {
        m.reply("Failed to get variables from Heroku.");
      }
    }
  },
  {
    command: ["delvar"],
    description: "Delete environment variable (Heroku only)",
    category: "External",
    owner: true,
    execute: async (m, { text }) => {
      const key = text.trim();

      if (!key) return m.reply("Usage: delvar KEY");

      if (!HEROKU_API_KEY || !HEROKU_APP_NAME) {
        return m.reply("Heroku API credentials not set.");
      }

      try {
        await herokuDelVar(key);
        m.reply(`Deleted *${key}* from Heroku.`);
      } catch {
        m.reply("Failed to delete variable from Heroku.");
      }
    }
  }
];