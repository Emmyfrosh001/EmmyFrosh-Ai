const os = require("os");
const moment = require("moment-timezone");
const { sizeFormatter } = require("human-readable");
const fs = require("fs");
const path = require("path");

// ================= MENU STORAGE =================
const menuFile = path.join(__dirname, "menu.json");

function loadMenu() {
  try {
    if (!fs.existsSync(menuFile)) {
      fs.writeFileSync(menuFile, JSON.stringify({ menuImage: null, fontIndex: 1, customFonts: {}, menuStyle: null }, null, 2));
    }
    return JSON.parse(fs.readFileSync(menuFile));
  } catch (e) {
    return { menuImage: null, fontIndex: 1, customFonts: {}, menuStyle: null };
  }
}

function saveMenu(data) {
  fs.writeFileSync(menuFile, JSON.stringify(data, null, 2));
}

// ================= BOT VERSION (from package.json) =================
// Walks upward from this file until it finds package.json, so it keeps
// working even if this command file gets moved to a different folder depth.
function getBotVersion() {
  try {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
      const pkgPath = path.join(dir, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        return pkg.version || "";
      }
      const parent = path.join(dir, "..");
      if (parent === dir) break; // reached filesystem root
      dir = parent;
    }
    return global.version || "";
  } catch (e) {
    return global.version || "";
  }
}

// ================= HOSTING PLATFORM DETECTION =================
// Detects where the bot is running: Pterodactyl panel, Heroku, Railway,
// Render, Replit, Koyeb, Fly.io, Termux, Docker, VPS, Windows, etc.
function getPlatform() {
  try {
    const env = process.env;
    const cwd = process.cwd();

    // Pterodactyl / Pelican panel (most free & paid bot hosts use this)
    if (
      env.P_SERVER_UUID || env.P_SERVER_LOCATION || env.P_SERVER_ALLOCATION_LIMIT ||
      (env.STARTUP && env.SERVER_IP) ||
      cwd === "/home/container" || env.HOME === "/home/container"
    ) return "Pterodactyl (Panel)";

    if (env.DYNO || env.HEROKU_APP_NAME || (env.PATH && env.PATH.includes("/app/.heroku"))) return "Heroku";
    if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_STATIC_URL || env.RAILWAY_PROJECT_ID || env.RAILWAY_SERVICE_ID) return "Railway";
    if (env.RENDER || env.RENDER_SERVICE_ID || env.RENDER_EXTERNAL_URL) return "Render";
    if (env.KOYEB_APP_NAME || env.KOYEB_SERVICE_NAME) return "Koyeb";
    if (env.FLY_APP_NAME || env.FLY_ALLOC_ID) return "Fly.io";
    if (env.REPL_ID || env.REPL_SLUG || env.REPLIT_DB_URL) return "Replit";
    if (env.VERCEL || env.VERCEL_ENV) return "Vercel";
    if (env.CODESPACES || env.CODESPACE_NAME) return "GitHub Codespaces";
    if (env.GITPOD_WORKSPACE_ID) return "Gitpod";
    if (env.GLITCH_PROJECT_NAME || env.PROJECT_DOMAIN) return "Glitch";
    if (env.NORTHFLANK_PROJECT_ID) return "Northflank";
    if (env.SCALINGO_APP || env.CONTAINER_VERSION) return "Scalingo";
    if (env.SHARD_PLATFORM || env.WEBSITE_SITE_NAME) return "Azure";
    if (env.AWS_EXECUTION_ENV || env.AWS_LAMBDA_FUNCTION_NAME) return "AWS";
    if (env.TERMUX_VERSION || (env.PREFIX && env.PREFIX.includes("com.termux"))) return "Termux (Android)";

    const plat = os.platform();
    if (plat === "android") return "Android";
    if (plat === "win32") return "Windows";
    if (plat === "darwin") return "macOS";

    if (plat === "linux") {
      let docker = false;
      try { docker = fs.existsSync("/.dockerenv"); } catch (e) {}
      if (docker) return "Docker (Linux)";
      return "Linux (VPS)";
    }
    return plat;
  } catch (e) {
    return os.platform();
  }
}

// message ping in ms (messageTimestamp can be a number, string or Long object)
// (kept for collected .menustyle templates that still use {PING})
function getPing(m) {
  try {
    let ts = m.messageTimestamp;
    if (ts && typeof ts.toNumber === "function") ts = ts.toNumber();
    ts = Number(ts);
    if (!ts) return 0;
    const ping = Date.now() - ts * 1000;
    return ping < 0 ? 0 : ping;
  } catch (e) {
    return 0;
  }
}

