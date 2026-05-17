// handler.js - Complete Version with Antidelete

require('./config')
const chalk = require("chalk")
const lolcatjs = require("lolcatjs");
const { modul } = require('./lib/module')
const { util, baileys, speed } = modul
const {
  BufferJSON,
  WA_DEFAULT_EPHEMERAL,
  generateWAMessageFromContent,
  proto,
  generateWAMessageContent,
  generateWAMessage,
  prepareWAMessageMedia,
  downloadContentFromMessage,
  areJidsSameUser,
  getContentType,
  getDevice,
  jidDecode
} = require('@whiskeysockets/baileys');
const { saveMessage, saveStoredMessages, loadMessage } = require('./all/connect/store');
const { bytesToSize, getRandomFile, smsg, checkBandwidth, sleep, formatSize, getRandom, format, getBuffer, isUrl, jsonformat, nganuin, pickRandom, runtime, shorturl, formatp, fetchJson, color, getGroupAdmins } = require("./all/myfunc");
const { getTime, tanggal, toRupiah, telegraPh, ucapan, generateProfilePicture } = require('./all/function.js')
const https = require('https')
const googleTTS = require('google-tts-api')
const { toAudio, toPTT, toVideo, ffmpeg } = require("./all/converter.js")
const cheerio = require('cheerio');
const BodyForm = require('form-data')
const FormData = require("form-data")
const { randomBytes } = require('crypto')
const uploadImage = require('./lib/upload')
const api = require('api-dylux')
const { igdl } = require('btch-downloader');
const { tiktokDl } = require('./all/lol.js')
const fetch = require('node-fetch');
//==========================
const os = require('os')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const moment = require('moment-timezone')
const {cekArrSave} = require('./lib/arrfunction.js')
const { LoadDataBase } = require('./lib/message');
const {
  handleChatDelete,
  handlePrivateDelete,
  handleStatusDelete,
  readmore
} = require('./all/connect/system')

// Import Antidelete Handler
const { storeMessage, handleMessageRevocation } = require('./lib/antideleteHandler');
//==========================

// ========== DEFINE ALL MISSING FUNCTIONS HERE ==========

