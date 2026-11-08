const translate = require('translate-google-api')
const axiosLib = require('axios')

// ================================================================
//  helpers for .getpp / .pp / .pfp
//  WhatsApp often gives a hidden "@lid" id instead of the phone number,
//  and the profile picture only loads with the real phone-number id.
//  So we build a list of ids (phone number first) and try them all.
// ================================================================
const stripDevice = (j) => String(j || "").replace(/:\d+@/, "@")
const isLidJid = (j) => String(j || "").endsWith("@lid")
const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))])

async function candidateJids(m, ednut, target, resolveLidDigits) {
  const list = []
  const add = (j) => {
    if (!j || typeof j !== "string") return
    const clean = stripDevice(j)
    if (!/@/.test(clean)) return
    if (!list.includes(clean)) list.push(clean)
  }
  const addPhone = (j) => { if (j && !isLidJid(j)) add(j) }

  if (!target) return list
  const t = stripDevice(target)

  // ids that belong to the person who SENT the command. They must never be used
  // for somebody else, otherwise you get your own picture (or the wrong person's).
  const senderIds = [m.sender, m.key?.participant, m.key?.participantAlt, m.key?.remoteJidAlt]
    .filter(Boolean).map(stripDevice)
  const isSelf = senderIds.includes(t)
  const finish = () => (isSelf ? list : list.filter((j) => !senderIds.includes(j)))

  // already a phone-number id: use it straight away
  if (!isLidJid(t)) {
    add(t)
    return list
  }

  // 1) lid -> phone number table inside Baileys
  for (const l of [target, t]) {
    try { addPhone(await ednut.signalRepository?.lidMapping?.getPNForLID?.(l)) } catch {}
  }

  // 2) phone number info that came with the replied message
  //    (only when the target really is the person who was replied to)
  if (stripDevice(m.quoted?.sender) === t) {
    for (const alt of [
      m.quoted?.senderAlt,
      m.quoted?.key?.participantPn,
      m.quoted?.key?.participantAlt,
      m.quoted?.participantAlt,
    ]) addPhone(alt)
  }

  // 3) the group member list (in lid groups each member carries the phone number)
  if (String(m.chat || "").endsWith("@g.us")) {
    try {
      const meta = await withTimeout(ednut.groupMetadata(m.chat), 8000)
      const same = (x) => x && stripDevice(x) === t
      const p = (meta?.participants || []).find((x) => same(x.id) || same(x.lid) || same(x.jid))
      if (p) {
        addPhone(p.phoneNumber)
        addPhone(p.jid)
        addPhone(p.id)
      }
    } catch {}
  }

  // 4) the bot's own lid resolver
  try {
    if (typeof resolveLidDigits === "function") {
      const digits = await resolveLidDigits(target)
      if (digits && /^\d{7,15}$/.test(String(digits))) add(digits + "@s.whatsapp.net")
    }
  } catch {}

  // 5) last chance: the lid itself
  add(t)
  return finish()
}

async function downloadProfilePicture(ednut, jids, tag = "pp") {
  let lastError = null
  for (const jid of jids) {
    for (const type of ["image", "preview"]) {
      try {
        const url = await withTimeout(ednut.profilePictureUrl(jid, type), 10000)
        if (!url) continue
        const res = await axiosLib.get(url, { responseType: "arraybuffer", timeout: 20000 })
        console.log(`[${tag}] profile picture OK from ${jid} (${type})`)
        return Buffer.from(res.data)
      } catch (e) {
        lastError = e
      }
    }
  }
  console.log(`[${tag}] could not read the profile picture (tried ${jids.join(", ") || "nothing"}):`, lastError?.message || lastError)
  return null
}

