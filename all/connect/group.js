const moment = require("moment-timezone");
const { invalidateGroupMetadataCache } = require("../../handler");

const handledGroupEvents = new Set();
const DEFAULT_PP = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png";

let onGroupParticipantsUpdate;

const normalizeJid = (jid) => {
  if (!jid) return null;
  if (typeof jid === "object" && jid.phoneNumber) {
    return jid.phoneNumber.includes("@") ? jid.phoneNumber : `${jid.phoneNumber}@s.whatsapp.net`;
  }
  if (typeof jid === "string") {
    if (jid.includes("@g.us") || jid.includes("@s.whatsapp.net")) return jid;
    if (!jid.includes("@")) return `${jid}@s.whatsapp.net`;
    return jid;
  }
  return null;
};

const normalizeGroupId = (id) => {
  if (!id) return null;
  if (id.includes("@g.us")) return id;
  if (id.includes("@")) return id;
  return `${id}@g.us`;
};

const toSmallCaps = (text) => {
  const map = {
    a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',
    k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',
    u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'
  };
  return text.split('').map(c => map[c.toLowerCase()] || c).join('');
};

module.exports = function groupParticipantsUpdate(ednut) {

  if (onGroupParticipantsUpdate) {
    ednut.ev.off("group-participants.update", onGroupParticipantsUpdate);
  }

  onGroupParticipantsUpdate = async (anu) => {
    try {
      const groupId = normalizeGroupId(anu.id);

      // ── CACHE INVALIDATION ───────────────────────────────
      // handler.js caches groupMetadata() for up to 5 minutes to avoid a
      // network round-trip on every message (used to compute isAdmins /
      // isBotAdmins for every command). Any add/remove/promote/demote here
      // makes that cache stale immediately — without this, a freshly
      // promoted admin could be told "you need to be an admin" for up to
      // 5 minutes after actually being promoted. Drop it unconditionally,
      // before the dedup/early-return below, so it fires even on the
      // rare chance this same event somehow got queued twice.
      invalidateGroupMetadataCache(groupId);

      const eventKey = `${groupId}-${anu.action}-${anu.participants?.join(",")}`;

      if (handledGroupEvents.has(eventKey)) return;
      handledGroupEvents.add(eventKey);
      setTimeout(() => handledGroupEvents.delete(eventKey), 10000);

      // ── DB INIT ──────────────────────────────────────────
      if (!global.db) global.db = {};
      if (!global.db.groups) global.db.groups = {};
      if (!global.db.groups[groupId]) global.db.groups[groupId] = {};

      let metadata;
      try {
        metadata = await ednut.groupMetadata(groupId);
      } catch (e) {
        if (e?.message?.includes("forbidden") || e?.output?.statusCode === 428) return;
        console.error("Failed to get group metadata:", e);
        return;
      }

      const groupName = metadata.subject;
      const desc      = metadata.desc || "No description.";
      const date      = moment().tz("Africa/Lagos").format("DD/MM/YYYY");
      const time      = moment().tz("Africa/Lagos").format("HH:mm:ss");
      const count     = metadata.participants.length;

      // ── FEATURE FLAGS ────────────────────────────────────
      const eventsEnabled        = global.db.groups[groupId]?.events        === true || process.env.EVENTS  === "true";
      const welcomeEnabled       = global.db.groups[groupId]?.welcome       === true || process.env.WELCOME === "true";
      const goodbyeEnabled       = global.db.groups[groupId]?.goodbye       === true || process.env.GOODBYE === "true";
      // antipromotion = protects against DEMOTION (re-promotes back)
      const antiPromotionEnabled = global.db.groups[groupId]?.antipromotion === true;
      // antidemotion = protects against PROMOTION (demotes back)
      const antiDemotionEnabled  = global.db.groups[groupId]?.antidemotion  === true;

      const botId = ednut.user.id;

      // ── AUTHOR ───────────────────────────────────────────
      const authorJid  = normalizeJid(anu.author);
      const authorTag  = authorJid ? `@${authorJid.split("@")[0]}` : toSmallCaps("unknown");
      let   authorName = toSmallCaps("unknown");
      if (authorJid) {
        try { authorName = await ednut.getName(authorJid) || authorName; } catch {}
      }

      for (const participant of anu.participants) {
        const jid = normalizeJid(
          typeof participant === "object"
            ? (participant.phoneNumber || participant.id || participant)
            : participant
        );
        if (!jid) continue;

        let pp = DEFAULT_PP;
        try { pp = await ednut.profilePictureUrl(jid, "image"); } catch {}

        let userName = jid.split("@")[0];
        try { userName = await ednut.getName(jid) || userName; } catch {}

        const userTag = `@${jid.split("@")[0]}`;

        const replaceVars = (template) => template
          .replace(/@user/gi, userTag)
          .replace(/@name/gi, userName)
          .replace(/@group/gi, groupName)
          .replace(/@desc/gi, desc)
          .replace(/@date/gi, date)
          .replace(/@time/gi, time)
          .replace(/@count/gi, count.toString());

        // ── WELCOME ──────────────────────────────────────
        if (anu.action === "add" && welcomeEnabled) {
          let tmpl = global.db.groups[groupId]?.setwelcome || process.env.WELCOME_MSG ||
            `👋 Hello @user, welcome to *@group*!\n@desc\nJoined: @time on @date`;
          const hasPP = tmpl.includes("@pp");
          tmpl = tmpl.replace(/@pp/gi, "").trim();
          const msg = replaceVars(tmpl);
          await ednut.sendMessage(groupId, hasPP
            ? { image: { url: pp }, caption: msg, mentions: [jid] }
            : { text: msg, mentions: [jid] });
        }

        // ── GOODBYE ──────────────────────────────────────
        if (anu.action === "remove" && goodbyeEnabled) {
          let tmpl = global.db.groups[groupId]?.setgoodbye || process.env.GOODBYE_MSG ||
            `👋 @user left *@group*`;
          const hasPP = tmpl.includes("@pp");
          tmpl = tmpl.replace(/@pp/gi, "").trim();
          const msg = replaceVars(tmpl);
          await ednut.sendMessage(groupId, hasPP
            ? { image: { url: pp }, caption: msg, mentions: [jid] }
            : { text: msg, mentions: [jid] });
        }

        // ── PROMOTE ACTION ───────────────────────────────
        if (anu.action === "promote") {

          // .events on → notification only
          if (eventsEnabled) {
            await ednut.sendMessage(groupId, {
              text: `🎉 ${userTag} ${toSmallCaps("has been promoted to admin by")} ${authorTag}`,
              mentions: [jid, authorJid].filter(Boolean)
            });
          }

          // .antidemotion on → someone promoted? demote them back + notify
          if (antiDemotionEnabled && authorJid !== botId) {
            await ednut.groupParticipantsUpdate(groupId, [jid], "demote");
            invalidateGroupMetadataCache(groupId);
            await ednut.sendMessage(groupId, {
              text: `🚫 ${userTag} ${toSmallCaps("was promoted by")} ${authorTag} ${toSmallCaps("but has been automatically demoted. anti-demotion is active in this group.")}`,
              mentions: [jid, authorJid].filter(Boolean)
            });
          }
        }

        // ── DEMOTE ACTION ────────────────────────────────
        if (anu.action === "demote") {

          // .events on → notification only
          if (eventsEnabled) {
            await ednut.sendMessage(groupId, {
              text: `⬇️ ${userTag} ${toSmallCaps("has been demoted from admin by")} ${authorTag}`,
              mentions: [jid, authorJid].filter(Boolean)
            });
          }

          // .antipromotion on → someone demoted? re-promote them back + notify
          if (antiPromotionEnabled && authorJid !== botId) {
            await ednut.groupParticipantsUpdate(groupId, [jid], "promote");
            invalidateGroupMetadataCache(groupId);
            await ednut.sendMessage(groupId, {
              text: `🛡️ ${userTag} ${toSmallCaps("was demoted by")} ${authorTag} ${toSmallCaps("but has been automatically re-promoted. anti-promotion is active in this group.")}`,
              mentions: [jid, authorJid].filter(Boolean)
            });
          }
        }

      }

    } catch (err) {
      console.error("Group update handler error:", err);
    }
  };

  ednut.ev.on("group-participants.update", onGroupParticipantsUpdate);
};
