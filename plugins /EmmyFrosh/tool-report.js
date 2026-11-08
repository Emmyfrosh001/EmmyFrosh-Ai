module.exports = [
  {
    command: ["report"],
    alias: ["ask", "bug", "request"],
    description: "Report a bug or request a feature",
    category: "Tool",
    use: "<message>",
    async execute(m, { ednut, args, fontx, reply, isOwner }) {
      try {
        const firstPrefix = Array.isArray(global.prefix) ? global.prefix[0] : global.prefix;

        if (!args.length) {
          return reply(`Example: ${firstPrefix}report Play command is not working`);
        }

        // store outside function if you want persistence
        const devNumber = "2349160224621";  
        const devJid = `${devNumber}@s.whatsapp.net`;

        const senderJid = m.sender;
        const reportText = `*| REQUEST/BUG |*\n\n*User*: @${senderJid.split("@")[0]}\n*Request/Bug*: ${args.join(" ")}`;
        const confirmationText = `ʜɪ ${m.pushName || "User"}, ʏᴏᴜʀ ʀᴇǫᴜᴇꜱᴛ ʜᴀꜱ ʙᴇᴇɴ ꜰᴏʀᴡᴀʀᴅᴇᴅ ᴛᴏ ᴛʜᴇ ᴏᴡɴᴇʀ. ᴘʟᴇᴀꜱᴇ ᴡᴀɪᴛ...`;

        await ednut.sendMessage(
          devJid,
          {
            text: reportText,
            mentions: [senderJid]
          },
          { quoted: m }
        );

        reply(confirmationText);
      } catch (error) {
        console.error("[REPORT COMMAND ERROR]:", error);
        reply("⚠️ An error occurred while processing your report.");
      }
    }
  }
];