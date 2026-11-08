module.exports = [
  {
  command: "del",
  description: "Delete a quoted message (owner, mods, sudo)",
  category: "Owner",
  ban: true,
  gcban: true,
  execute: async (m, { ednut, isModerator, isSudo, isAdmins, senderNumber, isBotAdmins, botNumber }) => {
    // ── WHO CAN USE .del ──
    // - the owner number (OWNER_NUMBER / the bot's own account)
    // - mods
    // - sudo users
    // Plain admins (not sudo) and everyone else are ignored.
    const digits = (v = "") =>
      String(v).includes("@")
        ? String(v).split("@")[0].split(":")[0].replace(/\D/g, "")
        : String(v).replace(/\D/g, "");

    const ownerList = [global.owner, global.ownerNumber]
      .flat()
      .filter(Boolean)
      .map(digits)
      .filter(Boolean);

    const senderIds = [senderNumber, m.sender, m.key?.participant, m.senderAlt]
      .filter(Boolean)
      .map(digits)
      .filter(Boolean);

    const isRealOwner = !!m.key?.fromMe || senderIds.some((id) => ownerList.includes(id));
    // sudo users can use it too (admin rules for others' messages below)
    if (!isRealOwner && !isModerator && !isSudo) return;

    if (!m.quoted) return m.reply("❗ Reply to the message you want to delete.");

    // Normalize a jid down to just its digits (strips @server and :device)
    const jidToNum = (jid = "") =>
      String(jid).includes("@")
        ? String(jid).split("@")[0].split(":")[0]
        : String(jid).replace(/[^0-9]/g, "");

    // Is the quoted message the BOT'S OWN? (fromMe flag, or the sender id
    // matches the bot's own number / lid — the flag alone is not reliable
    // in groups). The bot can always delete its own messages, even when it
    // is not a group admin.
    const botIds = [ednut.user?.id, ednut.user?.lid, botNumber]
      .filter(Boolean)
      .map(digits)
      .filter(Boolean);
    const quotedIsBot =
      !!m.quoted.fromMe || botIds.includes(jidToNum(m.quoted.sender));
    const quotedIsSender = jidToNum(m.quoted.sender) === jidToNum(m.sender);
    const isOwnMessage = quotedIsBot || quotedIsSender;

    const deleteKey = {
      remoteJid: m.chat,
      fromMe: quotedIsBot,
      id: m.quoted.id,
      participant: m.quoted.sender,
    };

    // Anyone allowed to use .del can delete THEIR OWN message (or the bot's own
    // message), in a group or a DM, WITHOUT being a group admin.
    if (isOwnMessage) {
      return ednut.sendMessage(m.chat, { delete: deleteKey });
    }

    // Deleting someone ELSE's message needs elevated permission.
    if (m.isGroup) {
      // the bot must always be admin to delete other people's messages
      if (!isBotAdmins)
        return m.reply("❌ I need to be an admin to delete other people's messages.");
      // EVERYONE (owner, mods, sudo) must be a group admin to delete
      // someone else's message
      if (!isAdmins)
        return m.reply("❌ You need to be a group admin to delete someone else's message.");
      return ednut.sendMessage(m.chat, { delete: deleteKey });
    }

    // In a private DM, WhatsApp only ever allows deleting your own sent
    // messages (or the bot's own) — there's no way to delete the other
    // person's message from your side at all.
    return m.reply("❌ I can only delete your own message in a private chat, not theirs.");
  }
},
  {
    command: "bio",
    alias: ["setbiobot"],
    description: "Set the bot's bio/status",
    category: "Owner",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { ednut, text, isOwner, msg, example, isGroup }) => {
      if (!text) return m.reply(example("Set your bot bio text"));
      await ednut.updateProfileStatus(text);
      m.reply("_Bio set successfully._");
    },
  },
  {
    command: "restart",
    description: "Restart the bot",
    category: "Owner",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { isOwner, msg, sleep, reply }) => {
      reply("*Restarting, please wait...*");
      await sleep(1500);
      process.exit(42); // MANUAL_RESTART_CODE — tells index.js this restart was intentional
    },
  },
  {
    command: "leave",
    alias: ["left"],
    description: "Make bot leave the group",
    category: "Owner",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, isOwner, msg, sleep, isGroup}) => {
      if (!m.isGroup) return m.reply(msg.group);
      if (!isOwner) return m.reply(msg.owner)
      await sleep(2000);
      await ednut.groupLeave(m.chat);
    },
  },
  {
    command: "join",
    alias: ["joingc"],
    description: "Join a WhatsApp group using invite link (typed, or from a replied message)",
    category: "Owner",
    ban: true,
    gcban: true,
    owner: true,
    execute: async (m, { ednut, isOwner, text, msg, example, isGroup }) => {
      // Pull a link from either: text typed after .join, OR the text of
      // whatever message you replied to when you ran .join.
      const quotedText =
        m.quoted?.text ||
        m.quoted?.body ||
        m.quoted?.message?.conversation ||
        m.quoted?.message?.extendedTextMessage?.text ||
        null;

      const link = (text && text.trim()) || (quotedText && quotedText.trim());

      if (!link)
        return m.reply(example("Provide a group invite link, or reply to a message containing one"));
      if (!link.includes("chat.whatsapp.com"))
        return m.reply("The given link is invalid.");

      try {
        // Pull just the invite code, trimming off any trailing text/query
        // params/whitespace that might follow the link in a longer message.
        const code = link
          .split("https://chat.whatsapp.com/")[1]
          ?.split(/[\s?]/)[0];

        if (!code) return m.reply("The given link is invalid.");

        await ednut.groupAcceptInvite(code);
        m.reply("✅ Successfully joined the group.");
      } catch (err) {
        m.reply("❌ Failed to join group. Make sure the link is correct and valid.");
      }
    },
  },
];