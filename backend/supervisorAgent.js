import { invokeGeminiWithFallback } from "./services/geminiClient.js";

const prompt = `
You are the Supervisor AI for an electronics showroom sales agent.

Your job is to understand customer messages and decide
what action the sales system should take.

Available product categories:
- Smartphones
- Laptops
- Televisions
- Headphones and audio
- Smartwatches
- Accessories

Classify the customer's intent into one of:

GENERAL_QUERY
PRODUCT_ENQUIRY
PRODUCT_RECOMMENDATION
PRICE_ENQUIRY
COMPARISON
WARRANTY_ENQUIRY
APPOINTMENT_BOOKING
HUMAN_HANDOFF
OTHER

Available actions:

RESPOND
SEARCH_PRODUCTS
SEARCH_KNOWLEDGE
RECOMMEND_PRODUCT
QUALIFY_LEAD
BOOK_APPOINTMENT
HUMAN_HANDOFF

Rules:
- Greetings and simple conversation need RESPOND.
- Product enquiries need SEARCH_PRODUCTS.
- Product recommendations need SEARCH_PRODUCTS and RECOMMEND_PRODUCT.
- Price and stock enquiries need SEARCH_PRODUCTS.
- Warranty and policy questions need SEARCH_KNOWLEDGE.
- Appointment requests need BOOK_APPOINTMENT.
- Human assistance requests need HUMAN_HANDOFF.
- Capture useful buying requirements with QUALIFY_LEAD.
- Never invent prices, specifications, stock or offers.
- Consider conversation history.
- Ask for clarification when essential information is missing.
- Select multiple actions when required.

GENERAL QUERY:
- Greetings and ordinary conversational questions use GENERAL_QUERY.
- Select RESPOND.
- Do not search the product catalogue for general conversation.

APPOINTMENT BOOKING:
- Select APPOINTMENT_BOOKING.
- Select BOOK_APPOINTMENT.
- Extract date, appointmentTime, customerName and phone
  whenever the customer provides them.
- Convert dates into YYYY-MM-DD format.
- Convert times into 24-hour HH:mm format.
- Use conversation history to recover previously provided details.
- Never invent missing customer details.
- If required details are missing, set needsClarification to true.
- Ask for one missing detail at a time.

HUMAN HANDOFF:
- If the customer requests a human representative,
  select HUMAN_HANDOFF.
- Do not pretend a human has joined the conversation.

Return ONLY valid JSON in this format:

{
  "intent": "PRODUCT_RECOMMENDATION",
  "actions": ["SEARCH_PRODUCTS", "RECOMMEND_PRODUCT"],
  "entities": {
    "category": null,
    "brand": null,
    "budget": null,
    "productName": null,
    "date": null,
    "appointmentTime": null,
    "customerName": null,
    "phone": null,
    "otherRequirements": null
  },
  "needsKnowledgeBase": true,
  "needsClarification": false,
  "clarificationQuestion": null
}
`;

export async function runSupervisor(transcript, history = [], memoryContext = null) {

  if (!transcript || typeof transcript !== "string") {
    throw new Error("Valid transcript is required.");
  }

  const today = new Date().toISOString().split("T")[0];

  const response = await invokeGeminiWithFallback(
    [
      ["system", prompt],
      [
        "human",
        `Today's date (YYYY-MM-DD): ${today}

Known customer profile & preferences:
${JSON.stringify(memoryContext || {})}

Conversation history:
${JSON.stringify(history)}

Latest customer message:
${transcript}`
      ]
    ],
    { temperature: 0 }
  );

  // Convert Gemini response into a JavaScript object
  const rawResponse = response.content;

  const jsonText = Array.isArray(rawResponse)
    ? rawResponse.map(item => item.text || "").join("")
    : String(rawResponse);

  const cleanedResponse = jsonText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const decision = JSON.parse(cleanedResponse);

  // Basic validation
  if (
    !decision.intent ||
    !Array.isArray(decision.actions) ||
    !decision.entities
  ) {
    throw new Error("Invalid Supervisor response.");
  }

  return decision;
  
}