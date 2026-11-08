module.exports = function setupAutoReplyListener(ednut, store) {
  // Tracks the last time each JID got an auto-reply.
  // Key: remoteJid, Value: timestamp (ms) of last reply sent.
  const lastReplied = new Map();

  const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

  ednut.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const mek = messages[0];
      if (!mek?.message) return;
      if (mek.key.fromMe) return;

      const remoteJid = mek.key?.remoteJid;
      if (!remoteJid) return;

      // Only private DMs — skip groups and status broadcasts
      const isGroup = remoteJid.endsWith("@g.us");
      const isStatus = remoteJid === "status@broadcast";
      if (isGroup || isStatus) return;

      const settings = global.db?.settings?.autoreply;
      if (!settings?.enabled || !settings?.message) return;

      const now = Date.now();
      const last = lastReplied.get(remoteJid);

      // If they messaged within the cooldown window since the last
      // auto-reply, stay quiet.
      if (last && now - last < COOLDOWN_MS) return;

      lastReplied.set(remoteJid, now);

      await ednut.sendMessage(remoteJid, { text: settings.message }, { quoted: mek });
    } catch (err) {
      console.error("Error in AutoReply Listener:", err);
    }
  });
};
