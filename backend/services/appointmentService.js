
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const filePath = path.join(
  process.cwd(),
  "data",
  "appointments.json"
);

async function readAppointments() {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function createAppointmentRequest(entities) {
  const { date, appointmentTime, customerName, phone } = entities;

  if (!date || !appointmentTime || !customerName || !phone) {
    throw new Error("Missing appointment details.");
  }

  const appointments = await readAppointments();

  const appointment = {
    referenceId: randomUUID(),
    customerName,
    phone,
    date,
    appointmentTime,
    status: "REQUESTED",
    createdAt: new Date().toISOString()
  };

  appointments.push(appointment);

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  await fs.writeFile(
    filePath,
    JSON.stringify(appointments, null, 2)
  );

  return appointment;
}
