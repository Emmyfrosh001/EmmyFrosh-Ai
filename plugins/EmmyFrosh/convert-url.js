const axios = require("axios");
const FormData = require("form-data");
const mime = require("mime-types");

module.exports = [
  {
    command: ["url"],
    alias: ["mediaurl", "tourl"],
    category: "tools",
    description: "Upload replied media and get direct URL",

    execute: async (m, { ednut, reply }) => {
      try {

        // MUST REPLY
        if (!m.quoted) {
          return reply("❌ Reply to image, video, or audio.");
        }

        const quoted = m.quoted;

        if (!quoted.download) {
          return reply("❌ Cannot download this media.");
        }

        const mimeType = quoted.mimetype || "";

        // VALIDATE MEDIA
        if (
          !mimeType.startsWith("image") &&
          !mimeType.startsWith("video") &&
          !mimeType.startsWith("audio")
        ) {
          return reply("❌ Unsupported media.");
        }

        // =========================
        // DOWNLOAD MEDIA
        // =========================

        let buffer;

        try {
          buffer = await quoted.download();
        } catch (e) {
          console.log("DOWNLOAD ERROR:", e);
          return reply("❌ Failed to download media.");
        }

        if (!buffer || !buffer.length) {
          return reply("❌ Empty media buffer.");
        }

        // =========================
        // FILE EXTENSION
        // =========================

        const ext =
          mime.extension(mimeType) || "bin";

        // =========================
        // UPLOAD TO UGUU
        // =========================

        let uploadedUrl;

        try {

          const form = new FormData();

          form.append(
            "files[]",
            buffer,
            `file.${ext}`
          );

          const res = await axios.post(
            "https://uguu.se/upload.php",
            form,
            {
              headers: form.getHeaders()
            }
          );

          uploadedUrl = res.data.files[0].url;

        } catch (e) {
          console.log("UPLOAD ERROR:", e);
          return reply("❌ Failed to upload media.");
        }

        // =========================
        // SEND RAW URL
        // =========================

        await ednut.sendMessage(
          m.chat,
          {
            text: uploadedUrl
          },
          { quoted: m }
        );

      } catch (e) {

        console.log("URL ERROR:", e);

        reply(`❌ ${e.message}`);
      }
    }
  },

  {
    command: ["shorturl"],
    alias: ["shortlink", "shorten", "tinyurl"],
    category: "tools",
    description: "Shorten a replied URL or typed URL",

    execute: async (m, { ednut, text, reply }) => {
      try {

        let url = text;

        // GET URL FROM REPLIED MESSAGE
        if (!url && m.quoted) {
          url =
            m.quoted.text ||
            m.quoted.caption ||
            "";
        }

        if (!url) {
          return reply(
            "❌ Reply to a message containing a URL\nor type:\nshorturl https://google.com"
          );
        }

        // EXTRACT URL
        const match = url.match(
          /(https?:\/\/[^\s]+)/gi
        );

        if (!match) {
          return reply("❌ No valid URL found.");
        }

        url = match[0];

        // SHORTEN URL
        const res = await axios.get(
          "https://tinyurl.com/api-create.php?url=" +
          encodeURIComponent(url)
        );

        const shortUrl = res.data.toString();

        // SEND RAW SHORT URL
        await ednut.sendMessage(
          m.chat,
          {
            text: shortUrl
          },
          { quoted: m }
        );

      } catch (e) {

        console.log("SHORTURL ERROR:", e);

        reply("❌ Failed to shorten URL.");
      }
    }
  }
];