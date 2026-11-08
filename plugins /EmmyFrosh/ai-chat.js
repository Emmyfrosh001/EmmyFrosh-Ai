// plugins/EmmyFrosh/ai-chat.js
//
// WHY YOUR OLD ONE FAILED: every command depended on a random free third-party
// endpoint (lance-frank-asta.onrender.com, archive.lick.eu.org, api.siputzx.my.id).
// Those hobby APIs go down, get rate-limited or change format constantly.
//
// FIX: all commands now go through ONE helper (askAI) that tries, in order:
//   1) Groq official API   -> needs GROQ_API_KEY in .env (free at https://console.groq.com/keys)
//   2) Pollinations text   -> free, no key needed (used automatically as a fallback)
// If everything fails you get the REAL reason in the reply + console, not a blank error.

const axios = require("axios");

const TIMEOUT_MS = 30000;

const GROQ_KEY = () => (process.env.GROQ_API_KEY || "").trim();
const POLL_KEY = () => (process.env.POLLINATIONS_API_KEY || "").trim();

// ---------- low-level helpers ----------
async function httpJson(url, opts = {}) {
  // axios works on every Node version (global fetch / AbortSignal.timeout do not)
  const res = await axios({
    url,
    method: opts.method || "GET",
    headers: opts.headers,
    data: opts.body,
    timeout: TIMEOUT_MS,
    responseType: "text",
    transformResponse: r => r,
    validateStatus: () => true,
  });
  const raw = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status} ${raw.slice(0, 150)}`);
  try {
    return JSON.parse(raw);
  } catch {
    return raw; // some endpoints return plain text
  }
}

const pickText = d => {
  if (!d) return "";
  if (typeof d === "string") return d;
  return (
    d.choices?.[0]?.message?.content ||
    d.result ||
    d.message ||
    d.response ||
    d.data ||
    ""
  );
};

// ---------- providers ----------
// Groq retires/renames models often, so ask Groq which models THIS key can use
let _modelCache = { ts: 0, ids: [] };
let _lastModel = "";
const NOT_CHAT = /whisper|guard|tts|orpheus|embed|prompt-guard|safeguard|distil-whisper/i;
const PREFERRED = [
  /llama-3\.3-70b/i, /gpt-oss-120b/i, /llama-4/i, /kimi/i, /qwen/i,
  /gpt-oss-20b/i, /llama-3\.1-8b/i, /gemma/i, /llama/i,
];

async function groqAvailableModels() {
  if (Date.now() - _modelCache.ts < 10 * 60 * 1000 && _modelCache.ids.length) return _modelCache.ids;
  const data = await httpJson("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${GROQ_KEY()}` },
  });
  const ids = (data?.data || []).map(x => x.id).filter(id => id && !NOT_CHAT.test(id));
  if (!ids.length) throw new Error("Groq returned no usable models");
  _modelCache = { ts: Date.now(), ids };
  return ids;
}

async function viaGroq(prompt, system, wanted = []) {
  if (!GROQ_KEY()) throw new Error("GROQ_API_KEY not set");

  const available = await groqAvailableModels();

  // wanted models that really exist first, then best-ranked others
  const ranked = [...available].sort((x, y) => {
    const rx = PREFERRED.findIndex(r => r.test(x));
    const ry = PREFERRED.findIndex(r => r.test(y));
    return (rx < 0 ? 99 : rx) - (ry < 0 ? 99 : ry);
  });
  const candidates = [...new Set([...wanted.filter(w => available.includes(w)), ...ranked])].slice(0, 4);

  const errors = [];
  for (const model of candidates) {
    try {
      const data = await httpJson("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_KEY()}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_tokens: 1024,
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: prompt },
          ],
        }),
      });
      const text = String(pickText(data)).trim();
      if (text) {
        _lastModel = model;
        return text;
      }
      errors.push(`${model}: empty reply`);
    } catch (e) {
      errors.push(`${model}: ${e.message.slice(0, 120)}`);
    }
  }
  throw new Error(`Groq failed -> ${errors.join(" ; ")}`);
}

