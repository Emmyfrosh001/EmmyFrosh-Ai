const { delay } = require("@whiskeysockets/baileys");
const handledCalls = new Set();

module.exports = function callReceived(ednut) {

  ednut.ev.removeAllListeners("call");

  ednut.ev.on("call", async (calls) => {
    try {
      const incoming = calls?.[0];
      if (!incoming) return;

      const caller = incoming.from;
      const callId = incoming.id;
      const status = incoming.status;

      if (!caller || !callId || handledCalls.has(callId)) return;

      handledCalls.add(callId);
      setTimeout(() => handledCalls.delete(callId), 10000); 

      const action =
        global.db.settings?.anticall2 ? "block" :
        global.db.settings?.anticall ? "reject" :
        process.env.CALL?.toLowerCase();

      if (!action) {
        return;
      }

      const note = action === "block"
        ? `@${caller.split("@")[0]} called and was *blocked*`
        : `@${caller.split("@")[0]} called and the call was *rejected*`;

      await ednut.sendMessage(ednut.user.id, {
        text: note,
        mentions: [caller],
      });

      await ednut.rejectCall(callId, caller);

      if (action === "block") {
        await delay(1000);
        await ednut.updateBlockStatus(caller, "block");
      }

    } catch (err) {
      log("ERROR", `Call Handler: ${err.stack || err.message}`);
    }
  });
};
