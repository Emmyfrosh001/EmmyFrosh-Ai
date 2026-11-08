const fetch = require("node-fetch");
const FormData = require("form-data");
const fileType = require("file-type");
const WSF = require("wa-sticker-formatter");

// Upload image to tmpfiles.org
async function uploadToTmpFiles(content) {
  if (!content || !(content instanceof Buffer)) throw "Invalid file content";

  const { ext } = (await fileType.fromBuffer(content)) || {};
  if (!ext) throw "Failed to detect file type";

  const form = new FormData();
  form.append("file", content, `file.${ext}`);

  const res = await fetch("https://tmpfiles.org/api/v1/upload", {
    method: "POST",
    body: form,
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const json = await res.json();
  if (!json?.data?.url) throw "Failed to upload image";

  const match = /https?:\/\/tmpfiles\.org\/(.*)/.exec(json.data.url);
  return `https://tmpfiles.org/dl/${match[1]}`;
}

// Create sticker using WSF
async function createSticker(url, pack, author) {
  try {
    return await new WSF.Sticker(url, {
      type: "full",
      pack,
      author,
      categories: [""]
    }).build();
  } catch (err) {
    global.log("ERROR", `Sticker creation error: ${err.message || err}`);
    throw "Failed to create sticker";
  }
}

// Plugin export
module.exports = {
  command: ["smeme"],
  description: "Create a sticker meme from an image and text",
  category: "Converter",
  ban: true,
  gcban: true,
  execute: async (m, { text, ednut, reply }) => {
    try {
      const teks = text.split("|");
      const topText = teks[0]?.trim() || " ";
      const bottomText = teks[1]?.trim() || " ";

      const q = m.quoted || m;
      const mime = (q.msg || q).mimetype || "";

      if (!mime) return reply(`Reply to an image with:\n\nsmeme Top Text | Bottom Text`);
      if (!/image\/(jpe?g|png|webp)/.test(mime)) return reply(`Unsupported image type: ${mime}`);

      const img = await q.download();
      if (!img) throw "Failed to download image";

      const imageUrl = await uploadToTmpFiles(img);
      const memeUrl = `https://api.memegen.link/images/custom/${encodeURIComponent(bottomText)}/${encodeURIComponent(topText)}.png?background=${encodeURIComponent(imageUrl)}`;

      const stickerBuffer = await createSticker(memeUrl, global.packname, global.author);
      if (stickerBuffer) {
        await ednut.sendFile(m.chat, stickerBuffer, "meme.webp", text, m);
      } else {
        reply("Failed to create sticker.");
      }
    } catch (err) {
      global.log("ERROR", `Smeme command error: ${err.message || err}`);
      reply("Error processing sticker meme.");
    }
  }
};