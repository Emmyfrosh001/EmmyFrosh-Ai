module.exports = [
  {
    command: ["sendvv"],
    alias: ["viewonce", "vo"],
    description: "Forward a view-once message to a tagged person's DM",
    category: "Utility",
    execute: async (m, { ednut, reply, isHighStaff }) => {
      try {
        if (!isHighStaff) return reply("❌ Only owner or mod can use this command.");
        if (!m.quoted) return reply("❌ Reply to a view-once message.");

        const q = m.quoted;
        const mtype = q.mtype || "";

        const mediaData =
          q.msg ||
          q.message?.imageMessage ||
          q.message?.videoMessage ||
          q.message?.audioMessage ||
          q.message?.viewOnceMessage?.message?.imageMessage ||
          q.message?.viewOnceMessage?.message?.videoMessage ||
          q.message?.viewOnceMessageV2?.message?.imageMessage ||
          q.message?.viewOnceMessageV2?.message?.videoMessage ||
          null;

        const isImage = mtype === "imageMessage" || !!mediaData?.mimetype?.includes("image");
        const isVideo = mtype === "videoMessage" || !!mediaData?.mimetype?.includes("video");
        const isAudio = mtype === "audioMessage" || !!mediaData?.mimetype?.includes("audio");

        if (!isImage && !isVideo && !isAudio) {
          return reply(`❌ No media found.\nmtype: ${mtype}`);
        }

        // ── Get tagged person ──
        const mentionedJids =
          m.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
          m.mentionedJid ||
          [];

        if (!mentionedJids || mentionedJids.length === 0) {
          return reply("❌ Tag someone to send to.\nExample: *.vv @person*");
        }

        const targetJid = mentionedJids[0];

        // ── FIX: Force session initialization for new users ──
        try {
          // This creates a direct connection handshake with the target number
          await ednut.onWhatsApp(targetJid);
        } catch (sessionError) {
          console.log("[VV PATCH] Session initialization skipped or failed:", sessionError.message);
        }

        // ── Download the media ──
        let buffer;
        try {
          buffer = await ednut.downloadMediaMessage(q);
        } catch (e) {
          return reply(`❌ Failed to download media: ${e.message}`);
        }

        if (!buffer || buffer.length < 100) {
          return reply(`❌ Download returned empty buffer (${buffer?.length || 0} bytes).`);
        }

        // ── Send to DM silently — no confirmation reply ──
        if (isImage) {
          await ednut.sendMessage(targetJid, {
            image:    buffer,
            caption:  mediaData?.caption || q.text || "",
            mimetype: mediaData?.mimetype || "image/jpeg"
          });
        } else if (isVideo) {
          await ednut.sendMessage(targetJid, {
            video:    buffer,
            caption:  mediaData?.caption || q.text || "",
            mimetype: mediaData?.mimetype || "video/mp4"
          });
        } else if (isAudio) {
          await ednut.sendMessage(targetJid, {
            audio:    buffer,
            mimetype: mediaData?.mimetype || "audio/ogg; codecs=opus",
            ptt:      mediaData?.ptt || false
          });
        }

        // ✅ Silent react instead of text reply — no number shown in chat
        await ednut.sendMessage(m.chat, {
          react: { text: "✅", key: m.key }
        }).catch(() => {});

      } catch (err) {
        console.error("[vv]", err);
        reply(`❌ Error: ${err.message || err}`);
      }
    }
  }
];