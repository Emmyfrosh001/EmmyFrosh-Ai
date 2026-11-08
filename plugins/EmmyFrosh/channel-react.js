// plugins/EmmyFrosh/chreact.js
// EMMYFROSH-AI — React to a WhatsApp channel post (Adeel API)

const axios = require('axios');

const API_URL = process.env.CHREACT_API_URL || 'https://adeel-api-f6e4b06d1510.herokuapp.com/api/chreact';
const DEFAULT_EMOJIS = ['❤️', '👍', '🔥'];
const MAX_EMOJIS = 10;

const USAGE = (prefix) => `🎯 *ᴄʜʀᴇᴀᴄᴛ ᴜꜱᴀɢᴇ*

▸ ${prefix}ᴄʜʀᴇᴀᴄᴛ <ᴜʀʟ> [ᴇᴍᴏᴊɪꜱ]

📌 *ᴇxᴀᴍᴘʟᴇꜱ:*

▸ ${prefix}ᴄʜʀᴇᴀᴄᴛ <ᴜʀʟ> ❤️,🔥
▸ ${prefix}ᴄʜʀᴇᴀᴄᴛ <ᴜʀʟ>`;

// lowercase letters -> small caps (digits/emojis untouched)
const SC = { a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ' };
const smallCaps = (str) => String(str).toLowerCase().replace(/[a-z]/g, (c) => SC[c]);

// string or object -> readable text
const txt = (v) => (v === undefined || v === null || v === '') ? undefined : (typeof v === 'string' ? v : JSON.stringify(v).slice(0, 300));

const isValidChannelPostUrl = (url) =>
    /^https?:\/\/(?:www\.)?whatsapp\.com\/channel\/[a-zA-Z0-9]+\/\d+$/.test(url);

const extractIds = (url) => {
    const match = url.match(/\/channel\/([a-zA-Z0-9]+)\/(\d+)/);
    return match ? { channelId: match[1], postId: match[2] } : null;
};

// "❤️,🔥, 😂" -> single emojis; { error: true } if emojis are stuck together
const parseEmojis = (input) => {
    const seg = new Intl.Segmenter();
    const emojis = [];
    for (const part of input.split(',').map((p) => p.trim()).filter(Boolean)) {
        if (!/\p{Extended_Pictographic}/u.test(part)) continue;
        if ([...seg.segment(part)].length > 1) return { error: true };
        emojis.push(part);
    }
    return { emojis };
};

module.exports = [
    {
        command: ["chreact"],
        alias: ["channelreact"],
        description: "React to a WhatsApp channel post with custom emojis",
        category: "group",
        use: "<channel_post_url> [emojis]",
        filename: __filename,

        execute: async (m, { ednut, reply, args = [], prefix: pfx }) => {
            const prefix = Array.isArray(pfx) ? (pfx.find(Boolean) || '.') : (pfx || '.');
            const react = (text) => ednut.sendMessage(m.chat, { react: { text, key: m.key } }).catch(() => {});

            try {
                if (!args[0]) return reply(USAGE(prefix));

                const url = args[0];
                if (!isValidChannelPostUrl(url)) return reply(USAGE(prefix));
                const ids = extractIds(url);

                // everything after the link = emojis (comma separated)
                let emojis = [];
                if (args.length > 1) {
                    const parsed = parseEmojis(args.slice(1).join(','));
                    if (parsed.error || !parsed.emojis.length) return reply(USAGE(prefix));
                    emojis = parsed.emojis.slice(0, MAX_EMOJIS);
                }
                if (!emojis.length) emojis = [...DEFAULT_EMOJIS];

                await react('⏳');

                // response: { status: true, result: { url, emojis, servers_used, message } }
                const emojiStr = emojis.join(',');
                const { data } = await axios.get(API_URL, {
                    params: { url, emojis: emojiStr, emoji: emojiStr },
                    timeout: 60000
                });

                const r = data?.result || {};
                if (!data?.status) {
                    await react('❌');
                    return reply(`❌ *Reaction failed!*\n\n${txt(r.message || data?.message || data?.error) || 'Unknown error'}`);
                }

                const shownEmojis = (r.emojis ? String(r.emojis).split(',') : emojis).join(' ');
                await Promise.all([react(''), reply(`╭━━━〘 *ᴇᴍᴍʏꜰʀᴏꜱʜ-ᴀɪ* 〙━━━━❒
┃▸  *ꜱᴜᴄᴄᴇꜱꜱ!* ʀᴇᴀᴄᴛɪᴏɴ ꜱᴇɴᴛ
┃▸ 🎯 *ᴄʜᴀɴɴᴇʟ:* ${smallCaps(ids.channelId)}
┃▸ 📝 *ᴘᴏꜱᴛ:* ${ids.postId}
┃▸ 😊*ʀᴇᴀᴄᴛɪᴏɴ:* ${shownEmojis}
┃▸ 🖥️ *ꜱᴇʀᴠᴇʀꜱ ᴜꜱᴇᴅ:* ${r.servers_used ?? '-'}
╰───────────╯
> *𝛯⁠𝛭⁠𝛭⁠𝑌⁠𝐹⁠𝑅⁠𝛩⁠𝑆⁠𝛨⁠ ⁠⁩💔*`)]);
            } catch (error) {
                const status = error.response?.status;
                const apiMsg = txt(error.response?.data?.result?.message || error.response?.data?.message || error.response?.data?.error);
                console.error('[CHREACT] Error:', status || '', apiMsg || error.message);
                await react('❌');
                await reply(`❌ *Error processing request!*\n\n*Error:* ${apiMsg || error.message}${status ? ` (HTTP ${status})` : ''}`);
            }
        }
    }
];