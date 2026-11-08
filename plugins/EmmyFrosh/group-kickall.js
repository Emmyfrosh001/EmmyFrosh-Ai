// plugins/EmmyFrosh/group-kickall.js
// FIX: handler.js does NOT pass `groupMetadata`, `groupAdmins` or `sender` to plugins,
// so `groupMetadata.participants` threw a TypeError -> "An error occurred during the operation".
// This version fetches the group data itself and uses the handler's own `isOwner` / `isBotAdmins`.

const digits = v => String(v || "").split("@")[0].split(":")[0].replace(/\D/g, "");

// All identifiers (id / jid / lid / phoneNumber) a participant might be known by
const idsOf = p =>
  [p?.id, p?.jid, p?.lid, p?.phoneNumber].map(digits).filter(Boolean);

const isAdminP = p => p?.admin === "admin" || p?.admin === "superadmin";

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Build the set of digits that must never be removed (bot + owner + the person who ran the command)
function protectedSet(ednut, m) {
  const set = new Set(
    [
      ednut.user?.id,
      ednut.user?.lid,
      ednut.user?.jid,
      global.owner,
      m.sender,
      m.key?.participant,
      m.participant,
    ]
      .map(digits)
      .filter(Boolean)
  );
  if (Array.isArray(global.sudo)) global.sudo.forEach(s => set.add(digits(s)));
  else if (global.sudo) set.add(digits(global.sudo));
  return set;
}

module.exports = [
  {
    command: ["kickall"],
    description: "Remove all non-admin members from the group.",
    category: "group",
    filename: __filename,
    async execute(m, { ednut, from, isGroup, isBotAdmins, isOwner, reply }) {
      try {
        if (!isGroup) return reply("❌ This command can only be used in groups.");
        if (!isOwner && !m.key?.fromMe) return reply("❌ Only the bot owner can use this command.");
        if (!isBotAdmins) return reply("❌ I need to be an admin to execute this command.");

        // Always fetch fresh metadata (handler doesn't pass it in)
        const groupMetadata = await ednut.groupMetadata(from);
        const allParticipants = groupMetadata?.participants || [];
        const keep = protectedSet(ednut, m);

        // Remove only non-admins, and never the bot / owner / sender
        const participantsToRemove = allParticipants.filter(
          p => !isAdminP(p) && !idsOf(p).some(d => keep.has(d))
        );

        if (participantsToRemove.length === 0) {
          return reply("✅ No non-admin members to remove.");
        }

        await reply(`🔄 Starting mass removal: ${participantsToRemove.length} members`);

        let successCount = 0;
        let failCount = 0;

        for (const p of participantsToRemove) {
          try {
            await sleep(Math.floor(Math.random() * 2000) + 2000);
            await ednut.groupParticipantsUpdate(from, [p.id], "remove");
            successCount++;

            if (successCount % 5 === 0) {
              await reply(`Progress: ${successCount}/${participantsToRemove.length} members removed...`);
            }
          } catch (e) {
            console.error(`❌ Failed to remove ${p.id}:`, e?.message || e);
            failCount++;
            await sleep(3000);
          }
        }

        await reply(`✅ Operation Complete!\n• Successfully removed: ${successCount}\n• Failed: ${failCount}`);

        await sleep(3000);
        await ednut.groupLeave(from);
      } catch (e) {
        console.error("❌ Error during mass removal:", e);
        reply("❌ An error occurred during the operation.");
      }
    },
  },

  {
    command: ["kickadmins"],
    description: "Remove all admin members from the group, excluding the bot and bot owner.",
    category: "group",
    filename: __filename,
    async execute(m, { ednut, from, isGroup, isBotAdmins, isOwner, reply }) {
      try {
        if (!isGroup) return reply("❌ This command can only be used in groups.");
        if (!isOwner && !m.key?.fromMe) return reply("❌ Only the bot owner can use this command.");
        if (!isBotAdmins) return reply("❌ I need to be an admin to execute this command.");

        const groupMetadata = await ednut.groupMetadata(from);
        const allParticipants = groupMetadata?.participants || [];
        const keep = protectedSet(ednut, m);

        const adminParticipants = allParticipants.filter(
          p => isAdminP(p) && !idsOf(p).some(d => keep.has(d))
        );

        if (adminParticipants.length === 0) {
          return reply("✅ No admins to remove (excluding bot and bot owner).");
        }

        await reply(`🔄 Removing ${adminParticipants.length} admin members...`);

        let successCount = 0;
        let failCount = 0;

        for (const p of adminParticipants) {
          try {
            await ednut.groupParticipantsUpdate(from, [p.id], "remove");
            successCount++;
            await sleep(2000);
          } catch (e) {
            console.error(`❌ Failed to remove ${p.id}:`, e?.message || e);
            failCount++;
          }
        }

        await reply(`✅ Done!\n• Admins removed: ${successCount}\n• Failed: ${failCount}`);
      } catch (e) {
        console.error("❌ Error removing admins:", e);
        reply("❌ An error occurred while trying to remove admins.");
      }
    },
  },
];