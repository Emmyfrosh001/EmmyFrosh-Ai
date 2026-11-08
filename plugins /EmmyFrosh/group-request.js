const fs = require("fs");
const path = require("path");

/* ───────────────────────── storage (auto-reject rules) ───────────────────────── */
const RULES_FILE = path.join(process.cwd(), "database", "join-rules.json");

const loadAll = () => {
  try {
    return JSON.parse(fs.readFileSync(RULES_FILE, "utf8"));
  } catch {
    return {};
  }
};
const saveAll = (data) => {
  try {
    fs.mkdirSync(path.dirname(RULES_FILE), { recursive: true });
    fs.writeFileSync(RULES_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[joinrequests] could not save rules:", e.message);
  }
};
const getRules = (gid) => {
  const r = loadAll()[gid] || {};
  return { numbers: r.numbers || [], prefixes: r.prefixes || [] };
};
const setRules = (gid, rules) => {
  const all = loadAll();
  if (!rules.numbers.length && !rules.prefixes.length) delete all[gid];
  else all[gid] = rules;
  saveAll(all);
};

/* ───────────────────────── helpers ───────────────────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SMALL = {
  a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ꜰ", g: "ɢ", h: "ʜ", i: "ɪ", j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ",
  n: "ɴ", o: "ᴏ", p: "ᴘ", q: "ǫ", r: "ʀ", s: "ꜱ", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ",
};
const smallCaps = (s) => String(s).replace(/[a-z]/gi, (c) => SMALL[c.toLowerCase()] || c);
const digits = (s) => String(s || "").replace(/\D/g, "");
const bare = (jid) => String(jid || "").split("@")[0].split(":")[0];

const matchesRules = (number, rules) =>
  rules.numbers.includes(number) || rules.prefixes.some((p) => number.startsWith(p));

const fmtTime = (t) => {
  if (!t) return "N/A";
  const n = Number(t);
  const d = new Date(n > 1e12 ? n : n * 1000);
  return d.toLocaleString("en-US", { timeZone: "Africa/Lagos" });
};

// Turn the @lid that WhatsApp gives us into a real phone number when possible
async function resolvePhone(ednut, u) {
  const direct = u.phone_number || u.phoneNumber || u.pn;
  if (direct) return { number: bare(direct), resolved: true };

  if (String(u.jid || "").endsWith("@s.whatsapp.net")) {
    return { number: bare(u.jid), resolved: true };
  }

  try {
    const pn = await ednut.signalRepository?.lidMapping?.getPNForLID?.(u.jid);
    if (pn) return { number: bare(pn), resolved: true };
  } catch {}

  return { number: bare(u.jid), resolved: false };
}

async function fetchRequests(ednut, chat) {
  const raw = (await ednut.groupRequestParticipantsList(chat)) || [];
  const out = [];
  for (const u of raw) {
    if (!u?.jid) continue;
    const { number, resolved } = await resolvePhone(ednut, u);
    out.push({
      jid: u.jid, // always use this one for approve / reject
      number,
      resolved,
      method: u.request_method || u.method || "unknown",
      time: u.request_time || u.time,
    });
  }
  return out;
}

const label = (i) => `+${i.number}${i.resolved ? "" : " ⚠️"}`;
const unresolvedNote = (items) =>
  items.some((i) => !i.resolved)
    ? "\n⚠️ _WhatsApp did not reveal the real number for these (LID shown)._"
    : "";

function getArgs(ctx, m) {
  if (Array.isArray(ctx.args)) return ctx.args.map(String);
  const t = ctx.text ?? ctx.q ?? "";
  if (t) return String(t).trim().split(/\s+/).filter(Boolean);
  return [];
}

// "all" | "+234" → country code | "+2349060724789" → exact number
// bare "5" (1-2 digits) → count | bare "234" (3 digits) → country code | bare 7+ digits → exact number
// inside a list ("234, 44, +1"), 1-3 digit items are always country codes
function parseTarget(arg, inList = false) {
  if (!arg) return null;
  if (arg.toLowerCase() === "all") return { type: "all" };

  const d = digits(arg);
  if (!d) return null;

  if (arg.startsWith("+")) {
    return d.length <= 4 ? { type: "prefix", value: d } : { type: "number", value: d };
  }
  if (/^\d+$/.test(arg)) {
    if (d.length <= 2) return inList ? { type: "prefix", value: d } : { type: "count", n: parseInt(d, 10) };
    if (d.length === 3) return { type: "prefix", value: d };
    if (d.length >= 7) return { type: "number", value: d };
  }
  return null;
}

// ".reject 234, 334, +2349060724789" → [prefix 234, prefix 334, number 2349060724789]
function parseTargets(argv) {
  const tokens = argv.join(" ").split(/[,\s]+/).filter(Boolean);
  if (!tokens.length) return null;
  if (tokens.length === 1) {
    const t = parseTarget(tokens[0]);
    return t ? [t] : null;
  }
  const list = tokens.map((x) => parseTarget(x, true));
  if (list.some((t) => !t || t.type === "all" || t.type === "count")) return null;
  return list;
}

function selectMany(items, targets) {
  if (targets.length === 1) return select(items, targets[0]);
  const seen = new Set();
  return targets.flatMap((t) => select(items, t)).filter((i) => !seen.has(i.jid) && seen.add(i.jid));
}

function select(items, t) {
  switch (t.type) {
    case "all":
      return items;
    case "count":
      return items.slice(0, t.n);
    case "prefix":
      return items.filter((i) => i.resolved && i.number.startsWith(t.value));
    case "number":
      return items.filter((i) => i.resolved && i.number === t.value);
    default:
      return [];
  }
}

async function applyAction(ednut, chat, items, action) {
  const done = [];
  const failed = [];
  for (const i of items) {
    try {
      await ednut.groupRequestParticipantsUpdate(chat, [i.jid], action);
      done.push(i);
    } catch (e) {
      console.error(`[joinrequests] ${action} failed for ${i.jid}:`, e.message);
      failed.push(i);
    }
    await sleep(500); // avoid rate limit
  }
  return { done, failed };
}

async function checkAccess(m, ctx, what) {
  const { isGroup, isAdmins, isBotAdmins, reply } = ctx;
  if (!isGroup) return reply("❌ This command can only be used in groups."), false;
  if (!isAdmins) return reply("❌ Only group admins can use this command."), false;
  if (!isBotAdmins) return reply(`❌ I need to be an admin to ${what}.`), false;
  if (typeof ctx.ednut.groupRequestParticipantsList !== "function") {
    return reply("❌ Your Baileys version does not support join requests. Please update the bot."), false;
  }
  return true;
}

/* ───────────────────────── auto-reject on new join request ───────────────────────── */
function attachJoinGuard(ednut) {
  if (!ednut || ednut.__joinGuardAttached) return;
  ednut.__joinGuardAttached = true;

  ednut.ev.on("group.join-request", async (ev) => {
    try {
      if (ev.action !== "created") return;
      const rules = getRules(ev.id);
      if (!rules.numbers.length && !rules.prefixes.length) return;

      const { number, resolved } = await resolvePhone(ednut, {
        jid: ev.participant,
        phone_number: ev.participantPn,
      });
      if (!resolved) return;

      if (matchesRules(number, rules)) {
        await ednut.groupRequestParticipantsUpdate(ev.id, [ev.participant], "reject");
        console.log(`[joinrequests] auto-rejected +${number} in ${ev.id}`);
      }
    } catch (e) {
      console.error("[joinrequests] auto-reject error:", e.message);
    }
  });

  // Someone joined directly (approval off, invite link, added by a member...) → kick if blocked
  ednut.ev.on("group-participants.update", async (ev) => {
    try {
      if (ev.action !== "add") return;
      const rules = getRules(ev.id);
      if (!rules.numbers.length && !rules.prefixes.length) return;

      const botIds = [bare(ednut.user?.id), bare(ednut.user?.lid)].filter(Boolean);
      let meta = null;
      const getMeta = async () => (meta = meta || (await ednut.groupMetadata(ev.id)));
      const findIn = (m, jid) => m.participants.find((x) => x.id === jid || x.lid === jid);

      for (const p of ev.participants || []) {
        const jid = typeof p === "string" ? p : p.id || p.jid;
        if (!jid || botIds.includes(bare(jid))) continue;

        let r = await resolvePhone(ednut, {
          jid,
          phone_number: typeof p === "object" ? p.phoneNumber || p.phone_number : null,
        });

        // fall back to the group's participant list, which carries phone numbers for LID members
        if (!r.resolved) {
          const found = findIn(await getMeta(), jid);
          const pn = found?.phoneNumber || (String(found?.id).endsWith("@s.whatsapp.net") ? found.id : null);
          if (pn) r = { number: bare(pn), resolved: true };
        }
        if (!r.resolved || !matchesRules(r.number, rules)) continue;

        const found = findIn(await getMeta(), jid);
        if (found?.admin) continue; // never kick admins

        await ednut.groupParticipantsUpdate(ev.id, [jid], "remove");
        console.log(`[joinrequests] removed +${r.number} from ${ev.id}`);
        await sleep(500);
      }
    } catch (e) {
      console.error("[joinrequests] auto-kick error:", e.message);
    }
  });
}

/* ───────────────────────── command bodies ───────────────────────── */
async function doRequestList(m, ctx) {
  const { ednut, reply } = ctx;
  try {
    attachJoinGuard(ednut);
    if (!(await checkAccess(m, ctx, "view join requests"))) return;

    const argv = getArgs(ctx, m);
    const items = await fetchRequests(ednut, m.chat);
    if (!items.length) return reply("ℹ️ No pending join requests.");

    // .request info
    if (["info", "details", "detail"].includes((argv[0] || "").toLowerCase())) {
      let text = `° ${smallCaps("Join Request List")}:\n`;
      items.forEach((i, idx) => {
        const jid = `_${i.number}_${i.resolved ? "" : " ⚠️"}`;
        const time = fmtTime(i.time).replace(/[\s\u202f]*(AM|PM)$/i, (_, ap) => ` ${smallCaps(ap)}`);
        text +=
          `\n${smallCaps("No.")} ${idx + 1}` +
          `\n${smallCaps("JID")}: ${jid}` +
          `\n${smallCaps("Method")}: ${smallCaps(i.method)}` +
          `\n${smallCaps("Time")}: ${time}\n`;
      });
      return reply(text + unresolvedNote(items));
    }

    // .request
    let text = `📋 *ᴘᴇɴᴅɪɴɢ ᴊᴏɪɴ ʀᴇǫᴜᴇꜱᴛꜱ (${items.length})*\n\n`;
    items.forEach((i, idx) => {
      text += `${idx + 1}.  _+${i.number}_${i.resolved ? "" : " ⚠️"}\n`;
    });
    return reply(text + unresolvedNote(items));
  } catch (error) {
    console.error("Request list error:", error);
    return reply("❌ Failed to fetch join requests.");
  }
}

async function doAccept(m, ctx, forceAll = false) {
  const { ednut, reply } = ctx;
  try {
    attachJoinGuard(ednut);
    if (!(await checkAccess(m, ctx, "accept join requests"))) return;

    const argv = getArgs(ctx, m);
    const target = forceAll ? { type: "all" } : parseTarget(argv[0]);

    if (!target) {
      return reply(
        "❓ *How many should I accept?*\n\n" +
          "• `.accept 5` → accept the first 5\n" +
          "• `.accept all` → accept everyone\n" +
          "• `.accept +234` → accept numbers starting with +234\n" +
          "• `.accept +2349060724789` → accept only that number"
      );
    }

    const items = await fetchRequests(ednut, m.chat);
    if (!items.length) return reply("ℹ️ No pending join requests to approve.");

    const picked = select(items, target);
    if (!picked.length) return reply("ℹ️ No pending request matches that.");

    const { done, failed } = await applyAction(ednut, m.chat, picked, "approve");
    let text = `✅ ${smallCaps("Approved")} ${done.length} successfully`;
    if (failed.length) text += `\n❌ ${smallCaps("Failed")}: ${failed.length}`;
    return reply(text);
  } catch (error) {
    console.error("[joinrequests] accept failed:", error);
    return reply("❌ Failed to accept join requests.\n\nError: ```" + (error?.message || error) + "```");
  }
}

async function doReject(m, ctx, forceAll = false) {
  const { ednut, reply } = ctx;
  try {
    attachJoinGuard(ednut);
    if (!(await checkAccess(m, ctx, "reject join requests"))) return;

    const argv = getArgs(ctx, m);
    const first = (argv[0] || "").toLowerCase();

    // .reject list → show auto-reject rules
    if (!forceAll && ["list", "rules", "blocklist"].includes(first)) {
      const r = getRules(m.chat);
      if (!r.numbers.length && !r.prefixes.length) return reply("ℹ️ The auto-reject list is empty.");
      let text = "🚫 *ᴀᴜᴛᴏ-ʀᴇᴊᴇᴄᴛ ʟɪꜱᴛ*\n";
      if (r.prefixes.length) text += `\n*Country codes*\n${r.prefixes.map((p) => `• +${p}`).join("\n")}\n`;
      if (r.numbers.length) text += `\n*Numbers*\n${r.numbers.map((n) => `• +${n}`).join("\n")}\n`;
      return reply(text);
    }

    // .reject clear all | .reject clear +234 | .reject clear +2349060724789
    if (!forceAll && first === "clear") {
      const what = argv[1];
      if (!what) {
        return reply(
          "❓ *What should I clear?*\n\n" +
            "• `.reject clear all` → empty the auto-reject list\n" +
            "• `.reject clear +2349060724789` → remove one number\n" +
            "• `.reject clear +234` → remove a country code"
        );
      }
      if (what.toLowerCase() === "all") {
        setRules(m.chat, { numbers: [], prefixes: [] });
        return reply("✅ Auto-reject list cleared.");
      }
      const ts = parseTargets(argv.slice(1));
      if (!ts || ts.some((t) => t.type !== "number" && t.type !== "prefix")) {
        return reply("❌ Give me numbers like +2349060724789 or country codes like +234 (use + for 1-2 digit codes, e.g. +44).");
      }
      const r = getRules(m.chat);
      const removed = [];
      for (const t of ts) {
        const key = t.type === "number" ? "numbers" : "prefixes";
        if (r[key].includes(t.value)) {
          r[key] = r[key].filter((x) => x !== t.value);
          removed.push("+" + t.value);
        }
      }
      if (!removed.length) return reply("ℹ️ None of those are on the auto-reject list.");
      setRules(m.chat, r);
      return reply(`✅ Removed from the auto-reject list: ${removed.join(", ")}`);
    }

    // normal reject
    const targets = forceAll ? [{ type: "all" }] : parseTargets(argv);
    if (!targets) {
      return reply(
        "❓ *How many should I reject?*\n\n" +
          "• `.reject 5` → reject the first 5 pending\n" +
          "• `.reject all` → reject everyone pending\n" +
          "• `.reject +234` or `.reject 234` → block that country code\n" +
          "• `.reject 234, 334, +44` → block several codes\n" +
          "• `.reject +2349060724789` → block that exact number\n\n" +
          "Blocked codes/numbers are rejected when they request to join, and *kicked out if they join directly* (even with approval off).\n\n" +
          "• `.reject list` → see the block list\n" +
          "• `.reject clear all` / `.reject clear +234` → remove from it"
      );
    }

    // codes / numbers go on the persistent block list
    const ruleTargets = targets.filter((t) => t.type === "prefix" || t.type === "number");
    let ruleNote = "";
    if (ruleTargets.length) {
      const r = getRules(m.chat);
      for (const t of ruleTargets) {
        const key = t.type === "number" ? "numbers" : "prefixes";
        if (!r[key].includes(t.value)) r[key].push(t.value);
      }
      setRules(m.chat, r);
      ruleNote = ruleTargets.map((t) => "+" + t.value).join(", ");
    }

    let items = [];
    try {
      items = await fetchRequests(ednut, m.chat);
    } catch (e) {
      // group may not use join approval; the block list is still saved
      if (!ruleTargets.length) throw e;
    }
    const picked = selectMany(items, targets);

    if (!picked.length) {
      if (ruleNote) return reply(`✅ ${smallCaps("Blocked")} ${ruleNote} successfully`);
      return reply(items.length ? "ℹ️ No pending request matches that." : "ℹ️ No pending join requests to reject.");
    }

    const { done, failed } = await applyAction(ednut, m.chat, picked, "reject");
    let text = `✅ ${smallCaps("Rejected")} ${done.length} successfully`;
    if (failed.length) text += `\n❌ ${smallCaps("Failed")}: ${failed.length}`;
    return reply(text);
  } catch (error) {
    console.error("[joinrequests] reject failed:", error);
    return reply("❌ Failed to reject join requests.\n\nError: ```" + (error?.message || error) + "```");
  }
}

/* ───────────────────────── exports ───────────────────────── */
module.exports = [
  {
    command: ["request"],
    alias: ["requestlist", "joinrequests"],
    description: "Shows pending group join requests (.request info for details)",
    category: "Group",
    group: true,
    execute: (m, ctx) => doRequestList(m, ctx),
  },
  {
    command: ["accept"],
    alias: ["approve"],
    description: "Accept join requests: .accept 5 | .accept all | .accept +234",
    category: "Group",
    group: true,
    execute: (m, ctx) => doAccept(m, ctx),
  },
  {
    command: ["reject"],
    alias: ["unapprove"],
    description: "Reject join requests: .reject 5 | all | +234 | +number | list | clear all",
    category: "Group",
    group: true,
    execute: (m, ctx) => doReject(m, ctx),
  },
];

// Optional: call this once after your socket connects so auto-reject works
// even before anyone uses a command, e.g. require(".../joinrequests").attachJoinGuard(ednut)
module.exports.attachJoinGuard = attachJoinGuard;