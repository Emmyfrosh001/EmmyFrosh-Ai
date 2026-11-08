const { smsg } = require("../myfunc");

module.exports = function setupStatusListener(ednut, store) {
  ednut.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const mek = messages[0];
      if (!mek?.message) return;
      if (mek.key.fromMe) return;

      // ------------------------
      // ✅ Status Broadcast React
      // ------------------------
      if (mek.key?.remoteJid === "status@broadcast") {
        if (global.db?.settings?.autolike !== true) return;

        // Find the poster's JID from every known location
        let participant =
          mek.key.participant ||
          mek.participant ||
          null;

        if (!participant) return;

        // Resolve @lid JIDs to real @s.whatsapp.net JIDs (required for
        // reactions to actually display for the status poster)
        if (participant.endsWith("@lid")) {
          try {
            const resolved =
              (await ednut.signalRepository?.lidMapping?.getPNForLID?.(participant)) ||
              (await ednut.lidMapping?.getPNForLID?.(participant)) ||
              null;

            if (resolved) participant = resolved;
          } catch (lidErr) {
            // silently fall back to original participant
          }
        }

        const emojis = [
          "❤️","💛","💚","💙","💜","🖤","💖","💘","💝","💞","💟","💌",
          "🔥","✨","💯","🎉","🥳","🤩","😎","😍","🥰","😘","😇","🤍","🤎",
          "😺","😸","😹","😻","😼","🙀","😿","😾","🎈","🌸","🌼","🌻","🌹","💐",
          "🚀","✈️","🚁","🚂","🚗","🚕","🚙","🚌","🚎","🏎️","🏍️","🛵","🚲","🛴",
          "⚡","💥","💫","🌟","⭐","☀️","🌙","🌈","⚽","🏀","🏈","⚾","🎾","🏐","🏓","🏸",
          "🎯","🎳","🎮","🎰","🎲","🎭","🎨","🎵","🎶","🎼","🎹","🥁","🎷","🎺","🎸"
        ];
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        const botJid = ednut.user.id.split(":")[0] + "@s.whatsapp.net";

        try {
          await ednut.sendMessage(
            "status@broadcast",
            { react: { text: randomEmoji, key: mek.key } },
            { statusJidList: [participant, botJid] }
          );
        } catch (reactErr) {
          // reaction failed silently; no console output
        }

        return; // stop processing for status messages
      }

      // ------------------------
      // ✅ Non-status messages: forward to your command handler
      // ------------------------
      const m = smsg(ednut, mek, store);
      // require("../../handler")(ednut, m, mek, store);
    } catch (err) {
      // errors suppressed from console per request
    }
  });
};
