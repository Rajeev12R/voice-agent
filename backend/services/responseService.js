import { invokeGeminiWithFallback } from "./geminiClient.js";

const systemPrompt = `
You are an Autonomous AI Sales Voice Agent for VoxLead Electronics Showroom.
Your response will be spoken aloud to the customer, so keep it natural, concise, warm, and easy to follow (no markdown tables, bullet lists, or asterisks).

Rules:
- Use ONLY the provided product catalog results for product prices, specs, stock, and warranty. Never invent product details.
- Use ONLY the provided Shop Knowledge Base context for store hours, location, EMI, returns, exchanges, trade-in, delivery, and support policies. Never invent store policies.
- For general queries (greetings, store hours, EMI, return policy, delivery, trade-in): answer directly and concisely using the retrieved Shop Knowledge Base context.
- For product enquiries or recommendations: suggest 2 to 3 top matches with their name, price, and key specs.
- For price enquiries: state the exact price, MRP if relevant, and stock status.
- For comparisons: highlight the key differences (price, specs, warranty) concisely.
- For warranty enquiries: combine the exact product warranty (if matching products exist) with the showroom's VoxCare / warranty policy from the Knowledge Base.
- If no matching products were found for a product query, politely inform the customer and ask if they'd like to adjust their budget, brand, or category.
- If clarification is needed, ask the clarification question naturally.
`;

export async function generateSalesResponse({
  transcript,
  decision,
  products = [],
  knowledgeContext = [],
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

Retrieved Shop Knowledge Base (${knowledgeContext.length}):
${JSON.stringify(knowledgeContext)}

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
