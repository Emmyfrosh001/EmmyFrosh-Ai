const axios = require('axios');
const path = require('path');

module.exports = {
    name: 'dlanime',
    aliases: ['anidownload', 'animedownload'],
    category: 'anime',
    exp: 5,
    cooldown: 0,
    description: 'Download or stream an anime episode',
    usage: '!dlanime <url>',

    async execute(sock, msg, args, extra) {
        try {
            const chatId = extra.from;

            if (args.length < 1) {
                return extra.reply(
                    `📥 *DOWNLOAD EPISODE*\n\n` +
                    `Usage: !dlanime <url>\n\n` +
                    `Get the URL from:\n` +
                    `• !animeepisodes <season_url>\n` +
                    `• !animeepisode <episode_url>\n\n` +
                    `Example: !dlanime <url>`
                );
            }

            await extra.react('⏳');

            const url = args[0];
            
            // ── Extract filename from URL ─────────────────────────────────────
            let filename = 'episode.mp4';
            let title = 'Episode';
            try {
                const urlObj = new URL(url);
                const pathname = urlObj.pathname;
                const baseName = path.basename(pathname);
                if (baseName && baseName.includes('.')) {
                    filename = decodeURIComponent(baseName);
                    // Remove .mp4 extension and the leading number
                    title = filename.replace(/\.mp4$/i, '').replace(/^\d+\s*/, '').trim();
                }
            } catch (e) {
                // If URL parsing fails, use default
            }

            // Send initial message
            const statusMsg = await extra.reply(`📥 Downloading episode...\n⏳ Please wait...`);

            // Direct download using axios
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.cartoonsarea.cc/'
                }
            });

            const buffer = Buffer.from(response.data);

            if (buffer.length === 0) {
                throw new Error('Downloaded file is empty');
            }

            // ── Extract series name, season, and episode from URL ─────────────
            let seriesName = 'Anime Episode';
            let seasonNum = '';
            let episodeNum = '';

            // Decode the URL for better parsing
            const decodedUrl = decodeURIComponent(url);
            const urlLower = decodedUrl.toLowerCase();

            // Pattern for: /Chainsaw%20Man/Season%201/Episode%2012//12%20Katana%20vs.%20Chainsaw.mp4
            // Or: /Chainsaw Man/Season 1/Episode 12//12 Katana vs. Chainsaw.mp4
            
            // First, try to extract series name from path
            // Look for pattern: /Series Name/Season X/Episode Y/
            const seasonEpPattern = /\/([^\/]+)\/Season\s*(\d+)\/Episode\s*(\d+)\//i;
            const match = decodedUrl.match(seasonEpPattern);
            
            if (match) {
                seriesName = match[1].trim();
                seasonNum = match[2];
                episodeNum = match[3];
            } else {
                // Fallback: try to extract from URL parts
                const urlParts = decodedUrl.split('/');
                for (let i = 0; i < urlParts.length; i++) {
                    const part = urlParts[i];
                    // Check for Season pattern
                    const seasonMatch = part.match(/season\s*(\d+)/i);
                    if (seasonMatch) {
                        seasonNum = seasonMatch[1];
                        // Series name is usually before Season
                        if (i > 0) {
                            const seriesPart = urlParts[i - 1];
                            if (seriesPart && !seriesPart.match(/season|episode|user-data|cartoonsarea/i)) {
                                seriesName = seriesPart.trim();
                            }
                        }
                    }
                    // Check for Episode pattern
                    const epMatch = part.match(/episode\s*(\d+)/i);
                    if (epMatch) {
                        episodeNum = epMatch[1];
                    }
                    // Check if filename contains episode number
                    if (i === urlParts.length - 1) {
                        const fileEpMatch = part.match(/^(\d+)\s/);
                        if (fileEpMatch && !episodeNum) {
                            episodeNum = fileEpMatch[1];
                        }
                    }
                }
            }

            // If series name still not found, try to get it from the path
            if (seriesName === 'Anime Episode') {
                const pathParts = decodedUrl.split('/');
                for (const part of pathParts) {
                    const trimmed = part.trim();
                    if (trimmed && 
                        !trimmed.match(/^season|^episode|^user-data|^cartoonsarea|^english|^japanese|^dubbed|^subbed|^\d+$/i) && 
                        trimmed.length > 2) {
                        seriesName = trimmed;
                        break;
                    }
                }
            }

            // Clean up series name
            if (seriesName && seriesName !== 'Anime Episode') {
                seriesName = seriesName
                    .replace(/[_-]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .replace(/\b\w/g, l => l.toUpperCase())
                    .trim();
            }

            // Update status with upload progress
            try {
                await sock.sendMessage(chatId, {
                    text: `📤 Uploading episode... (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`,
                    edit: statusMsg.key
                });
            } catch (e) {}

            // ── Build caption ──────────────────────────────────────────────────
            let caption = `📥 *Episode Downloaded*\n\n`;
            
            if (seriesName && seriesName !== 'Anime Episode' && seriesName !== '') {
                caption += `📺 Series: *${seriesName}*\n`;
            }
            if (seasonNum) {
                caption += `📂 Season: *${seasonNum}*\n`;
            }
            if (episodeNum) {
                caption += `🎬 Episode: *${episodeNum}*\n`;
            }
            caption += `📖 Title: *${title}*\n`;
            caption += `📊 Size: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB`;

            // Try to send as video first (for better playback)
            try {
                await sock.sendMessage(chatId, {
                    video: buffer,
                    mimetype: 'video/mp4',
                    caption: caption,
                    fileName: filename
                }, { quoted: msg });
            } catch (videoError) {
                // Fallback to document if video fails
                await sock.sendMessage(chatId, {
                    document: buffer,
                    mimetype: 'video/mp4',
                    fileName: filename,
                    caption: caption
                }, { quoted: msg });
            }

            // Delete the status message
            try {
                await sock.sendMessage(chatId, { delete: statusMsg.key });
            } catch (e) {}

            await extra.react('✅');

        } catch (error) {
            console.error('Download error:', error);
            await extra.react('🔴');
            
            let errorMsg = '🔴 Failed to download episode.\n\n';
            
            if (error.message && error.message.includes('500')) {
                errorMsg += '⚠️ *Server Error (500)*\n';
                errorMsg += 'The server is currently experiencing issues.\n\n';
                errorMsg += '💡 *Try these alternatives:*\n';
                errorMsg += '• Use the link directly in your browser\n';
                errorMsg += '• Try again in a few minutes\n';
                errorMsg += '• Check if the episode URL is still valid\n';
            } else if (error.message && error.message.includes('404')) {
                errorMsg += '⚠️ *File Not Found (404)*\n';
                errorMsg += 'The episode file might have been removed or moved.\n';
            } else if (error.message && error.message.includes('timeout')) {
                errorMsg += '⏰ *Timeout*\n';
                errorMsg += 'The download took too long. The file might be very large.\n';
            } else {
                errorMsg += `⚠️ *Error Details*\n`;
                errorMsg += `${error.message || 'Unknown error occurred'}\n`;
            }
            
            errorMsg += `\n📄 *URL:* ${url}`;
            
            // Delete status message if exists
            try {
                if (statusMsg && statusMsg.key) {
                    await sock.sendMessage(chatId, { delete: statusMsg.key });
                }
            } catch (e) {}
            
            return extra.reply(errorMsg);
        }
    }
};