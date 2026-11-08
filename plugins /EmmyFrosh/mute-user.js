// mute.js — Advanced Mute & Unmute System (Silent Auto-Unmute + Duration List)

const initMuteData = (chat) => {

  if (!global.db.groups) global.db.groups = {}

  if (!global.db.groups[chat]) global.db.groups[chat] = {}

  if (!global.db.groups[chat].mutedUsers) {

    global.db.groups[chat].mutedUsers = {}

  }

}

const muteUser = {

  command: ['mute-user'],

  category: 'group',

  admin: true,

  async execute(m, { ednut, args, reply }) {

    initMuteData(m.chat)

    const firstArg = args[0]?.toLowerCase()

    // LIST MUTED USERS

    if (firstArg === 'list') {

      const mutedUsers = global.db.groups[m.chat].mutedUsers

      if (!Object.keys(mutedUsers).length) {

        return reply('😇 No one is currently muted.')

      }

      let text = '📋 *MUTED USERS LIST*\n\n'

      const mentions = []

      for (const jid of Object.keys(mutedUsers)) {

        const muteData = mutedUsers[jid]

        // remove expired

        if (muteData !== 'permanent' && Date.now() >= Number(muteData)) {

          delete mutedUsers[jid]

          continue

        }

        let status

        if (muteData === 'permanent') {

          status = '♾️ Permanent'

        } else {

          let remaining = Number(muteData) - Date.now()

          const hours = Math.floor(remaining / 3600000)

          remaining %= 3600000

          const minutes = Math.floor(remaining / 60000)

          remaining %= 60000

          const seconds = Math.floor(remaining / 1000)

          const parts = []

          if (hours) parts.push(`${hours}h`)

          if (minutes) parts.push(`${minutes}m`)

          if (seconds && !hours) parts.push(`${seconds}s`)

          status = `⏳ ${parts.join(' ')} left`

        }

        text += `▢ @${jid.split('@')[0]} - ${status}\n\n`

        mentions.push(jid)

      }

      return ednut.sendMessage(

        m.chat,

        { text, mentions },

        { quoted: m }

      )

    }

    // CLEAR LIST

    if (firstArg === 'clear') {

      global.db.groups[m.chat].mutedUsers = {}

      return reply('✅ Mute list cleared.')

    }

    const target =

      m.quoted?.sender ||

      m.mentionedJid?.[0]

    if (!target) {

      return reply(

        `📋 *MUTE USER SYSTEM*\n\n` +

        `▢ .mute-user @user\n` +

        `▢ .mute-user @user 30s\n` +

        `▢ .mute-user @user 5m\n` +

        `▢ .mute-user @user 1h\n` +

        `▢ .mute-user @user 1d\n` +

        `▢ .mute-user list\n` +

        `▢ .mute-user clear\n` +

        `▢ .unmute-user @user`

      )

    }

    const timeArgs = args.filter(a => /^\d+[smhdw]$/i.test(a))

    let expires = 'permanent'

    if (timeArgs.length) {

      let ms = 0

      for (const t of timeArgs) {

        const value = parseInt(t)

        const unit = t.slice(-1).toLowerCase()

        if (unit === 's') ms += value * 1000

        else if (unit === 'm') ms += value * 60000

        else if (unit === 'h') ms += value * 3600000

        else if (unit === 'd') ms += value * 86400000

        else if (unit === 'w') ms += value * 604800000

      }

      expires = Date.now() + ms

    }

    global.db.groups[m.chat].mutedUsers[target] = expires

    // silent auto-unmute

    if (expires !== 'permanent') {

      const delay = expires - Date.now()

      setTimeout(() => {

        try {

          if (

            global.db.groups?.[m.chat]?.mutedUsers?.[target] &&

            global.db.groups[m.chat].mutedUsers[target] === expires

          ) {

            delete global.db.groups[m.chat].mutedUsers[target]

          }

        } catch (e) {

          console.log('Auto-unmute error:', e)

        }

      }, delay)

    }

    return ednut.sendMessage(

      m.chat,

      {

        text: `🔇 @${target.split('@')[0]} has been muted ${

          expires === 'permanent'

            ? 'permanently'

            : 'for ' + timeArgs.join(' ')

        }.`,

        mentions: [target]

      },

      { quoted: m }

    )

  }

}

const unmuteUser = {

  command: ['unmute-user'],

  category: 'group',

  admin: true,

  async execute(m, { args, reply, ednut }) {

    initMuteData(m.chat)

    let target =

      m.quoted?.sender ||

      m.mentionedJid?.[0]

    if (!target && args[0]) {

      const num = args[0].replace(/[^0-9]/g, '')

      if (num.length >= 10) {

        target = num + '@s.whatsapp.net'

      }

    }

    if (!target) return reply('❌ Tag or reply to a user.')

    if (!global.db.groups[m.chat].mutedUsers[target]) {

      return reply('❌ User is not muted.')

    }

    delete global.db.groups[m.chat].mutedUsers[target]

    return ednut.sendMessage(

      m.chat,

      {

        text: `🔊 @${target.split('@')[0]} has been unmuted.`,

        mentions: [target]

      },

      { quoted: m }

    )

  }

}

module.exports = [muteUser, unmuteUser]