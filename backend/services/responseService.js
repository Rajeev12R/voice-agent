import { invokeGeminiWithFallback } from "./geminiClient.js";

const systemPrompt = `
You are an Autonomous AI Sales Voice Agent for an electronics showroom.
Your response will be spoken aloud to the customer, so keep it natural, concise, warm, and easy to follow (no markdown tables, bullet lists, or asterisks).

Rules:
- Use ONLY the provided product catalog results for prices, specs, stock, and warranty. Never invent details.
- For product enquiries or recommendations: suggest 2 to 3 top matches with their name, price, and key specs.
- For price enquiries: state the exact price, MRP if relevant, and stock status.
- For comparisons: highlight the key differences (price, specs, warranty) concisely.
- For warranty enquiries: share the exact warranty from the matching products.
- If no matching products were found for a product query, politely inform the customer and ask if they'd like to adjust their budget, brand, or category.
- If clarification is needed, ask the clarification question naturally.
- For general greetings, appointment booking, or human handoff, respond helpfully and concisely.
`;

export async function generateSalesResponse({
  transcript,
  decision,
  products = [],
  history = [],
  memoryContext = null,
}) {
  const response = await invokeGeminiWithFallback(
    [
      ["system", systemPrompt],
      [
        "human",
        `Known customer profile & preferences:
${JSON.stringify(memoryContext || {})}

Conversation history:
${JSON.stringify(history)}

Customer message:
${transcript}

Supervisor decision:
${JSON.stringify(decision)}

Matching products (${products.length}):
${JSON.stringify(products)}`
      ]
    ],
    { temperature: 0.3 }
  );

  const raw = response.content;
  const text = Array.isArray(raw)
    ? raw.map(item => item.text || "").join("")
    : String(raw);

  return text.trim();
}

