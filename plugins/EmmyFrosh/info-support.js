module.exports = [
  {
    command: ["owner"],
    description: "Get owner contact",
    category: "Info",
    ban: true,
    gcban: true,
    execute: async (m, { ednut }) => {
      await ednut.sendContact(m.chat, [global.owner], `${global.ownername}`)
    }
  }
]