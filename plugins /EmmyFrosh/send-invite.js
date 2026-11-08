module.exports = [
  {
    command: ["sendinvite"], // only ONE main command
    alias: ["send-invite"],  // put the rest here
    description: "Invite a user to the group via link",
    category: "Group",
    use: "<phone number>",
    filename: __filename,
    async execute(m, { ednut, from, text, isGroup, isBotAdmins, isAdmins, reply }) {
      try {
        // ✅ Must be used in group
        if (!isGroup) return reply("❌ This command can only be used *in a group chat*.");

        // ✅ Only group admins allowed
        if (!isAdmins) return reply("❌ Only group admins can use this command.");

        // ✅ Bot must be admin to get group invite code
        if (!isBotAdmins) return reply("❌ I need to be *admin* in this group to generate invite links.");

        // ✅ Validate phone number input
        if (!text) {
          return reply(
            `❌ *Please enter the number you want to invite.*\n\n` +
            `📌 *Example:*\n` +
            `*.sendinvite 234813XXXXXXX*\n\n` +
            `💡 Use *.invite* to get the group link manually.`
          );
        }

        // ✅ Clean number input
        let number = text.replace(/\D/g, ""); // remove non-digits
        if (number.length < 8) return reply("⚠️ *Enter a valid number with country code.*");

        // ✅ Check if user exists on WhatsApp
        let [exists] = await ednut.onWhatsApp(number + "@s.whatsapp.net");
        if (!exists?.exists) return reply("❌ This number is not registered on WhatsApp.");

        // ✅ Generate group invite link
        let code = await ednut.groupInviteCode(from);
        let link = `https://chat.whatsapp.com/${code}`;

        // ✅ Try sending invite in DM
        await ednut.sendMessage(`${number}@s.whatsapp.net`, {
          text:
            `📩 *GROUP INVITATION*\n\n` +
            `👤 *Sender:* @${m.sender.split("@")[0]}\n` +
            `💬 *Group ID:* ${from}\n\n` +
            `🔗 ${link}`,
          mentions: [m.sender],
        }).catch(err => {
          console.error("DM failed:", err);
          return reply("❌ Could not send DM. Maybe the user has privacy settings enabled.");
        });

        reply("✅ *Group invite link has been sent successfully!*");

      } catch (e) {
        console.error("Error in sendinvite command:", e);
        reply(`⚠️ *Error:* ${e?.message || e}`);
      }
    }
  }
];