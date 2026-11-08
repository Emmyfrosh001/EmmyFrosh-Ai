module.exports = (ednut, store, saveCreds) => {
  ednut.ev.off("creds.update", saveCreds);
  ednut.ev.on("creds.update", saveCreds);
};
