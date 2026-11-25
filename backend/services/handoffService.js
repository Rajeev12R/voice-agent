
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const filePath = path.join(
  process.cwd(),
  "data",
  "handoffs.json"
);

async function readHandoffs() {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function createHandoff({
  transcript,
  history = [],
  sessionId = null
}) {
  const handoffs = await readHandoffs();

  const handoff = {
    referenceId: randomUUID(),
    sessionId,
    customerMessage: transcript,
    conversationHistory: history,
    status: "PENDING",
    createdAt: new Date().toISOString()
  };

  handoffs.push(handoff);

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  await fs.writeFile(
    filePath,
    JSON.stringify(handoffs, null, 2)
  );

  return handoff;
}
