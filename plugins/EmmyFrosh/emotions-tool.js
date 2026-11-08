module.exports = [
  {
    command: ["happy"],
    description: "Displays a dynamic edit msg for fun.",
    category: "Fun",
    filename: __filename,
    async execute(m, { ednut, reply, from }) {
      try {
        const loadingMessage = await ednut.sendMessage(from, { text: '😂' });
        const emojiMessages = [
          "😃", "😄", "😁", "😊", "😎", "🥳",
          "😸", "😹", "🌞", "🌈", "😃", "😄",
          "😁", "😊", "😎", "🥳", "😸", "😹",
          "🌞", "🌈", "😃", "😄", "😁", "😊"
        ];

        for (const line of emojiMessages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await ednut.relayMessage(from, {
            protocolMessage: {
              key: loadingMessage.key,
              type: 14,
              editedMessage: { conversation: line },
            },
          }, {});
        }
      } catch (e) {
        console.log(e);
        reply(`❌ *Error!* ${e.message}`);
      }
    }
  },

  {
    command: ["heart"],
    description: "Displays a dynamic edit msg for fun.",
    category: "Fun",
    filename: __filename,
    async execute(m, { ednut, reply, from }) {
      try {
        const loadingMessage = await ednut.sendMessage(from, { text: '🧡' });
        const emojiMessages = [
          "💖", "💗", "💕", "🚹", "💛", "💚",
          "🖤", "💙", " 💞", "💝🩶", "🤍",
          "🤎", "❤️‍🔥", "💞", "💓", "💘", "💝",
          "♥️", "💟", "❤️‍🩹", "❤️"
        ];

        for (const line of emojiMessages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await ednut.relayMessage(from, {
            protocolMessage: {
              key: loadingMessage.key,
              type: 14,
              editedMessage: { conversation: line },
            },
          }, {});
        }
      } catch (e) {
        console.log(e);
        reply(`❌ *Error!* ${e.message}`);
      }
    }
  },

  {
    command: ["angry"],
    description: "Displays a dynamic edit msg for fun.",
    category: "Fun",
    filename: __filename,
    async execute(m, { ednut, reply, from }) {
      try {
        const loadingMessage = await ednut.sendMessage(from, { text: '👽' });
        const emojiMessages = ["😡", "😠", "🤬", "😤", "😾", "😡", "😠", "🤬", "😤", "😾"];

        for (const line of emojiMessages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await ednut.relayMessage(from, {
            protocolMessage: {
              key: loadingMessage.key,
              type: 14,
              editedMessage: { conversation: line },
            },
          }, {});
        }
      } catch (e) {
        console.log(e);
        reply(`❌ *Error!* ${e.message}`);
      }
    }
  },

  {
    command: ["sad"],
    description: "Displays a dynamic edit msg for fun.",
    category: "Fun",
    filename: __filename,
    async execute(m, { ednut, reply, from }) {
      try {
        const loadingMessage = await ednut.sendMessage(from, { text: '😔' });
        const emojiMessages = [
          "🥺", "😟", "😕", "😖", "😫", "🙁",
          "😩", "😥", "😓", "😪", "😢", "😔",
          "😞", "😭", "💔", "😭", "😿"
        ];

        for (const line of emojiMessages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await ednut.relayMessage(from, {
            protocolMessage: {
              key: loadingMessage.key,
              type: 14,
              editedMessage: { conversation: line },
            },
          }, {});
        }
      } catch (e) {
        console.log(e);
        reply(`❌ *Error!* ${e.message}`);
      }
    }
  },

  {
    command: ["shy"],
    description: "Displays a dynamic edit msg for fun.",
    category: "Fun",
    filename: __filename,
    async execute(m, { ednut, reply, from }) {
      try {
        const loadingMessage = await ednut.sendMessage(from, { text: '🧐' });
        const emojiMessages = ["😳", "😊", "😶", "🙈", "🙊", "😳", "😊", "😶", "🙈", "🙊"];

        for (const line of emojiMessages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await ednut.relayMessage(from, {
            protocolMessage: {
              key: loadingMessage.key,
              type: 14,
              editedMessage: { conversation: line },
            },
          }, {});
        }
      } catch (e) {
        console.log(e);
        reply(`❌ *Error!* ${e.message}`);
      }
    }
  },

  {
    command: ["moon"],
    description: "Displays a dynamic edit msg for fun.",
    category: "Fun",
    filename: __filename,
    async execute(m, { ednut, reply, from }) {
      try {
        const loadingMessage = await ednut.sendMessage(from, { text: '🌝' });
        const emojiMessages = [
          "🌗", "🌘", "🌑", "🌒", "🌓", "🌔",
          "🌕", "🌖", "🌗", "🌘", "🌑", "🌒",
          "🌓", "🌔", "🌕", "🌖", "🌗", "🌘",
          "🌑", "🌒", "🌓", "🌔", "🌕", "🌖",
          "🌗", "🌘", "🌑", "🌒", "🌓", "🌔",
          "🌕", "🌖", "🌝🌚"
        ];

        for (const line of emojiMessages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await ednut.relayMessage(from, {
            protocolMessage: {
              key: loadingMessage.key,
              type: 14,
              editedMessage: { conversation: line },
            },
          }, {});
        }
      } catch (e) {
        console.log(e);
        reply(`❌ *Error!* ${e.message}`);
      }
    }
  },

  {
    command: ["confused"],
    description: "Displays a dynamic edit msg for fun.",
    category: "Fun",
    filename: __filename,
    async execute(m, { ednut, reply, from }) {
      try {
        const loadingMessage = await ednut.sendMessage(from, { text: '🤔' });
        const emojiMessages = ["😕", "😟", "😵", "🤔", "😖", "😲", "😦", "🤷", "🤷‍♂️", "🤷‍♀️"];

        for (const line of emojiMessages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await ednut.relayMessage(from, {
            protocolMessage: {
              key: loadingMessage.key,
              type: 14,
              editedMessage: { conversation: line },
            },
          }, {});
        }
      } catch (e) {
        console.log(e);
        reply(`❌ *Error!* ${e.message}`);
      }
    }
  },

  {
    command: ["hot"],
    description: "Displays a dynamic edit msg for fun.",
    category: "Fun",
    filename: __filename,
    async execute(m, { ednut, reply, from }) {
      try {
        const loadingMessage = await ednut.sendMessage(from, { text: '💋' });
        const emojiMessages = [
          "🥵", "❤️", "💋", "😫", "🤤", 
          "😋", "🥵", "🥶", "🙊", "😻", 
          "🙈", "💋", "🫂", "🫀", "👅", 
          "👄", "💋"
        ];

        for (const line of emojiMessages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await ednut.relayMessage(from, {
            protocolMessage: {
              key: loadingMessage.key,
              type: 14,
              editedMessage: { conversation: line },
            },
          }, {});
        }
      } catch (e) {
        console.log(e);
        reply(`❌ *Error!* ${e.message}`);
      }
    }
  }
];