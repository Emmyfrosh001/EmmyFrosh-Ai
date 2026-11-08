// ================================================================
// 🛡️ ANTI-STATUS TAG HANDLER — all/connect/antistatustag.js
// ✅ FIX: Bot now replies (quotes) the actual tagged message in all
//         notification messages, instead of sending a plain text mention.
//         Note: the offending message is deleted first, so we build
//         a synthetic quoted reference using its key/sender so the
//         reply still visually links to the original message bubble.
// ================================================================

const toSmallCaps = (str = "") => {
  const map = {
    a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',
    k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',
    u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ',
    '0':'0','1':'1','2':'2','3':'3','4':'4',
    '5':'5','6':'6','7':'7','8':'8','9':'9'
  }
  return str.toLowerCase().split('').map(c => map[c] || c).join('')
}


// ── Deep scan: finds status / story group-mention payloads wherever
// WhatsApp nests them (ephemeral, viewOnce, documentWithCaption,
// associatedChildMessage, protocolMessage, etc.).
// contextInfo is skipped so replying to / quoting an old status
// mention never triggers a false positive.
const hasStatusMention = (obj, depth = 0) => {
  if (!obj || typeof obj !== "object" || depth > 6) return false
  for (const key of Object.keys(obj)) {
    if (key === "contextInfo" || key === "quotedMessage") continue
    const k = key.toLowerCase()
    if (k.includes("statusmention") || k.includes("groupstatus") || k.includes("storymention")) return true
    if (hasStatusMention(obj[key], depth + 1)) return true
  }
  return false
}


// ── Group STATUS POST detection (the post that shows in the group's
// profile/status). WhatsApp flags these with contextInfo.isGroupStatus
// (same flag togc uses) or wraps them in groupStatusMessage*.
// quotedMessage is skipped so replying to an old post never triggers.
const isGroupStatusPost = (obj, depth = 0) => {
  if (!obj || typeof obj !== "object" || depth > 6) return false
  const ci = obj.contextInfo
  if (ci && (ci.isGroupStatus === true || ci.isGroupStatus === 1)) return true
  for (const key of Object.keys(obj)) {
    if (key === "quotedMessage") continue
    if (key.toLowerCase().includes("groupstatus")) return true
    if (isGroupStatusPost(obj[key], depth + 1)) return true
  }
  return false
}

// ── Delete helper: tries the normal revoke, then a raw protocol revoke
const deleteMsg = async (sock, jid, key, sender) => {
  try {
    await sock.sendMessage(jid, { delete: { ...key, remoteJid: jid, fromMe: false, participant: sender } })
    return true
  } catch (e1) {
    try {
      await sock.relayMessage(jid, {
        protocolMessage: { key: { ...key, remoteJid: jid, fromMe: false, participant: sender }, type: 0 }
      }, {})
      return true
    } catch (e2) {
      log("WARN", `[AntiStatusTag] Delete failed: ${e2?.message || e1?.message || e2}`)
      return false
    }
  }
}


// ── Build a quote reference that ALWAYS renders as a reply bubble.
// Status-mention / group-status payloads have no previewable content, so
// WhatsApp silently drops the quote. We unwrap to the real content when
// there is some (photo, video, text...) and otherwise fall back to a
// small text stand-in so the notice still shows as a reply to the post.
const PREVIEWABLE = [
  "conversation", "extendedTextMessage", "imageMessage", "videoMessage",
  "audioMessage", "stickerMessage", "documentMessage", "contactMessage", "locationMessage"
]
const buildQuoted = (m, sender) => {
  let msg = m.message || {}
  // unwrap wrappers (up to a few levels)
  for (let i = 0; i < 4; i++) {
    const nxt =
      msg.ephemeralMessage?.message           ||
      msg.viewOnceMessage?.message            ||
      msg.viewOnceMessageV2?.message          ||
      msg.viewOnceMessageV2Extension?.message ||
      msg.documentWithCaptionMessage?.message ||
      msg.groupStatusMessageV2?.message       ||
      msg.groupStatusMessage?.message         ||
      msg.associatedChildMessage?.message
    if (!nxt) break
    msg = nxt
  }
  const key = { ...m.key, remoteJid: m.key.remoteJid, participant: sender, fromMe: false }
  const t = PREVIEWABLE.find(x => msg[x])
  if (t) {
    // Strip the post's own contextInfo (isGroupStatus / statusAttributions):
    // a quote carrying those flags can fail to render as a normal reply.
    const content = typeof msg[t] === "object" ? { ...msg[t] } : msg[t]
    if (content && typeof content === "object") delete content.contextInfo
    return { key, message: { [t]: content } }
  }
  return { key, message: { conversation: "📢 Status group mention" } }
}

