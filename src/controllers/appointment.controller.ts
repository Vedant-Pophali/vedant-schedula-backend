// src/controllers/appointment.controller.ts
import { Request, Response } from "express";
import {
  bookAppointmentService,
  rescheduleAppointmentService,
  cancelAppointmentService,
  getPatientAppointmentsService,
  getDoctorAppointmentsService
} from "../services/appointment.service";
import { AppDataSource } from "../config/data-source";
import { Patient } from "../entities/Patients"; // <--- ADD THIS IMPORT
import { Doctor } from "../entities/Doctor";   // <--- ADD THIS IMPORT
import { UserRole } from "../entities/User";    // <--- ADD THIS IMPORT for role checking


// Book Appointment (POST /api/appointments)
// Protected: Only Patients can book appointments for now.
export const bookAppointment = async (req: Request, res: Response) => {
  try {
    const { slotId, notes } = req.body;
    // const patientId = req.user.patient_id; // Original comment: Assuming patient_id is available in req.user from JWT or derived

    // Authorization: Only authenticated patients can book appointments.
    // Fetch user and check role
    if (!req.user || !req.user.user_id || req.user.role !== UserRole.PATIENT) { // Using UserRole enum
      return res.status(403).json({ message: "Forbidden: Only authenticated patients can book appointments." });
    }
    
    // Find patient profile ID based on authenticated user's ID
    const patientRepo = AppDataSource.getRepository(Patient);
    const patientProfile = await patientRepo.findOneBy({ user: { id: req.user.user_id } });
    if (!patientProfile) {
        return res.status(404).json({ message: "Patient profile not found for the authenticated user. Please create your patient profile first." });
    }
    const actualPatientId = patientProfile.id; // This is the ID of the Patient entity

    if (!slotId) {
      return res.status(400).json({ error: "Slot ID is required to book an appointment." });
    }

    const result = await bookAppointmentService({ slotId, patientId: actualPatientId, notes });
    return res.status(201).json(result);
  } catch (error: any) {
    console.error("❌ Error booking appointment:", error);
    return res.status(error.status || 500).json({ error: error.message || "Internal server error" });
  }
};

// Reschedule Appointment (PATCH /api/appointments/:id/reschedule)
// Protected: Only Patient who owns the appointment can reschedule
export const rescheduleAppointment = async (req: Request, res: Response) => {
  try {
    const { id: appointmentId } = req.params;
    const { newSlotId } = req.body;
    
    // Authorization: Only authenticated patients can reschedule appointments.
    if (!req.user || !req.user.user_id || req.user.role !== UserRole.PATIENT) { // Using UserRole enum
      return res.status(403).json({ message: "Forbidden: Only authenticated patients can reschedule appointments." });
    }
    // Derive patientId from req.user
    const patientRepo = AppDataSource.getRepository(Patient);
    const patientProfile = await patientRepo.findOneBy({ user: { id: req.user.user_id } });
    if (!patientProfile) {
        return res.status(404).json({ message: "Patient profile not found for the authenticated user." });
    }
    const actualPatientId = patientProfile.id;


    if (!newSlotId) {
      return res.status(400).json({ error: "New Slot ID is required for rescheduling." });
    }

    const result = await rescheduleAppointmentService(appointmentId, newSlotId, actualPatientId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("❌ Error rescheduling appointment:", error);
    return res.status(error.status || 500).json({ error: error.message || "Internal server error" });
  }
};

// Cancel Appointment (DELETE /api/appointments/:id)
// Protected: Patient who owns it OR Doctor it's with can cancel
export const cancelAppointment = async (req: Request, res: Response) => {
  try {
    const { id: appointmentId } = req.params;
    const userId = req.user.user_id;
    const userRole = req.user.role;

    if (!userId || !userRole) {
        return res.status(401).json({ message: "Unauthorized." });
    }

    const result = await cancelAppointmentService(appointmentId, userId, userRole);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("❌ Error cancelling appointment:", error);
    return res.status(error.status || 500).json({ error: error.message || "Internal server error" });
  }
};

// Get Patient's Appointments (GET /api/appointments/patient/:id)
// Protected: Only the patient themselves can view OR doctors (if allowed)
export const getPatientAppointments = async (req: Request, res: Response) => {
  try {
    const { id: patientIdParam } = req.params; // The patientId from URL param
    const userId = req.user.user_id;
    const userRole = req.user.role;

    if (!userId || !userRole) {
        return res.status(401).json({ message: "Unauthorized." });
    }

    // Authorization logic:
    // A patient can only view their own appointments
    // A doctor can view any patient's appointments (for now, until specific assignment logic)
    if (userRole === UserRole.PATIENT) { // Using UserRole enum
        const patientRepo = AppDataSource.getRepository(Patient);
        const patientProfile = await patientRepo.findOneBy({ user: { id: userId } });
        // Check if patient profile exists and if the ID matches the requested patientIdParam
        if (!patientProfile || patientProfile.id !== patientIdParam) {
            return res.status(403).json({ message: "Forbidden: Patients can only view their own appointments." });
        }
    } else if (userRole === UserRole.DOCTOR) { // Using UserRole enum
        // Doctors are allowed to view any patient's appointments for now
        // Future enhancement: restrict doctors to only view appointments of patients they are associated with.
    } else {
        return res.status(403).json({ message: "Forbidden: Unauthorized role to view patient appointments." });
    }

    const appointments = await getPatientAppointmentsService(patientIdParam, userId);
    return res.status(200).json(appointments);
  } catch (error: any) {
    console.error("❌ Error fetching patient appointments:", error);
    return res.status(error.status || 500).json({ error: error.message || "Internal server error" });
  }
};

// Get Doctor's Appointments (GET /api/appointments/doctor/:id)
// Protected: Only the doctor themselves can view
export const getDoctorAppointments = async (req: Request, res: Response) => {
  try {
    const { id: doctorIdParam } = req.params; // The doctorId from URL param
    const userId = req.user.user_id;
    const userRole = req.user.role;

    if (!userId || !userRole) {
        return res.status(401).json({ message: "Unauthorized." });
    }

    // Authorization logic: Only the doctor can view their own appointments
    if (userRole !== UserRole.DOCTOR) { // Using UserRole enum
        return res.status(403).json({ message: "Forbidden: Only doctors can view doctor appointments." });
    }
    const doctorRepo = AppDataSource.getRepository(Doctor);
    const doctorProfile = await doctorRepo.findOneBy({ user: { id: userId } });
    if (!doctorProfile || doctorProfile.id !== doctorIdParam) {
        return res.status(403).json({ message: "Forbidden: Doctors can only view their own appointments." });
    }

    const appointments = await getDoctorAppointmentsService(doctorIdParam, userId);
    return res.status(200).json(appointments);
  } catch (error: any) {
    console.error("❌ Error fetching doctor appointments:", error);
    return res.status(error.status || 500).json({ error: error.message || "Internal server error" });
  }
};