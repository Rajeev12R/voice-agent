import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const filePath = path.join(process.cwd(), "data", "leads.json");

export async function readLeads() {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeLeads(leads) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(leads, null, 2));
}

function detectTimeline(text = "", date = null) {
  if (date) return `Scheduled (${date})`;
  const lower = text.toLowerCase();

  if (/\b(today|tomorrow|asap|urgent|immediately|right now|this week|tonight)\b/.test(lower)) {
    return "Immediate (This Week)";
  }
  if (/\b(next week|this month|few days|soon|weekend)\b/.test(lower)) {
    return "Near-term (This Month)";
  }
  if (/\b(just looking|next year|later|maybe|exploring|browsing)\b/.test(lower)) {
    return "Long-term / Exploring";
  }
  return "Unspecified";
}

function scoreLead({
  transcript,
  decision,
  session,
  timeline,
  customerName,
  phone,
}) {
  let points = 0;
  const reasons = [];

  const intent = decision.intent;
  const actions = decision.actions || [];
  const budget = session.preferences?.budget || decision.entities?.budget;
  const category = session.preferences?.category || decision.entities?.category;
  const brand = session.preferences?.brand || decision.entities?.brand;
  const lower = transcript.toLowerCase();

  // 1. Buying Intent Signals
  if (intent === "APPOINTMENT_BOOKING" || actions.includes("BOOK_APPOINTMENT")) {
    points += 40;
    reasons.push("Requested showroom appointment");
  } else if (intent === "HUMAN_HANDOFF" || actions.includes("HUMAN_HANDOFF")) {
    points += 35;
    reasons.push("Requested human sales representative");
  } else if (
    intent === "PRODUCT_RECOMMENDATION" ||
    intent === "PRICE_ENQUIRY" ||
    intent === "COMPARISON"
  ) {
    points += 25;
    reasons.push(`High-intent query (${intent.replace(/_/g, " ").toLowerCase()})`);
  } else if (intent === "PRODUCT_ENQUIRY" || intent === "WARRANTY_ENQUIRY") {
    points += 18;
    reasons.push("Active product/warranty enquiry");
  } else {
    points += 5;
  }

  if (/\b(buy|purchase|order|book|visit showroom|pick up|emi|exchange)\b/.test(lower)) {
    points += 15;
    reasons.push("Explicit purchase/financing signal");
  }

  // 2. Budget & Product Clarity
  if (budget) {
    points += 20;
    reasons.push(`Budget stated (₹${Number(budget).toLocaleString("en-IN")})`);
  }
  if (category || brand) {
    points += 10;
    reasons.push(`Interested in ${[brand, category].filter(Boolean).join(" ")}`);
  }

  // 3. Purchase Timeline
  if (timeline.startsWith("Immediate") || timeline.startsWith("Scheduled")) {
    points += 25;
    reasons.push(`Urgent timeline (${timeline})`);
  } else if (timeline.startsWith("Near-term")) {
    points += 15;
    reasons.push(`Near-term timeline (${timeline})`);
  }

  // 4. Contact Details Captured
  if (customerName && customerName !== "Anonymous Visitor") {
    points += 10;
    reasons.push("Name captured");
  }
  if (phone) {
    points += 15;
    reasons.push("Phone number captured");
  }

  // 5. Conversation Engagement Depth
  const turnCount = Math.floor((session.history?.length || 0) / 2) + 1;
  if (turnCount >= 3) {
    points += 10;
    reasons.push(`Multi-turn engagement (${turnCount} turns)`);
  }

  const numericScore = Math.min(100, points);
  const tier = numericScore >= 60 ? "HOT" : numericScore >= 30 ? "WARM" : "COLD";

  return { tier, numericScore, reasons, turnCount };
}

const SCORE_RANK = { COLD: 1, WARM: 2, HOT: 3 };

export async function qualifyAndSaveLead({
  sessionId,
  transcript,
  decision,
  session,
  products = [],
}) {
  const leads = await readLeads();
  const key = sessionId || "default";
  const now = new Date().toISOString();

  const existingIndex = leads.findIndex((l) => l.sessionId === key);
  const existing = existingIndex >= 0 ? leads[existingIndex] : null;

  const customerName =
    session.customerProfile?.customerName ||
    decision.entities?.customerName ||
    existing?.customerName ||
    "Anonymous Visitor";

  const phone =
    session.customerProfile?.phone ||
    decision.entities?.phone ||
    existing?.phone ||
    null;

  const detectedTimeline = detectTimeline(transcript, decision.entities?.date);
  const effectiveTimeline =
    detectedTimeline !== "Unspecified"
      ? detectedTimeline
      : existing?.timeline || "Unspecified";

  const { tier, numericScore, reasons, turnCount } = scoreLead({
    transcript,
    decision,
    session,
    timeline: effectiveTimeline,
    customerName,
    phone,
  });

  // Preserve highest qualification tier and peak score achieved in the session
  const finalTier =
    existing && SCORE_RANK[existing.score] > SCORE_RANK[tier]
      ? existing.score
      : tier;

  const finalNumericScore = Math.max(numericScore, existing?.leadScore || 0);
  const mergedReasons = Array.from(
    new Set([...(existing?.reasons || []), ...reasons])
  ).slice(0, 6);

  const recommendedProducts =
    products.length > 0
      ? products.slice(0, 3).map((p) => p.productName)
      : existing?.recommendedProducts || [];

  const leadRecord = {
    leadId: existing?.leadId || randomUUID(),
    sessionId: key,
    customerName,
    phone,
    score: finalTier,
    leadScore: finalNumericScore,
    reasons: mergedReasons,
    turns: turnCount,
    intent: decision.intent,
    category:
      session.preferences?.category ||
      decision.entities?.category ||
      existing?.category ||
      null,
    brand:
      session.preferences?.brand ||
      decision.entities?.brand ||
      existing?.brand ||
      null,
    budget:
      session.preferences?.budget ||
      decision.entities?.budget ||
      existing?.budget ||
      null,
    timeline: effectiveTimeline,
    recommendedProducts,
    notes:
      session.preferences?.otherRequirements ||
      decision.entities?.otherRequirements ||
      transcript,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    leads[existingIndex] = leadRecord;
  } else {
    leads.unshift(leadRecord);
  }

  await writeLeads(leads);
  console.log(`[CRM] Lead qualified as ${leadRecord.score} (${leadRecord.leadScore}/100):`, {
    customerName: leadRecord.customerName,
    category: leadRecord.category,
    budget: leadRecord.budget,
    timeline: leadRecord.timeline,
    reasons: leadRecord.reasons,
  });

  return leadRecord;
}
