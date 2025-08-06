 // src/routes/appointment.routes.ts
import { Router } from "express";
import {
  bookAppointment,
  rescheduleAppointment,
  cancelAppointment,
  getPatientAppointments,
  getDoctorAppointments,
} from "../controllers/appointment.controller";
import { verifyToken } from "../middlewares/verifyToken"; // Assuming this is your JWT middleware

const router = Router();

// ⏳ 📅 Appointment Booking & Management
router.post("/", verifyToken, bookAppointment); // Protected: Patient books an appointment
router.patch("/:id/reschedule", verifyToken, rescheduleAppointment); // Protected: Patient reschedules
router.delete("/:id", verifyToken, cancelAppointment); // Protected: Patient/Doctor cancels

// ⏳ 🧾 View Appointments
router.get("/patient/:id", verifyToken, getPatientAppointments); // Protected: Patient/Doctor views patient's appointments
router.get("/doctor/:id", verifyToken, getDoctorAppointments); // Protected: Doctor views their own appointments

export default router;