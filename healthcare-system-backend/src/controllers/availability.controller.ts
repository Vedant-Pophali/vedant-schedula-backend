// src/controllers/availability.controller.ts
import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { AvailabilitySlot, SlotType } from "../entities/AvailabilitySlot";
import { Doctor } from "../entities/Doctor";
import { UserRole } from "../entities/User";
import { Appointment, AppointmentStatus } from "../entities/Appointment";
import { In } from "typeorm";

// GET /api/doctors/:id/slots – Get all available slots for a doctor
export const getDoctorAvailabilitySlots = async (req: Request, res: Response) => {
    try {
        const { id: doctorId } = req.params;
        const slotRepo = AppDataSource.getRepository(AvailabilitySlot);
        const doctorRepo = AppDataSource.getRepository(Doctor);

        const doctorExists = await doctorRepo.count({ where: { id: doctorId } });
        if (doctorExists === 0) {
            return res.status(404).json({ message: "Doctor not found." });
        }

        const slots = await slotRepo.find({
            where: { doctorId },
            order: { startTime: "ASC" },
        });

        return res.status(200).json(slots);
    } catch (error) {
        console.error("❌ Error fetching doctor availability slots:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

// POST /api/doctors/:id/slots – Add slot (auth required)
export const addDoctorAvailabilitySlot = async (req: Request, res: Response) => {
    try {
        const { id: doctorIdParam } = req.params;
        const { startTime, endTime, slotType, maxCapacity } = req.body;
        const userId = req.user.user_id;
        const userRole = req.user.role;

        if (!startTime || !endTime) {
            return res.status(400).json({ message: "startTime and endTime are required" });
        }

        const startDateTime = new Date(startTime);
        const endDateTime = new Date(endTime);

        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            return res.status(400).json({ message: "Invalid date/time format for startTime or endTime." });
        }
        if (endDateTime <= startDateTime) {
            return res.status(400).json({ message: "endTime must be after startTime." });
        }
        if (startDateTime < new Date()) {
            return res.status(400).json({ message: "Cannot add slots in the past." });
        }

        const slotRepo = AppDataSource.getRepository(AvailabilitySlot);
        const doctorRepo = AppDataSource.getRepository(Doctor);

        if (userRole !== UserRole.DOCTOR) {
            return res.status(403).json({ message: "Forbidden: Only doctors can add availability slots." });
        }

        const doctor = await doctorRepo.findOne({
            where: { id: doctorIdParam, userId: userId },
            relations: ["user"]
        });

        if (!doctor) {
            return res.status(403).json({ message: "Unauthorized or Doctor not found for this user." });
        }

        if (slotType === SlotType.WAVE) {
            if (maxCapacity === undefined || maxCapacity === null || maxCapacity <= 0) {
                return res.status(400).json({ message: "maxCapacity is required and must be a positive number for WAVE slots." });
            }
        } else if (slotType && slotType !== SlotType.STREAM) {
            return res.status(400).json({ message: "Invalid slotType provided. Must be 'stream' or 'wave'." });
        }

        const newSlot = slotRepo.create({
            startTime: startDateTime,
            endTime: endDateTime,
            doctorId: doctor.id,
            isAvailable: true,
            slotType: slotType || SlotType.STREAM,
            // --- FIX HERE: Use 'unknown' in type assertion for null assignment ---
            maxCapacity: slotType === SlotType.WAVE ? maxCapacity : (null as unknown as number | undefined),
            // --- END FIX ---
            bookedCount: 0
        });

        await slotRepo.save(newSlot);

        return res.status(201).json({
            message: "Availability slot added successfully",
            slot: newSlot,
        });
    } catch (error: any) {
        console.error("❌ Error adding doctor availability slot:", error);
        if (error.code === '23505' && error.detail.includes('unique')) {
            return res.status(409).json({ message: "A slot with this start time already exists for this doctor or overlaps with an existing slot (if you add overlap logic)." });
        }
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

// PATCH /api/doctors/:id/slots/:slotId – Update a slot (e.g., change to wave, adjust capacity)
export const updateDoctorAvailabilitySlot = async (req: Request, res: Response) => {
    try {
        const { id: doctorIdParam, slotId } = req.params;
        const { startTime, endTime, isAvailable, slotType, maxCapacity } = req.body;
        const userId = req.user.user_id;
        const userRole = req.user.role;

        const slotRepo = AppDataSource.getRepository(AvailabilitySlot);
        const doctorRepo = AppDataSource.getRepository(Doctor);

        if (userRole !== UserRole.DOCTOR) {
            return res.status(403).json({ message: "Forbidden: Only doctors can update availability slots." });
        }

        const doctor = await doctorRepo.findOne({
            where: { id: doctorIdParam, userId: userId },
            relations: ["user"]
        });

        if (!doctor) {
            return res.status(403).json({ message: "Unauthorized or Doctor not found for this user." });
        }

        const slot = await slotRepo.findOne({
            where: { id: slotId, doctorId: doctor.id },
        });

        if (!slot) {
            return res.status(404).json({ message: "Availability slot not found or does not belong to this doctor." });
        }

        const activeAppointments = await AppDataSource.getRepository(Appointment).count({
            where: {
                slotId: slot.id,
                status: In([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED])
            }
        });

        if (activeAppointments > 0 && (slotType !== undefined || maxCapacity !== undefined)) {
            return res.status(400).json({ message: "Cannot change slot type or capacity for a slot with active appointments. Please cancel them first." });
        }

        if (startTime !== undefined) slot.startTime = new Date(startTime);
        if (endTime !== undefined) slot.endTime = new Date(endTime);
        if (isAvailable !== undefined) slot.isAvailable = isAvailable;

        if (slotType !== undefined) {
            if (!Object.values(SlotType).includes(slotType)) {
                return res.status(400).json({ message: "Invalid slotType provided. Must be 'stream' or 'wave'." });
            }
            slot.slotType = slotType;
        }

        if (maxCapacity !== undefined) {
            if (slot.slotType === SlotType.WAVE) {
                if (typeof maxCapacity !== 'number' || maxCapacity <= 0) {
                    return res.status(400).json({ message: "maxCapacity is required and must be a positive number for WAVE slots." });
                }
                slot.maxCapacity = maxCapacity;
            } else {
                // If changing to STREAM, maxCapacity should be null
                slot.maxCapacity = null as unknown as number | undefined; // <--- FIX HERE
            }
        } else if (slotType === SlotType.STREAM) {
            // If slotType is explicitly set to STREAM and maxCapacity is not provided, ensure it's null
            slot.maxCapacity = null as unknown as number | undefined; // <--- FIX HERE
        }

        // Ensure slot.maxCapacity is treated as a number for this check
        if (slot.slotType === SlotType.WAVE && typeof slot.maxCapacity === 'number' && slot.bookedCount > slot.maxCapacity) {
            return res.status(400).json({ message: `Cannot reduce maxCapacity below current bookedCount (${slot.bookedCount}).` });
        }

        await slotRepo.save(slot);

        return res.status(200).json({
            message: "Availability slot updated successfully",
            slot: slot,
        });

    } catch (error: any) {
        console.error("❌ Error updating doctor availability slot:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

// DELETE /api/doctors/:id/slots/:slotId – Delete a slot
export const deleteDoctorAvailabilitySlot = async (req: Request, res: Response) => {
    try {
        const { id: doctorIdParam, slotId } = req.params;
        const userId = req.user.user_id;
        const userRole = req.user.role;

        const slotRepo = AppDataSource.getRepository(AvailabilitySlot);
        const doctorRepo = AppDataSource.getRepository(Doctor);

        if (userRole !== UserRole.DOCTOR) {
            return res.status(403).json({ message: "Forbidden: Only doctors can delete availability slots." });
        }

        const doctor = await doctorRepo.findOne({
            where: { id: doctorIdParam, userId: userId },
            relations: ["user"]
        });

        if (!doctor) {
            return res.status(403).json({ message: "Unauthorized or Doctor not found for this user." });
        }

        const slot = await slotRepo.findOne({
            where: { id: slotId, doctorId: doctor.id },
        });

        if (!slot) {
            return res.status(404).json({ message: "Availability slot not found or does not belong to this doctor." });
        }

        const activeAppointments = await AppDataSource.getRepository(Appointment).count({
            where: {
                slotId: slot.id,
                status: In([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED])
            }
        });

        if (activeAppointments > 0) {
            return res.status(400).json({ message: "Cannot delete a slot with active appointments. Please cancel them first." });
        }

        await slotRepo.remove(slot);

        return res.status(200).json({ message: "Availability slot deleted successfully" });
    } catch (error) {
        console.error("❌ Error deleting doctor availability slot:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};