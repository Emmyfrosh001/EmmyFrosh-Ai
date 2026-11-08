module.exports = [
  {
    command: ["promote"],
    description: "Promote a member to admin",
    category: "Group",
    ban: true,
    gcban: true,
    group: true,
    execute: async (m, { ednut, isBotAdmins, isAdmins, text, reply }) => {
      try {
        if (!isBotAdmins) return reply("I need to be an admin to use this command.");
        if (!isAdmins) return reply("You need to be an admin to use this command.");

        let users = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : (text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : false));
        if (!users) return reply("Please tag or reply to a user.");

        // Extract base JID to prevent raw LID numbers showing up
        let targetTag = users.split('@')[0].split(':')[0];

        const metadata = await ednut.groupMetadata(m.chat);
        const participant = metadata.participants.find(p => p.id.split('@')[0].split(':')[0] === targetTag);

        // Check if target is already an admin
        if (participant && (participant.admin === 'admin' || participant.admin === 'superadmin')) {
          return await ednut.sendMessage(m.chat, {
            text: `@${targetTag} is already an admin.`,
            mentions: [users]
          });
        }

        await ednut.groupParticipantsUpdate(m.chat, [users], 'promote');
        await ednut.sendMessage(m.chat, {
          text: `@${targetTag} has been promoted.`,
          mentions: [users]
        });
        await ednut.sendMessage(m.chat, { delete: m.key });
      } catch (err) {
        reply("Unable to promote member.");
        if (global.log) global.log("ERROR", `Promote Error: ${err.message || err}`);
      }
    }
  },

  {
    command: ["demote"],
    description: "Demote a group admin",
    category: "Group",
    ban: true,
    gcban: true,
    group: true,
    execute: async (m, { ednut, isBotAdmins, isAdmins, text, reply }) => {
      try {
        if (!isBotAdmins) return reply("I need to be an admin to use this command.");
        if (!isAdmins) return reply("You need to be an admin to use this command.");

        let users = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : (text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : false));
        if (!users) return reply("Please tag or reply to a user.");

        let targetTag = users.split('@')[0].split(':')[0];

        const metadata = await ednut.groupMetadata(m.chat);
        const groupOwner = metadata.owner || metadata.participants.find(p => p.admin === 'superadmin')?.id;

        // Prevent demoting group creator
        if (users === groupOwner || targetTag === groupOwner?.split('@')[0].split(':')[0]) {
          return reply("You can't demote the creator of the group.");
        }

        const participant = metadata.participants.find(p => p.id.split('@')[0].split(':')[0] === targetTag);
        if (participant && !participant.admin) {
          return await ednut.sendMessage(m.chat, {
            text: `@${targetTag} is not an admin.`,
            mentions: [users]
          });
        }

        await ednut.groupParticipantsUpdate(m.chat, [users], 'demote');
        await ednut.sendMessage(m.chat, {
          text: `@${targetTag} has been demoted.`,
          mentions: [users]
        });
        await ednut.sendMessage(m.chat, { delete: m.key });
      } catch (err) {
        reply("Unable to demote member.");
        if (global.log) global.log("ERROR", `Demote Error: ${err.message || err}`);
      }
    }
  },

  {
    command: ["kick"],
    alias: ["fling", "remove"],
    description: "Remove a user from the group",
    category: "Group",
    ban: true,
    gcban: true,
    group: true,
    execute: async (m, { ednut, isBotAdmins, isAdmins, text, reply }) => {
      try {
        if (!isBotAdmins) return reply("I need to be an admin to use this command.");
        if (!isAdmins) return reply("You need to be an admin to use this command.");

        let users = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : (text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : false));
        if (!users) return reply("Tag or reply to a user to kick.");

        let targetTag = users.split('@')[0].split(':')[0];

        const metadata = await ednut.groupMetadata(m.chat);
        const groupOwner = metadata.owner || metadata.participants.find(p => p.admin === 'superadmin')?.id;

        if (users === groupOwner || targetTag === groupOwner?.split('@')[0].split(':')[0]) {
          return reply("You can't kick the creator of the group.");
        }

        await ednut.groupParticipantsUpdate(m.chat, [users], 'remove');
        await ednut.sendMessage(m.chat, {
          text: `@${targetTag} has been removed from the group chat.`,
          mentions: [users]
        });
        await ednut.sendMessage(m.chat, { delete: m.key });
      } catch (err) {
        reply("Unable to kick member.");
        if (global.log) global.log("ERROR", `Kick Error: ${err.message || err}`);
      }
    }
  },

  {
    command: ["mute"],
    alias: ["close"],
    description: "Mute the group (only admins can send messages)",
    category: "Group",
    ban: true,
    gcban: true,
    group: true,
    execute: async (m, { ednut, isBotAdmins, isAdmins, reply }) => {
      try {
        if (!isBotAdmins) return reply("I need to be an admin to use this command.");
        if (!isAdmins) return reply("You need to be an admin to use this command.");

        const metadata = await ednut.groupMetadata(m.chat);

        if (!metadata.announce) {
          await ednut.groupSettingUpdate(m.chat, 'announcement');
          reply(`Group has been muted!`);
        } else {
          reply(`Group is already muted!`);
        }
      } catch (err) {
        reply("Failed to mute group.");
        if (global.log) global.log("ERROR", `Mute Error: ${err.message || err}`);
      }
    }
  },

  {
    command: ["unmute"],
    alias: ["open"],
    description: "Unmute the group (everyone can send messages)",
    category: "Group",
    ban: true,
    gcban: true,
    group: true,
    execute: async (m, { ednut, isBotAdmins, isAdmins, reply }) => {
      try {
        if (!isBotAdmins) return reply("I need to be an admin to use this command.");
        if (!isAdmins) return reply("You need to be an admin to use this command.");

        const metadata = await ednut.groupMetadata(m.chat);

        if (metadata.announce) {
          await ednut.groupSettingUpdate(m.chat, 'not_announcement');
          reply(`Group has been opened!`);
        } else {
          reply(`Group is already open!`);
        }
      } catch (err) {
        reply("Failed to unmute group.");
        if (global.log) global.log("ERROR", `Unmute Error: ${err.message || err}`);
      }
    }
  }
];