const axios = require("axios");

async function SsPost(tweetUrl) {
  try {
    const match = tweetUrl.match(/status\/(\d+)/);
    if (!match) throw new Error("❌ Invalid Twitter link, please use a correct one.");

    const tweetId = match[1];
    const payload = {
      templateSlug: "tweet-image",
      modifications: { tweetUrl, tweetId },
      renderType: "images",
      responseFormat: "png",
      responseType: "base64",
      userAPIKey: false,
    };

    const { data } = await axios.post(
      "https://orshot.com/api/templates/make-playground-request",
      JSON.stringify(payload),
      {
        headers: {
          "Content-Type": "text/plain; charset=UTF-8",
          Origin: "https://orshot.com",
          Referer: "https://orshot.com/templates/tweet-image/generate",
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) Chrome/107.0.0.0 Safari/537.36",
          Accept: "*/*",
        },
      }
    );

    if (!data?.data?.content) throw new Error("⚠️ No response from API.");

    const base64Data = data.data.content.replace(
      /^data:image\/png;base64,/,
      ""
    );
    return Buffer.from(base64Data, "base64");
  } catch (err) {
    throw new Error(err.message);
  }
}

module.exports = [
  {
    command: ["sstweet"],
    alias: ["ss-twitter", "tweetcap"],
    description: "Take a screenshot of a Tweet by URL",
    category: "Tool",
    async execute(m, { q, reply, ednut }) {
      try {
        if (!q) return reply("⚡ *Usage:* .sstweet <tweet url>");
        if (!q.includes("twitter.com") && !q.includes("x.com"))
          return reply("❌ Please provide a valid Twitter/X URL.");

        await reply("⏳ Taking screenshot of the Tweet...");

        const imgbuff = await SsPost(q);

        await ednut.sendMessage(
          m.chat,
          {
            image: imgbuff,
            caption: "✅ *Screenshot Done!*",
          },
          { quoted: m }
        );
      } catch (err) {
        console.error("❌ Error in sstweet command:", err.message || err);
        reply(`❌ Failed: ${err.message}`);
      }
    },
  },
];