// plain WHITE profile picture, used when the person has no visible picture
let sharpLib
try { sharpLib = require("sharp") } catch {}
async function whiteAvatar() {
  const size = 640
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#ffffff"/>
  <circle cx="${size / 2}" cy="${size * 0.38}" r="${size * 0.17}" fill="#c4c8cf"/>
  <ellipse cx="${size / 2}" cy="${size * 0.95}" rx="${size * 0.32}" ry="${size * 0.32}" fill="#c4c8cf"/>
</svg>`
  if (sharpLib) return sharpLib(Buffer.from(svg)).png().toBuffer()
  const res = await axiosLib.get("https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png", { responseType: "arraybuffer", timeout: 20000 })
  return Buffer.from(res.data)
}

module.exports = [
  {
    command: "translate",
    alias: ["trt"],
    description: "Translate text into another language",
    category: "Tool",
    ban: true,
    gcban: true,
    execute: async (m, { text, args, ednut, example }) => {
      const defaultLang = "en"
      let language, teks

      if (!text && !m.quoted) return m.reply(example("en good night"))

      if (text && !m.quoted) {
        if (args.length < 2) return m.reply(example("en good night"))
        language = args[0]
        teks = text.split(" ").slice(1).join(" ")
      } else if (m.quoted && m.quoted.text) {
        if (!args[0]) return m.reply(example("en good night"))
        language = args[0]
        teks = m.quoted.text
      } else {
        return m.reply(example("en good night"))
      }

      try {
        const result = await translate(teks, { to: language })
        m.reply(result[0])
      } catch (e) {
        global.log("ERROR", `translate plugin: ${e.message || e}`)
        try {
          const result = await translate(teks, { to: defaultLang })
          m.reply(result[0])
        } catch (err) {
          global.log("ERROR", `translate fallback: ${err.message || err}`)
          m.reply("Failed to translate the text.")
        }
      }
    }
  },
  {
    command: ["dictionary"],
    alias: ["define", "meaning"],
    description: "Get the definition of an English word",
    category: "Tool",
    ban: true,
    gcban: true,
    execute: async (m, { text, ednut, fetch }) => {
      try {
        const word = text.trim();
        if (!word) return m.reply("Please provide a word to define.");

        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        if (!res.ok) return m.reply("Word not found or invalid.");

        const data = await res.json();
        const entry = data[0];

        let reply = `*Definition of "${entry.word}"*\n`;

        const phonetic = entry.phonetics.find(p => p.text) || {};
        if (phonetic.text) reply += `Pronunciation: _${phonetic.text}_\n`;

        entry.meanings.slice(0, 2).forEach((meaning, idx) => {
          reply += `\n${idx + 1}. *${meaning.partOfSpeech}*\n`;
          meaning.definitions.slice(0, 2).forEach(def => {
            reply += `- ${def.definition}\n`;
            if (def.example) reply += `  _e.g._ "${def.example}"\n`;
          });
        });

        const synonyms = entry.meanings.flatMap(m => m.synonyms).filter(Boolean);
        const antonyms = entry.meanings.flatMap(m => m.antonyms).filter(Boolean);

        if (synonyms.length) {
          reply += `\nSynonyms: ${[...new Set(synonyms)].slice(0, 5).join(", ")}`;
        }
        if (antonyms.length) {
          reply += `\nAntonyms: ${[...new Set(antonyms)].slice(0, 5).join(", ")}`;
        }

        await ednut.sendMessage(m.chat, { text: reply.trim() }, { quoted: m });

        const audioUrl = entry.phonetics.find(p => p.audio)?.audio;
        if (audioUrl) {
          await ednut.sendMessage(m.chat, {
            audio: { url: audioUrl },
            mimetype: 'audio/mp4',
            ptt: true
          }, { quoted: m });
        }

      } catch (e) {
        global.log("ERROR", `dictionary plugin: ${e.message || e}`);
        m.reply("Failed to fetch definition.");
      }
    }
  },
  {
    command: "getpp",
    alias: ["pfp", "pp"],
    description: "Get profile picture of a user (tag, reply, type a number, or yourself)",
    category: "Privacy",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, text, reply, resolveLidDigits }) => {
      try {
        // who: 1) tagged person  2) number typed  3) replied person  4) yourself
        let target = null
        const digits = String(text || "").replace(/[^0-9]/g, "")

        if (Array.isArray(m.mentionedJid) && m.mentionedJid[0]) {
          target = m.mentionedJid[0]
        } else if (digits.length >= 7 && digits.length <= 15) {
          let n = digits
          if (/^0\d{10}$/.test(n)) n = "234" + n.slice(1) // 0803... -> 234803...
          target = n + "@s.whatsapp.net"
          try {
            const [info] = await ednut.onWhatsApp(target)
            if (info && info.exists === false) return reply("❎ That number is not on WhatsApp.")
            if (info?.jid) target = info.jid
          } catch {}
        } else if (m.quoted?.sender) {
          target = m.quoted.sender
        } else {
          target = m.sender
        }

        if (!target) return reply("❎ Please mention a user, reply to their message, or enter their number.")

        const jids = await candidateJids(m, ednut, target, resolveLidDigits)
        console.log(`[pp] target=${target} | mention=${(m.mentionedJid || [])[0] || "-"} | typed=${digits || "-"} | quoted=${m.quoted?.sender || "-"} | sender=${m.sender || "-"} | trying: ${jids.join(", ")}`)

        let buffer = await downloadProfilePicture(ednut, jids, "pp")
        const caption = `Profile picture of @${stripDevice(target).split("@")[0]}`

        // no picture set, or hidden by their privacy setting -> plain white profile image
        if (!buffer) buffer = await whiteAvatar()

        await ednut.sendMessage(m.chat, {
          image: buffer,
          caption,
          mentions: [target]
        }, { quoted: m })

      } catch (e) {
        global.log("ERROR", `pfp plugin: ${e.message || e}`)
        reply("Failed to fetch profile picture.")
      }
    }
  },
  {
  command: "weather",
  alias: ["forecast"],
  description: "Get weather info for a location",
  category: "Tool",
  ban: true,
  gcban: true,
  execute: async (m, { text, ednut, example, axios }) => {
    if (!text) return m.reply(example('location'));
    try {
      let wdata = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?q=${text}&units=metric&appid=060a6bcfa19809c2cd4d97a212b19273&language=en`
      );
      let info = wdata.data;

      let textw = `🌍 *Weather Report* 🌍\n\n`;
      textw += `📍 *Location:* ${info.name}, ${info.sys.country}\n`;
      textw += `🗺️ *Coordinates:* ${info.coord.lat}, ${info.coord.lon}\n\n`;

      textw += `🌤️ *Condition:* ${info.weather[0].main}\n`;
      textw += `📝 *Description:* ${info.weather[0].description}\n\n`;

      textw += `🌡️ *Temperature:* ${info.main.temp}°C\n`;
      textw += `🤔 *Feels Like:* ${info.main.feels_like}°C\n`;
      textw += `💧 *Humidity:* ${info.main.humidity}%\n`;
      textw += `🌀 *Wind Speed:* ${info.wind.speed} m/s\n`;
      textw += `⏲️ *Pressure:* ${info.main.pressure} hPa\n\n`;

      // ➡️ Footer / credit
      textw += `> *© Powered By ɢᴏᴏᴅɴᴇꜱꜱ ᴛᴇᴄʜ*`;

      await ednut.sendMessage(m.chat, { text: textw }, { quoted: m });
    } catch (e) {
      global.log("ERROR", `weather plugin: ${e.message || e}`);
      m.reply("❌ Failed to fetch weather data. Please check the location and try again.");
    }
  }
},

  {
    command: "fancy",
    alias: ["styletext"],
    description: "Convert text to fancy styles",
    category: "Tool",
    ban: true,
    gcban: true,
    execute: async (m, { text, ednut, prefix, example, styletext }) => {
      try {
        if (!text) return m.reply(example('Enter query text!'));
        let args = text.split(' ');
        let styleNumber = parseInt(args[0]);
        let query = text.replace(args[0], '').trim();

        if (isNaN(styleNumber) || !query) {
          let styles = await styletext(text);
          let teks = `Example: ${prefix}fancy 2 hello\n\nStyles for: ${text}\n\n`;
          for (let i = 0; i < styles.length; i++) {
            teks += `${i + 1}. ${styles[i].name} : ${styles[i].result}\n\n`;
          }
          return m.reply(teks);
        }

        let styles = await styletext(query);
        if (styleNumber && styles[styleNumber - 1]) {
          return m.reply(styles[styleNumber - 1].result);
        } else {
          return m.reply('Invalid style number.');
        }
      } catch (e) {
        global.log("ERROR", `fancy plugin: ${e.message || e}`);
        m.reply("Failed to convert text.");
      }
    }
  }
]