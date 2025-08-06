// src/controllers/doctor.controller.ts
import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Doctor } from "../entities/Doctor";
import { UserRole } from "../entities/User"; // <--- ADD THIS IMPORT

// Create a doctor profile (protected route)
export const createDoctorProfile = async (req: Request, res: Response) => {
  try {
    const {
      fullName,
      phone,
      specialization,
      experience,
      bio,
      profilePictureUrl,
      consultationFee,
      location,
      availableDays,
      availableHours,
      isActive,
    } = req.body;

    const userId = req.user.user_id;

    const doctorRepo = AppDataSource.getRepository(Doctor);
    const existing = await doctorRepo.findOneBy({ userId });

    if (existing) {
      return res.status(409).json({ message: "Doctor profile already exists" });
    }

    const doctor = doctorRepo.create({
      fullName,
      phone,
      specialization,
      experience,
      bio,
      profilePictureUrl,
      consultationFee,
      location,
      availableDays,
      availableHours,
      isActive,
      userId,
    });

    await doctorRepo.save(doctor);

    return res.status(201).json({
      message: "Doctor profile created successfully",
      doctor_id: doctor.id,
    });
  } catch (error) {
    console.error("❌ Error creating doctor profile:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get all doctors (public)
export const getAllDoctors = async (req: Request, res: Response) => {
  try {
    const doctorRepo = AppDataSource.getRepository(Doctor);
    const doctors = await doctorRepo.find({ relations: ["user"] });

    const response = doctors.map((doc) => ({
      doctor_id: doc.id,
      full_name: doc.fullName,
      email: doc.user.email,
      specialization: doc.specialization,
      experience: doc.experience,
    }));

    return res.status(200).json(response);
  } catch (error) {
    console.error("❌ Error fetching doctors:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Get single doctor by ID (public)
export const getDoctorById = async (req: Request, res: Response) => {
  const doctorId = req.params.id;

  try {
    const doctorRepo = AppDataSource.getRepository(Doctor);
    const doctor = await doctorRepo.findOne({
      where: { id: doctorId },
      relations: ["user"],
    });

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    return res.status(200).json({
      doctor_id: doctor.id,
      full_name: doctor.fullName,
      email: doctor.user.email,
      phone: doctor.phone,
      specialty: doctor.specialization,
      experience_years: doctor.experience,
      bio: doctor.bio,
      profile_picture_url: doctor.profilePictureUrl,
      consultation_fee: doctor.consultationFee,
      location: doctor.location,
      available_days: doctor.availableDays,
      available_hours: doctor.availableHours,
      is_active: doctor.isActive,
      rating_avg: 4.5, // placeholder
      total_reviews: 20, // placeholder
    });
  } catch (error) {
    console.error("❌ Error fetching doctor by ID:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateDoctorProfile = async (req: Request, res: Response) => {
  try {
    const doctorId = req.params.id;
    const userId = req.user.user_id;

    const doctorRepo = AppDataSource.getRepository(Doctor);
    const doctor = await doctorRepo.findOneBy({ id: doctorId });

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Ensure only the owner doctor can update their profile
    if (doctor.userId !== userId) {
      return res.status(403).json({ message: "Unauthorized to update this profile" });
    }

    // Update allowed fields
    const {
      fullName, phone, specialization, experience,
      bio, profilePictureUrl, consultationFee,
      location, availableDays, availableHours, isActive
    } = req.body;

    doctor.fullName = fullName ?? doctor.fullName;
    doctor.phone = phone ?? doctor.phone;
    doctor.specialization = specialization ?? doctor.specialization;
    doctor.experience = experience ?? doctor.experience;
    doctor.bio = bio ?? doctor.bio;
    doctor.profilePictureUrl = profilePictureUrl ?? doctor.profilePictureUrl;
    doctor.consultationFee = consultationFee ?? doctor.consultationFee;
    doctor.location = location ?? doctor.location;
    doctor.availableDays = availableDays ?? doctor.availableDays;
    doctor.availableHours = availableHours ?? doctor.availableHours;
    doctor.isActive = isActive ?? doctor.isActive;

    await doctorRepo.save(doctor);

    return res.status(200).json({
      message: "Doctor profile updated successfully",
    });
  } catch (error) {
    console.error("❌ Error updating doctor profile:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// NEW: Get own doctor profile (protected route for the logged-in doctor)
export const getMyDoctorProfile = async (req: Request, res: Response) => {
    try {
        const userId = req.user.user_id; // From verifyToken middleware
        const userRole = req.user.role;   // From verifyToken middleware

        if (userRole !== UserRole.DOCTOR) {
            return res.status(403).json({ message: "Forbidden: Only doctors can view their own profile this way." });
        }

        const doctorRepo = AppDataSource.getRepository(Doctor);
        const doctor = await doctorRepo.findOne({
            where: { userId: userId }, // Find the doctor profile linked to this user ID
            relations: ["user"] // Load the user relation to get email etc.
        });

        if (!doctor) {
            return res.status(404).json({ message: "Doctor profile not found for this user." });
        }

        return res.status(200).json({
            doctor_id: doctor.id,
            full_name: doctor.fullName,
            email: doctor.user.email,
            phone: doctor.phone,
            specialization: doctor.specialization,
            experience: doctor.experience,
            bio: doctor.bio,
            profile_picture_url: doctor.profilePictureUrl,
            consultation_fee: doctor.consultationFee,
            location: doctor.location,
            available_days: doctor.availableDays,
            available_hours: doctor.availableHours,
            is_active: doctor.isActive,
            // Add placeholder for ratings if you have them in the future
            rating_avg: 0,
            total_reviews: 0,
        });
    } catch (error) {
        console.error("❌ Error fetching own doctor profile:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};