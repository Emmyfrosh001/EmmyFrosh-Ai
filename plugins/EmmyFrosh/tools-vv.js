module.exports = {
  command: ["vv", "readviewonce"],
  alias: ["retrieve"],
  description: "Resend view-once image/video/audio to the current chat",
  category: "Tool",

  async execute(m, { ednut, msg, prefix, command }) {
    try {
      if (!m.quoted) {
        return m.reply(`*Reply to an image, video, or audio with the caption ${prefix + command}*`);
      }

      let mime = (m.quoted.msg || m.quoted).mimetype || '';

      if (/image/.test(mime)) {
        let media = await m.quoted.download();
        await ednut.sendMessage(m.chat, {
          image: media,
          caption: "",
        }, { quoted: m });

      } else if (/video/.test(mime)) {
        let media = await m.quoted.download();
        await ednut.sendMessage(m.chat, {
          video: media,
          caption: "",
        }, { quoted: m });

      } else if (/audio/.test(mime)) {
        let media = await m.quoted.download();
        await ednut.sendMessage(m.chat, {
          audio: media,
          mimetype: 'audio/mpeg',
          ptt: true, // Set to true if you want to send as a voice note
        }, { quoted: m });

      } else {
        m.reply(`❌ Unsupported media type!\nReply to an image, video, or audio with *${prefix + command}*`);
      }
    } catch (err) {
      console.error('Error processing media:', err);
      m.reply(`❌ Failed to process media. Please try again.`);
    }
  }
};
