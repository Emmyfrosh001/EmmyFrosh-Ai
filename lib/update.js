const { exec } = require("child_process");

module.exports = function autoUpdate() {
  if (process.env.AUTO_UPDATE !== "true") return;

  exec("git pull --ff-only", (err, stdout) => {
    if (err) return; // silently skip on error
    if (!stdout.includes("Already up to date.")) {
      process.exit(42); // MANUAL_RESTART_CODE — silently restart if updated (intentional)
    }
  });
};
