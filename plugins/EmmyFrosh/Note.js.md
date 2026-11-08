// Named notes
//   Choose the name:             .addnote hello | me     or   .addnote hello / me   -> saved as "me"
//   Reply to a message and send  .addnote deploy   -> saves that text as "deploy"
//   No name given:               .addnote hello    -> the first word ("hello") is the name
//   Read it back:                .note deploy
//   List / delete:               .notes   .delnote deploy
//
// Notes are stored per user in global.db.notes, which your bot already saves
// (file DB / MongoDB) every 10 seconds, so they survive restarts.

const MAX_NOTES = 100
const MAX_LEN = 4000
const MAX_NAME = 30

const ownerKey = (m) => String(m.sender || "").replace(/:\d+@/, "@")

function getNotes(m) {
  if (!global.db.notes || typeof global.db.notes !== "object") global.db.notes = {}
  const key = ownerKey(m)
  if (!Array.isArray(global.db.notes[key])) global.db.notes[key] = []
  return global.db.notes[key]
}

const cleanName = (s) => String(s || "").trim().toLowerCase().slice(0, MAX_NAME)
const find = (notes, name) => notes.find((n) => n.name === name)

const fmtDate = (t) =>
  new Date(t).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })

const preview = (s, n = 50) => {
  const one = String(s).replace(/\s+/g, " ").trim()
  return one.length > n ? one.slice(0, n) + "…" : one
}

module.exports = [
  {
    command: ["addnote"],
    alias: ["savenote", "newnote"],
    description: "Save a note under a name (reply to a message, or type the text)",
    category: "Tools",
    ban: true,
    gcban: true,
    execute: async (m, { text, reply }) => {
      const raw = String(text || "").trim()
      const quoted = m.quoted ? String(m.quoted.text || m.quoted.caption || "").trim() : ""

      // 1) "<note> | <name>"  or  "<note> / <name>"  -> you choose the name
      //    ("/" needs a space before it, so links like https://site.com/page are safe)
      let name = "", content = ""
      const sep = raw.match(/^([\s\S]*\S)\s*\|\s*([^\s|\/]+)$/) || raw.match(/^([\s\S]*\S)\s+\/\s*([^\s|\/]+)$/) ||
                  raw.match(/^()\|\s*([^\s|\/]+)$/) || raw.match(/^()\/\s*([^\s|\/]+)$/)
      if (sep) {
        name = cleanName(sep[2])
        content = sep[1].trim() || quoted
      } else if (raw) {
        // 2) no name given: the first word becomes the name
        const first = raw.split(/\s+/)[0]
        name = cleanName(first)
        // replying to a message -> save the replied text; otherwise save what you typed
        content = quoted || raw
      }

      if (!name) {
        return reply(
          "❎ How to use:\n\n" +
          "Choose the name:\n.addnote hello | me\n.addnote hello / me\n\n" +
          "Reply to a message:\n.addnote deploy\n(or .addnote | deploy)\n\n" +
          "No name given? The first word is used:\n.addnote hello"
        )
      }
      if (!content) return reply(`❎ Nothing to save. Reply to a message, or type the note before the name:\n.addnote hello | ${name}`)
      if (content.length > MAX_LEN) return reply(`❎ That is too long (max ${MAX_LEN} characters).`)

      const notes = getNotes(m)
      const existing = find(notes, name)
      if (existing) {
        existing.text = content
        existing.time = Date.now()
        return reply(`✅ Note *${name}* updated.\n\nRead it: .note ${name}`)
      }
      if (notes.length >= MAX_NOTES) return reply(`❎ You already have ${MAX_NOTES} notes. Delete some with .delnote <name>`)

      notes.push({ name, text: content, time: Date.now() })
      reply(`✅ Saved as *${name}*.\n\nRead it: .note ${name}`)
    }
  },

  {
    command: ["note"],
    alias: ["getnote", "readnote", "shownote"],
    description: "Show a saved note by name",
    category: "Tools",
    ban: true,
    gcban: true,
    execute: async (m, { text, reply }) => {
      const notes = getNotes(m)
      const name = cleanName(String(text || "").trim().split(/\s+/)[0])

      if (!name) {
        if (!notes.length) return reply("📝 You have no notes yet.\n\nSave one: reply to a message with .addnote <name>")
        return reply(`📝 *Your notes (${notes.length})*\n\n${notes.map((n) => `• ${n.name}`).join("\n")}\n\nRead one: .note <name>`)
      }

      const note = find(notes, name)
      if (!note) {
        const close = notes.filter((n) => n.name.includes(name)).map((n) => n.name)
        return reply(`❎ No note named *${name}*.` + (close.length ? `\n\nDid you mean: ${close.slice(0, 5).join(", ")}?` : "\n\nSee all: .notes"))
      }
      reply(note.text)
    }
  },

  {
    command: ["notes"],
    alias: ["mynotes", "listnotes"],
    description: "List your saved notes",
    category: "Tools",
    ban: true,
    gcban: true,
    execute: async (m, { reply }) => {
      const notes = getNotes(m)
      if (!notes.length) return reply("📝 You have no notes yet.\n\nSave one: reply to a message with .addnote <name>")

      let out = `📝 *Your notes (${notes.length})*\n\n`
      notes.forEach((n) => { out += `*${n.name}*\n${preview(n.text)}\n_${fmtDate(n.time)}_\n\n` })
      out += "Read one: .note <name>\nDelete: .delnote <name>"
      reply(out.trim())
    }
  },

  {
    command: ["delnote"],
    alias: ["deletenote", "rmnote"],
    description: "Delete a note by name, or 'all'",
    category: "Tools",
    ban: true,
    gcban: true,
    execute: async (m, { text, reply }) => {
      const notes = getNotes(m)
      const name = cleanName(String(text || "").trim().split(/\s+/)[0])
      if (!name) return reply("❎ Which note? Example: .delnote deploy")
      if (!notes.length) return reply("📝 You have no notes to delete.")

      if (name === "all") {
        const count = notes.length
        notes.length = 0
        return reply(`🗑️ Deleted all ${count} notes.`)
      }

      const i = notes.findIndex((n) => n.name === name)
      if (i < 0) return reply(`❎ No note named *${name}*.`)
      notes.splice(i, 1)
      reply(`🗑️ Note *${name}* deleted.`)
    }
  }
]