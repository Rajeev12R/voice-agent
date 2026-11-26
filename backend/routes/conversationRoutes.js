import express from "express";

import { runSupervisor } from "../supervisorAgent.js";
import { searchProducts } from "../services/productService.js";
import { retrieveKnowledge } from "../services/ragService.js";
import { generateSalesResponse } from "../services/responseService.js";
import { createAppointmentRequest } from "../services/appointmentService.js";
import { createHandoff } from "../services/handoffService.js";
import {
  getSessionMemory,
  updateSessionPreferences,
  recordSessionTurn,
  persistSessionChanges,
} from "../services/memoryService.js";
import { qualifyAndSaveLead } from "../services/leadService.js";

const router = express.Router();

const PRODUCT_INTENTS = new Set([
  "PRODUCT_ENQUIRY",
  "PRODUCT_RECOMMENDATION",
  "PRICE_ENQUIRY",
  "COMPARISON",
  "WARRANTY_ENQUIRY"
]);

const RAG_INTENTS = new Set([
  "GENERAL_QUERY",
  "WARRANTY_ENQUIRY",
  "OTHER"
]);

router.post("/transcript", async (req, res) => {
  try {
    const {
      transcript,
      history,
      sessionId = null
    } = req.body;

    if (!transcript || typeof transcript !== "string") {
      return res.status(400).json({
        error: "Transcript is required."
      });
    }

    const session = await getSessionMemory(sessionId);
    const activeHistory =
      Array.isArray(history) && history.length > 0 ? history : session.history;
    const memoryContext = {
      customerProfile: session.customerProfile,
      preferences: session.preferences,
    };

    console.log("Customer Transcript:", transcript);

    const decision = await runSupervisor(transcript, activeHistory, memoryContext);
    console.log("Supervisor Decision:", decision);

    await updateSessionPreferences(session, decision.entities);

    // 1. HUMAN HANDOFF
    if (
      decision.intent === "HUMAN_HANDOFF" ||
      decision.actions.includes("HUMAN_HANDOFF")
    ) {
      const lead = await qualifyAndSaveLead({
        sessionId: session.sessionId,
        transcript,
        decision,
        session,
      });

      const handoff = await createHandoff({
        transcript,
        history: activeHistory,
        sessionId: session.sessionId
      });

      const reply =
        "I've recorded your request for assistance from a human representative. Your reference number is " +
        handoff.referenceId +
        ". This demo has created the request, but has not yet notified a live representative.";

      await recordSessionTurn(session, transcript, reply);

      return res.json({
        success: true,
        intent: decision.intent,
        action: "HUMAN_HANDOFF",
        handoff,
        lead,
        reply
      });
    }

    // 2. APPOINTMENT BOOKING
    if (
      decision.intent === "APPOINTMENT_BOOKING" ||
      decision.actions.includes("BOOK_APPOINTMENT")
    ) {
      const lead = await qualifyAndSaveLead({
        sessionId: session.sessionId,
        transcript,
        decision,
        session,
      });

      const incoming = decision.entities || {};
      const draft = session.appointmentDraft;

      if (incoming.date) draft.date = incoming.date;
      if (incoming.appointmentTime) draft.appointmentTime = incoming.appointmentTime;
      if (incoming.customerName || session.customerProfile.customerName) {
        draft.customerName =
          incoming.customerName || session.customerProfile.customerName;
      }
      if (incoming.phone || session.customerProfile.phone) {
        draft.phone = incoming.phone || session.customerProfile.phone;
      }

      const missingDetails = [];
      if (!draft.date) missingDetails.push("date");
      if (!draft.appointmentTime) missingDetails.push("time");
      if (!draft.customerName) missingDetails.push("name");
      if (!draft.phone) missingDetails.push("phone");

      if (missingDetails.length > 0) {
        const questions = {
          date: "What date would you like to visit our showroom?",
          time: "What time would you prefer for your showroom visit?",
          name: "May I have your name for the appointment request?",
          phone: "Could you please share your contact number?"
        };

        const nextQuestion = questions[missingDetails[0]];
        await recordSessionTurn(session, transcript, nextQuestion);

        return res.json({
          success: true,
          intent: decision.intent,
          action: "COLLECT_APPOINTMENT_DETAILS",
          collectedDetails: { ...draft },
          missingDetails,
          lead,
          reply: nextQuestion
        });
      }

      const appointment = await createAppointmentRequest({ ...draft });
      session.appointmentDraft = {};
      await persistSessionChanges();

      const reply = `Thank you, ${appointment.customerName}. Your showroom appointment request has been recorded for ${appointment.date} at ${appointment.appointmentTime}. Your reference number is ${appointment.referenceId}. The slot is not confirmed yet; our showroom team needs to verify availability.`;
      await recordSessionTurn(session, transcript, reply);

      return res.json({
        success: true,
        intent: decision.intent,
        action: "APPOINTMENT_REQUEST_CREATED",
        appointment,
        lead,
        reply
      });
    }

    // 3. PRODUCT SEARCH & KNOWLEDGE BASE RAG
    const needsProductSearch =
      decision.intent !== "GENERAL_QUERY" &&
      (PRODUCT_INTENTS.has(decision.intent) ||
        decision.actions.includes("SEARCH_PRODUCTS") ||
        decision.actions.includes("RECOMMEND_PRODUCT"));

    const searchEntities = {
      ...session.preferences,
      ...Object.fromEntries(
        Object.entries(decision.entities || {}).filter(
          ([, v]) => v !== null && v !== undefined && v !== ""
        )
      ),
    };

    const products = needsProductSearch ? searchProducts(searchEntities) : [];

    const needsRag =
      RAG_INTENTS.has(decision.intent) ||
      decision.actions.includes("SEARCH_KNOWLEDGE") ||
      Boolean(decision.needsKnowledgeBase);

    const knowledgeContext = needsRag ? await retrieveKnowledge(transcript, 3) : [];
    if (needsRag) {
      console.log(
        `[RAG] Retrieved ${knowledgeContext.length} chunks:`,
        knowledgeContext.map((k) => `${k.title} (${k.method}:${k.score})`)
      );
    }

    const lead = await qualifyAndSaveLead({
      sessionId: session.sessionId,
      transcript,
      decision,
      session,
      products,
    });

    // 4. GENERAL QUERY (RAG) AND PRODUCT RESPONSE
    const reply =
      decision.needsClarification &&
      decision.clarificationQuestion &&
      products.length === 0 &&
      knowledgeContext.length === 0
        ? decision.clarificationQuestion
        : await generateSalesResponse({
            transcript,
            decision,
            products,
            knowledgeContext,
            history: activeHistory,
            memoryContext,
          });

    console.log("Agent Reply:", reply);
    await recordSessionTurn(session, transcript, reply);

    return res.json({
      success: true,
      transcript,
      decision,
      products,
      knowledgeContext,
      lead,
      reply
    });
  } catch (error) {
    console.error("Conversation Error:", error.message || error);

    const isRateLimited =
      error?.status === 429 ||
      error?.name === "RateLimitQuotaExhaustedError" ||
      String(error?.message || "").includes("429");

    if (isRateLimited) {
      return res.status(429).json({
        success: false,
        error: "Gemini API rate limit exceeded.",
        reply: "I'm experiencing high demand right now. Please try again in a moment, or ask for a human representative."
      });
    }

    return res.status(500).json({
      success: false,
      error: "Unable to process customer message."
    });
  }
});

export default router;