// ── Anti-spam: one notice/warning per sender per window, and each
// message id is only processed once (WhatsApp can deliver the same
// status card more than once, and one status post can produce several
// related messages).
const seenIds   = new Map()   // msgId  -> timestamp
const lastNotice = new Map()  // jid|sender -> timestamp
const NOTICE_COOLDOWN = 60000 // 60s

const cleanup = () => {
  const now = Date.now()
  for (const [k, t] of seenIds)    if (now - t > 60000) seenIds.delete(k)
  for (const [k, t] of lastNotice) if (now - t > NOTICE_COOLDOWN * 3) lastNotice.delete(k)
}

const pending = new Map()   // jid|sender -> { best, rank, timer }
const COLLECT_MS = 2000     // wait this long to pick the best message to reply to

// photo/video > other media > text > plain mention card fallback
const quoteRank = (q) => {
  const k = Object.keys(q?.message || {})[0]
  if (k === "imageMessage" || k === "videoMessage") return 3
  if (k === "stickerMessage" || k === "documentMessage" || k === "audioMessage") return 2
  if (k === "extendedTextMessage") return 1
  if (k === "conversation" && q.message.conversation !== "📢 Status group mention") return 1
  return 0
}

// ── Sends the single notice for the active mode, replying to the post ──
const sendNotice = async (sock, jid, sender, quotedRef) => {
  const group = global.db?.groups?.[jid]
  if (!group) return
  const senderNum = sender.split("@")[0]

  // MODE 1 — DELETE + NOTIFY (.antistatus on)
  if (group.antistatus) {
    await sock.sendMessage(jid, {
      text:     `@${senderNum} ❌ ${toSmallCaps("status group mention is not allowed here")}.`,
      mentions: [sender]
    }, { quoted: quotedRef }).catch(() => {})
    return
  }

  // MODE 2 — WARN then KICK (.antistatus warn)
  if (group.antistatus2) {
    if (!group.antistatusWarn) group.antistatusWarn = {}
    if (!group.antistatusMax)  group.antistatusMax  = 3

    group.antistatusWarn[sender] = (group.antistatusWarn[sender] || 0) + 1
    const count = group.antistatusWarn[sender]
    const max   = group.antistatusMax

    if (count >= max) {
      try {
        await sock.groupParticipantsUpdate(jid, [sender], "remove")
        delete group.antistatusWarn[sender]
        await sock.sendMessage(jid, {
          text:     `👢 @${senderNum} ${toSmallCaps(`has been kicked for repeatedly tagging this group in their status`)}. (${count}/${max} ${toSmallCaps("warnings")})`,
          mentions: [sender]
        }, { quoted: quotedRef })
        log("INFO", `[AntiStatusTag] Kicked ${senderNum} from ${jid}`)
      } catch (e) {
        log("WARN", `[AntiStatusTag] Kick failed: ${e?.message || e}`)
      }
    } else {
      await sock.sendMessage(jid, {
        text:     `⚠️ @${senderNum} *${toSmallCaps(`Warning ${count}/${max}`)}* — ${toSmallCaps("do not tag this group in your status")}.\n${toSmallCaps(`you will be kicked at ${max} warnings`)}.`,
        mentions: [sender]
      }, { quoted: quotedRef }).catch(() => {})
    }
    return
  }

  // MODE 3 — KICK IMMEDIATELY (.antistatus kick)
  if (group.antistatus3) {
    try {
      await sock.groupParticipantsUpdate(jid, [sender], "remove")
      await sock.sendMessage(jid, {
        text:     `👢 @${senderNum} ${toSmallCaps("has been kicked for tagging this group in their status")}.`,
        mentions: [sender]
      }, { quoted: quotedRef })
      log("INFO", `[AntiStatusTag] Kicked ${senderNum} from ${jid}`)
    } catch (e) {
      log("WARN", `[AntiStatusTag] Kick failed: ${e?.message || e}`)
    }
  }
}

