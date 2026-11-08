module.exports = [
  {
    command: ["poll"],
    category: "Group",
    group: true,

    execute: async (m, { ednut, text, reply }) => {
      try {
        // Validation: check if text exists
        if (!text) return reply("❌ Usage:\n.poll Question | opt1 | opt2\n.poll Question / opt1 / opt2\n.poll Question, opt1, opt2");

        // Split logic: Handles |, /, and ,
        // We use a regex that looks for these specific characters
        let parts = text.split(/[|/,]/).map(v => v.trim()).filter(v => v !== "");

        if (parts.length < 3) {
          return reply("❌ Format error! Need a question and at least 2 options.\nExample: .poll Pizza / Yes / No");
        }

        const question = parts[0];
        const options = parts.slice(1);

        // Limit options to prevent crashing (WhatsApp limit is usually 12)
        if (options.length > 10) return reply("❌ Max 10 options allowed.");

        await ednut.sendMessage(m.chat, {
          poll: {
            name: question,
            values: options,
            selectableCount: 1
          }
        });

      } catch (e) {
        console.error("Poll Error:", e);
        reply("❌ Error: Make sure you used the separators correctly (/, |, or ,)");
      }
    },
  }
];
