// ============================================================
// 👮 MOD COMMANDS — addmod, removemod, modlist
// Owner + Moderator System
// ============================================================
const jidToNum = (jid = "") =>
  jid.includes("@")
    ? jid.split("@")[0].split(":")[0] // strip device suffix, e.g. "123:0" -> "123"
    : jid.replace(/[^0-9]/g, "");

// WhatsApp now sometimes gives senders/mentions as "@lid" (a random
// linked/privacy ID) instead of the real "@s.whatsapp.net" number.
// This resolves a @lid back to the real phone-number jid.
//
// Strategy:
//  1) Try Baileys' native LID -> PN mapping store (most reliable, works
//     even outside groups, present in newer Baileys versions).
//  2) Fall back to scanning the group's participant metadata, checking
//     several possible field names since these vary across Baileys
//     versions (jid, phoneNumber, pn, or id itself).
//  3) If neither works, log the raw participant shape so the exact
//     field name can be identified for this Baileys version, and fall
//     back to returning the original @lid (better than crashing).
async function resolveRealJid(ednut, chat, jid) {
  if (!jid) return jid;
  if (!jid.endsWith("@lid")) return jid; // already a real number jid

  // 1) Native LID -> PN mapping store
  try {
    const mapping = ednut.signalRepository?.lidMapping;
    if (mapping?.getPNForLID) {
      const pn = await mapping.getPNForLID(jid);
      if (pn) return pn.includes("@") ? pn : `${pn}@s.whatsapp.net`;
    }
  } catch (e) {
    // ignore, fall through to metadata approach
  }

  // 2) Group participant metadata fallback
  try {
    const meta = await ednut.groupMetadata(chat);
    const participant = meta?.participants?.find(
      (p) => p.id === jid || p.lid === jid
    );

    if (participant) {
      const real =
        participant.jid ||
        participant.phoneNumber ||
        participant.pn ||
        (participant.id?.endsWith("@s.whatsapp.net") ? participant.id : null);

      if (real) return real.includes("@") ? real : `${real}@s.whatsapp.net`;

      // Couldn't find a known field — log the raw shape so we can see
      // what this Baileys version actually calls it.
      console.log("⚠️ Unresolved LID participant shape:", JSON.stringify(participant));
    }
  } catch (e) {
    console.log("⚠️ resolveRealJid group metadata error:", e.message);
  }

  return jid; // couldn't resolve, fall back to whatever we had
}

const isOwner = (jid) => {
  const sender = jidToNum(jid);
  if (!global.ownerNumber) return false;
  if (Array.isArray(global.ownerNumber)) {
    return global.ownerNumber.some(
      (num) => jidToNum(String(num)) === sender
    );
  }
  return jidToNum(String(global.ownerNumber)) === sender;
};

const isMod = (jid) => {
  const sender = jidToNum(jid);
  if (!Array.isArray(global.db?.setmod)) return false;
  return global.db.setmod.some(
    (num) => jidToNum(String(num)) === sender
  );
};

const resolveTarget = (m, args) => {
  if (m.quoted?.sender) return m.quoted.sender;
  const mentioned =
    m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentioned.length) return mentioned[0];
  if (args[0]) {
    const num = args[0].replace(/[^0-9]/g, "");
    if (num.length >= 7) return `${num}@s.whatsapp.net`;
  }
  return null;
};

