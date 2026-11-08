/**
 * Plugin Collection: Unified Anti-Badword Command Suite
 * Description: Anti-badword commands (modes, add, delete, list, reset warns) in one modular file.
 * Author: Elijah (Emmyfrosh)
 *
 * NOTE: the default word list lives in the main handler (global.defaultBadwords),
 * so the filter and the list command always show the exact same words.
 */

// Safe global database initialization helper
const initGroupDb = (chatId) => {
  if (!global.db) global.db = {};
  if (!global.db.groups) global.db.groups = {};
  if (!global.db.groups[chatId]) global.db.groups[chatId] = {};
  const g = global.db.groups[chatId];
  if (!g.badwordWarns) g.badwordWarns = {};
  if (!Array.isArray(g.customBadwords)) g.customBadwords = [];
  if (g.maxWarnings === undefined) g.maxWarnings = 3;
  return g;
};

const getDefaults = () => (Array.isArray(global.defaultBadwords) ? global.defaultBadwords : []);

// Builds the word list message (used by .listbadword and .antibw list)
const sendWordList = (m) => {
  const groupDb = initGroupDb(m.chat);
  const defaults = getDefaults();
  const custom = groupDb.customBadwords;

  const customText = custom.length
    ? custom.map((w, i) => `${i + 1}. ${w}`).join('\n')
    : 'ɴᴏɴᴇ ᴀᴅᴅᴇᴅ ʏᴇᴛ';
  const defaultText = defaults.length ? defaults.join(', ') : 'ɴᴏɴᴇ';

  const msg = `🤬 ʙᴀᴅᴡᴏʀᴅ ʟɪꜱᴛ

▢ ᴄᴜꜱᴛᴏᴍ ᴡᴏʀᴅꜱ (${custom.length}):
${customText}

▢ ᴅᴇꜰᴀᴜʟᴛ ᴡᴏʀᴅꜱ (${defaults.length}):
${defaultText}

▢ .ᴀᴅᴅʙᴀᴅᴡᴏʀᴅ [ᴡᴏʀᴅ]
▢ .ᴅᴇʟʙᴀᴅᴡᴏʀᴅ [ᴡᴏʀᴅ]`;

  return m.reply(msg);
};