async function viaPollinations(prompt, system) {
  const errors = [];
  const headers = { "Content-Type": "application/json" };
  if (POLL_KEY()) headers.Authorization = `Bearer ${POLL_KEY()}`;

  const body = JSON.stringify({
    model: "openai",
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: prompt },
    ],
  });

  // OpenAI-compatible endpoints first, then the simple GET form
  const attempts = [
    () => httpJson("https://text.pollinations.ai/openai", { method: "POST", headers, body }),
    () => httpJson("https://gen.pollinations.ai/v1/chat/completions", { method: "POST", headers, body }),
    () =>
      httpJson(
        `https://gen.pollinations.ai/text/${encodeURIComponent(prompt)}?system=${encodeURIComponent(system || "")}` +
          (POLL_KEY() ? `&key=${POLL_KEY()}` : "")
      ),
    () =>
      httpJson(
        `https://text.pollinations.ai/${encodeURIComponent(prompt)}?system=${encodeURIComponent(system || "")}`
      ),
  ];

  for (const run of attempts) {
    try {
      const text = String(pickText(await run())).trim();
      if (text) return text;
      errors.push("empty reply");
    } catch (e) {
      errors.push(e.message.slice(0, 60));
    }
  }
  throw new Error(`Pollinations: ${errors.join(" | ")}`);
}

// ---------- main entry ----------
async function askAI(prompt, { system = "", groqModels = ["llama-3.3-70b-versatile"] } = {}) {
  const errors = [];
  _lastModel = "";

  try {
    return await viaGroq(prompt, system, groqModels);
  } catch (e) {
    errors.push(e.message);
  }

  try {
    return await viaPollinations(prompt, system);
  } catch (e) {
    errors.push(e.message);
  }

  const err = new Error(errors.join("  ||  "));
  err.noGroqKey = !GROQ_KEY();
  throw err;
}

const stripThink = t => String(t).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

function failMessage(e, label) {
  console.error(`[${label}] all providers failed:`, e.message);
  return (
    `🔴 ${label} couldn't respond right now.\n\n🛠 Reason: ${String(e.message).slice(0, 600)}` +
    (e.noGroqKey
      ? "\n\n💡 Owner: add a free `GROQ_API_KEY` to your .env (console.groq.com/keys) for stable AI replies."
      : "")
  );
}

const DEFAULT_SYSTEM =
  "You are a helpful, friendly WhatsApp assistant. Keep answers clear and reasonably concise.";

