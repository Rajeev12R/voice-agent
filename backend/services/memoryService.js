import fs from "fs/promises";
import path from "path";

const filePath = path.join(process.cwd(), "data", "sessions.json");

let sessionsCache = null;

async function loadSessions() {
  if (sessionsCache) return sessionsCache;

  try {
    const data = await fs.readFile(filePath, "utf-8");
    sessionsCache = JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      sessionsCache = {};
    } else {
      throw error;
    }
  }

  return sessionsCache;
}

async function saveSessions() {
  if (!sessionsCache) return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(sessionsCache, null, 2));
}

export async function getSessionMemory(sessionId) {
  const key = sessionId || "default";
  const sessions = await loadSessions();

  if (!sessions[key]) {
    sessions[key] = {
      sessionId: key,
      history: [],
      customerProfile: {
        customerName: null,
        phone: null,
      },
      preferences: {
        category: null,
        brand: null,
        budget: null,
        otherRequirements: null,
      },
      appointmentDraft: {},
      updatedAt: new Date().toISOString(),
    };
    await saveSessions();
  }

  return sessions[key];
}

export async function updateSessionPreferences(session, entities = {}) {
  if (entities.customerName) {
    session.customerProfile.customerName = entities.customerName;
  }
  if (entities.phone) {
    session.customerProfile.phone = entities.phone;
  }

  if (entities.category) session.preferences.category = entities.category;
  if (entities.brand) session.preferences.brand = entities.brand;
  if (
    entities.budget !== null &&
    entities.budget !== undefined &&
    entities.budget !== ""
  ) {
    session.preferences.budget = entities.budget;
  }
  if (entities.otherRequirements) {
    session.preferences.otherRequirements = entities.otherRequirements;
  }

  session.updatedAt = new Date().toISOString();
  await saveSessions();
}

export async function recordSessionTurn(session, transcript, reply) {
  const now = new Date().toISOString();
  session.history.push(
    { role: "user", content: transcript, timestamp: now },
    { role: "assistant", content: reply, timestamp: now }
  );

  if (session.history.length > 20) {
    session.history = session.history.slice(-20);
  }

  session.updatedAt = now;
  await saveSessions();
}

export async function persistSessionChanges() {
  await saveSessions();
}

