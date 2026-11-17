const core = require("../../all/connect/antiviewonce");
core.autoAttach(); // starts listening as soon as this plugin loads

module.exports = {
  command: ["antiviewonce"],
  alias: ["antivv", "avv"],
  category: "owner",
  description: "Anti view-once: delete view-once messages and reveal them when you reply/react",
  async execute(m, { ednut, args, reply, isOwner, isHighStaff }) {
    core.attach(ednut); // make sure we are listening on the live connection

    // owner, sudo and moderators may use dm/chat for themselves; the rest is owner-only
    const isStaff = isOwner || isHighStaff || (await core.isOwnerMessage(ednut, m));
    if (!isStaff) return reply("Only the owner, sudo or moderators can use this command.");
    const sub0 = (args[0] || "").toLowerCase();
    if (!isOwner && !["dm", "chat", "group", ""].includes(sub0)) return reply("Only the owner can use that. You can use *.avv dm* or *.avv chat*.");

    if (!global.db) global.db = {};
    if (!global.db.settings) global.db.settings = {};
    const st = global.db.settings;

    const sub = (args[0] || "").toLowerCase();

    if (sub === "on") {
      st.antiviewonce = true;
      return reply("✅ *Anti View-Once ON*\nView-once messages are saved and deleted. Reply to, react to, or sticker-reply to one to get it back.");
    }
    if (sub === "off") {
      st.antiviewonce = false;
      return reply("❌ *Anti View-Once OFF*\nView-once messages are left alone.");
    }
    if (sub === "dm") {
      await core.setDestMode(ednut, m, "dm");
      return reply("📥 Revealed view-once media will now go to *your own DM* when you reply/react.");
    }
    if (sub === "chat" || sub === "group") {
      await core.setDestMode(ednut, m, "chat");
      return reply("📥 Revealed view-once media will now go to *the chat where you reply/react*.");
    }

    if (sub === "debug") {
      const d = core.status();
      return reply(
        `🔧 *Anti View-Once debug*\n\n` +
        `• Listening: ${d.attached ? "✅ yes" : "❌ no"}\n` +
        `• View-once seen: ${d.seen}\n` +
        `• Saved: ${d.saved} (in memory: ${d.stored})\n` +
        `• Failed: ${d.failed}\n` +
        `• Revealed: ${d.revealed}\n` +
        `• Last error: ${d.lastError || "none"}\n` +
                `• Last person not allowed: ${d.lastDenied || "none"}\n` +
        `• Last messages seen: ${d.lastTypes.join(" | ") || "none yet"}`
      );
    }

    const on = st.antiviewonce !== false;
    const dest = (await core.getDestMode(ednut, m)) === "dm" ? "Your own DM" : "Same chat";
    return reply(
      `👁 *Anti View-Once*\n\n` +
      `• Status: ${on ? "✅ ON" : "❌ OFF"}\n` +
      `• Your revealed media goes to: ${dest}\n\n` +
      `*Commands:*\n` +
      `• .antiviewonce on\n` +
      `• .antiviewonce off\n` +
      `• .antiviewonce dm\n` +
      `• .antiviewonce chat\n` +
      `• .antiviewonce debug`
    );
  }
};
