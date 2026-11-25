// lib/antideleteHandler.js - COMPLETE WORKING VERSION

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');

const messageStore = new Map();
const CONFIG_PATH = path.join(__dirname, '../data/antidelete.json');
const TEMP_MEDIA_DIR = path.join(__dirname, '../tmp');

// Ensure directories exist
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}
if (!fs.existsSync(path.dirname(CONFIG_PATH))) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
}

// Load config
function loadAntideleteConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            return { enabled: false, forwardToOwner: false };
        }
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        return { 
            enabled: data.enabled === true, 
            forwardToOwner: data.forwardToOwner === true 
        };
    } catch (err) {
        console.error('[ANTIDELETE] Config load error:', err);
        return { enabled: false, forwardToOwner: false };
    }
}

// Get owner number (where to forward deleted messages)
function getOwnerNumber(sock) {
    // Priority 1: Check global owner number from config
    if (global.ownerNumber) {
        return global.ownerNumber;
    }
    // Priority 2: Check process env
    if (process.env.OWNER_NUMBER) {
        return process.env.OWNER_NUMBER;
    }
    // Priority 3: Use bot's own number (will send to itself)
    if (sock && sock.user && sock.user.id) {
        return sock.user.id.split(':')[0] + '@s.whatsapp.net';
    }
    return null;
}

// Clean temp folder function
const cleanTempFolder = () => {
    try {
        const files = fs.readdirSync(TEMP_MEDIA_DIR);
        let deletedCount = 0;
        for (const file of files) {
            const filePath = path.join(TEMP_MEDIA_DIR, file);
            try {
                fs.unlinkSync(filePath);
                deletedCount++;
            } catch (err) {}
        }
        if (deletedCount > 0) {
            console.log(`[ANTIDELETE] Cleaned ${deletedCount} temp files`);
        }
    } catch (err) {}
};

// Clean temp folder every hour
setInterval(cleanTempFolder, 60 * 60 * 1000);

