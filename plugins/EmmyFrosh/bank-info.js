const fs = require("fs");
const path = require("path");

// Ensure data folder exists
const dataDir = path.join(__dirname, "../../storage");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Path to bank data file
const bankDataPath = path.join(dataDir, "bank-data.json");

// Function to load bank info
function loadBankInfo() {
  try {
    if (fs.existsSync(bankDataPath)) {
      const data = fs.readFileSync(bankDataPath, "utf8");
      return JSON.parse(data);
    } else {
      // If file doesn't exist, create with default values
      const defaultData = {
        bankName: "",
        holderName: "",
        accountNumber: "",
      };
      fs.writeFileSync(bankDataPath, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
  } catch (e) {
    console.error("Error loading bank data:", e);
    return {
      bankName: "",
      holderName: "",
      accountNumber: "",
    };
  }
}

// Function to save bank info
function saveBankInfo(data) {
  try {
    fs.writeFileSync(bankDataPath, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error("Error saving bank data:", e);
    return false;
  }
}

// Load initial bank info
let bankInfo = loadBankInfo();

module.exports = [
  {
    command: ["setaza"],
    alias: ["setbank"],
    description: "Set bank account information",
    category: "Owner",
    async execute(m, { text, isOwner, reply }) {
      try {
        if (!isOwner) return reply("🔴 This command is restricted to owners only.");

        if (!text || text.trim() === "") {
          return reply("🔴 *Missing Bank Info!*\n\n`Example:\n`.setaza Emmyfrosh | opay | 912074XXXX`\n\n\nWhere EmmyFrosh is The Account owner name and OPAY is the Bank Name lastly 9126793637 is the Account Number");
        }

        const parts = text.split("|").map((p) => p.trim());
        if (parts.length !== 3) {
          return reply("🔴 *Invalid Format!*\n\n`Example:\n`.setaza EmmyFrosh | OPAY | 9160224621`\n\n\nWhere EmmyFrosh is The Account owner name and PALMPAY is the Bank Name lastly 9160224621 is the Account Number");
        }

        let [holderName, bankName, accountNumber] = parts;
        holderName = holderName.toUpperCase();
        bankName = bankName.toUpperCase();

        if (!/^\d+$/.test(accountNumber)) {
          return reply("🔴 Account number must be numeric.\n\n`Example:\n`.setaza EmmyFrosh | OPAY | 9126793637`\n\n\nWhere Goodness Obilom is The Account owner name and OPAY is the Bank Name lastly 9160224621 is the Account Number");
        }

        bankInfo = { holderName, bankName, accountNumber };

        if (!saveBankInfo(bankInfo)) {
          return reply("🔴 Error saving bank information. Please try again.");
        }

        return reply(
          `🏦 *🟢 DETAILS ACCEPTED*\n\n` +
          `🚹 *${bankInfo.holderName}*\n` +
          `🔢 *${bankInfo.accountNumber}*\n` +
          `🏦 *${bankInfo.bankName}*\n\n` +
          `Use .aza to view this information.`
        );
      } catch (e) {
        console.error("Set bank info error:", e);
        return reply("🔴 An error occurred while setting bank info.");
      }
    },
  },

  {
    command: ["aza"],
    alias: ["bank"],
    description: "Get bank account information",
    category: "Info",
    async execute(m, { reply }) {
      try {
        bankInfo = loadBankInfo();

        if (!bankInfo.bankName || !bankInfo.holderName || !bankInfo.accountNumber) {
          return reply("🔴 Bank Details not set yet.\n\n`Example:\n`.setaza EmmyFrosh | OPAY | 9126793637`\n\n\nWhere Goodness Obilom is The Account owner name and OPAY is the Bank Name lastly 9160224621 is the Account Number");
        }

        return reply(
          `🏦 *BANK DETAILS*\n\n` +
          `🚹 *${bankInfo.holderName}*\n` +
          `🔢 *${bankInfo.accountNumber}*\n` +
          `🏦 *${bankInfo.bankName}*\n\n` +
          `*SEND SCREENSHOT AFTER PAYMENT*`
        );
      } catch (e) {
        console.error("Get bank info error:", e);
        return reply("🔴 An error occurred while fetching bank info.");
      }
    },
  },

  {
    command: ["clearaza"],
    alias: ["resetbank"],
    description: "Clear saved bank account information",
    category: "Owner",
    async execute(m, { isOwner, reply }) {
      try {
        if (!isOwner) return reply("🔴 This command is restricted to owners only.");

        bankInfo = { bankName: "", holderName: "", accountNumber: "" };
        if (fs.existsSync(bankDataPath)) fs.unlinkSync(bankDataPath);

        // Recreate empty file
        saveBankInfo(bankInfo);

        return reply("🟢 Bank information has been cleared.");
      } catch (e) {
        console.error("Clear bank info error:", e);
        return reply("🔴 An error occurred while clearing bank info.");
      }
    },
  },
];