module.exports = [
{
  command: ["addmod"],
  alias: ["setmod"],
  category: "Owner",
  description: "Add moderator",
  async execute(m, { ednut, args, reply }) {
    // Resolve the command sender too, in case they come through as @lid
    const senderJid = await resolveRealJid(ednut, m.chat, m.sender);

    if (!isOwner(senderJid) && !isMod(senderJid))
      return reply("⛔ Only *Owner* or *Moderator* can use this command.");
    if (!global.db) global.db = {};
    if (!Array.isArray(global.db.setmod))
      global.db.setmod = [];

    let target = resolveTarget(m, args);
    if (!target)
      return reply(
        "❌ Reply a user or use:\n.addmod 2348012345678"
      );

    // Always resolve to the real WhatsApp number before storing, never a @lid
    target = await resolveRealJid(ednut, m.chat, target);

    const num = jidToNum(target);
    const jid = target.includes("@s.whatsapp.net") ? target : `${num}@s.whatsapp.net`;

    if (global.db.setmod.some(v => jidToNum(v) === num))
      return reply(`⚠️ \`\`\`${num}\`\`\` is already a moderator.`);

    global.db.setmod.push(jid);
    global.flushDB?.()?.catch?.(() => {}); // save now, survive restart
    return ednut.sendMessage(
      m.chat,
      {
        text: `\`\`\`${num}\`\`\` ᴀᴅᴅᴇᴅ ᴛᴏ ᴍᴏᴅ ʟɪꜱᴛ...`,
        mentions: [jid]
      },
      { quoted: m }
    );
  }
},
{
  command: ["delmod"],
  category: "Owner",
  description: "Remove moderator",
  async execute(m, { ednut, args, reply }) {
    const senderJid = await resolveRealJid(ednut, m.chat, m.sender);

    if (!isOwner(senderJid) && !isMod(senderJid))
      return reply("⛔ Only *Owner* or *Moderator* can use this command.");
    if (!Array.isArray(global.db?.setmod))
      return reply("📋 No moderators found.");

    let target = resolveTarget(m, args);
    if (!target)
      return reply(
        "❌ Reply a user or use:\n.removemod 2348012345678"
      );

    target = await resolveRealJid(ednut, m.chat, target);

    const num = jidToNum(target);
    const jid = target.includes("@s.whatsapp.net") ? target : `${num}@s.whatsapp.net`;
    const before = global.db.setmod.length;

    global.db.setmod = global.db.setmod.filter(
      v => jidToNum(v) !== num
    );

    if (before === global.db.setmod.length)
      return reply(`⚠️ \`\`\`${num}\`\`\` is not a moderator.`);

    global.flushDB?.()?.catch?.(() => {}); // save now, survive restart

    return ednut.sendMessage(
      m.chat,
      {
        text: `\`\`\`${num}\`\`\` ʀᴇᴍᴏᴠᴇᴅ ꜰʀᴏᴍ ᴍᴏᴅ ʟɪꜱᴛ...`,
        mentions: [jid]
      },
      { quoted: m }
    );
  }
},
{
  command: ["modlist"],
  category: "Owner",
  description: "Show moderator list",
  async execute(m, { ednut, reply }) {
    const senderJid = await resolveRealJid(ednut, m.chat, m.sender);

    if (!isOwner(senderJid) && !isMod(senderJid))
      return reply("⛔ Only *Owner* or *Moderator* can use this command.");

    const mods = global.db?.setmod || [];
    if (!mods.length)
      return reply("📋 No moderators have been added.");

    // Normalize every stored entry into a proper number-based JID. If an
    // older/legacy entry was ever stored as a raw @lid before this fix,
    // try to resolve it now using this chat's participant list so it
    // still displays as a real number instead of garbage digits.
    const jids = [];
    for (const v of mods) {
      const resolved = await resolveRealJid(ednut, m.chat, v);
      const num = jidToNum(resolved);
      jids.push(`${num}@s.whatsapp.net`);
    }

    let text = "*ᴍᴏᴅᴇʀᴀᴛᴏʀ ʟɪꜱᴛ*\n";
    jids.forEach((jid, i) => {
      text += `${i + 1}. \`\`\`+${jidToNum(jid)}\`\`\`\n`;
    });
    text += `ᴛᴏᴛᴀʟ: ${jids.length} ᴍᴏᴅᴇʀᴀᴛᴏʀ(ꜱ)`;

    return ednut.sendMessage(
      m.chat,
      {
        text,
        mentions: jids
      },
      { quoted: m }
    );
  }
}
];