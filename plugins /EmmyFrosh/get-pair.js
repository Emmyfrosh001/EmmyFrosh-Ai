const fetch = require("node-fetch");

// ==========================================
// PAIR — generates a WhatsApp pairing code from your pair site
// ==========================================
const PAIR_SITE = "https://emmyfrosh.name.ng"; // your pair site
// Routes to try, in order. The first one that returns a code is used.
// If you know the exact route of your site, keep only that one here.
const PAIR_ROUTES = ["/code?number=", "/pair?number=", "/api/pair?number=", "/pair/code?number="];
const TIMEOUT_MS = 30000; // pair servers can take a while to answer

// the code can come back under different names depending on the server
function pickCode(data) {
  if (!data || typeof data !== "object") return null;
  const code =
    data.code || data.pair || data.pairingCode || data.pairing_code ||
    (data.data && (data.data.code || data.data.pairingCode)) || null;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }
    });
    const raw = await res.text();
    try { return JSON.parse(raw); } catch { return null; } // not JSON (e.g. an HTML page)
  } finally {
    clearTimeout(timer);
  }
}

async function requestPairCode(digits) {
  for (const route of PAIR_ROUTES) {
    try {
      const data = await getJson(`${PAIR_SITE}${route}${encodeURIComponent(digits)}`);
      const code = pickCode(data);
      if (code) return code;
    } catch (e) {
      // this route failed (timeout / network): try the next one
    }
  }
  return null;
}

module.exports = [
  {
    command: ["pair"],
    alias: ["getpair", "clonebot"],
    description: "Generate a pairing code",
    category: "Other",
    use: "<phone_number>",
    filename: __filename,
    async execute(m, { ednut, q, reply, prefix }) {
      try {
        const input = Array.isArray(q) ? q.join(" ") : String(q || "");
        if (!input.trim()) {
          return await reply(`*Example -* ${prefix}pair 2346921XX\n\nOr use the website: ${PAIR_SITE}`);
        }

        // keep digits only (removes +, spaces, dashes)
        const digitsOnly = input.replace(/\D/g, "");

        if (digitsOnly.startsWith("0")) {
          return await reply("❗Please use your country code (e.g., 234) instead of starting with 0.");
        }
        if (digitsOnly.length < 8 || digitsOnly.length > 15) {
          return await reply("❗That phone number does not look right. Use the country code and the full number, e.g. 2348012345678.");
        }

        await reply("⏳ Generating your pairing code, please wait...");

        const pairingCode = await requestPairCode(digitsOnly);

        if (!pairingCode) {
          return await reply(`❌ Failed to get a pairing code. Check the number and try again, or use the website: ${PAIR_SITE}`);
        }

        const doneMessage = "> *Emmyfrosh-Ai* Code Generated";

        // First message with details
        await ednut.sendMessage(m.chat, { text: `${doneMessage}\n\n*Your pairing code is:* \`${pairingCode}\` ` }, { quoted: m });

        await new Promise((res) => setTimeout(res, 2000));

        // Just the pairing code again (easy to copy)
        await ednut.sendMessage(m.chat, { text: `${pairingCode}` }, { quoted: m });

      } catch (error) {
        console.error(error);
        await reply("⚠️ An error occurred. Please try again later.");
      }
    },
  },
];