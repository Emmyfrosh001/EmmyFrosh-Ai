module.exports = [
  {
    command: ["take"],
    alias: ["steal", "stickersteal", "stickertake", "wm"],
    description: "Steal a sticker with custom pack and author",
    category: "Converter",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, args, quoted, mime, fs, isOwner, reply, prefix, command }) => {
      try {
        if (!isOwner) return reply("❌ Only the bot owner can use this command.");
        if (!quoted) return reply("Reply to a sticker");
        if (!/webp/.test(mime)) return reply("Reply to a sticker only");

        const getRandom = (ext) => `${Math.floor(Math.random() * 10000)}${ext}`;

        // ✅ .take alone -> pack "EMMYFROSH", no author
        // ✅ .take emmy -> pack "emmy", no author (nothing extra appended)
        // ✅ .take Pack|Author -> pack "Pack", author "Author"
        const rawInput = args.join(" ").trim();

        let satu, dua;
        if (!rawInput) {
          satu = "EMMYFROSH";
          dua  = "";
        } else {
          let ahuh = rawInput.split("|");
          satu = ahuh[0]?.trim() || "EMMYFROSH";
          dua  = typeof ahuh[1] !== "undefined" ? ahuh[1].trim() : "";
        }

        const { Sticker, StickerTypes } = require("wa-sticker-formatter");

        let media = await ednut.downloadAndSaveMediaMessage(quoted);
        let sticker = new Sticker(media, {
          pack: satu,
          author: dua,
          type: StickerTypes.FULL,
          categories: ["🤩", "🎉"],
          id: "12345",
          quality: 70,
          background: "#FFFFFF00",
        });

        let outFile = getRandom(".webp");
        let file = await sticker.toFile(outFile);
        let buffer = fs.readFileSync(file);
        await ednut.sendMessage(m.chat, { sticker: buffer }, { quoted: m });
        fs.unlinkSync(outFile);
        fs.unlinkSync(media);
      } catch (err) {
        global.log("ERROR", `Take command failed: ${err.message || err}`);
        reply("Failed to steal sticker.");
      }
    },
  },

  {
    command: ["toimg"],
    alias: ["toimage"],
    description: "Convert sticker to image",
    category: "Converter",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, quoted, mime, fs, exec, reply }) => {
      try {
        if (!quoted) return reply("Reply to a sticker");
        if (!/webp/.test(mime)) return reply("Reply to a sticker");

        let media = await ednut.downloadAndSaveMediaMessage(quoted);
        let output = "converted.png";
        exec(`ffmpeg -i ${media} ${output}`, (err) => {
          fs.unlinkSync(media);
          if (err) {
            global.log("ERROR", `toimg ffmpeg error: ${err.message || err}`);
            return reply("Conversion failed.");
          }
          let buffer = fs.readFileSync(output);
          ednut.sendMessage(m.chat, { image: buffer }, { quoted: m });
          fs.unlinkSync(output);
        });
      } catch (err) {
        global.log("ERROR", `toimg command failed: ${err.message || err}`);
        reply("Failed to convert sticker.");
      }
    },
  },

  {
    command: ["sticker"],
    alias: ["stik", "s"],
    description: "Create a sticker from image or video",
    category: "Converter",
    ban: true,
    gcban: true,
    async execute(m, { ednut, args, quoted, mime, fs, isOwner, reply }) {
      try {
        if (!isOwner) return reply("❌ Only the bot owner can use this command.");
        if (!quoted) return reply("Reply to an image or video");
        if (!/image|video/.test(mime)) return reply("Reply to an image or video");

        const isVideo = /video/.test(mime);

        const getRandom = (ext) => `${Math.floor(Math.random() * 10000)}${ext}`;

        // ✅ Same logic as .take — no author auto-appended unless given
        const rawInput = args.join(" ").trim();
        let satu, dua;
        if (!rawInput) {
          satu = "EMMYFROSH";
          dua  = "";
        } else {
          let ahuh = rawInput.split("|");
          satu = ahuh[0]?.trim() || "EMMYFROSH";
          dua  = typeof ahuh[1] !== "undefined" ? ahuh[1].trim() : "";
        }

        const { Sticker, StickerTypes } = require("wa-sticker-formatter");

        let media = await ednut.downloadAndSaveMediaMessage(quoted);

        // ✅ Trim long videos automatically (WhatsApp animated stickers
        // only support short clips, roughly up to ~10s)
        if (isVideo) {
          try {
            const { execSync } = require("child_process");
            const durationOutput = execSync(
              `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${media}"`
            ).toString().trim();
            const duration = parseFloat(durationOutput) || 0;

            if (duration > 10) {
              const trimmedPath = media.replace(/(\.\w+)$/, "_trimmed$1");
              execSync(`ffmpeg -y -i "${media}" -t 10 -c copy "${trimmedPath}"`);
              fs.unlinkSync(media);
              media = trimmedPath;
            }
          } catch (probeErr) {
            global.log("ERROR", `Video duration check failed: ${probeErr.message || probeErr}`);
          }
        }

        let sticker = new Sticker(media, {
          pack: satu,
          author: dua,
          type: StickerTypes.FULL,
          categories: ["🤩", "🎉"],
          id: "12345",
          quality: 70,
          background: "#FFFFFF00",
        });

        let outFile = getRandom(".webp");
        let file = await sticker.toFile(outFile);
        let buffer = fs.readFileSync(file);
        await ednut.sendMessage(m.chat, { sticker: buffer }, { quoted: m });
        fs.unlinkSync(outFile);
        if (fs.existsSync(media)) fs.unlinkSync(media);
      } catch (err) {
        global.log("ERROR", `Sticker command failed: ${err.message || err}`);
        reply("Failed to create sticker. Make sure ffmpeg is installed and the video isn't too long.");
      }
    },
  },
];