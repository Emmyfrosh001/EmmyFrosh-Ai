module.exports = [
  {
    command: ["spamtag"],
    description: "Mention a user multiple times with optional message",
    category: "Group",
    group: true,
    owner: true,
    async execute(m, { ednut, text, sleep, reply }) {
      if (!text.includes(" ")) {
        return reply(`Example:\n• spamtag @user 5\n• spamtag @user 5 Hello there!`);
      }

      const args = text.split(" ");
      const amount = parseInt(args[1], 10);

      if (isNaN(amount) || amount <= 0) {
        return reply("Amount must be a positive number!");
      }

      const mentionedUser = m.mentionedJid?.[0];
      if (!mentionedUser) {
        return reply("You must tag someone to spam!");
      }

      const customMsg = args.slice(2).join(" ").trim();

      for (let i = 0; i < amount; i++) {
        await ednut.sendMessage(m.chat, {
          text: `@${mentionedUser.split("@")[0]}${customMsg ? ` ${customMsg}` : ""}`,
          mentions: [mentionedUser]
        });
        await sleep(1000); // uses your global sleep
      }
    }
  }
];