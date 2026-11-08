/**
 * Author: Elijah (Emmyfrosh)
 * Mute Sticker + Emoji Command
 */

module.exports = [
{
    command: ['mute-sticker'],
    alias: ['mute-s'],
    category: 'group',
    description: 'to Mute a sticker or emoji',
    group: true,
    admin: true,
    botadmin: true,
    async execute(m, { text }) {
        if (!global.db.groups) global.db.groups = {};
        if (!global.db.groups[m.chat]) global.db.groups[m.chat] = {};
        if (!global.db.groups[m.chat].mutedStickers) {
            global.db.groups[m.chat].mutedStickers = {};
        }
        if (!global.db.groups[m.chat].mutedEmojis) {
            global.db.groups[m.chat].mutedEmojis = {};
        }

        const mutedStickers = global.db.groups[m.chat].mutedStickers;
        const mutedEmojis = global.db.groups[m.chat].mutedEmojis;

        const quoted =
            m.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
            m.quoted?.message || {};
        const stickerObj = quoted?.stickerMessage;

        // =========================
        // MUTE STICKER
        // =========================
        if (stickerObj) {
            const rawHash = stickerObj.fileSha256;
            if (!rawHash) {
                return m.reply(`❌ *ᴜɴᴀʙʟᴇ ᴛᴏ ʀᴇᴀᴅ ꜱᴛɪᴄᴋᴇʀ ɪᴅ*`);
            }
            const hash = Buffer.isBuffer(rawHash)
                ? rawHash.toString("hex")
                : Buffer.from(rawHash).toString("hex");

            if (mutedStickers[hash]) {
                return m.reply(`⚠️ *ꜱᴛɪᴄᴋᴇʀ ᴀʟʀᴇᴀᴅʏ ᴍᴜᴛᴇᴅ*`);
            }

            mutedStickers[hash] = true;
            return m.reply(`🔒 *ꜱᴛɪᴄᴋᴇʀ ᴍᴜᴛᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ*`);
        }

        // =========================
        // MUTE EMOJI
        // =========================
        const quotedText =
            m.quoted?.text ||
            quoted?.conversation ||
            quoted?.extendedTextMessage?.text;

        // Use either the text written next to the command or the replied text
        const targetText = text ? text.trim() : (quotedText ? quotedText.trim() : "");

        if (targetText) {
            if (mutedEmojis[targetText]) {
                return m.reply(`⚠️ *ᴇᴍᴏᴊɪ ᴀʟʀᴇᴀᴅʏ ᴍᴜᴛᴇᴅ*`);
            }

            mutedEmojis[targetText] = true;
            return m.reply(
`🔒 *ᴇᴍᴏᴊɪ ᴍᴜᴛᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ*

ᴇᴍᴏᴊɪ: ${targetText}`
            );
        }

        return m.reply(
`❌ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ꜱᴛɪᴄᴋᴇʀ/ᴇᴍᴏᴊɪ ᴏʀ ᴛʏᴘᴇ ᴛʜᴇ ᴇᴍᴏᴊɪ ᴀꜰᴛᴇʀ ᴛʜᴇ ᴄᴏᴍᴍᴀɴᴅ*`
        );
    }
},
{
    command: ['unmute-sticker'],
    alias: ['unmute-s' ],
    category: 'group',
    description: 'Unmute sticker or emoji',
    group: true,
    admin: true,
    botadmin: true,
    async execute(m, { text }) {
        if (!global.db.groups) global.db.groups = {};
        if (!global.db.groups[m.chat]) global.db.groups[m.chat] = {};
        if (!global.db.groups[m.chat].mutedStickers) {
            global.db.groups[m.chat].mutedStickers = {};
        }
        if (!global.db.groups[m.chat].mutedEmojis) {
            global.db.groups[m.chat].mutedEmojis = {};
        }

        // =========================
        // UNMUTE ALL (Stickers + Emojis)
        // =========================
        if (text && text.toLowerCase() === "all") {
            global.db.groups[m.chat].mutedStickers = {};
            global.db.groups[m.chat].mutedEmojis = {};
            return m.reply(
`🔓 *ᴀʟʟ ᴍᴜᴛᴇᴅ ꜱᴛɪᴄᴋᴇʀꜱ ᴀɴᴅ ᴇᴍᴏᴊɪꜱ ʜᴀᴠᴇ ʙᴇᴇɴ ᴄʟᴇᴀʀᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ!*`
            );
        }

        const mutedStickers = global.db.groups[m.chat].mutedStickers;
        const mutedEmojis = global.db.groups[m.chat].mutedEmojis;

        const quoted =
            m.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
            m.quoted?.message || {};
        const stickerObj = quoted?.stickerMessage;

        // =========================
        // UNMUTE STICKER
        // =========================
        if (stickerObj) {
            const rawHash = stickerObj.fileSha256;
            if (!rawHash) {
                return m.reply(`❌ *ᴜɴᴀʙʟᴇ ᴛᴏ ʀᴇᴀᴅ ꜱᴛɪᴄᴋᴇʀ ɪᴅ*`);
            }
            const hash = Buffer.isBuffer(rawHash)
                ? rawHash.toString("hex")
                : Buffer.from(rawHash).toString("hex");

            if (!mutedStickers[hash]) {
                return m.reply(`⚠️ *ꜱᴛɪᴄᴋᴇʀ ɴᴏᴛ ᴍᴜᴛᴇᴅ*`);
            }

            delete mutedStickers[hash];
            return m.reply(
`🔓 *ꜱᴛɪᴄᴋᴇʀ ᴜɴᴍᴜᴛᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ*`
            );
        }

        // =========================
        // UNMUTE EMOJI
        // =========================
        const quotedText =
            m.quoted?.text ||
            quoted?.conversation ||
            quoted?.extendedTextMessage?.text;

        const targetText = text ? text.trim() : (quotedText ? quotedText.trim() : "");

        if (targetText) {
            if (!mutedEmojis[targetText]) {
                return m.reply(`⚠️ *ᴇᴍᴏᴊɪ ɴᴏᴛ ᴍᴜᴛᴇᴅ*`);
            }

            delete mutedEmojis[targetText];
            return m.reply(
`🔓 *ᴇᴍᴏᴊɪ ᴜɴᴍᴜᴛᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ*

ᴇᴍᴏᴊɪ: ${targetText}`
            );
        }

        return m.reply(
`❌ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴍᴜᴛᴇᴅ ꜱᴛɪᴄᴋᴇʀ/ᴇᴍᴏᴊɪ ᴏʀ ᴛʏᴘᴇ ɪᴛ ᴀꜰᴛᴇʀ ᴛʜᴇ ᴄᴏᴍᴍᴀɴᴅ*

ᴏʀ ᴜꜱᴇ: .ᴜɴᴍᴜᴛᴇꜱᴛɪᴄᴋᴇʀ ᴀʟʟ`
        );
    }
}
];