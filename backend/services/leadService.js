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

  if (/\b(today|tomorrow|asap|urgent|immediately|right now|this week)\b/.test(lower)) {
    return "Immediate (This Week)";
  }
  if (/\b(next week|this month|few days|soon)\b/.test(lower)) {
    return "Near-term (This Month)";
  }
  if (/\b(just looking|next year|later|maybe|exploring)\b/.test(lower)) {
    return "Long-term / Exploring";
  }
  return "Unspecified";
}

function classifyLeadScore({ transcript, decision, session, timeline }) {
  const intent = decision.intent;
  const actions = decision.actions || [];
  const hasBudget = Boolean(
    decision.entities?.budget || session.preferences?.budget
  );
  const hasCategory = Boolean(
    decision.entities?.category || session.preferences?.category
  );
  const lower = transcript.toLowerCase();

  const urgentTimeline = timeline.startsWith("Immediate") || timeline.startsWith("Scheduled");
  const nearTermTimeline = timeline.startsWith("Near-term");

  if (
    intent === "APPOINTMENT_BOOKING" ||
    intent === "HUMAN_HANDOFF" ||
    actions.includes("BOOK_APPOINTMENT") ||
    actions.includes("HUMAN_HANDOFF") ||
    (hasBudget && urgentTimeline) ||
    /\b(buy|purchase|order|book|visit showroom)\b/.test(lower)
  ) {
    return "HOT";
  }

  if (
    intent === "PRODUCT_RECOMMENDATION" ||
    intent === "PRODUCT_ENQUIRY" ||
    intent === "PRICE_ENQUIRY" ||
    intent === "COMPARISON" ||
    intent === "WARRANTY_ENQUIRY" ||
    actions.includes("QUALIFY_LEAD") ||
    hasBudget ||
    hasCategory ||
    nearTermTimeline
  ) {
    return "WARM";
  }

  return "COLD";
}

const SCORE_RANK = { COLD: 1, WARM: 2, HOT: 3 };

export async function qualifyAndSaveLead({
  sessionId,
  transcript,
  decision,
  session,
}) {
  const leads = await readLeads();
  const key = sessionId || "default";
  const now = new Date().toISOString();

  const timeline = detectTimeline(transcript, decision.entities?.date);
  const computedScore = classifyLeadScore({
    transcript,
    decision,
    session,
    timeline,
  });

  const existingIndex = leads.findIndex((l) => l.sessionId === key);
  const existing = existingIndex >= 0 ? leads[existingIndex] : null;

  // Preserve highest qualification score achieved in the session
  const finalScore =
    existing && SCORE_RANK[existing.score] > SCORE_RANK[computedScore]
      ? existing.score
      : computedScore;

  const leadRecord = {
    leadId: existing?.leadId || randomUUID(),
    sessionId: key,
    customerName:
      session.customerProfile?.customerName ||
      decision.entities?.customerName ||
      existing?.customerName ||
      "Anonymous Visitor",
    phone:
      session.customerProfile?.phone ||
      decision.entities?.phone ||
      existing?.phone ||
      null,
    score: finalScore,
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
    timeline:
      timeline !== "Unspecified"
        ? timeline
        : existing?.timeline || "Unspecified",
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
  console.log(`[CRM] Lead qualified as ${leadRecord.score}:`, {
    customerName: leadRecord.customerName,
    category: leadRecord.category,
    budget: leadRecord.budget,
    timeline: leadRecord.timeline,
  });

  return leadRecord;
}

