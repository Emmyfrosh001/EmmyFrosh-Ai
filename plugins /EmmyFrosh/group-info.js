module.exports = [
  {
    command: ["ginfo"],
    alias: ["groupinfo"],
    description: "Get group information",
    category: "Group",
    group: true,
    execute: async (m, { ednut, from, isGroup, isAdmins, isBotAdmins, reply }) => {
      try {
        if (!isGroup) return reply("❌ This command can only be used in groups.");
        if (!isAdmins) return reply("❌ Only group admins can use this command.");
        if (!isBotAdmins) return reply("❌ I need to be an admin to get group info.");

        // Profile picture fallback URLs
        const ppUrls = [
          'https://i.ibb.co/KhYC4FY/1221bc0bdd2354b42b293317ff2adbcf-icon.png',
          'https://i.ibb.co/KhYC4FY/1221bc0bdd2354b42b293317ff2adbcf-icon.png',
          'https://i.ibb.co/KhYC4FY/1221bc0bdd2354b42b293317ff2adbcf-icon.png',
        ];

        let ppUrl;
        try {
          ppUrl = await ednut.profilePictureUrl(from, 'image');
        } catch {
          ppUrl = ppUrls[Math.floor(Math.random() * ppUrls.length)];
        }

        // Fetch group metadata
        const metadata = await ednut.groupMetadata(from);
        const participants = metadata.participants || []; // safe fallback
        const groupAdmins = participants.filter(p => p.admin);
        const listAdmin = groupAdmins.map((v, i) => `${i + 1}. @${v.id.split('@')[0]}`).join('\n');
        const owner = metadata.owner;

        // Construct message
        const gdata = `*「 Group Information 」*\n
*${metadata.subject}*

*Group Jid* - ${metadata.id}
*Participant Count* - ${metadata.size}
*Group Creator* - ${owner.split('@')[0]}
*Group Description* - ${metadata.desc?.toString() || 'undefined'}

*Group Admins* -
${listAdmin}\n`;

        await ednut.sendMessage(from, {
          image: { url: ppUrl },
          caption: gdata,
          mentions: groupAdmins.map(u => u.id)
        });

      } catch (e) {
        console.error("Error in ginfo:", e);
        return reply(`❌ *Error Occurred!!*\n\n${e}`);
      }
    }
  }
];