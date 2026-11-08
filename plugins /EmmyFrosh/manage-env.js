const fs = require("fs");

const path = require("path");

// ========================================

// UPDATE .ENV + LIVE PROCESS ENV

// ========================================

function updateEnv(key, value) {

  const envPath = path.resolve(__dirname, "../../.env");

  let envFile = fs.readFileSync(envPath, "utf8");

  // Replace existing key

  if (new RegExp(`^${key}=`, "m").test(envFile)) {

    envFile = envFile.replace(

      new RegExp(`^${key}=.*`, "m"),

      `${key}=${value}`

    );

  } else {

    // Add new key

    envFile += `\n${key}=${value}`;

  }

  fs.writeFileSync(envPath, envFile);

  // Update live process env

  process.env[key] = value;

  // ========================================

  // LIVE PREFIX SYNC

  // ========================================

  if (key === "PREFIX") {

    global.prefix =

      !value ||

      value.toLowerCase() === "null" ||

      value.toLowerCase() === "undefined"

        ? ""

        : value;

  }

}

// ========================================

// ALLOWED ENVIRONMENT KEYS

// ========================================

const allowedKeysInfo = {

  OWNER_NUMBER:

    "Your WhatsApp number in international format",

  BOT_NAME:

    "The bot display name",

  OWNER_NAME:

    "Owner display name",

  PACK_NAME:

    "Sticker pack name",

  PREFIX:

    "Command prefix OR null for NO PREFIX MODE",

  WARN:

    "Maximum warning limit",

};

const allowedKeys = Object.keys(allowedKeysInfo);

// ========================================

// PREFIX INITIALIZER

// ========================================

global.prefix =

  !process.env.PREFIX ||

  process.env.PREFIX.toLowerCase() === "null" ||

  process.env.PREFIX.toLowerCase() === "undefined"

    ? ""

    : process.env.PREFIX;

// ========================================

// EXPORT COMMANDS

// ========================================

module.exports = [

  {

    command: ["setenv"],

    alias: ["updateenv"],

    description: "Update bot settings",

    category: "EnvManager",

    use: "<key> <value>",

    filename: __filename,

    async execute(m, { q, reply, isOwner }) {

      // OWNER ONLY

      if (!isOwner) {

        return reply(

          "❌ Only the bot owner can use this command."

        );

      }

      // NO QUERY

      if (!q) {

        let usageText =

`❌ Usage: setenv <key> <value>

Allowed keys:

`;

        allowedKeys.forEach((k) => {

          usageText += `• ${k}: ${allowedKeysInfo[k]}\n`;

        });

        usageText +=

`\nExample:

.setenv BOT_NAME EmmyFrosh`;

        return reply(usageText);

      }

      // SPLIT INPUT

      const [key, ...rest] = q.split(" ");

      const value = rest.join(" ").trim();

      const keyUpper = key.toUpperCase();

      // INVALID INPUT

      if (!keyUpper || !value) {

        return reply(

          "❌ Usage: setenv <key> <value>"

        );

      }

      // INVALID KEY

      if (!allowedKeys.includes(keyUpper)) {

        return reply(

`❌ Key not allowed.

Allowed keys:

${allowedKeys.join(", ")}`

        );

      }

      // ========================================

      // PREFIX HANDLING

      // ========================================

      if (keyUpper === "PREFIX") {

        // NO PREFIX MODE

        if (

          !value ||

          value.toLowerCase() === "null"

        ) {

          global.prefix = "";

          updateEnv("PREFIX", "null");

          return reply(

`✅ NO PREFIX MODE ENABLED

Now use commands like:

ping

menu

alive`

          );

        }

        // ACCEPT ANY PREFIX

        global.prefix = value;

        updateEnv("PREFIX", value);

        return reply(

          `✅ PREFIX UPDATED TO → ${value}`

        );

      }

      // UPDATE OTHER ENV VALUES

      updateEnv(keyUpper, value);

      return reply(

        `✅ ${keyUpper} updated to:\n${value}`

      );

    },

  },

  {

    command: ["getenv"],

    alias: ["envinfo", "showenv"],

    description: "Show current bot settings",

    category: "EnvManager",

    filename: __filename,

    async execute(m, { reply }) {

      const prefixStatus =

        !global.prefix || global.prefix === ""

          ? "NO PREFIX MODE"

          : global.prefix;

      const info = `

🌍 *Environment Config*

──────────────────────────

👑 OWNER_NUMBER: ${process.env.OWNER_NUMBER || "Not set"}

🤖 BOT_NAME: ${process.env.BOT_NAME || "Not set"}

🙍 OWNER_NAME: ${process.env.OWNER_NAME || "Not set"}

📦 PACK_NAME: ${process.env.PACK_NAME || "Not set"}

📌 PREFIX: ${prefixStatus}

⚠️ WARN: ${process.env.WARN || "Not set"}

──────────────────────────

`.trim();

      return reply(info);

    },

  },

];