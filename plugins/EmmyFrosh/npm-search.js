const axios = require("axios");

module.exports = [
  {
    command: ["npm"],
    alias: ["npmsearch", "npmsearcher"],
    description: "Search for a package on npm.",
    category: "Tool",
    filename: __filename,
    use: "<package-name>",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, args, reply }) => {
      try {
        if (!args || !args.length) {
          return reply("❎ Please provide the name of the npm package you want to search for.\nExample: .npm express");
        }

        const packageName = args.join(" ");
        const apiUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;

        const { data: packageData } = await axios.get(apiUrl);

        const latestVersion = packageData["dist-tags"]?.latest || "N/A";
        const description = packageData.description || "No description available.";
        const npmUrl = `https://www.npmjs.com/package/${packageName}`;
        const license = packageData.license || "Unknown";
        const repository = packageData.repository?.url || "Not available";

        const message = `
*PATRON-MD NPM SEARCH*

*🔰 NPM PACKAGE:* ${packageName}
*📄 DESCRIPTION:* ${description}
*⏸️ LAST VERSION:* ${latestVersion}
*🪪 LICENSE:* ${license}
*🪩 REPOSITORY:* ${repository}
*🔗 NPM URL:* ${npmUrl}
`;

        await ednut.sendMessage(m.chat, { text: message }, { quoted: m });

      } catch (error) {
        console.error("NPM Command Error:", error);

        const errorMessage = `
*❌ NPM Command Error Logs*

*Error Message:* ${error.message}
*Stack Trace:* ${error.stack || "Not available"}
*Timestamp:* ${new Date().toISOString()}
`;

        await ednut.sendMessage(m.chat, { text: errorMessage }, { quoted: m });
        reply("❎ An error occurred while fetching the npm package details.");
      }
    }
  }
];