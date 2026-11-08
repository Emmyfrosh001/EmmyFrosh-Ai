module.exports = [
  {
  command: ["hd"],
  alias: ["upscale", "enhance"],
  description: "Upscale an image using AI",
  category: "Tool",
  ban: true,
  gcban: true,
  execute: async (m, { ednut, uploadImage }) => {
    try {
      if (!m.quoted || m.quoted.mtype !== "imageMessage")
        return m.reply("❌ Reply to an image to upscale.");

      const buffer = await ednut.downloadMediaMessage(m.quoted);
      const imageUrl = await uploadImage(buffer);
      const api = `https://archive.lick.eu.org/api/tools/upscale?url=${encodeURIComponent(imageUrl)}`;
      const res = await fetch(api);

      if (!res.ok) return m.reply("❌ Failed to fetch upscaled image.");

      const arrayBuffer = await res.arrayBuffer(); // ✅ use arrayBuffer
      const upscaledBuffer = Buffer.from(arrayBuffer);

      await ednut.sendMessage(
        m.chat,
        { image: upscaledBuffer, caption: global.footer },
        { quoted: m }
      );
    } catch (err) {
      global.log("ERROR", `upscale: ${err.message}`);
      m.reply("❌ Error upscaling image.");
    }
  }
},
  {
  command: ["prompt"],
  description: "Generate a new prompt based on input",
  category: "Tool",
  ban: true,
  gcban: true,
  execute: async (m, { ednut }) => {
    try {
      const text = m.text.split(" ").slice(1).join(" ");
      if (!text) return m.reply("❌ Please provide some text input to generate prompt.");

      const api = `https://archive.lick.eu.org/api/tools/prompt-to-prompt?text=${encodeURIComponent(text)}`;
      const res = await fetch(api);
      const data = await res.json();

      if (!data?.status || !data.result?.generated)
        return m.reply("❌ Failed to generate prompt.");

      await ednut.sendMessage(
        m.chat,
        { text: data.result.generated, footer: global.footer },
        { quoted: m }
      );
    } catch (err) {
      global.log("ERROR", `prompt: ${err.message}`);
      m.reply("❌ Error generating prompt.");
    }
  }
}
];