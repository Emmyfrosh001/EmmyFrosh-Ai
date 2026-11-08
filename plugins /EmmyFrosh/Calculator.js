module.exports = [
  {
    command: ["calc"],
    alias: ["calculator"],
    description: "Math tutor style calculator (BODMAS steps)",
    category: "Utility",
    filename: __filename,

    async execute(m, { text, reply }) {
      try {

        if (!text) {
          return reply("Example:\n.calc 10 + 5 * 2")
        }

        const expression = text.replace(/[^0-9+\-*/().%]/g, "")

        let steps = []
        let current = expression

        steps.push(`Original: ${current}`)

        // Helper function to evaluate safely
        const compute = (exp) =>
          Function(`"use strict"; return (${exp})`)()

        // 1. Handle multiplication/division first (BODMAS)
        let prev

        do {
          prev = current

          current = current.replace(
            /(\d+(\.\d+)?)\s*([*/])\s*(\d+(\.\d+)?)/,
            (match, a, _, op, b) => {
              a = Number(a)
              b = Number(b)
              const result = op === "*" ? a * b : a / b

              steps.push(`→ ${a} ${op} ${b} = ${result}`)

              return result
            }
          )

        } while (current !== prev)

        // 2. Handle addition/subtraction
        do {
          prev = current

          current = current.replace(
            /(-?\d+(\.\d+)?)\s*([+-])\s*(\d+(\.\d+)?)/,
            (match, a, _, op, b) => {
              a = Number(a)
              b = Number(b)
              const result = op === "+" ? a + b : a - b

              steps.push(`→ ${a} ${op} ${b} = ${result}`)

              return result
            }
          )

        } while (current !== prev)

        const answer = compute(expression)

        return reply(
`╭─❏〘 🧮 MATH TUTOR 〙━❒

📘 Expression:
${expression}

📊 Working Steps:
${steps.join("\n")}

🎯 Final Answer:
${answer}

╰──────────────╯`
        )

      } catch (err) {
        console.log(err)
        return reply("❌ Cannot solve this expression.")
      }
    }
  }
]