// ================= FONT LIST =================
const FONT_LIST = [
  // 01
  { name: "Small Caps",
    sample: "ᴇᴍᴍʏꜰʀᴏsʜ-ᴀɪ",
    convert: t => t.toLowerCase().split("").map(c => ({a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ғ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'}[c] || c)).join("") },
  // 02
  { name: "Bold",
    sample: "𝗘𝗠𝗠𝗬𝗙𝗥𝗢𝗦𝗛-𝗔𝗜",
    convert: t => t.split("").map(c => ({a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭'}[c] || c)).join("") },
  // 03
  { name: "Italic",
    sample: "𝐸𝑀𝑀𝑌𝐹𝑅𝑂𝑆𝐻-𝐴𝐼",
    convert: t => t.split("").map(c => ({a:'𝑎',b:'𝑏',c:'𝑐',d:'𝑑',e:'𝑒',f:'𝑓',g:'𝑔',h:'ℎ',i:'𝑖',j:'𝑗',k:'𝑘',l:'𝑙',m:'𝑚',n:'𝑛',o:'𝑜',p:'𝑝',q:'𝑞',r:'𝑟',s:'𝑠',t:'𝑡',u:'𝑢',v:'𝑣',w:'𝑤',x:'𝑥',y:'𝑦',z:'𝑧',A:'𝐴',B:'𝐵',C:'𝐶',D:'𝐷',E:'𝐸',F:'𝐹',G:'𝐺',H:'𝐻',I:'𝐼',J:'𝐽',K:'𝐾',L:'𝐿',M:'𝑀',N:'𝑁',O:'𝑂',P:'𝑃',Q:'𝑄',R:'𝑅',S:'𝑆',T:'𝑇',U:'𝑈',V:'𝑉',W:'𝑊',X:'𝑋',Y:'𝑌',Z:'𝑍'}[c] || c)).join("") },
  // 04
  { name: "Bold Italic",
    sample: "𝑬𝑴𝑴𝒀𝑭𝑹𝑶𝑺𝑯-𝑨𝑰",
    convert: t => t.split("").map(c => ({a:'𝒂',b:'𝒃',c:'𝒄',d:'𝒅',e:'𝒆',f:'𝒇',g:'𝒈',h:'𝒉',i:'𝒊',j:'𝒋',k:'𝒌',l:'𝒍',m:'𝒎',n:'𝒏',o:'𝒐',p:'𝒑',q:'𝒒',r:'𝒓',s:'𝒔',t:'𝒕',u:'𝒖',v:'𝒗',w:'𝒘',x:'𝒙',y:'𝒚',z:'𝒛',A:'𝑨',B:'𝑩',C:'𝑪',D:'𝑫',E:'𝑬',F:'𝑭',G:'𝑮',H:'𝑯',I:'𝑰',J:'𝑱',K:'𝑲',L:'𝑳',M:'𝑴',N:'𝑵',O:'𝑶',P:'𝑷',Q:'𝑸',R:'𝑹',S:'𝑺',T:'𝑻',U:'𝑼',V:'𝑽',W:'𝑾',X:'𝑿',Y:'𝒀',Z:'𝒁'}[c] || c)).join("") },
  // 05
  { name: "Cursive",
    sample: "𝓔𝓜𝓜𝓨𝓕𝓡𝓞𝓢𝓗 - 𝓐𝓘",
    convert: t => t.split("").map(c => ({a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃',A:'𝓐',B:'𝓑',C:'𝓒',D:'𝓓',E:'𝓔',F:'𝓕',G:'𝓖',H:'𝓗',I:'𝓘',J:'𝓙',K:'𝓚',L:'𝓛',M:'𝓜',N:'𝓝',O:'𝓞',P:'𝓟',Q:'𝓠',R:'𝓡',S:'𝓢',T:'𝓣',U:'𝓤',V:'𝓥',W:'𝓦',X:'𝓧',Y:'𝓨',Z:'𝓩'}[c] || c)).join("") },
  // 06
  { name: "Double Struck",
    sample: "𝔼𝕄𝕄𝕐𝔽ℝ𝕆𝕊ℍ-𝔸𝕀",
    convert: t => t.split("").map(c => ({a:'𝕒',b:'𝕓',c:'𝕔',d:'𝕕',e:'𝕖',f:'𝕗',g:'𝕘',h:'𝕙',i:'𝕚',j:'𝕛',k:'𝕜',l:'𝕝',m:'𝕞',n:'𝕟',o:'𝕠',p:'𝕡',q:'𝕢',r:'𝕣',s:'𝕤',t:'𝕥',u:'𝕦',v:'𝕧',w:'𝕨',x:'𝕩',y:'𝕪',z:'𝕫',A:'𝔸',B:'𝔹',C:'ℂ',D:'𝔻',E:'𝔼',F:'𝔽',G:'𝔾',H:'ℍ',I:'𝕀',J:'𝕁',K:'𝕂',L:'𝕃',M:'𝕄',N:'ℕ',O:'𝕆',P:'ℙ',Q:'ℚ',R:'ℝ',S:'𝕊',T:'𝕋',U:'𝕌',V:'𝕍',W:'𝕎',X:'𝕏',Y:'𝕐',Z:'ℤ'}[c] || c)).join("") },
  // 07
  { name: "Fraktur",
    sample: "𝔈𝔐𝔐𝔜𝔉ℜ𝔒𝔖ℌ-𝔄ℑ",
    convert: t => t.split("").map(c => ({a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷',A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ'}[c] || c)).join("") },
  // 08
  { name: "Monospace",
    sample: "𝙴𝙼𝙼𝚈𝙵𝚁𝙾𝚂𝙷-𝙰𝙸",
    convert: t => t.split("").map(c => ({a:'𝚊',b:'𝚋',c:'𝚌',d:'𝚍',e:'𝚎',f:'𝚏',g:'𝚐',h:'𝚑',i:'𝚒',j:'𝚓',k:'𝚔',l:'𝚕',m:'𝚖',n:'𝚗',o:'𝚘',p:'𝚙',q:'𝚚',r:'𝚛',s:'𝚜',t:'𝚝',u:'𝚞',v:'𝚟',w:'𝚠',x:'𝚡',y:'𝚢',z:'𝚣',A:'𝙰',B:'𝙱',C:'𝙲',D:'𝙳',E:'𝙴',F:'𝙵',G:'𝙶',H:'𝙷',I:'𝙸',J:'𝙹',K:'𝙺',L:'𝙻',M:'𝙼',N:'𝙽',O:'𝙾',P:'𝙿',Q:'𝚀',R:'𝚁',S:'𝚂',T:'𝚃',U:'𝚄',V:'𝚅',W:'𝚆',X:'𝚇',Y:'𝚈',Z:'𝚉'}[c] || c)).join("") },
  // 09
  { name: "Bubble",
    sample: "ⒺⓂⓂⓎⒻⓇⓄⓈⒽ-ⒶⒾ",
    convert: t => t.split("").map(c => ({a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'Ⓤ',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ'}[c] || c)).join("") },
  // 10
  { name: "Square",
    sample: "🄴🄼🄼🅈🄵🅁🄾🅂🄷-🄰🄸",
    convert: t => t.split("").map(c => ({a:'🄰',b:'🄱',c:'🄲',d:'🄳',e:'🄴',f:'🄵',g:'🄶',h:'🄷',i:'🄸',j:'🄹',k:'🄺',l:'🄻',m:'🄼',n:'🄽',o:'🄾',p:'🄿',q:'🅀',r:'🅁',s:'🅂',t:'🅃',u:'🅄',v:'🅅',w:'🅆',x:'🅇',y:'🅈',z:'🅉',A:'🄰',B:'🄱',C:'🄲',D:'🄳',E:'🄴',F:'🄵',G:'🄶',H:'🄷',I:'🄸',J:'🄹',K:'🄺',L:'🄻',M:'🄼',N:'🄽',O:'🄾',P:'🄿',Q:'🅀',R:'🅁',S:'🅂',T:'🅃',U:'🅄',V:'🅅',W:'🅆',X:'🅇',Y:'🅈',Z:'🅉'}[c] || c)).join("") },
  // 11
  { name: "Yi Script",
    sample: "ꏂꂵꂵꌦꎇꋪꂦꌗꃅ-ꍏꀤ",
    convert: t => t.toUpperCase().split("").map(c => ({E:'ꏂ',M:'ꂵ',Y:'ꌦ',F:'ꎇ',R:'ꋪ',O:'ꂦ',S:'ꌗ',H:'ꃅ',A:'ꍏ',I:'ꀤ'}[c] || c)).join("") },
  // 12
  { name: "Circled Dark",
    sample: "🅔🅜🅜🅨🅕🅡🅞🅢🅗-🅐🅘",
    convert: t => t.toLowerCase().split("").map(c => ({a:'🅐',b:'🅑',c:'🅒',d:'🅓',e:'🅔',f:'🅕',g:'🅖',h:'🅗',i:'🅘',j:'🅙',k:'🅚',l:'🅛',m:'🅜',n:'🅝',o:'🅞',p:'🅟',q:'🅠',r:'🅡',s:'🅢',t:'🅣',u:'🅤',v:'🅥',w:'🅦',x:'🅧',y:'🅨',z:'🅩'}[c] || c)).join("") },
  // 13
  { name: "Square Dark",
    sample: "🅴🅼🅼🆈🅵🆁🅾🆂🅷-🅰🅸",
    convert: t => t.toLowerCase().split("").map(c => ({a:'🅰',b:'🅱',c:'🅲',d:'🅳',e:'🅴',f:'🅵',g:'🅶',h:'🅷',i:'🅸',j:'🅹',k:'🅺',l:'🅻',m:'🅼',n:'🅽',o:'🅾',p:'🅿',q:'🆀',r:'🆁',s:'🆂',t:'🆃',u:'🆄',v:'🆅',w:'🆆',x:'🆇',y:'🆈',z:'🆉'}[c] || c)).join("") },
  // 14
  { name: "Script Light",
    sample: "𝑒𝓂𝓂𝓎𝒻𝓇𝑜𝓈𝒽-𝒶𝒾",
    convert: t => t.toLowerCase().split("").map(c => ({a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'𝑒',f:'𝒻',g:'𝑔',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'𝑜',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏'}[c] || c)).join("") },
  // 15
  { name: "Gothic",
    sample: "𝔢𝔪𝔪𝔶𝔣𝔯𝔬𝔰𝔥-𝔞𝔦",
    convert: t => t.toLowerCase().split("").map(c => ({a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷'}[c] || c)).join("") },
  // 16
  { name: "Bold Gothic",
    sample: "𝖊𝖒𝖒𝖞𝖋𝖗𝖔𝖘𝖍-𝖆𝖎",
    convert: t => t.toLowerCase().split("").map(c => ({a:'𝖆',b:'𝖇',c:'𝖈',d:'𝖉',e:'𝖊',f:'𝖋',g:'𝖌',h:'𝖍',i:'𝖎',j:'𝖏',k:'𝖐',l:'𝖑',m:'𝖒',n:'𝖓',o:'𝖔',p:'𝖕',q:'𝖖',r:'𝖗',s:'𝖘',t:'𝖙',u:'𝖚',v:'𝖛',w:'𝖜',x:'𝖝',y:'𝖞',z:'𝖟'}[c] || c)).join("") },
  // 17
  { name: "Curvy 1",
    sample: "єммуƒяσѕн-αι",
    convert: t => t.toLowerCase().split("").map(c => ({a:'α',b:'в',c:'c',d:'∂',e:'є',f:'ƒ',g:'g',h:'н',i:'ι',j:'נ',k:'к',l:'ℓ',m:'м',n:'η',o:'σ',p:'ρ',q:'q',r:'я',s:'ѕ',t:'т',u:'υ',v:'ν',w:'ω',x:'x',y:'у',z:'z'}[c] || c)).join("") },
  // 18
  { name: "Curvy 2",
    sample: "єммץŧгσѕђ-αเ",
    convert: t => t.toLowerCase().split("").map(c => ({a:'ค',b:'๒',c:'с',d:'๔',e:'є',f:'Ŧ',g:'g',h:'ђ',i:'เ',j:'ј',k:'к',l:'ℓ',m:'м',n:'ก',o:'σ',p:'ק',q:'ợ',r:'г',s:'ร',t:'Շ',u:'υ',v:'ν',w:'ฬ',x:'א',y:'ץ',z:'չ'}[c] || c)).join("") },
  // 19
  { name: "Cyber",
    sample: "ξᴍᴍʏғʀᴏsʜ-λɪ",
    convert: t => t.toLowerCase().split("").map(c => ({a:'λ',b:'ß',c:'ɔ',d:'Ð',e:'ξ',f:'ғ',g:'g',h:'ʜ',i:'ɪ',j:'J',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ρ',q:'Q',r:'ʀ',s:'s',t:'ᴛ',u:'υ',v:'ν',w:'ω',x:'x',y:'ʏ',z:'ᴢ'}[c] || c)).join("") },
  // 20
  { name: "Slashed",
    sample: "E̷M̷M̷Y̷F̷R̷O̷S̷H̷-A̷I̷",
    convert: t => t.split("").map(c => c + '̷').join("") },
  // 21
  { name: "Greek Sigma",
    sample: "ΣMMYFRΩSH-ΔI",
    convert: t => t.toUpperCase().split("").map(c => ({E:'Σ',O:'Ω',A:'Δ'}[c] || c)).join("") },
  // 22
  { name: "Double Underline",
    sample: "E̳M̳M̳Y̳F̳R̳O̳S̳H̳-A̳I̳",
    convert: t => t.split("").map(c => c + '̳').join("") },
  // 23
  { name: "Strikethrough",
    sample: "E̶M̶M̶Y̶F̶R̶O̶S̶H̶-A̶I̶",
    convert: t => t.split("").map(c => c + '̶').join("") },
  // 24
  { name: "Tiny",
    sample: "ᵉᵐᵐʸᶠʳᵒˢʰ-ᵃⁱ",
    convert: t => t.toLowerCase().split("").map(c => ({a:'ᵃ',b:'ᵇ',c:'ᶜ',d:'ᵈ',e:'ᵉ',f:'ᶠ',g:'ᵍ',h:'ʰ',i:'ⁱ',j:'ʲ',k:'ᵏ',l:'ˡ',m:'ᵐ',n:'ⁿ',o:'ᵒ',p:'ᵖ',q:'q',r:'ʳ',s:'ˢ',t:'ᵗ',u:'ᵘ',v:'ᵛ',w:'ʷ',x:'ˣ',y:'ʸ',z:'ᶻ'}[c] || c)).join("") },
  // 25
  { name: "Subscript",
    sample: "ₑₘₘᵧᶠᵣₒₛₕ-ₐᵢ",
    convert: t => t.toLowerCase().split("").map(c => ({a:'ₐ',b:'b',c:'c',d:'d',e:'ₑ',f:'f',g:'g',h:'ₕ',i:'ᵢ',j:'ⱼ',k:'k',l:'ₗ',m:'ₘ',n:'ₙ',o:'ₒ',p:'ₚ',q:'q',r:'ᵣ',s:'ₛ',t:'ₜ',u:'ᵤ',v:'ᵥ',w:'w',x:'ₓ',y:'ᵧ',z:'z'}[c] || c)).join("") },
  // 26
  { name: "IPA Style",
    sample: "ɛʍʍʏғʀօֆɦ-ǟɨ",
    convert: t => t.toUpperCase().split("").map(c => ({E:'ɛ',M:'ʍ',Y:'ʏ',F:'ғ',R:'ʀ',O:'օ',S:'ֆ',H:'ɦ',A:'ǟ',I:'ɨ'}[c] || c)).join("") },
  // 27
  { name: "Vintage",
    sample: "𝔈𝔐𝔐𝔜𝔉ℜ𝔒𝔖ℌ-𝔄ℑ",
    convert: t => t.toUpperCase().split("").map(c => ({A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ'}[c] || c)).join("") },
  // 28
  { name: "Cute Sparkles",
    sample: "E✧M✧M✧Y✧F✧R✧O✧S✧H-A✧I",
    convert: t => t.split("").join("✧") },
  // 29
  { name: "Ornate",
    sample: "꧁☬ EMMYFROSH-AI ☬꧂",
    convert: t => `꧁☬ ${t.toUpperCase()} ☬꧂` },
  // 30
  { name: "Blurry",
    sample: "E░M░M░Y░F░R░O░S░H-A░I",
    convert: t => t.split("").join("░") },
  // 31
  { name: "Handwriting",
    sample: "𝓮𝓶𝓶𝔂𝓯𝓻𝓸𝓼𝓱-𝓪𝓲",
    convert: t => t.toLowerCase().split("").map(c => ({a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃'}[c] || c)).join("") },
  // 32
  { name: "Overline",
    sample: "E̅M̅M̅Y̅F̅R̅O̅S̅H̅-A̅I̅",
    convert: t => t.split("").map(c => c + '̅').join("") },
  // 33
  { name: "Cloudy",
    sample: "E☁M☁M☁Y☁F☁R☁O☁S☁H-A☁I",
    convert: t => t.split("").join("☁") },
  // 34
  { name: "Hearty",
    sample: "E♥M♥M♥Y♥F♥R♥O♥S♥H-A♥I",
    convert: t => t.split("").join("♥") },
  // 35
  { name: "Starry",
    sample: "E★M★M★Y★F★R★O★S★H-A★I",
    convert: t => t.split("").join("★") },
  // 36
  { name: "Inverted",
    sample: "ıɐ-ɥsᴏɹɟʎɯɯǝ",
    convert: t => t.toLowerCase().split("").map(c => ({a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z'}[c] || c)).reverse().join("") },
  // 37
  { name: "Bold Sans Italic",
    sample: "𝙀𝙈𝙈𝙔𝙁𝙍𝙊𝙎𝙃-𝘼𝙄",
    convert: t => t.split("").map(c => ({a:'𝙖',b:'𝙗',c:'𝙘',d:'𝙙',e:'𝙚',f:'𝙛',g:'𝙜',h:'𝙝',i:'𝙞',j:'𝙟',k:'𝙠',l:'𝙡',m:'𝙢',n:'𝙣',o:'𝙤',p:'𝙥',q:'𝙦',r:'𝙧',s:'𝙨',t:'𝙩',u:'𝙪',v:'𝙫',w:'𝙬',x:'𝙭',y:'𝙮',z:'𝙯',A:'𝘼',B:'𝘽',C:'𝘾',D:'𝘿',E:'𝙀',F:'𝙁',G:'𝙂',H:'𝙃',I:'𝙄',J:'𝙅',K:'𝙆',L:'𝙇',M:'𝙈',N:'𝙉',O:'𝙊',P:'𝙋',Q:'𝙌',R:'𝙍',S:'𝙎',T:'𝙏',U:'𝙐',V:'𝙑',W:'𝙒',X:'𝙓',Y:'𝙔',Z:'𝙕'}[c] || c)).join("") },
  // 38
  { name: "Math Sans",
    sample: "𝖤𝖬𝖬𝖸𝖥𝖱𝖮𝖲𝖧-𝖠𝖨",
    convert: t => t.split("").map(c => ({a:'𝖺',b:'𝖻',c:'𝖼',d:'𝖽',e:'𝖾',f:'𝖿',g:'𝗀',h:'𝗁',i:'𝗂',j:'𝗃',k:'𝗄',l:'𝗅',m:'𝗆',n:'𝗇',o:'𝗈',p:'𝗉',q:'𝗊',r:'𝗋',s:'𝗌',t:'𝗍',u:'𝗎',v:'𝗏',w:'𝗐',x:'𝗑',y:'𝗒',z:'𝗓',A:'𝖠',B:'𝖡',C:'𝖢',D:'𝖣',E:'𝖤',F:'𝖥',G:'𝖦',H:'𝖧',I:'𝖨',J:'𝖩',K:'𝖪',L:'𝖫',M:'𝖬',N:'𝖭',O:'𝖮',P:'𝖯',Q:'𝖰',R:'𝖱',S:'𝖲',T:'𝖳',U:'𝖴',V:'𝖵',W:'𝖶',X:'𝖷',Y:'𝖸',Z:'𝖹'}[c] || c)).join("") },
  // 39
  { name: "Math Bold",
    sample: "𝐄𝐌𝐌𝐘𝐅𝐑𝐎𝐒𝐇-𝐀𝐈",
    convert: t => t.split("").map(c => ({a:'𝐚',b:'𝐛',c:'𝐜',d:'𝐝',e:'𝐞',f:'𝐟',g:'𝐠',h:'𝐡',i:'𝐢',j:'𝐣',k:'𝐤',l:'𝐥',m:'𝐦',n:'𝐧',o:'𝐨',p:'𝐩',q:'𝐪',r:'𝐫',s:'𝐬',t:'𝐭',u:'𝐮',v:'𝐯',w:'𝐰',x:'𝐱',y:'𝐲',z:'𝐳',A:'𝐀',B:'𝐁',C:'𝐂',D:'𝐃',E:'𝐄',F:'𝐅',G:'𝐆',H:'𝐇',I:'𝐈',J:'𝐉',K:'𝐊',L:'𝐋',M:'𝐌',N:'𝐍',O:'𝐎',P:'𝐏',Q:'𝐐',R:'𝐑',S:'𝐒',T:'𝐓',U:'𝐔',V:'𝐕',W:'𝐖',X:'𝐗',Y:'𝐘',Z:'𝐙'}[c] || c)).join("") },
  // 40
  { name: "Strips",
    sample: "E║M║M║Y║F║R║O║S║H-A║I",
    convert: t => t.split("").join("║") },
  // 41
  { name: "Wavy Lines",
    sample: "E〰M〰M〰Y〰F〰R〰O〰S〰H-A〰I",
    convert: t => t.split("").join("〰") },
  // 42
  { name: "Diamond Sparkle",
    sample: "E❖M❖M❖Y❖F❖R❖O❖S❖H-A❖I",
    convert: t => t.split("").join("❖") },
  // 43
  { name: "Checkers",
    sample: "E⟡M⟡M⟡Y⟡F⟡R⟡O⟡S⟡H-A⟡I",
    convert: t => t.split("").join("⟡") },
  // 44
  { name: "Greek Style",
    sample: "ΞMMYFRØSH-ΛI",
    convert: t => t.toUpperCase().split("").map(c => ({E:'Ξ',O:'Ø',A:'Λ'}[c] || c)).join("") },
  // 45
  { name: "Dot Below",
    sample: "Ẹ̣ṂṂỴF̣ṚỌṢḤ-ẠỊ",
    convert: t => t.split("").map(c => c + '̣').join("") },
  // 46
  { name: "Top Dot",
    sample: "Ė Ṁ Ṁ Ẏ Ḟ Ṙ Ȯ Ṡ Ḣ-Ȧ İ",
    convert: t => t.split("").map(c => c + '̇').join("") },
  // 47
  { name: "Upper Accent",
    sample: "É Ḿ Ḿ Ý F Ŕ Ó Ś H-Á Í",
    convert: t => t.split("").map(c => c + '́').join("") },
  // 48
  { name: "Spiky",
    sample: "E⃰M⃰M⃰Y⃰F⃰R⃰O⃰S⃰H⃰-A⃰I⃰",
    convert: t => t.split("").map(c => c + '⃰').join("") },
  // 49
  { name: "Japanese Style",
    sample: "乇爪爪ㄚ千尺ㄖ丂卄-卂丨",
    convert: t => t.toLowerCase().split("").map(c => ({a:'卂',b:'乃',c:'匚',d:'刀',e:'乇',f:'千',g:'爪',h:'卄',i:'丨',j:'丁',k:'长',l:'ㄥ',m:'爪',n:'几',o:'ㄖ',p:'卩',q:'q',r:'尺',s:'丂',t:'丅',u:'ㄩ',v:'ᐯ',w:'山',x:'乂',y:'ㄚ',z:'乙'}[c] || c)).join("") },
  // 50
  { name: "Boxed Outlines",
    sample: "⟦E⟧⟦M⟧⟦M⟧⟦Y⟧⟦F⟧⟦R⟧⟦O⟧⟦S⟧⟦H⟧-⟦A⟧⟦I⟧",
    convert: t => t.split("").map(c => `⟦${c}⟧`).join("") },
  // 51
  { name: "Lined Blockers",
    sample: "⫷E⫸⫷M⫸⫷M⫸⫷Y⫸⫷F⫸⫷R⫸⫷O⫸⫷S⫸⫷H⫸-⫷A⫸⫷I⫸",
    convert: t => t.split("").map(c => `⫷${c}⫸`).join("") },
  // 52
  { name: "Wide",
    sample: "ＥＭＭＹＦＲＯＳＨ－ＡＩ",
    convert: t => t.split("").map(c => {
      const code = c.charCodeAt(0);
      if (code >= 33 && code <= 126) return String.fromCharCode(code + 0xFEE0);
      if (c === ' ') return '\u3000';
      return c;
    }).join("") },
  // 53
  { name: "Runic",
    sample: "ᛖᛗᛗᚤᚠᚱᛟᛋᚺ-ᚨᛁ",
    convert: t => t.toLowerCase().split("").map(c => ({a:'ᚨ',b:'ᛒ',c:'ᚲ',d:'ᛞ',e:'ᛖ',f:'ᚠ',g:'ᚷ',h:'ᚺ',i:'ᛁ',j:'ᛃ',k:'ᚲ',l:'ᛚ',m:'ᛗ',n:'ᚾ',o:'ᛟ',p:'ᛈ',q:'q',r:'ᚱ',s:'ᛋ',t:'ᛏ',u:'ᚢ',v:'ᚡ',w:'ᚹ',x:'x',y:'ᚤ',z:'ᛉ'}[c] || c)).join("") },
  // 54
  { name: "Braille",
    sample: "⠑⠍⠍⠽⠋⠗⠕⠎⠓-⠁⠊",
    convert: t => t.toLowerCase().split("").map(c => ({a:'⠁',b:'⠃',c:'⠉',d:'⠙',e:'⠑',f:'⠋',g:'⠛',h:'⠓',i:'⠊',j:'⠚',k:'⠅',l:'⠇',m:'⠍',n:'⠝',o:'⠕',p:'⠏',q:'⠟',r:'⠗',s:'⠎',t:'⠞',u:'⠥',v:'⠧',w:'⠺',x:'⠭',y:'⠽',z:'⠵'}[c] || c)).join("") },
  // 55
  { name: "Currency Style",
    sample: "ɆᛗᛗɎ₣ɌØ₴Ħ-₳ł",
    convert: t => t.toLowerCase().split("").map(c => ({a:'₳',b:'฿',c:'₵',d:'Đ',e:'Ɇ',f:'₣',g:'₲',h:'Ħ',i:'ł',j:'J',k:'₭',l:'Ⱡ',m:'ᛗ',n:'₦',o:'Ø',p:'₱',q:'Q',r:'Ɍ',s:'₴',t:'₮',u:'Ʉ',v:'V',w:'₩',x:'X',y:'Ɏ',z:'Ƶ'}[c] || c)).join("") },
  // 56
  { name: "Old English",
    sample: "𝕰𝕸𝕸𝖄𝕱𝕽𝕺𝕾𝕳-𝕬𝕴",
    convert: t => t.split("").map(c => ({a:'𝖆',b:'𝖇',c:'𝖈',d:'𝖉',e:'𝖊',f:'𝖋',g:'𝖌',h:'𝖍',i:'𝖎',j:'𝖏',k:'𝖐',l:'𝖑',m:'𝖒',n:'𝖓',o:'𝖔',p:'𝖕',q:'𝖖',r:'𝖗',s:'𝖘',t:'𝖙',u:'𝖚',v:'𝖛',w:'𝖜',x:'𝖝',y:'𝖞',z:'𝖟',A:'𝕬',B:'𝕭',C:'𝕮',D:'𝕯',E:'𝕰',F:'𝕱',G:'𝕲',H:'𝕳',I:'𝕴',J:'𝕵',K:'𝕶',L:'𝕷',M:'𝕸',N:'𝕹',O:'𝕺',P:'𝕻',Q:'𝕼',R:'𝕽',S:'𝕾',T:'𝕿',U:'𝖀',V:'𝖁',W:'𝖂',X:'𝖃',Y:'𝖄',Z:'𝖅'}[c] || c)).join("") },
  // 57
  { name: "Thick Italic",
    sample: "𝙀𝙈𝙈𝙔𝙁𝙍𝙊𝙎𝙃-𝘼𝙄",
    convert: t => t.split("").map(c => ({a:'𝙖',b:'𝙗',c:'𝙘',d:'𝙙',e:'𝙚',f:'𝙛',g:'𝙜',h:'𝙝',i:'𝙞',j:'𝙟',k:'𝙠',l:'𝙡',m:'𝙢',n:'𝙣',o:'𝙤',p:'𝙥',q:'𝙦',r:'𝙧',s:'𝙨',t:'𝙩',u:'𝙪',v:'𝙫',w:'𝙬',x:'𝙭',y:'𝙮',z:'𝙯',A:'𝘼',B:'𝘽',C:'𝘾',D:'𝘿',E:'𝙀',F:'𝙁',G:'𝙂',H:'𝙃',I:'𝙄',J:'𝙅',K:'𝙆',L:'𝙇',M:'𝙈',N:'𝙉',O:'𝙊',P:'𝙋',Q:'𝙌',R:'𝙍',S:'𝙎',T:'𝙏',U:'𝙐',V:'𝙑',W:'𝙒',X:'𝙓',Y:'𝙔',Z:'𝙕'}[c] || c)).join("") },
  // 58
  { name: "Math Italic",
    sample: "𝐸𝑀𝑀𝑌𝐹𝑅𝑂𝑆𝐻-𝐴𝐼",
    convert: t => t.split("").map(c => ({a:'𝑎',b:'𝑏',c:'𝑐',d:'𝑑',e:'𝑒',f:'𝑓',g:'𝑔',h:'𝑕',i:'𝑖',j:'𝑗',k:'𝑘',l:'𝑙',m:'𝑚',n:'𝑛',o:'𝑜',p:'𝑝',q:'𝑞',r:'𝑟',s:'𝑠',t:'𝑡',u:'𝑢',v:'𝑣',w:'𝑤',x:'𝑥',y:'𝑦',z:'𝑧',A:'𝐴',B:'𝐵',C:'𝐶',D:'𝐷',E:'𝐸',F:'𝐹',G:'𝐺',H:'𝐻',I:'𝐼',J:'𝐽',K:'𝐾',L:'𝐿',M:'𝑀',N:'𝑁',O:'𝑂',P:'𝑃',Q:'𝑄',R:'𝑅',S:'𝑆',T:'𝑇',U:'𝑈',V:'𝑉',W:'𝑊',X:'𝑋',Y:'𝑌',Z:'𝑍'}[c] || c)).join("") },
  // 59
  { name: "Scribble",
    sample: "E͋M͋M͋Y͋F͋R͋O͋S͋H͋-A͋I͋",
    convert: t => t.split("").map(c => c + '͋').join("") },
  // 60
  { name: "Wiggle",
    sample: "Ẽ M̃ M̃ Ỹ F̃ R̃ Õ S̃ H̃-Ã Ĩ",
    convert: t => t.split("").map(c => c + '̃').join("") },
  // 61
  { name: "Ring Above",
    sample: "E̊M̊M̊Y̊F̊R̊O̊S̊H̊-ÅI̊",
    convert: t => t.split("").map(c => c + '̊').join("") },
  // 62
  { name: "Caret Above",
    sample: "Ê M̂ M̂ Ŷ F̂ R̂ Ô Ŝ Ĥ-Â Î",
    convert: t => t.split("").map(c => c + '̂').join("") },
  // 63
  { name: "Grave Above",
    sample: "È M̀ M̀ Ỳ F̀ R̀ Ò S̀ H̀-À Ì",
    convert: t => t.split("").map(c => c + '̀').join("") },
  // 64
  { name: "Bridge Below",
    sample: "E͆M͆M͆Y͆F͆R͆O͆S͆H͆-A͆I͆",
    convert: t => t.split("").map(c => c + '͆').join("") },
  // 65
  { name: "Cross Above",
    sample: "E͓M͓M͓Y͓F͓R͓O͓S͓H͓-A͓I͓",
    convert: t => t.split("").map(c => c + '͓').join("") },
  // 66
  { name: "Enclosing Circle",
    sample: "E⃝M⃝M⃝Y⃝F⃝R⃝O⃝S⃝H⃝-A⃝I⃝",
    convert: t => t.split("").map(c => c + '⃝').join("") },
  // 67
  { name: "Enclosing Square",
    sample: "E⃞M⃞M⃞Y⃞F⃞R⃞O⃞S⃞H⃞-A⃞I⃞",
    convert: t => t.split("").map(c => c + '⃞').join("") },
  // 68
  { name: "Enclosing Diamond",
    sample: "E⃟M⃟M⃟Y⃟F⃟R⃟O⃟S⃟H⃟-A⃟I⃟",
    convert: t => t.split("").map(c => c + '⃟').join("") },
  // 69
  { name: "Greek Bold Symbol",
    sample: "𝚵𝚳𝚳𝐘𝐅𝚪𝚯𝐒𝚮-𝚨𝙸",
    convert: t => t.toUpperCase().split("").map(c => ({A:'𝚨',B:'𝚩',C:'𝐂',D:'𝚫',E:'𝚵',F:'𝐅',G:'𝐆',H:'𝚮',I:'𝙸',J:'𝙹',K:'𝚱',L:'𝐋',M:'𝚳',N:'𝙽',O:'𝚯',P:'𝐏',Q:'𝐐',R:'𝚪',S:'𝐒',T:'𝚻',U:'𝐔',V:'𝐕',W:'𝐖',X:'𝚾',Y:'𝐘',Z:'𝚭'}[c] || c)).join("") },
  // 70
  { name: "Greek Sans Bold",
    sample: "𝞢𝞛𝞛𝙔𝙁𝞒𝞗𝙎𝞖-𝞐𝙄",
    convert: t => t.toUpperCase().split("").map(c => ({A:'𝞐',B:'𝞑',C:'𝐂',D:'𝞓',E:'𝞔',F:'𝙁',G:'𝐆',H:'𝞖',I:'𝙄',J:'𝙅',K:'𝚱',L:'𝐋',M:'𝞛',N:'𝙉',O:'𝞗',P:'𝞠',Q:'𝙌',R:'𝞒',S:'𝙎',T:'𝞣',U:'𝙐',V:'𝙑',W:'𝙒',X:'𝞦',Y:'𝙔',Z:'𝞧'}[c] || c)).join("") },
  // 71
  { name: "Wavy Above",
    sample: "E̴M̴M̴Y̴F̴R̴O̴S̴H̴-A̴I̴",
    convert: t => t.split("").map(c => c + '̴').join("") },
  // 72
  { name: "Keycap Enclosing",
    sample: "E⃣M⃣M⃣Y⃣F⃣R⃣O⃣S⃣H⃣-A⃣I⃣",
    convert: t => t.split("").map(c => c + '⃣').join("") },
  // 73
  { name: "Tildes",
    sample: "E~M~M~Y~F~R~O~S~H-A~I",
    convert: t => t.split("").join("~") },
  // 74
  { name: "Dashes",
    sample: "E-M-M-Y-F-R-O-S-H-A-I",
    convert: t => t.split("").join("-") },
  // 75
  { name: "Plus Signs",
    sample: "E+M+M+Y+F+R+O+S+H-A+I",
    convert: t => t.split("").join("+") },
  // 76
  { name: "Hash",
    sample: "E#M#M#Y#F#R#O#S#H-A#I",
    convert: t => t.split("").join("#") },
  // 77
  { name: "At Signs",
    sample: "E@M@M@Y@F@R@O@S@H-A@I",
    convert: t => t.split("").join("@") },
  // 78
  { name: "Dots",
    sample: "E·M·M·Y·F·R·O·S·H-A·I",
    convert: t => t.split("").join("·") },
  // 79
  { name: "Colon",
    sample: "E:M:M:Y:F:R:O:S:H-A:I",
    convert: t => t.split("").join(":") },
  // 80
  { name: "Slash Sep",
    sample: "E/M/M/Y/F/R/O/S/H-A/I",
    convert: t => t.split("").join("/") },
  // 81
  { name: "Pipe Sep",
    sample: "E|M|M|Y|F|R|O|S|H-A|I",
    convert: t => t.split("").join("|") },
  // 82
  { name: "Exclaim",
    sample: "E!M!M!Y!F!R!O!S!H-A!I",
    convert: t => t.split("").join("!") },
  // 83
  { name: "Double Colon",
    sample: "E::M::M::Y::F::R::O::S::H-A::I",
    convert: t => t.split("").join("::") },
  // 84
  { name: "Wave Sep",
    sample: "E∿M∿M∿Y∿F∿R∿O∿S∿H-A∿I",
    convert: t => t.split("").join("∿") },
  // 85
  { name: "Arrow Sep",
    sample: "E»M»M»Y»F»R»O»S»H-A»I",
    convert: t => t.split("").join("»") },
  // 86
  { name: "Thorn Sep",
    sample: "E×M×M×Y×F×R×O×S×H-A×I",
    convert: t => t.split("").join("×") },
  // 87
  { name: "Degree Sep",
    sample: "E°M°M°Y°F°R°O°S°H-A°I",
    convert: t => t.split("").join("°") },
  // 88
  { name: "Latin Extended",
    sample: "ȨɱɱɏƑɌØȘĦ-ȦȈ",
    convert: t => t.toLowerCase().split("").map(c => ({a:'ȧ',b:'ƀ',c:'ȼ',d:'ɖ',e:'ȩ',f:'ƒ',g:'ɠ',h:'ħ',i:'ȉ',j:'ȷ',k:'ƙ',l:'ƚ',m:'ɱ',n:'ɲ',o:'ø',p:'ƥ',q:'ɋ',r:'ɍ',s:'ș',t:'ƭ',u:'ʉ',v:'ʋ',w:'ƿ',x:'x',y:'ɏ',z:'ƶ'}[c] || c)).join("") },
  // 89
  { name: "Phonetic",
    sample: "ɛmmʏfʀoʃh-aɪ",
    convert: t => t.toLowerCase().split("").map(c => ({a:'a',b:'b',c:'c',d:'d',e:'ɛ',f:'f',g:'g',h:'h',i:'ɪ',j:'ʤ',k:'k',l:'l',m:'m',n:'n',o:'o',p:'p',q:'q',r:'ʀ',s:'ʃ',t:'t',u:'u',v:'v',w:'w',x:'x',y:'ʏ',z:'z'}[c] || c)).join("") },
  // 90
  { name: "Caps Serif",
    sample: "𝐄𝐌𝐌𝐘𝐅𝐑𝐎𝐒𝐇-𝐀𝐈",
    convert: t => t.toUpperCase().split("").map(c => ({A:'𝐀',B:'𝐁',C:'𝐂',D:'𝐃',E:'𝐄',F:'𝐅',G:'𝐆',H:'𝐇',I:'𝐈',J:'𝐉',K:'𝐊',L:'𝐋',M:'𝐌',N:'𝐍',O:'𝐎',P:'𝐏',Q:'𝐐',R:'𝐑',S:'𝐒',T:'𝐓',U:'𝐔',V:'𝐕',W:'𝐖',X:'𝐗',Y:'𝐘',Z:'𝐙'}[c] || c)).join("") },
  // 91
  { name: "Superscript Mix",
    sample: "ᴱᴹᴹʸᶠᴿᴼˢᴴ-ᴬᴵ",
    convert: t => t.split("").map(c => ({a:'ᵃ',b:'ᵇ',c:'ᶜ',d:'ᵈ',e:'ᵉ',f:'ᶠ',g:'ᵍ',h:'ʰ',i:'ⁱ',j:'ʲ',k:'ᵏ',l:'ˡ',m:'ᵐ',n:'ⁿ',o:'ᵒ',p:'ᵖ',q:'q',r:'ʳ',s:'ˢ',t:'ᵗ',u:'ᵘ',v:'ᵛ',w:'ʷ',x:'ˣ',y:'ʸ',z:'ᶻ',A:'ᴬ',B:'ᴮ',C:'ᶜ',D:'ᴰ',E:'ᴱ',F:'ᶠ',G:'ᴳ',H:'ᴴ',I:'ᴵ',J:'ᴶ',K:'ᴷ',L:'ᴸ',M:'ᴹ',N:'ᴺ',O:'ᴼ',P:'ᴾ',Q:'Q',R:'ᴿ',S:'ˢ',T:'ᵀ',U:'ᵁ',V:'ᵛ',W:'ᵂ',X:'ˣ',Y:'ʸ',Z:'ᶻ'}[c] || c)).join("") },
  // 92
  { name: "Big Caps",
    sample: "EMMYFROSH-AI",
    convert: t => t.toUpperCase() },
  // 93
  { name: "Mirrored",
    sample: "Ǝ M M Y ꟻ Я O Ƨ H - A I",
    convert: t => t.toUpperCase().split("").map(c => ({A:'A',B:'ᗺ',C:'Ɔ',D:'ᗡ',E:'Ǝ',F:'ꟻ',G:'ᵷ',H:'H',I:'I',J:'Ⴑ',K:'ʞ',L:'⅃',M:'M',N:'И',O:'O',P:'ꟼ',Q:'Ϙ',R:'Я',S:'Ƨ',T:'T',U:'U',V:'V',W:'W',X:'X',Y:'Y',Z:'Z'}[c] || c)).join("") },
  // 94
  { name: "Zalgo Light",
    sample: "E̍M̍M̍Y̍F̍R̍O̍S̍H̍-A̍I̍",
    convert: t => t.split("").map(c => c + '̍').join("") },
  // 95
  { name: "Diaeresis",
    sample: "Ë M̈ M̈ Ÿ F̈ R̈ Ö S̈ Ḧ-Ä Ï",
    convert: t => t.split("").map(c => c + '̈').join("") },
  // 96
  { name: "Cedilla",
    sample: "ȨM̧M̧Y̧F̧ŖO̧Ş H̨-ĄI̧",
    convert: t => t.split("").map(c => c + '̧').join("") },
  // 97
  { name: "Ogonek",
    sample: "Ę M̨ M̨ Y̨ F̨ R̨ Ǫ S̨ H̨-Ą Į",
    convert: t => t.split("").map(c => c + '̨').join("") },
  // 98
  { name: "Double Overline",
    sample: "E̿M̿M̿Y̿F̿R̿O̿S̿H̿-A̿I̿",
    convert: t => t.split("").map(c => c + '̿').join("") },
  // 99
  { name: "Tilde Below",
    sample: "ḚM̰M̰Y̰F̰R̰O̰S̰H̰-A̰Ḭ",
    convert: t => t.split("").map(c => c + '̰').join("") },
  // 100
  { name: "Macron Below",
    sample: "E̱M̱M̱Y̱F̱ṞO̱S̱H̱-A̱I̱",
    convert: t => t.split("").map(c => c + '̱').join("") },
];

// ── helpers ──────────────────────────────────────────────────────────────────
function padNum(n) { return String(n).padStart(2, "0"); }

/**
 * Get all fonts: built-in FONT_LIST + custom fonts from menu.json.
 * Custom fonts are appended after the built-in ones.
 * Returns an array where index 0 = font #1.
 */
function getAllFonts() {
  const data = loadMenu();
  const customs = data.customFonts || {};
  const customEntries = Object.entries(customs)
    .sort((a, b) => a[1].index - b[1].index)
    .map(([, v]) => ({
      name: v.name,
      sample: v.sample || v.name,
      convert: (() => {
        // Build a converter from the stored charMap
        const map = v.charMap || {};
        return (t) => t.split("").map(c => map[c] || map[c.toLowerCase()] || c).join("");
      })()
    }));
  return [...FONT_LIST, ...customEntries];
}

function applyFontByIndex(text, index, allFonts) {
  const fonts = allFonts || getAllFonts();
  const entry = fonts[index - 1];
  return entry ? entry.convert(text) : text;
}

const welDate = moment.tz(global.timezone).format("DD/MM/YYYY");
const formatp = sizeFormatter({ std: "JEDEC", decimalPlaces: 2, render: (l, s) => `${l} ${s}B` });
const run = (s) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, sec && `${sec}s`].filter(Boolean).join(" ");
};
const getTime = () => moment.tz(global.timezone).format("HH:mm:ss");

const ALL_CATEGORIES = [
  "EnvManager","Info","Fun","Ai","Group","Owner","Other","Logo",
  "Search","Converter","Maker","Game","Tool","Downloader", "Economy","Sport","Wa","External","Nsfw","Settings","Privacy"
];
const CATEGORY_SET = new Set(ALL_CATEGORIES.map(c => c.toLowerCase()));

// lowercase → proper name, so "group", "GROUP" and "Group" all become "Group"
// (plugins can write their category in any letter case and still land in ONE section)
const CATEGORY_MAP = new Map(ALL_CATEGORIES.map(c => [c.toLowerCase(), c]));
function normCat(c) {
  return CATEGORY_MAP.get(String(c || "Info").trim().toLowerCase());
}

// ================= MENU STYLE (collected from a replied menu) =================
// .menustyle  → reply to any menu message, bot reads its layout/decoration and saves it
// .delstyle   → go back to the default menu design
//
// Placeholders used in the saved template:
// {BOTNAME} {USER} {PING} {TIME} {DATE} {COMMANDS} {MEMORY} {UPTIME}
// {VERSION} {PREFIX} {PLATFORM} {OWNER}  and  {CAT} (category title)

const ALNUM     = "\\p{L}\\p{N}\\p{M}";
const HAS_ALNUM = new RegExp(`[${ALNUM}]`, "u");
// a command line = decoration + prefix char + one word + decoration  (e.g. "┃ ➥ .ping")
const CMD_RE    = new RegExp(`^([^${ALNUM}]*?)([.!#$/,;+?~])(\\S*?[${ALNUM}])([^${ALNUM}]*)$`, "u");

// fallback: command lines with NO prefix char (e.g. "┃ ➥ ᴘɪɴɢ") or a custom/unknown prefix
const LOOSE_RE  = new RegExp(`^([^${ALNUM}]*?)(\\S*?[${ALNUM}])([^${ALNUM}]*)$`, "u");

// Reverse lookup (fancy letter → plain letter) built from the font list above,
// so labels like "ᴜsᴇʀ" or "𝗨𝘀𝗲𝗿" can still be recognised as "user".
const REVERSE_MAP = (() => {
  const map = {};
  const abc = "abcdefghijklmnopqrstuvwxyz";
  for (const f of FONT_LIST) {
    if (f.name === "Inverted") continue; // reverses order, would corrupt the map
    try {
      const out = Array.from(f.convert(abc));
      if (out.length !== 26) continue;
      out.forEach((ch, i) => {
        if (ch.charCodeAt(0) > 127 && !(ch in map)) map[ch] = abc[i];
      });
    } catch (e) {}
  }
  return map;
})();

function plain(s) {
  return Array.from(String(s))
    .map(ch => REVERSE_MAP[ch] || ch)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u20d0-\u20ff]/g, "")
    .toLowerCase();
}

const LABEL_RULES = [
  ["BOTNAME",  /\bbot\s*name\b|\bbotname\b|^\s*bot\s*$/],
  ["OWNER",    /\bowner\b|\bcreator\b|\bdeveloper\b|\bdev\b/],
  ["PREFIX",   /\bprefix\b|\bpref\b/],
  ["PING",     /\bping\b|\bspeed\b|\blatency\b|\bresponse\b/],
  ["UPTIME",   /\buptime\b|\bruntime\b|\brun\s*time\b/],
  ["VERSION",  /\bversion\b|\bver\b|^\s*v\s*$/],
  ["MEMORY",   /\bmemory\b|\bram\b|\bmem\b|\bstorage\b/],
  ["COMMANDS", /\bcommands?\b|\bcmds?\b|\bfeatures?\b/],
  ["PLATFORM", /\bplatform\b|\bhost\b|\bserver\b|^\s*os\s*$/],
  ["DATE",     /\bdate\b/],
  ["TIME",     /\btime\b|\bclock\b/],
  ["USER",     /\buser\b|\bname\b|\bplayer\b|\bhello\b|^\s*hi\s*$/]
];

// split "❃ ➤ User: John" → { label: "❃ ➤ User", sep: ":", rest: " John" }
function splitLabel(line) {
  const chars = Array.from(line);
  let seen = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (HAS_ALNUM.test(ch)) seen = true;
    else if (seen && ":：»→➜⇒=".includes(ch)) {
      return { label: chars.slice(0, i).join(""), sep: ch, rest: chars.slice(i + 1).join("") };
    }
  }
  return null;
}

// replace everything from the first to the last letter/digit with a token
function replaceCore(str, token) {
  const chars = Array.from(str);
  let a = -1, b = -1;
  chars.forEach((ch, i) => { if (HAS_ALNUM.test(ch)) { if (a < 0) a = i; b = i; } });
  if (a < 0) return null;
  return chars.slice(0, a).join("") + token + chars.slice(b + 1).join("");
}

function templateHeader(lines) {
  let nameDone = false;
  return lines.map(line => {
    if (!HAS_ALNUM.test(line)) return line;
    const sp = splitLabel(line);
    if (sp) {
      nameDone = true;
      const key  = plain(sp.label).replace(/[^a-z\s]/g, " ");
      const rule = LABEL_RULES.find(([, re]) => re.test(key));
      if (rule) {
        const core = replaceCore(sp.rest, `{${rule[0]}}`);
        if (core !== null) return sp.label + sp.sep + core;
      }
      return line;
    }
    if (!nameDone) {
      nameDone = true;
      const t = replaceCore(line, "{BOTNAME}");
      if (t !== null) return t;
    }
    return line;
  });
}

// Clean text that comes from a WhatsApp quoted message:
// removes invisible chars, odd spaces, quote markers and *bold* / _italic_ / ~strike~ / `mono` wrappers
function cleanMenuText(raw) {
  return String(raw || "")
    .replace(/\r/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "")   // invisible chars
    .replace(/[\u00A0\u2007\u202F]/g, " ")                       // odd spaces
    .replace(/\t/g, " ")
    .split("\n")
    .map(l => l
      .replace(/\s+$/, "")
      .replace(/^>\s?/, "")                                      // WhatsApp quote marker
      .replace(/^(\s*)[*_~`]+(?=\S)/, "$1")                      // leading markers
      .replace(/(?<=\S)[*_~`]+$/, ""));                          // trailing markers
}

/**
 * Read a menu message and turn it into a reusable template.
 * Returns { ok:true, style, stats } or { ok:false, error }.
 */
function parseMenuStyle(raw) {
  const lines = cleanMenuText(raw);

  // 1) find command lines (most common "shape" wins)
  const keyOf = i => `${i.left}\u0000${i.pre}\u0000${i.right}`;
  const detect = (re, withPrefix) => {
    const arr = lines.map(l => {
      const mt = l.match(re);
      if (!mt) return null;
      return withPrefix
        ? { left: mt[1], pre: mt[2], right: mt[4].replace(/\s+$/, "") }
        : { left: mt[1], pre: "",    right: mt[3].replace(/\s+$/, "") };
    });
    const counts = new Map();
    arr.forEach(i => { if (i) counts.set(keyOf(i), (counts.get(keyOf(i)) || 0) + 1); });
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return { arr, best };
  };

  let usePrefix = true;
  let { arr: info, best } = detect(CMD_RE, true);
  if (!best || best[1] < 2) {
    usePrefix = false;
    ({ arr: info, best } = detect(LOOSE_RE, false));
  }
  if (!best || best[1] < 2) return { ok: false, error: "I couldn't find a repeating list of command lines in that message." };
  const [bestKey] = best;

  const isCmd = info.map(i => !!i && keyOf(i) === bestKey);
  const first = info.find(i => i && keyOf(i) === bestKey);

  // 2) group command lines into blocks (categories)
  const blocks = [];
  let cur = null;
  lines.forEach((_, i) => {
    if (!isCmd[i]) return;
    if (cur && cur.end === i - 1) cur.end = i;
    else { cur = { start: i, end: i }; blocks.push(cur); }
  });

  // 3) category title = lines right above the first block
  let t = 0, ti = blocks[0].start - 1;
  while (ti >= 0 && t < 3 && lines[ti].trim() && !isCmd[ti] && !splitLabel(lines[ti])) { t++; ti--; }
  if (t === 0) return { ok: false, error: "I couldn't find category titles above the command lists." };
  const titleStart = blocks[0].start - t;
  const titleRaw   = lines.slice(titleStart, blocks[0].start);
  let   catDone    = false;
  const title      = titleRaw.map(l => {
    if (catDone || !HAS_ALNUM.test(l)) return l;
    catDone = true;
    return replaceCore(l, "{CAT}") || l;
  });

  // 4) header = everything above the first title
  let h = titleStart - 1;
  while (h >= 0 && !lines[h].trim()) h--;
  const blanksBefore = titleStart - 1 - h;
  let header = lines.slice(0, h + 1);
  while (header.length && !header[0].trim()) header.shift();
  const headerGap = header.length ? "\n".repeat(blanksBefore + 1) : "";
  header = templateHeader(header);

  // 5) closing line(s) + gap between blocks
  let closeLines = [], blankCount = 1;
  if (blocks.length >= 2) {
    const region = lines.slice(blocks[0].end + 1, blocks[1].start);
    const before = region.slice(0, Math.max(0, region.length - t));
    let c = 0;
    while (c < before.length && before[c].trim()) c++;
    closeLines = before.slice(0, c);
    blankCount = before.slice(c).filter(l => !l.trim()).length;
  } else {
    const after = lines.slice(blocks[0].end + 1);
    let c = 0;
    while (c < after.length && c < 2 && after[c].trim() && !HAS_ALNUM.test(after[c])) c++;
    closeLines = after.slice(0, c);
  }
  const blockGap = "\n".repeat(blankCount + 1);

  // 6) footer (decoration only — text like "powered by X" is skipped)
  const lastBlock = blocks[blocks.length - 1];
  let after = lines.slice(lastBlock.end + 1);
  if (closeLines.length && after.slice(0, closeLines.length).every(l => l.trim())) after = after.slice(closeLines.length);
  let lead = 0;
  while (lead < after.length && !after[lead].trim()) lead++;
  const footerAll   = after.filter(l => l.trim());
  const footer      = footerAll.filter(l => !HAS_ALNUM.test(l));
  const footerGap   = "\n".repeat(lead + 1);
  const skippedText = footerAll.length - footer.length;

  const cmdCount = blocks.reduce((n, b) => n + (b.end - b.start + 1), 0);

  return {
    ok: true,
    style: {
      header, headerGap,
      title,
      cmdLeft: first.left, cmdRight: first.right, usePrefix,
      close: closeLines, blockGap,
      footer, footerGap,
      savedAt: Date.now()
    },
    stats: { categories: blocks.length, commands: cmdCount, skippedText }
  };
}

// Walk a message object and return the longest text/caption found.
// Used as a fallback when the quoted message wrapper has an unusual shape
// (public/private bot setups, ephemeral/view-once wrappers, forwarded menus, etc.)
function deepFindText(obj, depth = 0, seen = new Set()) {
  try {
    if (!obj || typeof obj !== "object" || depth > 7 || seen.has(obj)) return "";
    if (Buffer.isBuffer(obj) || ArrayBuffer.isView(obj)) return "";
    seen.add(obj);
    let best = "";
    for (const k of ["conversation", "text", "caption", "body"]) {
      const v = obj[k];
      if (typeof v === "string" && v.length > best.length) best = v;
    }
    for (const k of Object.keys(obj)) {
      if (k === "contextInfo" || k === "key" || k === "jpegThumbnail") continue;
      const v = obj[k];
      if (v && typeof v === "object") {
        const found = deepFindText(v, depth + 1, seen);
        if (found.length > best.length) best = found;
      }
    }
    return best;
  } catch (e) {
    return "";
  }
}

// Get the text of the message that was replied to (works with most Baileys wrappers)
function getQuotedText(m) {
  const q = m.quoted || m.quotedMsg;
  if (!q) return "";
  if (typeof q === "string") return q;
  const pick = [
    q.text, q.body, q.caption, q.conversation,
    q.msg?.text, q.msg?.caption, q.msg?.conversation, q.msg?.extendedTextMessage?.text,
    q.message?.conversation, q.message?.extendedTextMessage?.text,
    q.message?.imageMessage?.caption, q.message?.videoMessage?.caption,
    q.fakeObj?.message?.conversation, q.fakeObj?.message?.extendedTextMessage?.text,
    q.fakeObj?.message?.imageMessage?.caption, q.fakeObj?.message?.videoMessage?.caption
  ];
  const direct = pick.find(v => typeof v === "string" && v.trim());
  if (direct) return direct;

  // Last resort: search the whole quoted object for text
  for (const src of [q.msg, q.message, q.fakeObj, q]) {
    const found = deepFindText(src);
    if (found && found.trim()) return found;
  }
  return "";
}

function getOwnerName() {
  return global.ownername || global.ownerName || global.owner_name || "EMMYFROSH";
}

function makeValues(m, count, F, pfx) {
  return {
    BOTNAME:  F(global.botname || "EMMYFROSH-AI"),
    USER:     m.pushName || "User",
    PING:     `${getPing(m)} ms`,
    TIME:     getTime(),
    DATE:     moment.tz(global.timezone).format("DD/MM/YYYY"),
    COMMANDS: String(count),
    MEMORY:   formatp(os.totalmem() - os.freemem()),
    UPTIME:   run(process.uptime()) || "0s",
    VERSION:  String(getBotVersion()),
    PREFIX:   pfx,
    PLATFORM: getPlatform(),
    OWNER:    getOwnerName()
  };
}

// cats = [ [categoryName, [cmd, cmd, ...]], ... ]
function renderStyledMenu(style, { F, pfx, vals, cats }) {
  // font only touches plain A-Z words, placeholders like {USER} are left alone
  const styleText = s => s.replace(/\{[A-Z]+\}|[A-Za-z]+/g, w => (w[0] === "{" ? w : F(w)));
  const fill = (s, extra = {}) => s.replace(/\{([A-Z]+)\}/g, (w, k) => (k in extra ? extra[k] : (k in vals ? vals[k] : w)));

  const header = (style.header || []).map(l => fill(styleText(l))).join("\n");

  const blocks = cats.map(([cat, cmds]) => {
    const out = (style.title || []).map(l => fill(styleText(l), { CAT: F(cat) }));
    cmds.forEach(c => out.push(`${style.cmdLeft || ""}${style.usePrefix === false ? "" : pfx}${F(c)}${style.cmdRight || ""}`));
    (style.close || []).forEach(l => out.push(styleText(l)));
    return out.join("\n");
  });

  let msg = "";
  if (header) msg += header + (style.headerGap || "\n\n");
  msg += blocks.join(style.blockGap || "\n\n");
  const footer = (style.footer || []).join("\n");
  if (footer) msg += (style.footerGap || "\n\n") + footer;
  return msg;
}

async function okReact(m, ednut, reply) {
  try {
    await ednut.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
  } catch (e) {
    if (reply) await reply("✅");
  }
}

module.exports = [

  // ================= MENU =================
  {
    command: ["menu", "allmenu"],
    description: "Show bot menu or a specific category",
    category: "Info",
    execute: async (m, { ednut, commands, text }) => {
      const data     = loadMenu();
      const pfx      = Array.isArray(global.prefix) ? global.prefix[0] : global.prefix;
      const idx      = data.fontIndex || 1;
      const allFonts = getAllFonts();
      const F        = t => applyFontByIndex(t, idx, allFonts);
      const style    = data.menuStyle || null;
      const disabled = Array.isArray(global.db?.disabled) ? global.db.disabled.filter(Boolean).map(v => v.toLowerCase()) : [];

      // ── Category filter: .menu fun / .menu group / etc. ──────────────
      if (text) {
        const firstWord = text.trim().split(/\s+/)[0].toLowerCase();
        if (CATEGORY_SET.has(firstWord)) {
          const matchedCat = normCat(firstWord);
          const catCmds    = [];
          commands.forEach(cmd => {
            // group / Group / GROUP all count as the same category
            if (normCat(cmd.category) !== matchedCat) return;
            const cmds = Array.isArray(cmd.command) ? cmd.command : [cmd.command];
            if (!cmds.some(c => c && disabled.includes(c.toLowerCase())))
              cmds.filter(Boolean).forEach(c => { if (!catCmds.includes(c)) catCmds.push(c); });
          });

          // Collected style (.menustyle) → same design, single category
          if (style) {
            const sorted = [...new Set(catCmds)].sort();
            const out = renderStyledMenu(style, {
              F, pfx,
              vals: makeValues(m, sorted.length, F, pfx),
              cats: [[matchedCat, sorted]]
            });
            return await ednut.sendMessage(m.chat, { text: out }, { quoted: m });
          }

          let msg  = `┏━━{ *${F(global.botname || "EMMYFROSH-AI")}* }━━━\n`;
          msg     += `⚛ ⚙️ ${F("Commands")}: ${catCmds.length}\n`;
          msg     += `⚛ 🏷️ ${F("Prefix")}: ${pfx}\n`;
          msg     += `⚛ 📅 ${F("Date")}: ${welDate}\n`;
          msg     += `┗━━━━━━━━━━━━━━━\n\n`;
          msg     += `╭─❏〘 ${F(matchedCat)} 〙━━━━❒\n`;
          [...new Set(catCmds)].sort().forEach(cmd => { msg += `│ ${pfx}${F(cmd)}\n`; });
          msg     += `╰───────────╯`;

          // Category view → TEXT ONLY, no menu image
          return await ednut.sendMessage(m.chat, { text: msg }, { quoted: m });
        }
        return;
      }

      // ── Full menu ────────────────────────────────────────────────────
      let totalEnabledCommands = 0;
      const categories = {};
      ALL_CATEGORIES.forEach(cat => categories[cat] = []);
      commands.forEach(cmd => {
        const cmds    = Array.isArray(cmd.command) ? cmd.command : [cmd.command];
        const catName = normCat(cmd.category); // "group" / "Group" / "GROUP" → "Group"
        if (catName && !cmds.some(c => c && disabled.includes(c.toLowerCase()))) {
          cmds.filter(Boolean).forEach(c => categories[catName].push(c));
          totalEnabledCommands += cmds.filter(Boolean).length;
        }
      });

      let menu;

      if (style) {
        // Collected style (.menustyle)
        const cats = Object.keys(categories)
          .filter(cat => categories[cat].length > 0)
          .map(cat => [cat, [...new Set(categories[cat])].sort()]);
        menu = renderStyledMenu(style, {
          F, pfx,
          vals: makeValues(m, totalEnabledCommands, F, pfx),
          cats
        });
      } else {
        // Default design  (Owner is now before User, Ping removed, Platform is the LAST line)
        menu = `┏━━━{ *${F(global.botname || "EMMYFROSH-AI")}* }━━━┓
    ❃ ➤ ${F("Owner")}: ${getOwnerName()}
    ❃ ➤ ${F("User")}: ${m.pushName || "User"}
    ❃ ➤ ${F("Time")}: ${getTime()}
    ❃ ➤ ${F("Date")}: ${welDate}
    ❃ ➤ ${F("Commands")}: ${totalEnabledCommands}
    ❃ ➤ ${F("Memory")}: ${formatp(os.totalmem() - os.freemem())}
    ❃ ➤ ${F("Uptime")}: ${run(process.uptime())}
    ❃ ➤ ${F("Version")}: ${getBotVersion()}
    ❃ ➤ ${F("Platform")}: ${getPlatform()}
┗━━━━━━━━━━━━━━━┛\n\n`;

        Object.keys(categories).forEach(cat => {
          if (categories[cat].length > 0) {
            menu += `╭─❏〘 ${F(cat)} 〙━━━━❒\n`;
            [...new Set(categories[cat])].sort().forEach(cmd => { menu += `│ ${pfx}${F(cmd)}\n`; });
            menu += `╰───────────╯\n\n`;
          }
        });
      }

      // Full menu → show with menu image if set
      return await ednut.sendMessage(m.chat,
        data.menuImage
          ? { image: { url: data.menuImage }, caption: menu }
          : { text: menu },
        { quoted: m }
      );
    }
  },

  // ================= MENU STYLE (collect from replied menu) =================
  // Reply to any menu message with .menustyle
  {
    command: ["menustyle"],
    description: "Reply to a menu message to copy its design: .menustyle",
    category: "Settings",
    execute: async (m, { ednut, reply }) => {
      if (!m.quoted && !m.quotedMsg) {
        return reply("❌ Reply to a menu message with *.menustyle*\nI'll copy its design and use it for your menu.\n\nUse *.delstyle* to go back to the default.");
      }

      const raw = getQuotedText(m);
      if (!raw) return reply("❌ That message has no text I can read. Reply to the menu text/caption.");

      const parsed = parseMenuStyle(raw);
      if (!parsed.ok) {
        return reply(`❌ ${parsed.error}\n\nMake sure you reply to a full menu (with categories and commands like \`│ .ping\`).`);
      }

      const data     = loadMenu();
      data.menuStyle = parsed.style;
      saveMenu(data);

      return reply("Successfully ✔️");
    }
  },

  // ================= DELETE MENU STYLE =================
  {
    command: ["delstyle"],
    description: "Remove the collected menu style and use the default design",
    category: "Settings",
    execute: async (m, { ednut, reply }) => {
      const data     = loadMenu();
      data.menuStyle = null;
      saveMenu(data);
      return reply("ʀᴇᴍᴏᴠᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ ✔️");
    }
  },

  // ================= .font — dual purpose =================
  // .font          → show full font list (built-in + custom)
  // .font <N> <text> → convert text with font N
  {
    command: ["font"],
    description: "Show font list or convert text: .font | .font <N> <text>",
    category: "Settings",
    execute: async (m, { text, ednut, reply }) => {
      const allFonts = getAllFonts();
      const total    = allFonts.length;
      const data     = loadMenu();
      const idx      = data.fontIndex || 1;

      // ── No args → show font list ──────────────────────────────────────
      if (!text || !text.trim()) {
        let msg = `╭─❏〘 🎨 ғᴏɴᴛ ʟɪsᴛ 〙━━━❒\n`;
        msg    += `┃ 🔤 ᴄᴜʀʀᴇɴᴛ : #${padNum(idx)} ✅\n`;
        msg    += `┃ 📦 ᴛᴏᴛᴀʟ   : ${total} ғᴏɴᴛs\n`;
        msg    += `┗━━━━━━━━━━━━━━━━━━━\n\n`;
        msg    += `─❏〘  ᴀᴠᴀɪʟᴀʙʟᴇ ғᴏɴᴛs  〙━━❒\n`;

        allFonts.forEach((font, i) => {
          const isCustom = i >= FONT_LIST.length ? " 🆕" : "";
          msg += `│ ${padNum(i + 1)} • ${font.sample}${isCustom}\n`;
          if (i + 1 === 50) msg += `│\n`;
        });

        msg += `\n💡 sᴇᴛ     : .setfont <1-${total}>\n`;
        msg += `✨ ᴄᴏɴᴠᴇʀᴛ : .font <1-${total}> <text>\n`;
        msg += `➕ ᴀᴅᴅ     : .addfont <name> | <charMap>\n`;
        msg += `🗑️ ʀᴇsᴇᴛ   : .delfont\n`;
        msg += `❌ ʀᴇᴍᴏᴠᴇ  : .removefont <N>`;

        return await ednut.sendMessage(m.chat, { text: msg }, { quoted: m });
      }

      // ── Has args → try convert ────────────────────────────────────────
      const parts = text.trim().split(/\s+/);
      const num   = parseInt(parts[0], 10);
      const input = parts.slice(1).join(" ").trim();

      if (isNaN(num) || num < 1 || num > total || !input) {
        return reply(`❌ Usage: .font <1-${total}> <text>\nExample: .font 5 Hello World\n\nOr type *.font* alone to see all fonts.`);
      }

      return await ednut.sendMessage(m.chat,
        { text: allFonts[num - 1].convert(input) },
        { quoted: m }
      );
    }
  },

  // ================= ADD FONT =================
  // Usage: .addfont MyFont | a=ą b=ƀ c=ȼ ...
  // Or:    .addfont MyFont | a➜ą b➜ƀ c➜ȼ ...
  {
    command: ["addfont"],
    description: "Add a custom font: .addfont <name> | a=X b=Y c=Z ...",
    category: "Settings",
    execute: async (m, { text, reply }) => {
      if (!text || !text.includes("|")) {
        return reply(
          `❌ *Usage:* .addfont <FontName> | <charMap>\n\n` +
          `📝 *CharMap format:* use = or ➜ as separator\n` +
          `   a=ą b=ƀ c=ȼ d=ɖ e=ȩ ...\n\n` +
          `📌 *Example:*\n` +
          `.addfont MyFont | a=ą b=ƀ c=ȼ d=ɖ e=ȩ f=ƒ g=ɠ h=ħ i=ȉ j=ȷ`
        );
      }

      const [namePart, mapPart] = text.split("|").map(s => s.trim());
      const fontName = namePart.trim();
      if (!fontName) return reply("❌ Font name cannot be empty.");

      // Parse charMap — supports = or ➜ as separator, space-delimited pairs
      const charMap = {};
      const pairs   = mapPart.match(/\S+[=➜]\S+/g) || [];
      if (pairs.length === 0) return reply("❌ No valid character mappings found.\nFormat: a=ą b=ƀ c=ȼ");

      pairs.forEach(pair => {
        const sep = pair.includes("=") ? "=" : "➜";
        const [from, to] = pair.split(sep);
        if (from && to) {
          charMap[from] = to;
          // Also map uppercase if source is lowercase
          if (from === from.toLowerCase() && from !== from.toUpperCase()) {
            charMap[from.toUpperCase()] = to.toUpperCase ? to.toUpperCase() : to;
          }
        }
      });

      if (Object.keys(charMap).length === 0) return reply("❌ No valid mappings parsed. Check your format.");

      // Build a sample using EMMYFROSH-AI
      const sampleChars = "EMMYFROSH-AI".split("").map(c => charMap[c] || charMap[c.toLowerCase()] || c).join("");

      const data        = loadMenu();
      data.customFonts  = data.customFonts || {};

      // Assign next available custom index
      const existingCustom = Object.keys(data.customFonts).length;
      const newIndex        = FONT_LIST.length + existingCustom + 1;
      const key             = `custom_${Date.now()}`;

      data.customFonts[key] = {
        index:   newIndex,
        name:    fontName,
        sample:  sampleChars,
        charMap: charMap
      };

      saveMenu(data);

      return reply(
        `✅ *Custom font added!*\n` +
        `🔢 Font #: ${padNum(newIndex)}\n` +
        `🏷️ Name: ${fontName}\n` +
        `📝 Preview: ${sampleChars}\n` +
        `📦 Mappings: ${Object.keys(charMap).length} chars\n\n` +
        `💡 Use: .font ${newIndex} Your Text\n` +
        `💡 Set: .setfont ${newIndex}`
      );
    }
  },

  // ================= REMOVE CUSTOM FONT =================
  {
    command: ["removefont"],
    description: "Remove a custom font by number: .removefont <N>",
    category: "Settings",
    execute: async (m, { text, reply }) => {
      const data        = loadMenu();
      data.customFonts  = data.customFonts || {};
      const allFonts    = getAllFonts();
      const total       = allFonts.length;

      if (!text) return reply(`❌ Provide a font number (${FONT_LIST.length + 1}-${total}). Only custom fonts can be removed.`);
      const num = parseInt(text.trim(), 10);

      if (isNaN(num) || num <= FONT_LIST.length || num > total) {
        return reply(`❌ You can only remove custom fonts (numbers ${FONT_LIST.length + 1}–${total}).`);
      }

      // Find and delete the matching custom font
      const customArr = Object.entries(data.customFonts).sort((a, b) => a[1].index - b[1].index);
      const customPos = num - FONT_LIST.length - 1; // 0-based index in custom list
      if (customPos < 0 || customPos >= customArr.length) return reply("❌ Font not found.");

      const [keyToDelete, fontData] = customArr[customPos];
      delete data.customFonts[keyToDelete];

      // Re-index remaining custom fonts
      Object.entries(data.customFonts)
        .sort((a, b) => a[1].index - b[1].index)
        .forEach(([k, v], i) => { data.customFonts[k].index = FONT_LIST.length + i + 1; });

      // Reset fontIndex if it pointed to deleted font
      if (data.fontIndex === num) data.fontIndex = 1;

      saveMenu(data);
      return reply(`🗑️ Custom font #${padNum(num)} *${fontData.name}* removed successfully.`);
    }
  },

  // ================= SET FONT =================
  {
    command: ["setfont"],
    description: "Set menu font: .setfont <N>",
    category: "Settings",
    execute: async (m, { text, reply }) => {
      const data     = loadMenu();
      const allFonts = getAllFonts();
      const total    = allFonts.length;
      if (!text) return reply(`❌ Provide a font number (1-${total}). Use .font to see all.`);
      const num = parseInt(text.trim(), 10);
      if (isNaN(num) || num < 1 || num > total)
        return reply(`❌ Invalid. Choose between 1 and ${total}.`);
      data.fontIndex = num;
      saveMenu(data);
      return reply(`✅ Font set to #${padNum(num)} ${allFonts[num - 1].name}\n📝 Preview: ${allFonts[num - 1].sample}`);
    }
  },

  // ================= RESET FONT =================
  {
    command: ["delfont"],
    description: "Reset font to #01",
    category: "Settings",
    execute: async (m, { reply }) => {
      const data     = loadMenu();
      data.fontIndex = 1;
      saveMenu(data);
      return reply(`✅ Font reset to #01 Small Caps\n📝 Preview: ${FONT_LIST[0].sample}`);
    }
  },

  // ================= SET MENU IMAGE =================
  {
    command: ["setmenuimg"],
    description: "Set menu image via URL",
    category: "Settings",
    execute: async (m, { text, reply }) => {
      const imageUrl = (text || "").trim();
      if (!imageUrl)                    return reply("❌ Send an image URL\nExample: .setmenuimg https://example.com/image.jpg");
      if (!imageUrl.startsWith("http")) return reply("❌ Only a valid http/https URL is allowed.");
      const data     = loadMenu();
      data.menuImage = imageUrl;
      saveMenu(data);
      return reply(`✅ Menu image saved:\n${imageUrl}`);
    }
  },

  // ================= DELETE MENU IMAGE =================
  {
    command: ["delmenuimg"],
    description: "Remove menu image",
    category: "Settings",
    execute: async (m, { reply }) => {
      const data     = loadMenu();
      data.menuImage = null;
      saveMenu(data);
      return reply("🗑️ Menu image removed. Switched back to text layout.");
    }
  }
];
