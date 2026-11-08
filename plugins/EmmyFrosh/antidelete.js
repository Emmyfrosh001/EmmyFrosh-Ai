module.exports = {
  command: ["antidelete"],
  alias: ["ad"],
  category: "owner",
  description: "Control antidelete — group, dm, status",
  async execute(m, { ednut, args, reply, isOwner }) {
    if (!isOwner) return reply("Only the owner can use this command.")

    if (!global.db) global.db = {}
    if (!global.db.settings) global.db.settings = {}

    const sub = (args[0] || "").toLowerCase()
    const val = (args[1] || "").toLowerCase()

    // ── STATUS ───────────────────────────────────────────────────────────
    // .antidelete status on / .antidelete status off
    if (sub === "status") {
      if (val === "on") {
        global.db.settings.antideletestatus = true
        return reply(
          `✅ *Antidelete Status ON*\n` +
          `Anyone who deletes their status will have it sent to your DM.`
        )
      } else if (val === "off") {
        global.db.settings.antideletestatus = false
        return reply(`❌ *Antidelete Status OFF*\nDeleted statuses will no longer be forwarded.`)
      } else {
        const s = global.db.settings.antideletestatus ? "✅ ON" : "❌ OFF"
        return reply(
          `📢 *Antidelete Status*\nCurrent: ${s}\n\n` +
          `Usage:\n• .antidelete status on\n• .antidelete status off`
        )
      }
    }

    // ── GROUP ────────────────────────────────────────────────────────────
    // .antidelete on group → deleted messages in ANY group sent back to same group
    if (sub === "on" && val === "group") {
      global.db.settings.antidelete = "group"
      return reply(
        `✅ *Antidelete ON (Group Mode)*\n` +
        `Any deleted message in any group will be resent back to that same group.`
      )
    }

    // ── DM ───────────────────────────────────────────────────────────────
    // .antidelete on dm → deleted messages from ANY group sent to owner DM
    if (sub === "on" && val === "dm") {
      global.db.settings.antidelete = "dm"
      return reply(
        `✅ *Antidelete ON (DM Mode)*\n` +
        `Any deleted message from any group or chat will be forwarded to your DM.`
      )
    }

    // ── OFF ──────────────────────────────────────────────────────────────
    // .antidelete off
    if (sub === "off") {
      global.db.settings.antidelete = false
      return reply(`❌ *Antidelete OFF*\nDeleted messages will no longer be tracked.`)
    }

    // ── STATUS CHECK ─────────────────────────────────────────────────────
    // .antidelete → show current settings
    const adMode   = global.db.settings.antidelete
    const adStatus = global.db.settings.antideletestatus

    let modeText = "❌ OFF"
    if (adMode === "group") modeText = "✅ Group Mode"
    else if (adMode === "dm") modeText = "✅ DM Mode"

    return reply(
      `🗑️ *Antidelete Settings*\n\n` +
      `• Message Mode: ${modeText}\n` +
      `• Status Mode: ${adStatus ? "✅ ON" : "❌ OFF"}\n\n` +
      `*Commands:*\n` +
      `• .antidelete on group\n` +
      `• .antidelete on dm\n` +
      `• .antidelete off\n` +
      `• .antidelete status on\n` +
      `• .antidelete status off`
    )
  }
}