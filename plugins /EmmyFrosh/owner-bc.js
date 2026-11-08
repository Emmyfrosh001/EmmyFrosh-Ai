module.exports = [
  {
    command: ["broadcast"],
    alias: ["advertise"],
    description: "Broadcast text or media to all groups",
    category: "Owner",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { ednut, text, isOwner, msg, sleep, isGroup, reply }) => {
      try {
        let messageOptions = {};
        if (m.quoted && m.quoted.mimetype) {
          const mime = m.quoted.mimetype;
          const media = await m.quoted.download();

          if (/image/.test(mime)) {
            messageOptions = { image: media, caption: text || m.quoted.text || '' };
          } else if (/video/.test(mime)) {
            messageOptions = { video: media, caption: text || m.quoted.text || '' };
          } else if (/audio/.test(mime)) {
            messageOptions = {
              audio: media,
              mimetype: 'audio/mpeg',
              filename: 'music.mp3',
              ptt: true,
              contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                  newsletterJid: ``,
                  serverMessageId: 101,
                  newsletterName: `broadcast: ${text || m.quoted.text || ''}`
                }
              }
            };
          } else if (/sticker/.test(mime)) {
            messageOptions = { sticker: media };
          }
        } else {
          messageOptions = {
            text: text || (m.quoted ? m.quoted.text : '')
          };
        }

        if (messageOptions.caption) {
          messageOptions.text = messageOptions.caption;
          delete messageOptions.caption;
        }

        if (!messageOptions.text && !messageOptions.image && !messageOptions.video && !messageOptions.audio && !messageOptions.sticker) {
          return reply('No text or media provided.');
        }

        const allGroups = await ednut.groupFetchAllParticipating();
        const groupIds = Object.entries(allGroups).map(([_, group]) => group.id);

        reply(`Sending broadcast to ${groupIds.length} group(s). Estimated time: ${groupIds.length * 1.5} seconds.`);
        for (const groupId of groupIds) {
          await sleep(5000);
          await ednut.sendMessage(groupId, messageOptions, { quoted: m });
        }
        reply(`_Broadcast sent to ${groupIds.length} group(s) successfully._`);
      } catch (err) {
        global.log("ERROR", `broadcast plugin: ${err.message || err}`);
        reply('Error occurred while sending broadcast.');
      }
    }
  },

  {
    command: ["logout"],
    description: "Logout bot from all devices",
    category: "Owner",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { ednut, isOwner, msg, sleep, isGroup, reply }) => {
      try {
        reply("Logging out all devices...");
        await sleep(4000);
        await ednut.logout();
      } catch (err) {
        global.log("ERROR", `logout plugin: ${err.message || err}`);
        reply('Error occurred while logging out.');
      }
    }
  }
];