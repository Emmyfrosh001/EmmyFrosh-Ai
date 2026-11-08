module.exports = {

command: ["antilink"],

category: "group",

admin: true,

async execute(m, { args, reply, isAdmins, isOwner }) {

if (!isAdmins && !isOwner)

return reply("❌ Admin only")

if (!global.db) global.db = {}

if (!global.db.groups) global.db.groups = {}

if (!global.db.groups[m.chat]) global.db.groups[m.chat] = {}

const group = global.db.groups[m.chat]

// ==========================

// DEFAULT VALUES

// ==========================

if (group.antilink === undefined) group.antilink = false

if (group.antilink2 === undefined) group.antilink2 = false

if (group.antilink3 === undefined) group.antilink3 = false

if (group.antilink4 === undefined) group.antilink4 = false

group.allowedLinks = Array.isArray(group.allowedLinks)

? group.allowedLinks

: []

group.antilinkWarnings = group.antilinkWarnings || {}

group.maxWarnings = group.maxWarnings || 3

const type = (args[0] || "").toLowerCase()

const value = args.slice(1).join(" ")

// ==========================

// MODE ON

// ==========================

if (type === "on") {

group.antilink = true

group.antilink2 = false

group.antilink3 = false

group.antilink4 = false

return reply("✅ Antilink DELETE mode enabled")

}

// ==========================

// MODE KICK

// ==========================

if (type === "kick") {

group.antilink = false

group.antilink2 = true

group.antilink3 = false

group.antilink4 = false

return reply("✅ Antilink KICK mode enabled")

}

// ==========================

// MODE WARN

// ==========================

if (type === "warn") {

group.antilink = false

group.antilink2 = false

group.antilink3 = true

group.antilink4 = false

return reply("✅ Antilink WARN mode enabled")

}

// ==========================

// MODE WARNKICK

// ==========================

if (type === "warnkick") {

group.antilink = false

group.antilink2 = false

group.antilink3 = false

group.antilink4 = true

return reply("✅ Antilink WARN+KICK mode enabled")

}

// ==========================

// OFF

// ==========================

if (type === "off") {

group.antilink = false

group.antilink2 = false

group.antilink3 = false

group.antilink4 = false

return reply("✅ Antilink disabled")

}

// ==========================

// ALLOW LINK (CMD + REPLY)

// ==========================

if (type === "allow") {

let link = value

if (!link && m.quoted) {

link =

m.quoted.text ||

m.quoted.caption ||

m.quoted.message?.conversation ||

""

}

if (!link)

return reply("Example:\n.antilink allow link OR reply to link")

const match = link.match(/(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|t\.me\/[^\s]+|discord\.gg\/[^\s]+)/i)

if (!match)

return reply("❌ No valid link found")

link = match[0].toLowerCase()

if (!group.allowedLinks.includes(link)) {

group.allowedLinks.push(link)

}

return reply(`✅ Allowed link added:\n${link}`)

}

// ==========================

// UNALLOW LINK (CMD + REPLY)

// ==========================

if (type === "unallow") {

let link = value

if (!link && m.quoted) {

link =

m.quoted.text ||

m.quoted.caption ||

m.quoted.message?.conversation ||

""

}

// UNALLOW ALL

if (link && link.toLowerCase() === "all") {

group.allowedLinks = []

return reply("✅ All allowed links cleared")

}

if (!link)

return reply("Example:\n.antilink unallow link\n.antilink unallow all\nOR reply")

const match = link.match(/(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|t\.me\/[^\s]+|discord\.gg\/[^\s]+)/i)

if (!match)

return reply("❌ No valid link found")

link = match[0].toLowerCase()

group.allowedLinks = group.allowedLinks.filter(v => v !== link)

return reply(`✅ Removed allowed link:\n${link}`)

}

// ==========================

// SET WARN (1 - 20)

// ==========================

if (type === "setwarn") {

const num = parseInt(value)

if (isNaN(num))

return reply("Example:\n.antilink setwarn 3")

if (num < 1 || num > 20)

return reply("❌ Warn limit must be 1 - 20")

group.maxWarnings = num

return reply(`✅ Warning limit set to ${num}`)

}

// ==========================

// RESET (USER / ALL)

// ==========================

if (type === "reset") {

if (value === "all") {

group.antilinkWarnings = {}

return reply("✅ All users warnings reset")

}

const target =

m.quoted?.sender ||

m.mentionedJid?.[0]

if (!target)

return reply("Reply or tag a user OR use: .antilink reset all")

delete group.antilinkWarnings[target]

return reply(`✅ Reset warnings for @${target.split("@")[0]}`, {

mentions: [target]

})

}

// ==========================

// STATUS DASHBOARD

// ==========================

return reply(

`🔗 *ANTILINK SETTINGS*

📌 Delete Mode: ${group.antilink ? "ON" : "OFF"}

📌 Kick Mode: ${group.antilink2 ? "ON" : "OFF"}

📌 Warn Mode: ${group.antilink3 ? "ON" : "OFF"}

📌 WarnKick Mode: ${group.antilink4 ? "ON" : "OFF"}

⚠️ Warn Limit: ${group.maxWarnings}

🔗 Allowed Links:

${group.allowedLinks.length ? group.allowedLinks.join("\n") : "None"}

━━━━━━━━━━━━━━━

📚 COMMANDS

.antilink on

.antilink kick

.antilink warn

.antilink warnkick

.antilink off

.antilink allow <link> (or reply)

.antilink unallow <link> (or reply)

.antilink unallow all

.antilink setwarn 1-20

.antilink reset @user

.antilink reset all`

)

}

}