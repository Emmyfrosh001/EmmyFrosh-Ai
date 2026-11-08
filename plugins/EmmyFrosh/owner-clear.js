const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = [
  {
    command: ["clear"],
    description: "Clear chat for bot account (owner only)",
    category: "Owner",
    ban: true,
    gcban: true,
    owner: true,
    async execute(m, { ednut, isOwner, reply }) {
      if (!isOwner) return reply("❌ Only the bot owners can use this command.");

      try {
        const jid = m.chat;

        // Simple getLastMessageInChat using current message (fallback)
        const getLastMessageInChat = async (jid) => m; // fallback to current message

        const lastMsgInChat = await getLastMessageInChat(jid);

        if (!lastMsgInChat?.key || !lastMsgInChat?.messageTimestamp) {
          console.warn("⚠️ Cannot clear: missing key or timestamp.");
          return;
        }

        await ednut.chatModify({
          delete: true,
          lastMessages: [
            {
              key: lastMsgInChat.key,
              messageTimestamp: lastMsgInChat.messageTimestamp
            }
          ]
        }, jid);

        await sleep(1500);
        reply("✅ _Chat cleared_.");
      } catch (err) {
        reply(`❌ Failed to clear chat:\n\n${err.message || err.toString()}`);
      }
    }
  }
];
