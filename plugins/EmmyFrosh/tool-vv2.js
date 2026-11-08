module.exports = {
  command: ["vvd"],
  alias: ["todm"],
  description: "Resend view-once image/video/audio to the sender (owner-only)",
  category: "Owner",

  async execute(m, { ednut, msg, prefix, command, isOwner }) {
    try {
      if (!isOwner) return m.reply(msg.owner);

      if (!m.quoted) {
        return m.reply(`*Reply to an image, video, or audio with the caption ${prefix + command}*`);
      }

      let mime = (m.quoted.msg || m.quoted).mimetype || '';

      let messageContent = {};
      let media = await m.quoted.download();

      if (/image/.test(mime)) {
        messageContent = { image: media, caption: "" };
      } else if (/video/.test(mime)) {
        messageContent = { video: media, caption: "" };
      } else if (/audio/.test(mime)) {
        messageContent = { audio: media, mimetype: 'audio/mpeg', ptt: true };
      } else {
        return m.reply(`❌ Unsupported media type!\nReply to an image, video, or audio with *${prefix + command}*`);
      }

      // Send the media to the command sender instead of bot number
      await ednut.sendMessage(m.sender, messageContent, { quoted: m });

    } catch (err) {
      console.error('Error processing media:', err);
      m.reply(`❌ Failed to process media. Please try again.`);
    }
  }
};
