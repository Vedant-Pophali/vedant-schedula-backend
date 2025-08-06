// src/controllers/patient.controller.ts
import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Patient } from "../entities/Patients";
import { User } from "../entities/User"; // Assuming User entity is in ../entities/User
import { UserRole } from "../entities/User"; // NEW: Import UserRole enum

// GET /api/patients/:id (NOW SECURE: Protected with role-based access)
export const getPatientById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // The ID of the patient being requested
    // req.user is populated by the verifyToken middleware, which is now on this route
    const requestingUserId = req.user.user_id; // The ID of the logged-in user
    const requestingUserRole = req.user.role; // The role of the logged-in user

    const patientRepo = AppDataSource.getRepository(Patient);
    // Load patient and its associated user
    const patient = await patientRepo.findOne({ where: { id }, relations: ["user"] });

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    // --- ACCESS CONTROL LOGIC ---
    // 1. If the requesting user is a patient, they can only view their own profile.
    if (requestingUserRole === UserRole.PATIENT && patient.user.id !== requestingUserId) {
      return res.status(403).json({ message: "Forbidden: Patients can only view their own profile." });
    }
    // 2. Doctors can view any patient's profile. No explicit 'else if' needed as they pass the above check.
    //    If you introduce an Admin role, you might add 'else if (requestingUserRole === UserRole.ADMIN) { /* allow */ }'


    // If the request passes the access control, return the patient details
    return res.status(200).json({
      patient_id: patient.id,
      full_name: patient.fullName,
      email: patient.user?.email, // Ensure user relation is loaded and available
      age: patient.age,
      gender: patient.gender,
    });
  } catch (error) {
    console.error("Error fetching patient:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// PATCH /api/patients/:id (Protected - with owner check)
export const updatePatientById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.user_id; // From verifyToken middleware

    const repo = AppDataSource.getRepository(Patient);
    const patient = await repo.findOne({ where: { id }, relations: ["user"] });

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    // IMPORTANT: Ensure the authenticated user can only update their OWN patient profile
    if (patient.user.id !== userId) {
      return res.status(403).json({ message: "Unauthorized to update this patient profile" });
    }

    const { fullName, age, gender } = req.body;

    // Update only the fields that exist in the Patient entity
    repo.merge(patient, {
      fullName, age, gender,
    });

    await repo.save(patient);

    return res.status(200).json({ message: "Patient profile updated successfully" });
  } catch (error) {
    console.error("Error updating patient:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /api/patients - Create Patient Profile (after user registration)
export const createPatientProfile = async (req: Request, res: Response) => {
  try {
    const { fullName, age, gender } = req.body;
    const userId = req.user.user_id; // From verifyToken middleware

    // This check also covers the `fullName` casing issue you had earlier, as all are checked.
    if (!fullName || age === undefined || !gender) { // Check age for 'undefined' to allow '0' as a valid age.
      return res.status(400).json({ error: "All fields (fullName, age, gender) are required" });
    }

    const patientRepo = AppDataSource.getRepository(Patient);
    const userRepo = AppDataSource.getRepository(User);

    const user = await userRepo.findOneBy({ id: userId });
    if (!user || user.role !== UserRole.PATIENT) { // Using UserRole enum here too for consistency
      return res.status(403).json({ message: "Unauthorized: Only patients can create patient profiles." });
    }

    const existingPatient = await patientRepo.findOneBy({ user: { id: userId } });
    if (existingPatient) {
      return res.status(409).json({ message: "Patient profile already exists for this user." });
    }

    const patient = patientRepo.create({
      fullName,
      age,
      gender,
      user: user, // Link to the existing User entity
    });

    await patientRepo.save(patient);

    return res.status(201).json({
      message: "Patient profile created successfully",
      patient_id: patient.id,
    });
  } catch (error) {
    console.error("❌ Error creating patient profile:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};