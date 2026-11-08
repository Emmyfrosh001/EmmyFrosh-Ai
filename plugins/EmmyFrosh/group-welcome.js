/**
 * Group Configuration Plugin
 * Controls welcome/goodbye messages and promote/demote notifications in groups.
 * Features:
 * - Enable/disable welcome/goodbye system
 * - Set custom welcome/goodbye messages
 * - Enable promote/demote alerts (pdm)
 * 
 * Template Variables:
 *   @user  → Mention of new/left user
 *   @group → Group name
 *   @desc  → Group description
 *   @date  → Date (DD/MM/YYYY)
 *   @time  → Time (HH:mm:ss)
 *   @count → Member count
 *   @pp    → User profile picture
 */

module.exports = [
  {
    command: ["welcome"],
    description: "Enable or disable welcome messages in a group",
    category: "Group",
    group: true,
    gcban: true,
    ban: true,
    execute: async (m, { isAdmins, isOwner, args, reply }) => {
      if (!(isAdmins || isOwner)) return reply("❌ This command is for admins only.");
      if (args.length < 1) return reply("Example: .welcome on/off");

      if (!global.db.groups[m.chat]) global.db.groups[m.chat] = {};

      if (args[0] === "on") {
        if (global.db.groups[m.chat].welcome) return reply("Already on");
        global.db.groups[m.chat].welcome = true;
        reply("_Welcome system activated._");
      } else if (args[0] === "off") {
        if (!global.db.groups[m.chat].welcome) return reply("Already off");
        global.db.groups[m.chat].welcome = false;
        reply("_Welcome system deactivated._");
      }
    }
  },

  {
    command: ["goodbye"],
    description: "Enable or disable goodbye messages in a group",
    category: "Group",
    group: true,
    gcban: true,
    ban: true,
    execute: async (m, { isAdmins, isOwner, args, reply }) => {
      if (!(isAdmins || isOwner)) return reply("❌ This command is for admins only.");
      if (args.length < 1) return reply("Example: .goodbye on/off");

      if (!global.db.groups[m.chat]) global.db.groups[m.chat] = {};

      if (args[0] === "on") {
        if (global.db.groups[m.chat].goodbye) return reply("Already on");
        global.db.groups[m.chat].goodbye = true;
        reply("_Goodbye system activated._");
      } else if (args[0] === "off") {
        if (!global.db.groups[m.chat].goodbye) return reply("Already off");
        global.db.groups[m.chat].goodbye = false;
        reply("_Goodbye system deactivated._");
      }
    }
  },

  {
    command: ["pdm"],
    description: "Enable or disable promote/demote tag notifications",
    category: "Group",
    group: true,
    gcban: true,
    ban: true,
    execute: async (m, { isAdmins, isOwner, args, reply }) => {
      if (!(isAdmins || isOwner)) return reply("❌ This command is for admins only.");
      if (args.length < 1) return reply("Example: .pdm on/off");

      if (!global.db.groups[m.chat]) global.db.groups[m.chat] = {};

      if (args[0] === "on") {
        if (global.db.groups[m.chat].events) return reply("Already on");
        global.db.groups[m.chat].events = true;
        reply("_PDM (promote/demote notifications) enabled._");
      } else if (args[0] === "off") {
        if (!global.db.groups[m.chat].events) return reply("Already off");
        global.db.groups[m.chat].events = false;
        reply("_PDM disabled._");
      }
    }
  },

  {
    command: ["setwelcome"],
    description: "Set a custom welcome message",
    category: "Group",
    group: true,
    gcban: true,
    ban: true,

    async execute(m, { isAdmins, isOwner, prefix, reply }) {
      if (!(isAdmins || isOwner)) return reply("❌ This command is for admins only.");

      const body = m.body || m.text || "";
      const q = body.includes(" ") ? body.slice(body.indexOf(" ") + 1).trim() : "";

      if (!q) {
        return reply(
          `Usage: ${prefix}setwelcome <message>\n\n` +
          `📌 You can use the following templates:\n` +
          `- @user → Mention the user\n` +
          `- @group → Group name\n` +
          `- @desc → Group description\n` +
          `- @date → Current date\n` +
          `- @time → Current time\n` +
          `- @count → Member count\n` +
          `- @pp → User profile picture\n\n` +
          `✨ Example:\n.setwelcome 👋 Hello @user, welcome to *@group*! We are now @count members 🎉\nOr with profile picture:\n.setwelcome @pp 👋 Welcome @user to @group!`
        );
      }

      if (!global.db.groups[m.chat]) global.db.groups[m.chat] = {};
      global.db.groups[m.chat].setwelcome = q;

      reply("✅ Custom welcome message saved.");
    }
  },

  {
    command: ["getwelcome"],
    description: "Show the current welcome message",
    category: "Group",
    group: true,
    gcban: true,
    ban: true,

    async execute(m, { isAdmins, isOwner, reply }) {
      if (!(isAdmins || isOwner)) return reply("❌ This command is for admins only.");

      const groupData = global.db.groups[m.chat] || {};
      if (!groupData.setwelcome) {
        return reply("⚠️ No custom welcome message set. Use `.setwelcome` to create one.");
      }

      reply("📌 Current Welcome Message:\n\n" + groupData.setwelcome);
    }
  },

  {
    command: ["setgoodbye"],
    description: "Set a custom goodbye message",
    category: "Group",
    group: true,
    gcban: true,
    ban: true,

    async execute(m, { isAdmins, isOwner, prefix, reply }) {
      if (!(isAdmins || isOwner)) return reply("❌ This command is for admins only.");

      const body = m.body || m.text || "";
      const q = body.includes(" ") ? body.slice(body.indexOf(" ") + 1).trim() : "";

      if (!q) {
        return reply(
          `Usage: ${prefix}setgoodbye <message>\n\n` +
          `📌 You can use the following templates:\n` +
          `- @user → Mention the user\n` +
          `- @group → Group name\n` +
          `- @desc → Group description\n` +
          `- @date → Current date\n` +
          `- @time → Current time\n` +
          `- @count → Member count\n` +
          `- @pp → User profile picture\n\n` +
          `✨ Example:\n.setgoodbye 👋 Bye @user, you left *@group* on @date at @time.\nOr with profile picture:\n.setgoodbye @pp Goodbye @user!`
        );
      }

      if (!global.db.groups[m.chat]) global.db.groups[m.chat] = {};
      global.db.groups[m.chat].setgoodbye = q;

      reply("✅ Custom goodbye message saved.");
    }
  },

  {
    command: ["getgoodbye"],
    description: "Show the current goodbye message",
    category: "Group",
    group: true,
    gcban: true,
    ban: true,

    async execute(m, { isAdmins, isOwner, reply }) {
      if (!(isAdmins || isOwner)) return reply("❌ This command is for admins only.");

      const groupData = global.db.groups[m.chat] || {};
      if (!groupData.setgoodbye) {
        return reply("⚠️ No custom goodbye message set. Use `.setgoodbye` to create one.");
      }

      reply("📌 Current Goodbye Message:\n\n" + groupData.setgoodbye);
    }
  }
];