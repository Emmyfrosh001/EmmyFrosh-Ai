const fs = require("fs");
const path = require("path");
const axios = require("axios");

module.exports = [
  {
    command: ["Privacy"],
    description: "Privacy settings menu",
    category: "Privacy",
    async execute(m, { ednut, from, sender, reply }) {
      await ednut.sendMessage(m.key.remoteJid, {
        react: { text: "🔐", key: m.key },
      });

      try {
        const PrivacyMenu = `
╭─❏〘 *Privacy Settings* 〙━━━━❒
┃╭─────────────❒
┃┃• blocklist - View blocked users
┃┃• getbio - Get user's bio
┃┃• setppall - Set profile pic Privacy
┃┃• setonline - Set online Privacy
┃┃• setpp - Change bot's profile pic
┃┃• setmyname - Change bot's name
┃┃• updatebio - Change bot's bio
┃┃• groupsPrivacy - Set group add Privacy
┃┃• getPrivacy - View current Privacy settings
┃┃• getpp - Get user's profile picture
┃┃
┃┃*Options for Privacy commands:*
┃┃• all - Everyone
┃┃• contacts - My contacts only
┃┃• contact_blacklist - Contacts except blocked
┃┃• none - Nobody
┃┃• match_last_seen - Match last seen
╰──────────────❒
*Note:* Most commands are owner-only.
        `;

        await ednut.sendMessage(
          from,
          {
            image: { url: `https://files.catbox.moe/3m1vb1.png` },
            caption: PrivacyMenu,
            contextInfo: {
              mentionedJid: [m.sender],
              forwardingScore: 2,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid: "@newsletter",
                newsletterName: "Privacy Settings",
                serverMessageId: 143,
              },
            },
          },
          { quoted: m }
        );
      } catch (e) {
        console.log(e);
        reply(`Error: ${e.message}`);
      }
    },
  },
 
  {
    command: ["setownername"],
    description: "Set your WhatsApp display name.",
    category: "Privacy",
    async execute(m, { ednut, isOwner, reply, args }) {
      if (!isOwner) return reply("❌ You are not the owner!");

      const displayName = args.join(" ");
      if (!displayName) return reply("❌ Please provide a display name.");

      try {
        await ednut.updateProfileName(displayName);
        reply(`✅ Owner name updated to: ${displayName}`);
      } catch (err) {
        console.error(err);
        reply(`❌ Failed to update display name: ${err.message}`);
      }
    },
  },

  {
    command: ["getbio"],
    description: "Get user's bio",
    category: "Privacy",
    async execute(m, { ednut, args, reply }) {
      try {
        const jid = args[0] || m.key.remoteJid;
        const about = await ednut.fetchStatus?.(jid);

        if (!about) return reply("No bio found.");

        reply(`User Bio:\n\n${about.status}`);
      } catch (e) {
        console.error(e);
        reply("No bio found.");
      }
    },
  },

  {
    command: ["setppall"],
    description: "Update Profile Picture Privacy",
    category: "Privacy",
    async execute(m, { ednut, isOwner, args, reply }) {
      await ednut.sendMessage(m.key.remoteJid, {
        react: { text: "🔐", key: m.key },
      });

      if (!isOwner) return reply("❌ You are not the owner!");

      try {
        const value = args[0] || "all";
        const valid = ["all", "contacts", "contact_blacklist", "none"];

        if (!valid.includes(value))
          return reply(
            "❌ Invalid option. Valid: all, contacts, contact_blacklist, none"
          );

        await ednut.updateProfilePicturePrivacy(value);
        reply(`✅ Profile picture Privacy updated to: ${value}`);
      } catch (e) {
        reply(`❌ Error: ${e.message}`);
      }
    },
  },

  {
    command: ["setonline"],
    description: "Update Online Privacy",
    category: "Privacy",
    async execute(m, { ednut, isOwner, args, reply }) {
      await ednut.sendMessage(m.key.remoteJid, {
        react: { text: "🔐", key: m.key },
      });

      if (!isOwner) return reply("❌ You are not the owner!");

      try {
        const value = args[0] || "all";
        const valid = ["all", "match_last_seen"];

        if (!valid.includes(value))
          return reply("❌ Invalid option. Valid: all, match_last_seen");

        await ednut.updateOnlinePrivacy(value);
        reply(`✅ Online Privacy updated to: ${value}`);
      } catch (e) {
        reply(`❌ Error: ${e.message}`);
      }
    },
  },

  {
    command: ["updatebio"],
    description: "Change bot's bio",
    category: "Privacy",
    async execute(m, { ednut, isOwner, q, reply, from }) {
      await ednut.sendMessage(m.key.remoteJid, {
        react: { text: "🥏", key: m.key },
      });

      if (!isOwner) return reply("🚫 Owner only");
      if (!q) return reply("❓ Enter the new bio");
      if (q.length > 139) return reply("❗ Character limit exceeded");

      try {
        await ednut.updateProfileStatus(q);
        await ednut.sendMessage(
          from,
          { text: "✔️ New Bio Added Successfully" },
          { quoted: m }
        );
      } catch (e) {
        reply(`❌ Error: ${e.message}`);
      }
    },
  },

  {
    command: ["groupsPrivacy"],
    description: "Update Group Add Privacy",
    category: "Privacy",
    async execute(m, { ednut, isOwner, args, reply }) {
      await ednut.sendMessage(m.key.remoteJid, {
        react: { text: "🔐", key: m.key },
      });

      if (!isOwner) return reply("❌ You are not the owner!");

      try {
        const value = args[0] || "all";
        const valid = ["all", "contacts", "contact_blacklist", "none"];

        if (!valid.includes(value))
          return reply(
            "❌ Invalid option. Valid: all, contacts, contact_blacklist, none"
          );

        await ednut.updateGroupsAddPrivacy(value);
        reply(`✅ Group add Privacy updated to: ${value}`);
      } catch (e) {
        reply(`❌ Error: ${e.message}`);
      }
    },
  },

  {
    command: ["getPrivacy"],
    description: "View current Privacy settings",
    category: "Privacy",
    async execute(m, { ednut, isOwner, reply, from }) {
      if (!isOwner) return reply("🚫 Owner only");

      try {
        const duka = await ednut.fetchPrivacySettings?.(true);
        if (!duka) return reply("❌ Failed to fetch Privacy settings");

        const txt = `
╭──❏〘 𝙿𝚁𝙸𝚅𝙰𝙲𝚈 〙━━━━❒
│  Read Receipts: ${duka.readreceipts}
│  Profile Picture: ${duka.profile}
│  Status: ${duka.status}
│  Online: ${duka.online}
│  Last Seen: ${duka.last}
│  Group Privacy: ${duka.groupadd}
│  Call Privacy: ${duka.calladd}
╰────────────────────
        `;

        await ednut.sendMessage(from, { text: txt }, { quoted: m });
      } catch (e) {
        reply(`❌ Error: ${e.message}`);
      }
    },
  },

  {
    command: ["getgpp"],
    description: "Fetch group profile picture",
    category: "Privacy",
    async execute(m, { ednut, isGroup, reply }) {
      if (!isGroup) return reply("⚠️ Only works in groups");

      try {
        const groupPic = await ednut
          .profilePictureUrl(m.chat, "image")
          .catch(() => null);

        if (!groupPic) return reply("⚠️ No group profile picture found.");

        await ednut.sendMessage(m.chat, {
          image: { url: groupPic },
          caption: "🖼️ Group profile picture.",
        });
      } catch (e) {
        reply("❌ Error fetching group profile picture");
      }
    },
  },
];