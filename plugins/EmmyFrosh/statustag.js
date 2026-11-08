// ================================================================
// 🛡️ ANTISTATUS COMMAND PLUGIN
// Path: plugins/EmmyFrosh/antistatus.js
// ================================================================

module.exports = {
  command:     ["antistatus"],
  alias:       ["antistatustag"],
  category:    "group",
  description: "Auto-delete / warn / kick status taggers",
  admin:       true,

  async execute(m, { args, reply, isAdmins, isOwner }) {

    if (!isAdmins && !isOwner)
      return reply("❌ Only group admins can use this command.")

    if (!global.db)                    global.db              = {}
    if (!global.db.groups)             global.db.groups       = {}
    if (!global.db.groups[m.chat])     global.db.groups[m.chat] = {}

    const group = global.db.groups[m.chat]

    // defaults
    if (group.antistatus      === undefined) group.antistatus      = false  // delete mode
    if (group.antistatus2     === undefined) group.antistatus2     = false  // warn mode
    if (group.antistatus3     === undefined) group.antistatus3     = false  // kick mode
    if (group.antistatusWarn  === undefined) group.antistatusWarn  = {}     // warn counts
    if (group.antistatusMax   === undefined) group.antistatusMax   = 3      // max warns before kick

    const sub  = (args[0] || "").toLowerCase()
    const sub2 = (args[1] || "").toLowerCase()

    // ── No arg → show dashboard ──
    if (!sub) {
      const mode =
        group.antistatus  ? "🗑️ Delete" :
        group.antistatus2 ? `⚠️ Warn (kick at ${group.antistatusMax} warns)` :
        group.antistatus3 ? "👢 Kick" :
        "❌ Off"

      return reply(
        `╭─── 🛡️ *ANTISTATUS* ───\n` +
        `│\n` +
        `│ Mode: ${mode}\n` +
        `│\n` +
        `├─── *Commands* ────────\n` +
        `│ .antistatus on       → delete msg\n` +
        `│ .antistatus warn     → warn then kick\n` +
        `│ .antistatus kick     → kick immediately\n` +
        `│ .antistatus off      → disable\n` +
        `│ .antistatus setwarn <num>\n` +
        `│ .antistatus reset @user\n` +
        `│ .antistatus reset all\n` +
        `╰──────────────────────`
      )
    }

    // ── ON — delete only ──
    if (sub === "on") {
      group.antistatus  = true
      group.antistatus2 = false
      group.antistatus3 = false
      return reply("✅ Antistatus *DELETE* mode enabled.\nStatus tags will be automatically deleted.")
    }

    // ── WARN — delete + warn, kick on limit ──
    if (sub === "warn") {
      group.antistatus  = false
      group.antistatus2 = true
      group.antistatus3 = false
      return reply(
        `✅ Antistatus *WARN* mode enabled.\n\n` +
        `• Message will be deleted\n` +
        `• User gets a warning\n` +
        `• Kicked after *${group.antistatusMax} warnings*\n\n` +
        `> Use *.antistatus setwarn <num>* to change limit.`
      )
    }

    // ── KICK — delete + kick immediately ──
    if (sub === "kick") {
      group.antistatus  = false
      group.antistatus2 = false
      group.antistatus3 = true
      return reply("✅ Antistatus *KICK* mode enabled.\nAnyone who tags this group in their status will be immediately kicked.")
    }

    // ── OFF ──
    if (sub === "off") {
      group.antistatus  = false
      group.antistatus2 = false
      group.antistatus3 = false
      return reply("❌ Antistatus *disabled*.")
    }

    // ── SETWARN <num> ──
    if (sub === "setwarn") {
      const num = parseInt(sub2)
      if (isNaN(num) || num < 1 || num > 20)
        return reply("❌ Usage: `.antistatus setwarn 3`\nValue must be 1 - 20.")
      group.antistatusMax = num
      return reply(`✅ Warn limit set to *${num}*. User will be kicked after ${num} warnings.`)
    }

    // ── RESET @user / all ──
    if (sub === "reset") {
      if (sub2 === "all") {
        group.antistatusWarn = {}
        return reply("✅ All antistatus warnings reset.")
      }
      const target = m.quoted?.sender || m.mentionedJid?.[0]
      if (!target)
        return reply("❌ Reply/tag a user or use: `.antistatus reset all`")
      delete group.antistatusWarn[target]
      return reply(`✅ Warnings reset for @${target.split("@")[0]}`, { mentions: [target] })
    }

    // ── Unknown ──
    return reply(
      `❓ Unknown: *${sub}*\n\nOptions: on | warn | kick | off | setwarn | reset`
    )
  }
}