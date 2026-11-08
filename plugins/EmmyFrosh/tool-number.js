module.exports = [
  {
    command: ["tempnum"],
    alias: ["fakenumber", "getnumber"],
    description: "Get temporary numbers & OTP instructions",
    category: "Tool",
    use: "<country-code>",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, args, reply }) => {
      try {
        if (!args || args.length < 1) {
          return reply(`❌ Usage: .tempnum <country-code>\nExample: .tempnum us\n\n📦 Use .otpbox <number> to check OTPs`);
        }

        const countryCode = args[0].toLowerCase();

        const { data } = await require("axios").get(
          `https://api.vreden.my.id/api/tools/fakenumber/listnumber?id=${countryCode}`,
          { timeout: 10000, validateStatus: status => status === 200 }
        );

        if (!data?.result || !Array.isArray(data.result)) {
          console.error("Invalid API structure:", data);
          return reply(`⚠ Invalid API response format\nTry .tempnum us`);
        }

        if (data.result.length === 0) {
          return reply(`📭 No numbers available for *${countryCode.toUpperCase()}*\nTry another country code!\n\nUse .otpbox <number> after selection`);
        }

        const numbers = data.result.slice(0, 25);
        const numberList = numbers.map((num, i) => `${String(i+1).padStart(2,' ')}. ${num.number}`).join("\n");

        reply(
          `╭──「 📱 TEMPORARY NUMBERS 」\n` +
          `│ Country: ${countryCode.toUpperCase()}\n` +
          `│ Numbers Found: ${numbers.length}\n` +
          `│\n${numberList}\n` +
          `╰──「 📦 : .otpbox <number> 」\n_Example: .otpbox +1234567890_`
        );

      } catch (err) {
        console.error("API Error:", err);
        reply(
          err.code === "ECONNABORTED" ?
          `⏳ Timeout: API took too long\nTry smaller country codes like 'us', 'gb'` :
          `⚠ Error: ${err.message}\nUse format: .tempnum <country-code>`
        );
      }
    }
  },

  {
    command: ["templist"],
    alias: ["tempcountries", "fakenumlist"],
    description: "Show list of countries with temp numbers",
    category: "Tool",
    use: ".templist",
    execute: async (m, { ednut, reply }) => {
      try {
        const { data } = await require("axios").get("https://api.vreden.my.id/api/tools/fakenumber/country");
        if (!data || !data.result) return reply("❌ Couldn't fetch country list.");

        const countries = data.result.map((c, i) => `*${i+1}.* ${c.title} \`(${c.id})\``).join("\n");
        reply(`🌍 Total Available Countries: ${data.result.length}\n\n${countries}`);
      } catch (e) {
        console.error("TEMP LIST ERROR:", e);
        reply("❌ Failed to fetch temporary number country list.");
      }
    }
  },

  {
    command: ["otpbox"],
    alias: ["checkotp", "otpcheck"],
    description: "Check OTP messages for temporary number",
    category: "Tool",
    use: "<full-number>",
    execute: async (m, { ednut, args, reply }) => {
      try {
        if (!args[0] || !args[0].startsWith("+")) {
          return reply(`❌ Usage: .otpbox <full-number>\nExample: .otpbox +9231034481xx`);
        }

        const phoneNumber = args[0].trim();
        const { data } = await require("axios").get(
          `https://api.vreden.my.id/api/tools/fakenumber/message?nomor=${encodeURIComponent(phoneNumber)}`,
          { timeout: 10000, validateStatus: status => status === 200 }
        );

        if (!data?.result || !Array.isArray(data.result)) {
          return reply("⚠ No OTP messages found for this number");
        }

        const otpMessages = data.result.map(msg => {
          const otpMatch = msg.content.match(/\b\d{4,8}\b/g);
          const otpCode = otpMatch ? otpMatch[0] : "Not found";

          return `┌ *From:* ${msg.from || "Unknown"}\n│ *Code:* ${otpCode}\n│ *Time:* ${msg.time_wib || msg.timestamp}\n└ *Message:* ${msg.content.substring(0,50)}${msg.content.length > 50 ? "..." : ""}`;
        }).join("\n\n");

        reply(
          `╭──「 🔑 OTP MESSAGES 」\n` +
          `│ Number: ${phoneNumber}\n` +
          `│ Messages Found: ${data.result.length}\n` +
          `│\n${otpMessages}\n` +
          `╰──「 📌 Use .tempnum to get numbers 」`
        );

      } catch (err) {
        console.error("OTP Check Error:", err);
        reply(
          err.code === "ECONNABORTED" ?
          "⌛ OTP check timed out. Try again later" :
          `⚠ Error: ${err.response?.data?.error || err.message}\n\nUsage: .otpbox +9231034481xx`
        );
      }
    }
  }
];
