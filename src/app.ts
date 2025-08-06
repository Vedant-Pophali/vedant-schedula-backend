// src/app.ts
import express from "express";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.routes";
import profileRoutes from "./routes/profile.route";
import doctorRoutes from "./routes/doctor.route";
import patientRoutes from "./routes/patient.route";
import appointmentRoutes from "./routes/appointment.routes";
import doctorSessionRoutes from "./routes/doctorSession.routes";

dotenv.config();

const app = express();

// Middleware
app.use(express.json());

// --- ADDED THIS FOR DEBUGGING req.body ---
app.use((req, res, next) => {
    console.log(`Incoming Request: ${req.method} ${req.url}`);
    console.log("Headers:", req.headers); // Log headers to check Content-Type
    console.log("Raw Request Body (from app.ts):", req.body); // Check what Express.json() parsed
    next();
});
// --- END DEBUGGING BLOCK ---

// Root route
app.get("/", (req, res) => {
    res.send("Healthcare backend is running.");
});

// All API route mountings
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/appointments", appointmentRoutes);

app.use("/api/doctors/:id/sessions", doctorSessionRoutes);

export default app;