// Store incoming messages
async function storeMessage(sock, message) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return;

        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        let mediaType = 'text';
        let mediaPath = null;
        let sender = message.key.participant || message.key.remoteJid;

        // Skip if message is from bot itself
        if (sock.user && sender === sock.user.id) return;

        // Extract message content
        const msg = message.message;
        
        if (msg?.conversation) {
            content = msg.conversation;
            mediaType = 'text';
        } 
        else if (msg?.extendedTextMessage?.text) {
            content = msg.extendedTextMessage.text;
            mediaType = 'text';
        } 
        else if (msg?.imageMessage) {
            mediaType = 'image';
            content = msg.imageMessage.caption || '';
            try {
                const stream = await downloadContentFromMessage(msg.imageMessage, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
                await writeFile(mediaPath, buffer);
            } catch (err) {
                console.error('[ANTIDELETE] Failed to download image:', err);
            }
        } 
        else if (msg?.videoMessage) {
            mediaType = 'video';
            content = msg.videoMessage.caption || '';
            try {
                const stream = await downloadContentFromMessage(msg.videoMessage, 'video');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                await writeFile(mediaPath, buffer);
            } catch (err) {
                console.error('[ANTIDELETE] Failed to download video:', err);
            }
        } 
        else if (msg?.stickerMessage) {
            mediaType = 'sticker';
            try {
                const stream = await downloadContentFromMessage(msg.stickerMessage, 'sticker');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
                await writeFile(mediaPath, buffer);
            } catch (err) {
                console.error('[ANTIDELETE] Failed to download sticker:', err);
            }
        }
        else if (msg?.audioMessage) {
            mediaType = 'audio';
            try {
                const stream = await downloadContentFromMessage(msg.audioMessage, 'audio');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp3`);
                await writeFile(mediaPath, buffer);
            } catch (err) {
                console.error('[ANTIDELETE] Failed to download audio:', err);
            }
        }

        // Store in memory
        messageStore.set(messageId, {
            content: content || '',
            mediaType,
            mediaPath,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: Date.now()
        });

        console.log(`[ANTIDELETE] Stored: ${messageId} (${mediaType})`);

        // Auto-delete from store after 5 minutes
        setTimeout(() => {
            if (messageStore.has(messageId)) {
                const stored = messageStore.get(messageId);
                if (stored.mediaPath && fs.existsSync(stored.mediaPath)) {
                    try { fs.unlinkSync(stored.mediaPath); } catch (err) {}
                }
                messageStore.delete(messageId);
                console.log(`[ANTIDELETE] Expired: ${messageId}`);
            }
        }, 5 * 60 * 1000);

    } catch (err) {
        console.error('[ANTIDELETE] storeMessage error:', err);
    }
}

// Handle message deletion/revocation
async function handleMessageRevocation(sock, revocationMessage, store) {
    try {
        const config = loadAntideleteConfig();
        
        // Only process if antidelete is enabled
        if (!config.enabled) return;

        const protocolMsg = revocationMessage.message?.protocolMessage;
        if (!protocolMsg) return;
        
        const messageId = protocolMsg.key?.id;
        if (!messageId) return;
        
        const deletedBy = revocationMessage.participant || revocationMessage.key?.participant || revocationMessage.key?.remoteJid;
        
        // Don't report if bot deleted the message
        if (sock.user && deletedBy === sock.user.id) return;

        // Get the original message from store
        const original = messageStore.get(messageId);
        if (!original) {
            console.log(`[ANTIDELETE] Message not found: ${messageId}`);
            return;
        }

        console.log(`[ANTIDELETE] Deleted: ${messageId} by ${deletedBy}`);

        const sender = original.sender;
        const senderName = sender ? sender.split('@')[0] : 'Unknown';
        const deletedByName = deletedBy ? deletedBy.split('@')[0] : 'Unknown';
        
        // Get group name
        let groupName = '';
        if (original.group) {
            try {
                const metadata = await sock.groupMetadata(original.group);
                groupName = metadata.subject || 'Group';
            } catch (err) {
                groupName = 'Unknown Group';
            }
        }

        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Africa/Lagos',
            hour12: true, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric'
        });

        // Prepare report message for owner
        let reportMessage = `⚠️ *ANTIDELETE REPORT* ⚠️\n\n` +
            `*🗑️ Deleted By:* @${deletedByName}\n` +
            `*👤 Original Sender:* @${senderName}\n` +
            `*📱 Number:* ${sender}\n` +
            `*🕒 Time:* ${time}\n`;

        if (groupName) reportMessage += `*👥 Group:* ${groupName}\n`;
        
        if (original.content && original.content.trim()) {
            reportMessage += `\n*💬 Deleted Message:*\n${original.content.substring(0, 800)}${original.content.length > 800 ? '...' : ''}`;
        } else if (original.mediaType !== 'text') {
            reportMessage += `\n*📎 Media Type:* ${original.mediaType.toUpperCase()}`;
        }

        // FORWARD TO OWNER (Main feature)
        if (config.forwardToOwner) {
            const ownerNumber = getOwnerNumber(sock);
            if (ownerNumber) {
                try {
                    // Send text report to owner
                    await sock.sendMessage(ownerNumber, {
                        text: reportMessage,
                        mentions: [deletedBy, sender].filter(Boolean)
                    });
                    console.log(`[ANTIDELETE] Forwarded report to owner: ${ownerNumber}`);

                    // Send media if exists
                    if (original.mediaPath && fs.existsSync(original.mediaPath)) {
                        const mediaCaption = `*📎 Deleted ${original.mediaType}*\n*From:* @${senderName}`;
                        
                        switch (original.mediaType) {
                            case 'image':
                                await sock.sendMessage(ownerNumber, { 
                                    image: { url: original.mediaPath }, 
                                    caption: mediaCaption,
                                    mentions: [sender]
                                });
                                break;
                            case 'video':
                                await sock.sendMessage(ownerNumber, { 
                                    video: { url: original.mediaPath }, 
                                    caption: mediaCaption,
                                    mentions: [sender]
                                });
                                break;
                            case 'sticker':
                                await sock.sendMessage(ownerNumber, { 
                                    sticker: { url: original.mediaPath }
                                });
                                break;
                            case 'audio':
                                await sock.sendMessage(ownerNumber, { 
                                    audio: { url: original.mediaPath }, 
                                    mimetype: 'audio/mpeg',
                                    ptt: false
                                });
                                break;
                        }
                        console.log(`[ANTIDELETE] Forwarded ${original.mediaType} to owner`);
                    }
                } catch (err) {
                    console.error('[ANTIDELETE] Failed to forward to owner:', err.message);
                }
            } else {
                console.log('[ANTIDELETE] No owner number configured! Set global.ownerNumber or OWNER_NUMBER env');
            }
        }

        // Optional: Send notification to group
        if (original.group) {
            try {
                const groupMessage = `⚠️ *MESSAGE DELETED* ⚠️\n\n` +
                    `*From:* @${senderName}\n` +
                    `*Type:* ${original.mediaType === 'text' ? 'Text' : original.mediaType || 'Media'}\n` +
                    `${original.content && original.content.trim() ? `*Content:* ${original.content.substring(0, 200)}` : '*Content:* Media message'}\n\n` +
                    `_This message was deleted by the sender_`;
                
                await sock.sendMessage(original.group, {
                    text: groupMessage,
                    contextInfo: { mentionedJid: [sender] }
                });
                console.log(`[ANTIDELETE] Sent notification to group`);
            } catch (err) {
                console.error('[ANTIDELETE] Failed to send to group:', err.message);
            }
        }

        // Clean up media file
        if (original.mediaPath && fs.existsSync(original.mediaPath)) {
            try { fs.unlinkSync(original.mediaPath); } catch (err) {}
        }
        messageStore.delete(messageId);

    } catch (err) {
        console.error('[ANTIDELETE] handleMessageRevocation error:', err);
    }
}

module.exports = {
    storeMessage,
    handleMessageRevocation,
    loadAntideleteConfig
};
