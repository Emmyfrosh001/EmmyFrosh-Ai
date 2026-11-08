module.exports = {

  command: ["jid"],

  alias: ["getjid"],

  description: "Get user JID (reply, number, tag)",

  category: "Utility",

  async execute(m, { ednut, text }) {

    try {

      let targetJid;

      // 1. @tag support

      if (m.mentionedJid && m.mentionedJid.length > 0) {

        targetJid = m.mentionedJid[0];

      }

      // 2. reply support

      else if (m.quoted?.sender || m.quoted?.participant) {

        targetJid = m.quoted.sender || m.quoted.participant;

      }

      // 3. number input support (.jid 2348xxxx)

      else if (text) {

        let num = text.replace(/[^0-9]/g, "");

        targetJid = num ? `${num}@s.whatsapp.net` : m.sender;

      }

      // 4. fallback

      else {

        targetJid = m.sender;

      }

      const groupJid = m.isGroup ? m.chat : "PRIVATE CHAT";

      const result =

`╭━━〔 ᴊɪᴅ ɪɴꜰᴏ 〕━━⬣

ᴜꜱᴇʀ ᴊɪᴅ:

${targetJid}

ɢʀᴏᴜᴘ ᴊɪᴅ:

${groupJid}

Tap and hold to copy 📋

╰━━━━━━━━━━━━━━⬣`;

      await ednut.sendMessage(

        m.chat,

        {

          text: result,

          contextInfo: {

            isForwarded: false,

            forwardingScore: 0

          }

        },

        { quoted: m }

      );

    } catch (e) {

      console.error(e);

      await ednut.sendMessage(

        m.chat,

        { text: "Failed to fetch JID." },

        { quoted: m }

      );

    }

  }

};