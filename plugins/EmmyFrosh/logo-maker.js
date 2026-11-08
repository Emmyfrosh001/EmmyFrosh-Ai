
const axios = require("axios");

module.exports = [
  {
    command: ["3dcomic"],
    alias: [],
    description: "Create a 3D Comic-style text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .3dcomic EmmyFros-Ai");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-online-3d-comic-style-text-effects-817.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["dragonball"],
    alias: [],
    description: "Create a Dragon Ball-style text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .dragonball EmmyFros-Ai");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-dragon-ball-style-text-effects-online-809.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["deadpool"],
    alias: [],
    description: "Create a Deadpool-style text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .deadpool EmmyFros-Ai");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-text-effects-in-the-style-of-the-deadpool-logo-818.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["blackpink"],
    alias: [],
    description: "Create a Blackpink-style text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .blackpink EmmyFros-Ai");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-a-blackpink-style-logo-with-members-signatures-810.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["cat"],
    alias: [],
    description: "Create a Cat signature text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .cat EmmyFros-Ai");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/write-text-on-wet-glass-online-589.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["sadgirl"],
    alias: [],
    description: "Create a Sad Girl text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .sadgirl EmmyFros-Ai");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/write-text-on-sad-girl-image-online-free-432.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["pornhub"],
    alias: [],
    description: "Create a Pornhub-style logo",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q.includes("|")) return reply("❌ Please provide text in format: text1|text2. Example: .pornhub EmmyFros-Ai |Bot");
      const [txt1, txt2] = q.split("|");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/pornhub-style-logo-maker-online-free-502.html")}&name=${encodeURIComponent(txt1)}&name2=${encodeURIComponent(txt2)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["naruto"],
    alias: [],
    description: "Create a Naruto-style logo",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .naruto EmmyFros-Ai");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-naruto-logo-style-text-effects-online-808.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["thor"],
    alias: [],
    description: "Create a Thor-style logo",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .thor EmmyFros-Ai");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-thor-logo-style-text-effects-online-811.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["america"],
    alias: [],
    description: "Create an America Flag logo effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .america Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/american-flag-text-effect-online-441.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["eraser"],
    alias: [],
    description: "Create an Eraser text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .eraser Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-eraser-deleting-text-effect-online-717.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["3dpaper"],
    alias: [],
    description: "Create a 3D Paper Cut text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .3dpaper Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-3d-paper-cut-text-effect-online-683.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["futuristic"],
    alias: [],
    description: "Create a Futuristic text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .futuristic Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-a-futuristic-technology-neon-light-text-effect-418.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["clouds"],
    alias: [],
    description: "Create a Cloud text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .clouds Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/write-text-effect-clouds-in-the-sky-online-619.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["sand"],
    alias: [],
    description: "Create a Sand text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .sand Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/write-in-sand-summer-beach-online-free-412.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["galaxy"],
    alias: [],
    description: "Create a Galaxy text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .galaxy Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-galaxy-style-free-name-logo-online-438.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["leaf"],
    alias: [],
    description: "Create a Leaf text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .leaf Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/nature-leaf-text-effect-online-200.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["sunset"],
    alias: [],
    description: "Create a Sunset text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .sunset Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-sunset-light-text-effect-online-438.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["nigeria"],
    alias: [],
    description: "Create a Nigeria Flag text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .nigeria Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/nigeria-flag-text-effect-online-589.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["devilwings"],
    alias: [],
    description: "Create a Devil Wings text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .devilwings Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-devil-wings-text-effect-online-438.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["hacker"],
    alias: [],
    description: "Create a Hacker text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .hacker Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-hacker-style-text-effect-online-421.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
{
    command: ["boom"],
    alias: [],
    description: "Create Boom text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .boom Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-colorful-explosion-text-effect-online-502.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["luxury"],
    alias: [],
    description: "Create Luxury text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .luxury Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/modern-gold-4-0-typography-text-effect-online-915.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["zodiac"],
    alias: [],
    description: "Create Zodiac text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .zodiac Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-zodiac-sign-text-effect-online-619.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["angelwings"],
    alias: [],
    description: "Create Angel Wings text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .angelwings Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-angel-wing-galaxy-text-effect-1086.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
  {
    command: ["bulb"],
    alias: [],
    description: "Create Light Bulb text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide text. Example: .bulb Ozeba-Xd");
      try {
        const { data } = await axios.get(`https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/light-bulb-text-effect-idea-524.html")}&name=${encodeURIComponent(q)}`);
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate logo.");
      }
    }
  },
    {
    command: ["tattoo"],
    alias: [],
    description: "Create a Tattoo text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide a name. Example: .tattoo Ozeba-Xd");
      try {
        const { data } = await axios.get(
          `https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/make-tattoos-online-by-empire-tech-309.html")}&name=${encodeURIComponent(q)}`
        );
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate Tattoo logo.");
      }
    }
  },
  {
    command: ["castle"],
    alias: [],
    description: "Create a Castle text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide a name. Example: .castle Ozeba-Xd");
      try {
        const { data } = await axios.get(
          `https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-a-3d-castle-pop-out-mobile-photo-effect-786.html")}&name=${encodeURIComponent(q)}`
        );
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate Castle logo.");
      }
    }
  },
  {
    command: ["frozen"],
    alias: [],
    description: "Create a Frozen text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide a name. Example: .frozen Ozeba-Xd");
      try {
        const { data } = await axios.get(
          `https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-a-frozen-christmas-text-effect-online-792.html")}&name=${encodeURIComponent(q)}`
        );
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate Frozen logo.");
      }
    }
  },
  {
    command: ["paint"],
    alias: [],
    description: "Create a Paint text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide a name. Example: .paint Ozeba-Xd");
      try {
        const { data } = await axios.get(
          `https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-3d-colorful-paint-text-effect-online-801.html")}&name=${encodeURIComponent(q)}`
        );
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate Paint logo.");
      }
    }
  },
  {
    command: ["birthday"],
    alias: [],
    description: "Create a Birthday text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide a name. Example: .birthday Ozeba-Xd");
      try {
        const { data } = await axios.get(
          `https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/beautiful-3d-foil-balloon-effects-for-holidays-and-birthday-803.html")}&name=${encodeURIComponent(q)}`
        );
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate Birthday logo.");
      }
    }
  },
  {
    command: ["typography"],
    alias: [],
    description: "Create a Typography text effect",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide a name. Example: .typography Ozeba-Xd");
      try {
        const { data } = await axios.get(
          `https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/create-typography-status-online-with-impressive-leaves-357.html")}&name=${encodeURIComponent(q)}`
        );
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate Typography logo.");
      }
    }
  },
  {
    command: ["bear"],
    alias: [],
    description: "Create a Bear logo",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, q, reply, from }) {
      if (!q) return reply("❌ Please provide a name. Example: .bear EmmyFros-Ai");
      try {
        const { data } = await axios.get(
          `https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent("https://en.ephoto360.com/free-bear-logo-maker-online-673.html")}&name=${encodeURIComponent(q)}`
        );
        await ednut.sendMessage(from, { image: { url: data.result.download_url } });
      } catch (e) {
        reply("⚠️ Failed to generate Bear logo.");
      }
    }
  },
  {
    command: ["valorant"],
    alias: [],
    description: "Create a Valorant YouTube banner with 3 texts",
    category: "Logo",
    filename: __filename,
    async execute(m, { ednut, args, reply, from }) {
      if (args.length < 3) {
        return reply("❌ Please provide 3 text inputs. Example: .valorant Text1 Text2 Text3");
      }
      try {
        const text1 = args[0];
        const text2 = args[1];
        const text3 = args.slice(2).join(" ");
        const apiUrl = `https://api.nexoracle.com/ephoto360/valorant-youtube-banner?apikey=MepwBcqIM0jYN0okD&text1=${encodeURIComponent(text1)}&text2=${encodeURIComponent(text2)}&text3=${encodeURIComponent(text3)}`;
        const { data } = await axios.get(apiUrl, { responseType: "arraybuffer" });
        await ednut.sendMessage(from, { image: Buffer.from(data), caption: "Here is your Valorant YouTube banner!" });
      } catch (e) {
        reply("⚠️ Failed to generate Valorant banner.");
      }
    }
  }
];