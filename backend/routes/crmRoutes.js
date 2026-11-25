import express from "express";
import fs from "fs/promises";
import path from "path";
import { readLeads } from "../services/leadService.js";

const router = express.Router();

async function readJsonSafe(filename) {
  try {
    const filePath = path.join(process.cwd(), "data", filename);
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

router.get("/overview", async (_req, res) => {
  try {
    const [leads, appointments, handoffs] = await Promise.all([
      readLeads(),
      readJsonSafe("appointments.json"),
      readJsonSafe("handoffs.json"),
    ]);

    const summary = {
      totalLeads: leads.length,
      hot: leads.filter((l) => l.score === "HOT").length,
      warm: leads.filter((l) => l.score === "WARM").length,
      cold: leads.filter((l) => l.score === "COLD").length,
      appointments: appointments.length,
      handoffs: handoffs.length,
    };

    res.json({
      success: true,
      summary,
      leads,
      appointments,
      handoffs,
    });
  } catch (error) {
    console.error("CRM Overview Error:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to load CRM data.",
    });
  }
});

export default router;

