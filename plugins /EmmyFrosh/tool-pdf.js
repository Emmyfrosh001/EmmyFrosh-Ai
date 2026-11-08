const PDFDocument = require('pdfkit');
const { Buffer } = require('buffer');

module.exports = [
  {
    command: ["topdf"],
    alias: ["pdf"],
    use: "<text>",
    description: "Convert provided text to a PDF file.",
    category: "Tool",
    ban: true,
    gcban: true,
    execute: async (m, { ednut, q, reply, from }) => {
      try {
        if (!q) return reply("Please provide the text you want to convert to PDF.\n*Example:* `.topdf Pakistan ZindaBad 🇵🇰`");

        // Create a new PDF document
        const doc = new PDFDocument();
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', async () => {
          const pdfData = Buffer.concat(buffers);

          // Send the PDF file
          await ednut.sendMessage(from, {
            document: pdfData,
            mimetype: 'application/pdf',
            fileName: 'PatronTech.pdf',
            caption: `*📄 PDF created successfully!*\n\n> © Created By Ozeba-Xd`
          }, { quoted: m });
        });

        // Add text to the PDF
        doc.text(q);

        // Finalize the PDF
        doc.end();

      } catch (e) {
        console.error("topdf error:", e);
        reply(`❌ Error: ${e.message}`);
      }
    }
  }
];
