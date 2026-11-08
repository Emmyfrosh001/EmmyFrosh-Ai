module.exports = [
  {
    command: ["bot-info"],
    alias: ["emmyinfo", "Emmy-info", ""],
    description: "Information on how to use the bot.",
    category: "Info",
    filename: __filename,
    async execute(m, { ednut, from, reply }) {
      try {
        const prefix = global.prefix; 
        const ownerNumber = '+2349160224621';
        const ownerName = 'Elijah';

        // vCard content
        const vCard = 
`BEGIN:VCARD
VERSION:3.0
FN:${ownerName}
TEL;type=CELL;type=VOICE;waid=${ownerNumber.replace('+', '')}:${ownerNumber}
END:VCARD`;

        const message = 
`🔹 *Welcome to EmmyFrosh-Ai* 🔹
*(Please read everything carefully)*

📌 *Getting Started*
1️⃣ Use *${prefix}list* to Get all available commands with descriptions.
2️⃣ Use *${prefix}help <command>* to Learn how a specific command works.
3️⃣ Use *${prefix}report <command>* to Report issues or broken commands.
4️⃣ Use *${prefix}request <feature>* to Suggest new commands or features.
5️⃣ Visit: *${global.scan}* to Explore extra plugins. Use *${prefix}install <link>* to apply.
6️⃣ Reach out to the bot owner for any inquiries.
7️⃣ Use *${prefix}pair* to Connect your number to the bot for a session ID.
8️⃣ *Configuration Commands*
- *setenv* to Change bot settings if you are using a hosting panel.
- *setvar* to Change bot settings if you are deploying on Heroku.

🔄 *Updates*
9️⃣ Use *${prefix}update* to Update the bot.

🎭 *Reactions*
🔟 Use *${prefix}areact off/cmd/all* to Control bot reactions.
   - off to Disable all reactions
   - cmd to React only when a command is used
   - all to React to every message

💡 *Tips*
- Share the bot with friends.
- Join our support channel to stay updated on new features.

🌐 *Website & Resources*
- Visit: ${global.scan} to Learn more and get session IDs.
- Report issues using *${prefix}report <command>*.

`;

        // Send the info message
        await ednut.sendMessage(from, { text: message });

        // Send the vCard
        await ednut.sendMessage(from, {
          contacts: {
            displayName: ownerName,
            contacts: [{ vcard: vCard }]
          }
        });

      } catch (err) {
        console.error("Error in Manual command:", err);
        await ednut.sendMessage(from, { text: "❌ Something went wrong while retrieving the information." });
      }
    }
  }
];