module.exports = [

  // ══════════════════════════════════════════════════════
  // 📢 EVENTS
  // ══════════════════════════════════════════════════════
  {
    command: ["events",],
    alias: [],
    category: "group",
    description: "Toggle promote/demote event notifications in this group.",
    async execute(m, { args, reply, isAdmins, isOwner }) {
      if (!m.isGroup) return reply("This command can only be used in a group.")
      if (!isAdmins) return reply("❌ You need to be an admin to use this command. Only admins can use this command.")
      if (!global.db.groups)          global.db.groups = {}
      if (!global.db.groups[m.chat]) global.db.groups[m.chat] = {}
      const db = global.db.groups[m.chat]

      if (args[0] === "on") {
        db.events = true
        return reply(
          `📢 *Events Notifications — ENABLED* ✅\n\n` +
          `Bot will now announce every promote/demote action in this group.`
        )
      } else if (args[0] === "off") {
        db.events = false
        return reply(
          `📢 *Events Notifications — DISABLED* ❌\n\n` +
          `Bot will no longer announce promote/demote actions.`
        )
      } else {
        const status = db?.events ? "✅ *ON*" : "❌ *OFF*"
        return reply(
          `📢 *Events Notifications*\n` +
          `Status: ${status}\n\n` +
          `Usage:\n` +
          `• .events on\n` +
          `• .events off`
        )
      }
    }
  },

  // ══════════════════════════════════════════════════════
  // 🚫 ANTIPROMOTION
  // ══════════════════════════════════════════════════════
  {
    command: ["antipromotion"],
    alias: ["antipromo"],
    category: "group",
    description: "Auto-demote anyone promoted without permission.",
    async execute(m, { args, reply, isAdmins, isBotAdmins, isOwner }) {
      if (!m.isGroup) return reply("This command can only be used in a group.")
      if (!isAdmins) return reply("❌ You need to be an admin to use this command. Only admins can use this command.")
      if (!isBotAdmins) return reply("⚠️ I need to be an admin to use this feature.")
      if (!global.db.groups)          global.db.groups = {}
      if (!global.db.groups[m.chat]) global.db.groups[m.chat] = {}
      const db = global.db.groups[m.chat]

      if (args[0] === "on") {
        db.antipromotion = true
        return reply(
          `🚫 *Anti-Promotion — ENABLED* ✅\n\n` +
          `If anyone is promoted without permission, the bot will automatically demote them back.`
        )
      } else if (args[0] === "off") {
        db.antipromotion = false
        return reply(
          `🚫 *Anti-Promotion — DISABLED* ❌\n\n` +
          `The bot will no longer auto-demote unauthorized promotions.`
        )
      } else {
        const status = db?.antipromotion ? "✅ *ON*" : "❌ *OFF*"
        return reply(
          `🚫 *Anti-Promotion*\n` +
          `Status: ${status}\n\n` +
          `Usage:\n` +
          `• .antipromotion on\n` +
          `• .antipromotion off`
        )
      }
    }
  },

  // ══════════════════════════════════════════════════════
  // 🛡️ ANTIDEMOTION
  // ══════════════════════════════════════════════════════
  {
    command: ["antidemotion"],
    alias: [ "antidemote"],
    category: "group",
    description: "Auto-re-promote anyone wrongly demoted.",
    async execute(m, { args, reply, isAdmins, isBotAdmins, isOwner }) {
      if (!m.isGroup) return reply("This command can only be used in a group.")
      if (!isAdmins) return reply("❌ You need to be an admin to use this command. Only admins can use this command.")
      if (!isBotAdmins) return reply("⚠️ I need to be an admin to use this feature.")
      if (!global.db.groups)          global.db.groups = {}
      if (!global.db.groups[m.chat]) global.db.groups[m.chat] = {}
      const db = global.db.groups[m.chat]

      if (args[0] === "on") {
        db.antidemotion = true
        return reply(
          `🛡️ *Anti-Demotion — ENABLED* ✅\n\n` +
          `If any admin is demoted, the bot will automatically re-promote them back.`
        )
      } else if (args[0] === "off") {
        db.antidemotion = false
        return reply(
          `🛡️ *Anti-Demotion — DISABLED* ❌\n\n` +
          `The bot will no longer auto-re-promote demoted admins.`
        )
      } else {
        const status = db?.antidemotion ? "✅ *ON*" : "❌ *OFF*"
        return reply(
          `🛡️ *Anti-Demotion*\n` +
          `Status: ${status}\n\n` +
          `Usage:\n` +
          `• .antidemotion on\n` +
          `• .antidemotion off`
        )
      }
    }
  }

]