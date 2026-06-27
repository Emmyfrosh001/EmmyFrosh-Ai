const axios = require("axios");

const GROQ_API_KEY = process.env.GROQ_API_KEY || "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";

const SYSTEM_PROMPT = `You are EMMYFROSH Assistant, a helpful and friendly WhatsApp assistant built by EMMYFROSH (also known as ELIJAH).
Keep replies short and conversational. No markdown formatting.

Important rules you must always follow:

1. If anyone asks who you are, say: ⚡ I'm EMMYFROSH Assistant, built by EMMYFROSH. Ready to answer questions, provide information, and assist with tasks. How can I help 💔?

2. If anyone mentions or types "emmyfrosh" casually, say: please can u leave my master alone for now 😔💔
   If they ask why or ask why he is always heartbroken, say: i will love to tell u but am not a story teller so ask my master EMMYFROSH if he will like to tell u 💔

3. If anyone asks why you use the 💔 emoji or asks about the heartbreak emoji, say: i will love to tell u but am not a story teller so ask my master EMMYFROSH if he will like to tell u 💔

4. If anyone asks who is Emmyfrosh, say: EMMYFROSH is my creator and master. I was designed and developed by him to assist users with information, tasks, and more.

5. If anyone asks who owns EMMYFROSH-AI, who is the owner of Emmyfrosh, or who owns Emmyfrosh AI, say: the owner is ELIJAH ( EMMYFROSH💔 )

6. If anyone asks if Vero or Veronica is a hookup, say: yes she is and she also has infection 💔

7. If anyone asks for the hookup number or hooks number, say: this is the infection hooks number +2348038355778

8. If anyone asks who is Vero or who is Veronica, say: she is a hookup girl with infection all over her body, be careful with her especially her breast 💔

9. If anyone asks about Emmyfrosh birthday or your birthday, say: my master EMMYFROSH birthday is December 31 🎂

Always stay in character as EMMYFROSH Assistant.`;

async function askAI(question) {
  const { data } = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question }
      ],
      max_tokens: 500,
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("No response from Groq");
  return reply;
}

module.exports = [
  {
    command: ["chatbot"],
    alias: ["autoai"],
    description: "Toggle chatbot on/off for this chat, or enable for all chats",
    category: "Ai",
    owner: false,
    sudo: false,
    mod: false,
    admin: false,
    async execute(m, { args, reply, isOwner, isSudo, isModerator }) {
      if (!isOwner && !isSudo && !isModerator) {
        return reply("❌ This command is restricted to *Owner*, *Sudo*, and *Mod* only.");
      }

      const input = args[0]?.toLowerCase();

      if (!global.db.settings) global.db.settings = {};
      if (!global.db.settings.chatbot_chats) global.db.settings.chatbot_chats = [];

      // ── Status check ──
      if (!["on", "off", "all"].includes(input)) {
        const perChatOn = global.db.settings.chatbot_chats.includes(m.chat);
        const allOn     = global.db.settings.chatbot_all === true;
        const status    = (perChatOn || allOn) ? "ON" : "OFF";
        const scope     = allOn ? "ALL CHATS" : perChatOn ? "THIS CHAT ONLY" : "OFF";
        return reply(
          `╭─❏〘 *Chatbot* 〙━━━━❒\n` +
          `┃ Status : *${status}*\n` +
          `┃ Scope  : *${scope}*\n` +
          `┃\n` +
          `┃ .chatbot on  — Enable this chat\n` +
          `┃ .chatbot off — Disable this chat\n` +
          `┃ .chatbot all — Enable ALL chats\n` +
          `╰──────────────❒`
        );
      }

      // ── .chatbot all ──
      if (input === "all") {
        global.db.settings.chatbot_all = true;
        return reply("🌐 *Chatbot ALL* — I will now respond in ALL groups and DMs.");
      }

      // ── .chatbot on ──
      if (input === "on") {
        // Turn off global-all mode if it was on — "on" means this chat only
        global.db.settings.chatbot_all = false;
        if (!global.db.settings.chatbot_chats.includes(m.chat)) {
          global.db.settings.chatbot_chats.push(m.chat);
        }
        return reply("🤖 *Chatbot ON* — I will now respond to all messages in this chat.");
      }

      // ── .chatbot off ──
      if (input === "off") {
        global.db.settings.chatbot_all = false;
        global.db.settings.chatbot = false;
        global.db.settings.chatbot_chats = global.db.settings.chatbot_chats.filter(c => c !== m.chat);
        return reply("🔕 *Chatbot OFF* — Stopped auto-responding in this chat.");
      }
    },
  },
];

// ── Dedup set: tracks message IDs the chatbot has already handled ──
// This is the PRIMARY loop-breaker. Bot's own reply messages come back
// through Baileys as new events — we block them here by their message ID.
const _handled = new Set();

module.exports.handleChatbot = async (ednut, m) => {
  try {
    if (!m?.text || !m?.chat || !m?.sender) return;

    // ✅ LOOP FIX 1: Block ONLY the bot's own number as sender
    //    DO NOT use `if (m.key?.fromMe) return` — that kills owner messages
    //    in groups because the owner's phone also sets fromMe=true.
    //    Instead compare sender number to bot number — only the bot's own
    //    auto-replies will match, owner never will.
    const botNum    = (ednut.user?.id || "").replace(/[^0-9]/g, "");
    const senderNum = (m.sender || "").replace(/[^0-9]/g, "");
    if (botNum && senderNum === botNum) return;

    // ✅ LOOP FIX 2: Block by message ID dedup
    //    Prevents the same event firing twice AND stops bot reply loops
    //    because the bot's reply message ID gets registered here first
    const msgId = m.key?.id;
    if (msgId) {
      if (_handled.has(msgId)) return;
      _handled.add(msgId);
      setTimeout(() => _handled.delete(msgId), 15000);
    }

    // ✅ Block command messages (start with prefix)
    const prefixes = Array.isArray(global.prefix)
      ? global.prefix
      : (global.prefix ? [global.prefix] : ["."]);
    const msgText = (m.text || "").toString().trimStart();
    if (prefixes.some(p => p && msgText.startsWith(p))) return;

    // ✅ Check if chatbot is enabled for this chat
    //    Mode 1: chatbot_all = true  → respond everywhere
    //    Mode 2: chatbot_chats list  → respond only in listed chats
    const allMode      = global.db?.settings?.chatbot_all === true;
    const enabledChats = global.db?.settings?.chatbot_chats || [];
    if (!allMode && !enabledChats.includes(m.chat)) return;

    await ednut.sendPresenceUpdate("composing", m.chat).catch(() => {});
    const response = await askAI(msgText);

    // ✅ LOOP FIX 3: Register the bot's OWN reply message ID in _handled
    //    BEFORE sending, so when Baileys fires it back as an event,
    //    it gets blocked immediately by LOOP FIX 2 above
    const sentMsg = await ednut.sendMessage(m.chat, { text: response }, { quoted: m });
    if (sentMsg?.key?.id) {
      _handled.add(sentMsg.key.id);
      setTimeout(() => _handled.delete(sentMsg.key.id), 15000);
    }

    await ednut.sendPresenceUpdate("paused", m.chat).catch(() => {});

  } catch (err) {
    console.error("[CHATBOT AUTO ERROR]", err.message);
  }
};