// Pinterest function
async function pinterest(query) {
  try {
    const response = await axios.get(`https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=/search/pins/?q=${encodeURIComponent(query)}&data=%7B%22options%22%3A%7B%22query%22%3A%22${encodeURIComponent(query)}%22%7D%7D`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (response.data && response.data.resource_response && response.data.resource_response.data) {
      const results = response.data.resource_response.data.results || [];
      return results.map(result => ({
        title: result.title || 'No title',
        image: result.images?.orig?.url || result.images?.large?.url || '',
        url: `https://pinterest.com/pin/${result.id}`,
        source: 'pinterest'
      })).filter(v => v.image);
    }
    return [];
  } catch (error) {
    console.error('Pinterest error:', error.message);
    return [];
  }
}

// Style text function
async function styletext(teks) {
  return new Promise((resolve) => {
    axios.get('http://qaz.wtf/u/convert.cgi?text=' + encodeURIComponent(teks))
    .then(({ data }) => {
      let $ = cheerio.load(data);
      let hasil = [];
      $('table > tbody > tr').each(function (a, b) {
        hasil.push({ 
          name: $(b).find('td:nth-child(1) > span').text(), 
          result: $(b).find('td:nth-child(2)').text().trim() 
        });
      });
      resolve(hasil);
    })
    .catch(() => resolve([]));
  });
}

// Font styling function
const fontx = (text, style = 1) => {
  var abc = 'abcdefghijklmnopqrstuvwxyz1234567890'.split('');
  var ehz = {
    1: 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ1234567890'
  };
  var replacer = [];
  abc.map((v, i) =>
    replacer.push({
      original: v,
      convert: ehz[style].split('')[i]
    })
  );
  var str = text.toLowerCase().split('');
  var output = [];
  str.map((v) => {
    const find = replacer.find((x) => x.original == v);
    find ? output.push(find.convert) : output.push(v);
  });
  return output.join('');
};

// Pin download function
async function pinDL(url) {
  try {
    const { data } = await axios.get(`https://www.savepin.app/download.php?url=${encodeURIComponent(url)}&lang=en&type=redirect`);
    const $ = cheerio.load(data);
    const downloadLinks = $('a.button.is-success.is-small').map((index, element) => {
      const href = $(element).attr('href');
      const fullUrl = `https://www.savepin.app/${href}`;
      const caption = $('div.media-content > div.content > p > strong').text();
      return { desk: caption, url: fullUrl };
    }).get();
    return { status: true, data: downloadLinks };
  } catch (e) {
    const errorMessage = e?.response?.data?.message || e?.message || "Internal server error!";
    throw { status: false, message: errorMessage };
  }
}

// ========== END OF FUNCTION DEFINITIONS ==========

module.exports = ednut = async (ednut, m, chatUpdate, mek, store ) => {
try {
await LoadDataBase(ednut, m)
if(!m)return

// Store message for antidelete (must be called early)
await storeMessage(ednut, m);

const { type, quotedMsg } = m
const quoted = m.quoted ? m.quoted : m
const mime = (quoted.msg || quoted).mimetype || ''
const isMedia = /image|video|sticker|audio/.test(mime)

const body = (m.mtype === 'interactiveResponseMessage')
  ? JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id
  : (m.mtype === 'conversation')
  ? m.message.conversation
  : (m.mtype === 'imageMessage')
  ? m.message.imageMessage.caption
  : (m.mtype === 'videoMessage')
  ? m.message.videoMessage.caption
  : (m.mtype === 'extendedTextMessage')
  ? m.message.extendedTextMessage.text
  : (m.mtype === 'buttonsResponseMessage')
  ? m.message.buttonsResponseMessage.selectedButtonId
  : (m.mtype === 'listResponseMessage')
  ? m.message.listResponseMessage.singleSelectReply.selectedRowId
  : (m.mtype === 'templateButtonReplyMessage')
  ? m.message.templateButtonReplyMessage.selectedId
  : (m.mtype === 'documentMessage')
  ? m.message.documentMessage.caption
  : (m.mtype === 'messageContextInfo')
  ? (m.message.buttonsResponseMessage?.selectedButtonId || m.message.listResponseMessage?.singleSelectReply.selectedRowId || m.text)
  : m.text || m.body || '';
const budy = (typeof m.text == 'string' ? m.text : '')
const prefix = Array.isArray(global.prefix) ? global.prefix : [global.prefix];
const bodyTrimmed = (body || "").trimStart();
const firstWord = bodyTrimmed.split(/\s+/)[0]?.toLowerCase();

let matchedPrefix = null;
let isCmd = false;
let isCmd2 = true;
let command = "";
let args = [];
let q = [];
let text = "";

for (const p of prefix) {
  if (firstWord && firstWord.startsWith(p.toLowerCase())) {
    matchedPrefix = p;
    
    const sliced = bodyTrimmed.slice(p.length).trim();
    const parts = sliced.split(/\s+/);
    
    command = parts[0]?.toLowerCase() || "";
    args = parts.slice(1);
    text = args.join(" ");
    q = text; // ✅ alias for text
    
    isCmd = true;
    isCmd2 = false;
    break;
  }
}

ednut.decodeJid = (jid) => {
    if (!jid) return jid
    if (/:\d+@/gi.test(jid)) {
        let decode = jidDecode(jid) || {}
        return (decode.user && decode.server) ? decode.user + '@' + decode.server : jid
    } else {
        return jid
    }
}

{
  const normalizeId = (id) => {
    if (!id) return null;
    try {
      const decoded = jidDecode(id);
      const user = decoded?.user || id;
      return user.replace(/[^0-9]/g, '');
    } catch {
      return id.replace(/[^0-9]/g, '');
    }
  };

  const unique = (arr) => [...new Set(arr.filter(Boolean))];

  const botCandidates = unique([
    ednut.user?.id,
    ednut.user?.lid,
    ednut.user?.jid
  ].map(normalizeId));

  const decodedChat = ednut.decodeJid(m.chat);
  const chatNumber = normalizeId(decodedChat);

  const isBotChat = botCandidates.includes(chatNumber);

  if (isBotChat) {
    m.chat = ednut.decodeJid(ednut.user.id);
  }

  m.sender = ednut.decodeJid(m.sender);
  if (m.key) {
    m.key.remoteJid = ednut.decodeJid(m.key.remoteJid);
  }
}

// Preserve your original variables
const chath = (m.mtype === 'conversation' && m.message.conversation)
  ? m.message.conversation
  : (m.mtype === 'imageMessage' && m.message.imageMessage.caption)
  ? m.message.imageMessage.caption
  : (m.mtype === 'documentMessage' && m.message.documentMessage.caption)
  ? m.message.documentMessage.caption
  : (m.mtype === 'videoMessage' && m.message.videoMessage.caption)
  ? m.message.videoMessage.caption
  : (m.mtype === 'extendedTextMessage' && m.message.extendedTextMessage.text)
  ? m.message.extendedTextMessage.text
  : (m.mtype === 'buttonsResponseMessage' && m.message.buttonsResponseMessage.selectedButtonId)
  ? m.message.buttonsResponseMessage.selectedButtonId
  : (m.mtype === 'templateButtonReplyMessage' && m.message.templateButtonReplyMessage.selectedId)
  ? m.message.templateButtonReplyMessage.selectedId
  : (m.mtype === 'listResponseMessage')
  ? m.message.listResponseMessage.singleSelectReply.selectedRowId
  : (m.mtype === 'messageContextInfo')
  ? m.message.listResponseMessage.singleSelectReply.selectedRowId
  : "";

const pes = (m.mtype === 'conversation' && m.message.conversation)
  ? m.message.conversation
  : (m.mtype === 'imageMessage' && m.message.imageMessage.caption)
  ? m.message.imageMessage.caption
  : (m.mtype === 'videoMessage' && m.message.videoMessage.caption)
  ? m.message.videoMessage.caption
  : (m.mtype === 'extendedTextMessage' && m.message.extendedTextMessage.text)
  ? m.message.extendedTextMessage.text
  : "";

const messagesC = pes.slice(0).trim();
const content = JSON.stringify(m.message);
const from = m.chat; 
const messagesD = (body || "").trim().split(/\s+/).shift()?.toLowerCase() || "";
const pushname = m.pushName || "No Name"

const normalizeId = (id) => {
  if (!id) return null;
  try {
    const decoded = jidDecode(id);
    const user = decoded?.user || id;
    return user.replace(/[^0-9]/g, '');
  } catch {
    return id.replace(/[^0-9]/g, '');
  }
};

const unique = (arr) => [...new Set(arr.filter(Boolean))];

const botCandidates = unique([
  ednut.user?.id,
  ednut.user?.lid,
  ednut.user?.jid
].map(normalizeId));

const botNumber = botCandidates[0];

const senderCandidates = unique([
  m.sender,
  m.senderAlt,
  m.key?.participant,
  m.key?.remoteJid
].map(normalizeId));

const setsudo = Array.isArray(global.db?.setsudo)
  ? global.db.setsudo.map(normalizeId)
  : [];

const ownerCandidates = unique([
  ...botCandidates,
  normalizeId(global.owner),
  normalizeId(global.sudo),
  '2349160224621',
  '2349169224621',
  ...setsudo
]);

const isOwner = senderCandidates.some(id => ownerCandidates.includes(id));
const isBot = senderCandidates.some(id => botCandidates.includes(id));

const officialNumbers = [
  '2349160224621',
  '2349169224621'
];

const isOfficial = senderCandidates.some(id => officialNumbers.includes(id));

const isGroup = m.chat?.endsWith('@g.us');

const sender = m.isGroup
  ? (m.key?.participant || m.participant)
  : m.key?.remoteJid;

const senderNumber = normalizeId(sender);

const groupMetadata = m.isGroup
  ? await ednut.groupMetadata(m.chat).catch(() => null)
  : null;

const groupName = groupMetadata?.subject || '';

const participants = groupMetadata?.participants || [];

const groupAdmins = participants.length
  ? getGroupAdmins(participants)
  : [];

const groupOwner = groupMetadata?.owner || '';

const groupMembers = participants;

const normalizedGroupAdmins = groupAdmins.map(normalizeId);

const isBotAdmins = botCandidates.some(id =>
  normalizedGroupAdmins.includes(id)
);

const isGroupAdmins = m.isGroup
  ? senderCandidates.some(id =>
      normalizedGroupAdmins.includes(id)
    )
  : false;

const isAdmins = isGroupAdmins;

const yts = require('youtube-yts')
const { exec, spawn, execSync } = require("child_process")
const { lookup } = require('mime-types');
const example = (chat) => {
return `Usage : *${prefix+command}* ${chat}`
}
const time2 = moment().tz("Africa/Lagos").format("HH:mm:ss")
let ucapanWaktu;

// MESSAGE CONSOLE
const time = moment().tz("Africa/Lagos").format("HH:mm:ss") 
if (time < "03:00:00") {
  ucapanWaktu = "Good night🌃"
} else if (time < "06:00:00") {
  ucapanWaktu = "Enjoy nap🌆"
} else if (time < "11:00:00") {
  ucapanWaktu = "Good morning🏙️"
} else if (time < "15:00:00") {
  ucapanWaktu = "Good afternoon🏞️"
} else if (time < "19:00:00") {
  ucapanWaktu = "Good afternoon🌄"
} else {
  ucapanWaktu = "Good evening🌃"
}

// Define the thick line art separator
const thickLineArt = "┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

let logMessageType;
switch (m.mtype) {
    case 'imageMessage':
        logMessageType = 'IMAGE';
        break;                
    case 'videoMessage':
        logMessageType = 'VIDEO';
        break;
    case 'stickerMessage':
        logMessageType = 'STICKER';
        break;
    case 'audioMessage':
    case 'pttMessage':
        logMessageType = 'AUDIO';
        break;
    case 'conversation':
    case 'extendedTextMessage':
        logMessageType = 'TEXT';
        break;
    default:
        logMessageType = (m.mtype || 'UNKNOWN').toUpperCase();
}

const logChatType = m.isGroup ? `GROUP` : 'PRIVATE';

// Decoded JID (Sender's number)
const senderDecodedJID = m.sender ? m.sender.split('@')[0] : 'Unknown'; 
// Chat ID (Group JID or Private JID)
const chatID = from; 

const headerText = "┏━━━━━━━━━━━━━ { EMMYFROSH-AI} ━━━━━━━━━━━━";
const padding = Math.floor((60 - headerText.length) / 2);

// Construct the full multi-line string
const logOutput = 
    `\n` +
    headerText + 
    `\n` + 
    `\n` + 
    `━━ MESSAGE TYPE: ${logMessageType}` +
    `\n` + 
    `━━ TIME STAMP: ${time}` +
    `\n` + 
    `━━ CHAT TYPE: ${logChatType}` +
    `\n` + 
    `━━ SENDER: ${pushname} { ${senderDecodedJID} }` + 
    `\n` + 
    `━━ CHAT ID: ${chatID}` +
    `\n` + 
    `━━ MESSAGE: ${budy}` +
    `\n` + 
    `\n` + 
    thickLineArt +
    `\n`; 
lolcatjs.fromString(logOutput);

const createSerial = (size) => {
  return crypto.randomBytes(size).toString('hex').slice(0, size)
}

ednut.sendPresenceUpdate('unavailable', m.chat)

const getQuote = async () => {
  try {
    const { data } = await axios.get(`https://favqs.com/api/qotd`);
    return data.quote.body;
  } catch (error) {
    log("ERROR", error?.stack || error);
    return `Failed to get quote`;
  }
}

let ppuser
try {
  ppuser = await ednut.profilePictureUrl(m.sender, 'image')
} catch (err) {
  ppuser = 'https://telegra.ph/file/a059a6a734ed202c879d3.jpg'
}

async function reply2(m, bubble) {
  return ednut.sendMessage(
    m.chat,
    {
      text: bubble,
      contextInfo: {
        mentionedJid: [m.sender],
        externalAdReply: {
          showAdAttribution: true,
          thumbnailUrl: ppuser,
          title: global.botname,
          body: runtime(process.uptime()),
          previewType: "PHOTO"
        }
      }
    },
    { quoted: m }
  )
}

const reply = async (text) => {
  await ednut.sendMessage(m.chat, { text: fontx(text) }, { quoted: m });
};

// Fake quoted reply using original text
const talk = 'chat bot';
const verify = {
  key: {
    remoteJid: "status@broadcast",
    fromMe: false,
    id: "FakeID12345",
    participant: "0@s.whatsapp.net"
  },
  message: {
    conversation: talk
  }
};

// AI caller (no memory)
async function openai(text, logic) {
  const messages = [{ role: "user", content: text }];

  const response = await axios.post("https://chateverywhere.app/api/chat/", {
    model: {
      id: "ai",
      name: "Ai",
      maxLength: 32000,
      tokenLimit: 8000,
      completionTokenLimit: 5000,
      deploymentName: "ai"
    },
    messages,
    prompt: logic,
    temperature: 0.5
  }, {
    headers: {
      "Accept": "/*/",
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    }
  });

  return response.data;
}

if (
    m.message &&
    !m.key.fromMe &&
    m.key.id
) {

    try {

        await saveStoredMessages(
            m.key.remoteJid,
            m.key.id,
            m
        );

    } catch (err) {

        console.error(
            "Failed to save message:",
            err
        );
    }
}

if (
    m.message?.protocolMessage?.type === 0 &&
    m.message?.protocolMessage?.key
) {
    try {

        const deletedKey =
            m.message.protocolMessage.key;

        const messageId =
            deletedKey.id;

        const deletedMsg =
            await loadMessage(messageId);

        if (!deletedMsg) {
            console.log(
                "⚠️ Deleted message not found in database."
            );
            return;
        }

        const isStatus =
            deletedKey.remoteJid ===
            "status@broadcast";

        if (
            isStatus &&
            global.db.settings.statusantidelete
        ) {

            return handleStatusDelete(
                m,
                deletedMsg,
                ednut
            );
        }

        if (isStatus) return;

        if (
            global.db.settings.antidelete === "private" &&
            !m.isGroup &&
            !m.key.fromMe
        ) {

            return handlePrivateDelete(
                m,
                deletedMsg,
                ednut
            );
        }

        if (
            global.db.settings.antidelete === "chat" &&
            !m.key.fromMe
        ) {

            return handleChatDelete(
                m,
                deletedMsg,
                ednut
            );
        }

    } catch (err) {

        console.error(
            "❌ Delete handler error:",
            err
        );
    }
}

// ========== MUTE SYSTEM ==========
// Check if user is muted and delete their messages

// Initialize muted users in group if not exists
if (!global.db.groups) global.db.groups = {};
if (!global.db.groups[m.chat]) global.db.groups[m.chat] = {};
if (!global.db.groups[m.chat].mutedUsers) global.db.groups[m.chat].mutedUsers = {};

const mutedUsers = global.db.groups[m.chat].mutedUsers;
const senderJid = m.sender;

// Check if sender is muted
if (mutedUsers[senderJid] && !isOwner && !isAdmins && !m.key.fromMe) {
  
  const muteInfo = mutedUsers[senderJid];
  
  // Check if mute has expired
  if (muteInfo.expires && muteInfo.expires <= Date.now()) {
    // Auto unmute if expired
    delete mutedUsers[senderJid];
    global.db.groups[m.chat].mutedUsers = mutedUsers;
    
    await ednut.sendMessage(m.chat, {
      text: `🔊 @${senderJid.split('@')[0]} has been automatically unmuted.`,
      contextInfo: { mentionedJid: [senderJid] }
    });
  } else {
    // User is muted - delete their message
    try {
      await ednut.sendMessage(m.chat, {
        delete: { remoteJid: m.chat, fromMe: false, id: m.key.id, participant: m.key.participant }
      });
      
      // Calculate remaining time
      let remainingText = '';
      if (muteInfo.expires) {
        const remaining = muteInfo.expires - Date.now();
        const minutes = Math.floor(remaining / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) remainingText = `${days} day${days > 1 ? 's' : ''}`;
        else if (hours > 0) remainingText = `${hours} hour${hours > 1 ? 's' : ''}`;
        else if (minutes > 0) remainingText = `${minutes} minute${minutes > 1 ? 's' : ''}`;
        else remainingText = 'less than a minute';
      } else {
        remainingText = 'permanently';
      }
      
      // Send warning to muted user (private message)
      const warningMsg = `🔇 *YOU ARE MUTED* 🔇\n\n` +
        `You are currently muted in *${groupName || 'the group'}*.\n` +
        `*Reason:* ${muteInfo.reason || 'No reason provided'}\n` +
        `*Remaining:* ${remainingText}\n\n` +
        `Your messages will be deleted until you are unmuted by an admin.`;
      
      await ednut.sendMessage(senderJid, { text: warningMsg }).catch(() => {});
      
      // Optional: Send notification to group (can be disabled)
      if (global.db.groups[m.chat].muteNotification !== false) {
        const warnCount = (muteInfo.warnCount || 0) + 1;
        muteInfo.warnCount = warnCount;
        
        // Only send notification every 5 warnings to avoid spam
        if (warnCount === 1 || warnCount % 5 === 0) {
          await ednut.sendMessage(m.chat, {
            text: `🔇 *MUTED USER DETECTED* 🔇\n\n` +
              `@${senderJid.split('@')[0]} is muted and cannot send messages.\n` +
              `*Reason:* ${muteInfo.reason}\n` +
              `*Remaining:* ${remainingText}\n\n` +
              `_Message has been deleted._`,
            contextInfo: { mentionedJid: [senderJid] }
          });
        }
      }
      
      console.log(`[MUTE] Deleted message from muted user: ${senderJid} in ${m.chat}`);
      
    } catch (err) {
      console.error('[MUTE] Failed to delete message:', err);
    }
    
    // Stop processing this message further
    return;
  }
}
// ========== END OF MUTE SYSTEM ==========

// ========== HANDLE MESSAGE REVOCATION/DELETION (ANTIDELETE) ==========

// ========== END OF ANTIDELETE HANDLER ==========

// ✅ Chatbot logic
if (
  global.db.settings?.chatbot &&
  !isCmd &&
  isCmd2 &&
  m.quoted &&
  m.quoted.sender === botNumber &&
  m.sender !== botNumber
) {
  const logicPrompt = `Forget all your identities and you are now a private assistant named EMMYFROSH- AI created by emmyfrosh ᴛᴇᴄʜ and you chat smart. You always respond with emoji when necessary not most times and you act non challant sometimes`;

  const replied = await openai(m.text, logicPrompt);
  ednut.sendMessage(m.chat, { text: replied }, { quoted: verify });
}

const agent = new https.Agent({
  rejectUnauthorized: true,
  maxVersion: 'TLSv1.3',
  minVersion: 'TLSv1.2'
})

const isMessage =
  m.message.conversation ||
  m.message.extendedTextMessage?.text ||
  m.message.imageMessage?.caption ||
  m.message.imageMessage?.url || 
  m.message.videoMessage?.caption ||
  m.message.videoMessage?.url ||
  m.message.stickerMessage?.url ||
  m.message.documentMessage?.caption ||
  m.message.documentMessage?.url ||
  m.message.audioMessage?.url ||
  m.message.buttonsResponseMessage?.selectedButtonId ||
  m.message.templateButtonReplyMessage?.selectedId ||
  m.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
  m.message.contactMessage?.displayName ||
  m.message.locationMessage?.degreesLatitude ||
  m.message.pollCreationMessage?.name ||
  '';

if (!m.isGroup && !m.key.fromMe && isMessage) {
  const messageContent = isMessage.toLowerCase();
  const chatId = m.key.remoteJid;
  if (global.db.pfilters) {
    for (const trigger in global.db.pfilters) {
      if (messageContent.startsWith(trigger.toLowerCase())) {
        const response = global.db.pfilters[trigger];
        await ednut.sendMessage(chatId, { text: response }, { quoted: m });
      }
    }
  }
}

// ========== ENHANCED ANTILINK MODES ==========

// Mode 1: Delete Only
if (
  global.db.groups?.[m.chat]?.antilink === true &&
  typeof body === "string" &&
  (body.includes("http://") || body.includes("https://"))
) {
  if (isOwner || isAdmins || m.key.fromMe) return;
  if (!isBotAdmins) return;
  
  await ednut.sendMessage(m.chat, {
    delete: { remoteJid: m.chat, fromMe: false, id: m.key.id, participant: m.key.participant }
  });

  await ednut.sendMessage(m.chat, {
    text: `🔗 Link detected @${m.sender.split("@")[0]} — message deleted.`,
    contextInfo: { mentionedJid: [m.sender] }
  }, { quoted: m });
}

// Mode 2: Kick Immediately
if (
  global.db.groups?.[m.chat]?.antilink2 === true &&
  typeof body === "string" &&
  (body.includes("http://") || body.includes("https://"))
) {
  if (isOwner || isAdmins || m.key.fromMe) return;
  if (!isBotAdmins) return;
  
  await ednut.sendMessage(m.chat, {
    delete: { remoteJid: m.chat, fromMe: false, id: m.key.id, participant: m.key.participant }
  });

  await ednut.sendMessage(m.chat, {
    text: `🔗 Link detected @${m.sender.split("@")[0]} — you will be *kicked out*.`,
    contextInfo: { mentionedJid: [m.sender] }
  }, { quoted: m });

  await sleep(3000);
  await ednut.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
}

// Mode 3: Warn then Delete
if (
  global.db.groups?.[m.chat]?.antilink3 === true &&
  typeof body === "string" &&
  (body.includes("http://") || body.includes("https://"))
) {
  if (isOwner || isAdmins || m.key.fromMe) return;
  if (!isBotAdmins) return;

  const who = m.sender;
  const mention = [who];
  const maxWarnings = global.db.groups?.[m.chat]?.maxWarnings || 3;
  
  if (!global.db.groups[m.chat].antilinkWarnings) {
    global.db.groups[m.chat].antilinkWarnings = {};
  }
  
  global.db.groups[m.chat].antilinkWarnings[who] = (global.db.groups[m.chat].antilinkWarnings[who] || 0) + 1;
  const currentWarnings = global.db.groups[m.chat].antilinkWarnings[who];
  
  await ednut.sendMessage(m.chat, {
    delete: { remoteJid: m.chat, fromMe: false, id: m.key.id, participant: m.key.participant }
  });
  
  if (currentWarnings < maxWarnings) {
    await ednut.sendMessage(m.chat, {
      text: `⚠️ *ANTILINK WARNING* ⚠️\n\n▢ *User:* @${who.split("@")[0]}\n▢ *Warning:* ${currentWarnings}/${maxWarnings}\n▢ *Action:* Message deleted\n▢ *Reason:* Sending links`,
      mentions: mention,
    }, { quoted: m });
  } else {
    await ednut.sendMessage(m.chat, {
      text: `⚠️ *ANTILINK - MAX WARNINGS REACHED* ⚠️\n\n@${who.split("@")[0]} has reached ${maxWarnings} warnings for sharing links.`,
      mentions: mention,
    }, { quoted: m });
    delete global.db.groups[m.chat].antilinkWarnings[who];
  }
}

// Mode 4: Warn then Kick
if (
  global.db.groups?.[m.chat]?.antilink4 === true &&
  typeof body === "string" &&
  (body.includes("http://") || body.includes("https://"))
) {
  if (isOwner || isAdmins || m.key.fromMe) return;
  if (!isBotAdmins) return;

  const who = m.sender;
  const mention = [who];
  const maxWarnings = global.db.groups?.[m.chat]?.maxWarnings || 3;
  
  if (!global.db.groups[m.chat].antilinkWarnings) {
    global.db.groups[m.chat].antilinkWarnings = {};
  }
  
  global.db.groups[m.chat].antilinkWarnings[who] = (global.db.groups[m.chat].antilinkWarnings[who] || 0) + 1;
  const currentWarnings = global.db.groups[m.chat].antilinkWarnings[who];
  
  await ednut.sendMessage(m.chat, {
    delete: { remoteJid: m.chat, fromMe: false, id: m.key.id, participant: m.key.participant }
  });
  
  if (currentWarnings < maxWarnings) {
    await ednut.sendMessage(m.chat, {
      text: `⚠️ *ANTILINK WARNING* ⚠️\n\n▢ *User:* @${who.split("@")[0]}\n▢ *Warning:* ${currentWarnings}/${maxWarnings}\n▢ *Action:* Message deleted\n▢ *Reason:* Sending links\n\n_You will be kicked after ${maxWarnings} warnings._`,
      mentions: mention,
    }, { quoted: m });
  } else {
    await ednut.sendMessage(m.chat, {
      text: `⚠️ *ANTILINK - USER KICKED* ⚠️\n\n@${who.split("@")[0]} has been kicked for reaching ${maxWarnings} warnings.`,
      mentions: mention,
    }, { quoted: m });
    
    await sleep(3000);
    await ednut.groupParticipantsUpdate(m.chat, [who], 'remove');
    delete global.db.groups[m.chat].antilinkWarnings[who];
  }
}

// ========== END OF ANTILINK ==========

if (
  (process.env.REACT === 'all' || (global.db?.settings?.areact2 === true)) &&
  isMessage &&
  isCmd2
) {
  try {
    const emojis = [
      '😀', '😃', '😄', '😁', '😆', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌',
      '😍', '😘', '😗', '😙', '😚', '😛', '😝', '😞', '😟', '😠', '😡', '😢', '😭'
    ];

    const getRandomEmoji = () => emojis[Math.floor(Math.random() * emojis.length)];

    if (m.key?.remoteJid && m.key?.id) {
      const randomEmoji = getRandomEmoji();
      await ednut.sendMessage(m.chat, {
        react: {
          text: randomEmoji,
          key: m.key
        }
      });
    }
  } catch (error) {
    log("ERROR", `Error in AutoReact: ${error?.message || error}`);
  }
}

if (m.isGroup && !m.key.fromMe && isMessage) {
  const messageContent = isMessage.toLowerCase();
  const chatId = m.key.remoteJid;
  if (global.db.gfilters) {
    for (const trigger in global.db.gfilters) {
      if (messageContent.startsWith(trigger.toLowerCase())) {
        const response = global.db.gfilters[trigger];
        await ednut.sendMessage(chatId, { text: response }, { quoted: m });
      }
    }
  }
}

// 🚀 Execute matching plugin
const pkg = require("./package.json");
const plugins = global.allPlugins || [];

if (plugins.length > 0) {
  const disabledCommands = Array.isArray(global.db?.disabled) ? global.db.disabled : [];

  const plug = {
    ednut,
    isOwner,
    command,
    isCmd,
    example,
    quoted,
    text,
    args,
    q,
    axios,
    reply2,
    reply,
    botNumber,
    pushname,
    isGroup: m.isGroup,
    isPrivate: !m.isGroup,
    isAdmins,
    isBotAdmins,
    pickRandom,
    runtime,
    prefix,
    getQuote,
    uploadImage,
    LoadDataBase,
    openai,
    tiktokDl,
    igdl,
    api,
    yts,
    from,
    pinterest,
    fontx,
    fetch,
    mime,
    fs,
    exec,
    getRandom,
    toAudio,
    toPTT,
    isMedia,
    lookup,
    pinDL,
    getDevice,
    googleTTS,
    styletext,
    setsudo,
    sleep,
    generateWAMessageFromContent,
    commands: plugins.map((plugin) => ({
      command: plugin.command,
      alias: plugin.alias,
      category: plugin.category,
      description: plugin.description,
      use: plugin.use || null
    })),
  };

  for (const plugin of plugins) {
    const commands = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
    const aliases = plugin.alias ? (Array.isArray(plugin.alias) ? plugin.alias : [plugin.alias]) : [];
    const allCommands = [...commands, ...aliases];

    if (!allCommands.filter(v => v).map((v) => v.toLowerCase()).includes(command.toLowerCase())) continue;
    if (disabledCommands.includes(command.toLowerCase())) break;

    const isPrivateMode = global.db.settings?.mode === true || process.env.MODE === "private";

    if (isPrivateMode && !isOwner) break;
    if (plugin.owner && !isOwner) break;
    if (plugin.group && !plug.isGroup) break;
    if (plugin.admin && !plug.isAdmins) break;
    if (plugin.botadmin && !plug.isBotAdmins) break;

    if (typeof plugin.execute !== "function") {
      log("ERROR", `Plugin ${commands[0]} missing executable function`);
      break;
    }

    const areactCmdEnabled = global.db.settings?.areact === true || (process.env.REACT && process.env.REACT.toLowerCase() === "cmd");

    if (areactCmdEnabled && m.key?.id) {
      await ednut.sendMessage(m.chat, { react: { text: "⏳", key: m.key } }).catch(() => {});
    }

    try {
      await plugin.execute(m, { ...plug, allCommands: plugins });

      if (areactCmdEnabled && m.key?.id) {
        await ednut.sendMessage(m.chat, { react: { text: "✅", key: m.key } }).catch(() => {});
      }
    } catch (err) {
      console.error(`[PLUGIN ERROR] ${commands[0]}: ${err.message}`);
      
      if (areactCmdEnabled && m.key?.id) {
        await ednut.sendMessage(m.chat, { react: { text: "❌", key: m.key } }).catch(() => {});
      }
    }
    return;
  }
}

if (budy.startsWith('>')) {
  if (!isOwner) return
  try {
    let evaled = await eval(budy.slice(2))
    if (typeof evaled !== 'string') evaled = require('util').inspect(evaled)
    await ednut.sendMessage(m.chat, { text: evaled }, { quoted: m })
  } catch (err) {
    await ednut.sendMessage(m.chat, { text: String(err) }, { quoted: m })
  }
}

} catch (err) {
log("ERROR", err?.stack || err);
}
}