module.exports = [
  // ==========================================
  // ⚙️ MAIN DASHBOARD / TOGGLE SUB-COMMANDS
  // ==========================================
  {
    command: ['antibadword'],
    alias: ['antibw'],
    category: 'group',
    description: 'View filter stats or switch modes (delete, kick, warn, off, list)',
    group: true,
    admin: true,
    botadmin: true,
    async execute(m, { args }) {
      const groupDb = initGroupDb(m.chat);
      const userOption = args[0]?.toLowerCase();

      // Case 1: Dashboard
      if (!userOption) {
        if (!groupDb.antibadwordMode) groupDb.antibadwordMode = 'off';

        const currentStatus = groupDb.antibadword ? '🟢 ᴀᴄᴛɪᴠᴇ' : '🔴 ɪɴᴀᴄᴛɪᴠᴇ';

        const rawMode = String(groupDb.antibadwordMode).toLowerCase();
        let currentMode = 'ᴅᴇʟᴇᴛᴇ';
        if (rawMode === 'instantkick' || rawMode === 'kick') currentMode = 'ᴋɪᴄᴋ';
        if (rawMode === 'warn') currentMode = 'ᴡᴀʀɴ';
        if (rawMode === 'off') currentMode = 'ᴏꜰꜰ';

        const customList = groupDb.customBadwords.length > 0
          ? groupDb.customBadwords.map(w => w.toLowerCase()).join(', ')
          : 'ɴᴏɴᴇ';

        const dashboard = `🤖 ᴀɴᴛɪ-ʙᴀᴅᴡᴏʀᴅ ꜱʏꜱᴛᴇᴍ

▢ ꜱᴛᴀᴛᴜꜱ: ${currentStatus}
▢ ᴍᴏᴅᴇ: ${currentMode}
▢ ᴡᴏʀᴅ|ꜱ: ${customList}

▢ .ᴀɴᴛɪʙᴡ ᴅᴇʟᴇᴛᴇ
▢ .ᴀɴᴛɪʙᴡ ᴋɪᴄᴋ
▢ .ᴀɴᴛɪʙᴡ ᴡᴀʀɴ
▢ .ᴀɴᴛɪʙᴡ ᴏꜰꜰ
▢ .ᴀɴᴛɪʙᴡ ʟɪꜱᴛ
▢ .ᴀᴅᴅʙᴀᴅᴡᴏʀᴅ [ᴡᴏʀᴅ]
▢ .ᴅᴇʟʙᴀᴅᴡᴏʀᴅ [ᴡᴏʀᴅ]
▢ .ʟɪꜱᴛʙᴀᴅᴡᴏʀᴅ`;

        return m.reply(dashboard);
      }

      // .antibw list
      if (userOption === 'list') return sendWordList(m);

      // .antibw delete
      if (userOption === 'delete' || userOption === 'on') {
        groupDb.antibadword = true;
        groupDb.antibadwordMode = 'delete';
        return m.reply('🤬 🛡️ *Anti-Badword Mode updated to:* `DELETE` (Delete Only)');
      }

      // .antibw kick
      if (userOption === 'kick' || userOption === 'instant') {
        groupDb.antibadword = true;
        groupDb.antibadwordMode = 'instantkick';
        return m.reply('🤬 ⚡ *Anti-Badword Mode updated to:* `KICK` (Instant Kick)');
      }

      // .antibw warn
      if (userOption === 'warn') {
        groupDb.antibadword = true;
        groupDb.antibadwordMode = 'warn';
        return m.reply(`🤬 🚨 *Anti-Badword Mode updated to:* \`WARN\` (Kick at ${groupDb.maxWarnings} strikes)`);
      }

      // .antibw off
      if (userOption === 'off') {
        groupDb.antibadword = false;
        groupDb.antibadwordMode = 'off';
        return m.reply('🔓 *Anti-Badword Status:* 🔴 INACTIVE');
      }

      return m.reply('❌ Invalid option! Use `delete`, `kick`, `warn`, `off` or `list`.');
    }
  },

  // ==========================================
  // 📋 COMMAND: LIST ALL BADWORDS
  // ==========================================
  {
    command: ['listbadword'],
    alias: ['badwords', 'listbw', 'bwlist'],
    category: 'group',
    description: 'Show the default and custom badword lists for this group',
    group: true,
    admin: true,
    async execute(m) {
      return sendWordList(m);
    }
  },

  // ==========================================
  // ➕ COMMAND: ADD CUSTOM WORD(S) TO LIST
  // ==========================================
  {
    command: ['addbadword'],
    alias: ['addbw'],
    category: 'group',
    description: 'Add one or more custom words to the filter (separate with commas)',
    group: true,
    admin: true,
    botadmin: true,
    async execute(m, { text }) {
      const groupDb = initGroupDb(m.chat);
      const words = (text || '')
        .split(',')
        .map(w => w.trim().toLowerCase())
        .filter(Boolean);

      if (!words.length) {
        return m.reply('❌ Please specify the word you want to blacklist.\nExample: `.addbadword fool` or `.addbadword word1, word2`');
      }

      const defaults = getDefaults().map(w => w.toLowerCase());
      const added = [];
      const skipped = [];

      for (const w of words) {
        if (groupDb.customBadwords.includes(w) || defaults.includes(w) || added.includes(w)) {
          skipped.push(w);
        } else {
          groupDb.customBadwords.push(w);
          added.push(w);
        }
      }

      let reply = '';
      if (added.length) reply += `✅ Added: *${added.join(', ')}*\n`;
      if (skipped.length) reply += `⚠️ Already on the list: *${skipped.join(', ')}*`;
      return m.reply(reply.trim());
    }
  },

  // ==========================================
  // ➖ COMMAND: DELETE CUSTOM WORD FROM LIST
  // ==========================================
  {
    command: ['delbadword'],
    alias: ['delbw'],
    category: 'group',
    description: 'Remove a custom word from the filter',
    group: true,
    admin: true,
    botadmin: true,
    async execute(m, { text }) {
      const groupDb = initGroupDb(m.chat);
      const inputWord = text?.trim().toLowerCase();
      if (!inputWord) return m.reply('❌ Please specify the word you want to remove.\nExample: `.delbadword fool`');

      if (!groupDb.customBadwords.includes(inputWord)) {
        const isDefault = getDefaults().map(w => w.toLowerCase()).includes(inputWord);
        return m.reply(isDefault
          ? `⚠️ *"${inputWord}"* is a built-in default word, so it can't be removed with this command.`
          : `❌ *"${inputWord}"* was not found in your custom word list.`);
      }

      groupDb.customBadwords = groupDb.customBadwords.filter(w => w !== inputWord);
      return m.reply(`✅ Removed *"${inputWord}"* from your custom blacklist.`);
    }
  },

  // ==========================================
  // 🔓 COMMAND: RESET WARNING STRIKES
  // ==========================================
  {
    command: ['resetwarns'],
    alias: ['clearwarns', 'antibwreset'],
    category: 'group',
    description: 'Reset recorded profanity warning counts for a user',
    group: true,
    admin: true,
    botadmin: true,
    async execute(m, { args }) {
      const groupDb = initGroupDb(m.chat);
      const targetUser = m.quoted ? m.quoted.sender : (m.mentionedJid?.[0] || args[0]);
      if (!targetUser) return m.reply('❌ Please reply to a message or mention the user to clear their strikes.');
      if (!groupDb.badwordWarns[targetUser]) return m.reply('💯 This user has no warning strikes logged.');

      delete groupDb.badwordWarns[targetUser];
      return m.reply(`✅ Cleared badword strikes for @${targetUser.split('@')[0]}`, null, { mentions: [targetUser] });
    }
  }
];