/**
 * Author: Elijah (Emmyfrosh)
 * Sticker Command Manager (setcmd / delcmd)
 */

module.exports = [
{
    command: ['setcmd'],
    alias: ['addcmd', 'cmdsticker'],
    category: 'group',
    description: 'Assign a specific command string to a sticker',
    async execute(m, { text }) {
        const quoted =
            m.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
            m.quoted?.message || {};
        const stickerObj = quoted?.stickerMessage;

        if (!stickerObj) {
            return m.reply(`❌ *ʀᴇᴘʟʏ ᴛᴏ ᴛʜᴇ ꜱᴛɪᴄᴋᴇʀ ʏᴏᴜ ᴡᴀɴᴛ ᴛᴏ ᴀꜱꜱɪɢɴ ᴀ ᴄᴏᴍᴍᴀɴᴅ ᴛᴏ*`);
        }

        if (!text) {
            return m.reply(`❌ *ᴘʟᴇᴀꜱᴇ ᴘʀᴏᴠɪᴅᴇ ᴛʜᴇ ᴄᴏᴍᴍᴀɴᴅ ᴛᴇxᴛ (ᴇ.ɢ., .ꜱᴇᴛᴄᴍᴅ .ᴍᴇɴᴜ)*`);
        }

        const rawHash = stickerObj.fileSha256;
        if (!rawHash) {
            return m.reply(`❌ *ᴜɴᴀʙʟᴇ ᴛᴏ ʀᴇᴀᴅ ꜱᴛɪᴄᴋᴇʀ ɪᴅ*`);
        }

        const hash = Buffer.isBuffer(rawHash)
            ? rawHash.toString("hex")
            : Buffer.from(rawHash).toString("hex");

        // Initialize sticker database structure if absent
        if (!global.db.sticker) global.db.sticker = {};

        // Save the command string and inherit original mentions if any exist
        global.db.sticker[hash] = {
            text: text.trim(),
            mentionedJid: m.mentionedJid || []
        };

        return m.reply(`✅ *ꜱᴛɪᴄᴋᴇʀ ᴄᴏᴍᴍᴀɴᴅ ᴍᴀᴘᴘᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ!* \n\n» *ᴄᴍᴅ:* ${text.trim()}`);
    }
},
{
    command: ['delcmd'],
    alias: ['remcmd', 'deletecmd'],
    category: 'group',
    description: 'Remove an assigned command from a sticker',
    async execute(m) {
        const quoted =
            m.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
            m.quoted?.message || {};
        const stickerObj = quoted?.stickerMessage;

        if (!stickerObj) {
            return m.reply(`❌ *ʀᴇᴘʟʏ ᴛᴏ ᴛʜᴇ ꜱᴛɪᴄᴋᴇʀ ʏᴏᴜ ᴡᴀɴᴛ ᴛᴏ ᴜɴʟɪɴᴋ*`);
        }

        const rawHash = stickerObj.fileSha256;
        if (!rawHash) {
            return m.reply(`❌ *ᴜɴᴀʙʟᴇ ᴛᴏ ʀᴇᴀᴅ ꜱᴛɪᴄᴋᴇʀ ɪᴅ*`);
        }

        const hash = Buffer.isBuffer(rawHash)
            ? rawHash.toString("hex")
            : Buffer.from(rawHash).toString("hex");

        if (!global.db.sticker?.[hash]) {
            return m.reply(`⚠️ *ᴛʜɪꜱ ꜱᴛɪᴄᴋᴇʀ ᴅᴏᴇꜱ ɴᴏᴛ ʜᴀᴠᴇ ᴀɴʏ ᴄᴏᴍᴍᴀɴᴅ ᴀꜱꜱɪɢɴᴇᴅ ᴛᴏ ɪᴛ*`);
        }

        delete global.db.sticker[hash];
        return m.reply(`🗑️ *ꜱᴛɪᴄᴋᴇʀ ᴄᴏᴍᴍᴀɴᴅ ʀᴇᴍᴏᴠᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ!*`);
    }
}
];