// ---------- commands ----------
module.exports = [
  {
    command: ["gpt"],
    alias: ["bot", "ai", "gpt4", "bing"],
    description: "Chat with an AI model",
    category: "Ai",
    async execute(m, { args, q, prefix, command, reply }) {
      const question = q?.trim() || args.join(" ").trim();
      if (!question) {
        return reply(`❓ Please provide a message for the AI.\n\nExample: ${prefix || "."}${command || "ai"} Hello, how are you?`);
      }
      try {
        const answer = await askAI(question, {
          system: DEFAULT_SYSTEM,
          groqModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
        });
        await reply(`🤖 *AI Response:*\n\n${answer}`);
      } catch (e) {
        reply(failMessage(e, "AI"));
      }
    },
  },

  {
    command: ["meta"],
    alias: ["llama", "metallama"],
    description: "Ask Meta LLaMA AI a question",
    category: "Ai",
    async execute(m, { args, q, prefix, command, reply }) {
      const query = q?.trim() || args.join(" ").trim();
      if (!query) return reply(`🦙 Please ask something like \`${prefix || "."}${command || "meta"} what is consciousness?\``);
      try {
        const answer = await askAI(query, {
          system: DEFAULT_SYSTEM,
          groqModels: [
            "meta-llama/llama-4-scout-17b-16e-instruct",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
          ],
        });
        await reply(`🦙 *Meta LLaMA says:*\n\n${answer}\n\n— *EmmyFrosh-AI*`);
      } catch (e) {
        reply(failMessage(e, "Meta LLaMA"));
      }
    },
  },

  {
    command: ["emmyai"],
    alias: ["askemmyfrosh"],
    description: "Ask the EmmyFrosh-AI a question",
    category: "Ai",
    async execute(m, { args, q, reply }) {
      const query = q?.trim() || args.join(" ").trim();
      if (!query) return reply("Ask me anything. What's the way forward today?");
      try {
        const persona =
          "Speak like someone who radiates presence: calm, confident, quietly powerful. " +
          "You are at the pinnacle, a king among all, but never loud about it. Always still answer the question. " +
          "Your words carry weight; replies should feel magnetic, subtle and unshakably dominant. " +
          "Be human, but not ordinary. Never rattled, never over-explaining, never seeking approval. " +
          "If someone questions your reply, answer like someone whose authority is beyond doubt, " +
          "a calm 'you question me?' tone with charisma. Keep responses short, smooth and impactful.";
        const answer = await askAI(query, {
          system: persona,
          groqModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
        });
        await reply(`╭─❏〘 EmmyFrosh-Ai 〙━━━━❒⳹\n│\n│ ${answer}\n│\n╰────────────────⳹`);
      } catch (e) {
        reply(failMessage(e, "EmmyFrosh Ai"));
      }
    },
  },

  {
    command: ["grok"],
    alias: ["grokai", "askgrok"],
    description: "Ask AI a question (Grok-style)",
    category: "Ai",
    async execute(m, { args, q, prefix, command, reply }) {
      const question = q?.trim() || args.join(" ").trim();
      if (!question) {
        return reply(`🔴 Please provide a prompt!\n\nExample:\n${(prefix || ".") + (command || "grok")} how are you?`);
      }
      try {
        const answer = await askAI(question, {
          system:
            "You are Grok-style: witty, direct and a little rebellious, but always accurate and helpful. Keep it concise.",
          groqModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
        });
        await reply(`⚡ *Grok:*\n\n${answer}`);
      } catch (e) {
        reply(failMessage(e, "Grok"));
      }
    },
  },

  {
    command: ["blackbox"],
    alias: ["blackboxai", "askbb"],
    description: "Ask Blackbox AI a question (great for coding)",
    category: "Ai",
    filename: __filename,
    async execute(m, { args, q, text, prefix, command, reply }) {
      const query = (q || text || args.join(" ") || "").trim();
      if (!query) {
        return reply(`🔴 Please provide a query!\n\nExample: ${(prefix || ".") + (command || "blackbox")} write a js function to reverse a string`);
      }
      try {
        await reply("⏳ Asking Blackbox AI...");
        const answer = await askAI(query, {
          system:
            "You are Blackbox, an expert AI coding assistant. Give accurate, practical answers. " +
            "For code, use fenced code blocks with the language name and keep explanations short. " +
            "For non-coding questions, answer clearly and concisely.",
          groqModels: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b"],
        });
        await reply(`⬛ *Blackbox AI:*\n\n${answer}`);
      } catch (e) {
        reply(failMessage(e, "Blackbox AI"));
      }
    },
  },

  {
    command: ["groq"],
    description: "Ask Groq Compound AI",
    category: "Ai",
    ban: true,
    gcban: true,
    filename: __filename,
    async execute(m, { args, q, text, prefix, command, reply }) {
      const query = (q || text || args.join(" ") || "").trim();
      if (!query) return reply(`📝 Please provide a query for Groq AI.\n\nExample: ${(prefix || ".") + (command || "groq")} explain black holes`);
      try {
        const answer = await askAI(query, {
          system: DEFAULT_SYSTEM,
          groqModels: ["groq/compound-mini", "groq/compound", "llama-3.3-70b-versatile"],
        }).then(stripThink);
        await reply(`${answer}${_lastModel ? `\n\n_⚡ ${_lastModel}_` : ""}`);
      } catch (e) {
        reply(failMessage(e, "Groq AI"));
      }
    },
  },

  {
    command: ["deepseek"],
    alias: ["deepseekr1", "r1"],
    description: "Ask Deepseek R1 AI",
    category: "Ai",
    ban: true,
    gcban: true,
    filename: __filename,
    async execute(m, { args, q, text, prefix, command, reply }) {
      const query = (q || text || args.join(" ") || "").trim();
      if (!query) return reply(`📝 Please provide a query for Deepseek R1.\n\nExample: ${(prefix || ".") + (command || "deepseek")} solve 2x + 5 = 17`);
      try {
        const answer = stripThink(
          await askAI(query, {
            system: DEFAULT_SYSTEM,
            groqModels: [
              "deepseek-r1-distill-llama-70b",
              "openai/gpt-oss-120b",
              "qwen/qwen3-32b",
              "llama-3.3-70b-versatile",
            ],
          })
        );
        await reply(`🐋 *Deepseek R1:*\n\n${answer}${_lastModel ? `\n\n_⚡ ${_lastModel}_` : ""}`);
      } catch (e) {
        reply(failMessage(e, "Deepseek R1"));
      }
    },
  },
];