module.exports = (sock, store) => {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return

    for (const m of messages) {
      try {
        const jid = m.key?.remoteJid
        if (!jid || !jid.endsWith("@g.us")) continue
        if (m.key.fromMe) continue

        const group = global.db?.groups?.[jid]
        if (!group) continue

        // ── Any mode must be active ──
        const modeOn = group.antistatus || group.antistatus2 || group.antistatus3
        if (!modeOn) continue

        const msg = m.message
        if (!msg) continue

        // ── Unwrap wrappers ──
        const inner =
          msg.ephemeralMessage?.message            ||
          msg.viewOnceMessage?.message             ||
          msg.viewOnceMessageV2?.message           ||
          msg.viewOnceMessageV2Extension?.message  ||
          msg

        // ── Pull contextInfo ──
        const ctx =
          inner?.extendedTextMessage?.contextInfo  ||
          inner?.imageMessage?.contextInfo         ||
          inner?.videoMessage?.contextInfo         ||
          inner?.documentMessage?.contextInfo      ||
          inner?.audioMessage?.contextInfo         ||
          inner?.stickerMessage?.contextInfo       ||
          inner?.buttonsMessage?.contextInfo       ||
          inner?.templateMessage?.contextInfo      ||
          inner?.listMessage?.contextInfo          ||
          inner?.locationMessage?.contextInfo      ||
          inner?.contactMessage?.contextInfo       ||
          inner?.interactiveMessage?.contextInfo   ||
          null

        // ── Detection ──
        const isStatusMention = !!(
          inner?.statusMentionMessage                                            ||
          msg?.statusMentionMessage                                              ||
          ctx?.remoteJid === "status@broadcast"                                  ||
          ctx?.participant === "status@broadcast"                                ||
          (ctx?.forwardingScore >= 1 && ctx?.remoteJid === "status@broadcast")  ||
          (ctx?.stanzaId && ctx?.remoteJid === "status@broadcast")              ||
          m.key?.remoteJid === "status@broadcast"                               ||
          Object.keys(inner || {}).some(k => k.toLowerCase().includes("statusmention")) ||
          hasStatusMention(msg) ||
          isGroupStatusPost(msg)
        )

        if (!isStatusMention) continue

        const sender = m.key.participant
        if (!sender) continue

        // ── Dedupe: skip a message id we've already handled ──
        if (m.key.id) {
          if (seenIds.has(m.key.id)) continue
          seenIds.set(m.key.id, Date.now())
          if (seenIds.size > 500) cleanup()
        }

        const senderNum = sender.split("@")[0]

        // ✅ Quotable reference to this message (previewable photo/video/text,
        // or a fallback line). Built BEFORE deleting.
        const quotedRef = buildQuoted(m, sender)
        const rank      = quoteRank(quotedRef)

        // ── ONE notice per post, replying to the best message of it ──
        // A single status post arrives as several messages (a mention card,
        // the photo, ...) in random order. We delete each one immediately,
        // but collect them for COLLECT_MS and send ONE notice that replies
        // to the best one (photo/video > text > plain mention card).
        const nKey     = jid + "|" + sender
        const pend     = pending.get(nKey)
        const cooling  = (Date.now() - (lastNotice.get(nKey) || 0)) < NOTICE_COOLDOWN

        if (pend) {
          if (rank > pend.rank) { pend.best = quotedRef; pend.rank = rank }
        } else if (!cooling) {
          const entry = { best: quotedRef, rank }
          entry.timer = setTimeout(async () => {
            pending.delete(nKey)
            lastNotice.set(nKey, Date.now())
            try {
              await sendNotice(sock, jid, sender, entry.best)
            } catch (e) {
              log("WARN", `[AntiStatusTag] ${e?.message || e}`)
            }
          }, COLLECT_MS)
          pending.set(nKey, entry)
        }

        // ── Always delete the status/story post right away ──
        await deleteMsg(sock, jid, m.key, sender)

      } catch (err) {
        const e = String(err?.message || err)
        if (!e.includes("not-authorized") && !e.includes("forbidden")) {
          log("WARN", `[AntiStatusTag] ${e}`)
        }
      }
    }
  })
}
