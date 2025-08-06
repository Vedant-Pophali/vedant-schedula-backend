// src/controllers/doctorSession.controller.ts
import { Request, Response } from "express";
import { UserRole } from "../entities/User";
import { AppDataSource } from "../config/data-source";
import { Doctor } from "../entities/Doctor";

import { adjustDoctorSessionService } from "../services/doctorSession.service";

// Ensure this function is EXPORTED
export const adjustDoctorSession = async (req: Request, res: Response) => {
    try {
        const { id: doctorIdParam, date: dateParam } = req.params;
        // --- FIX: Get the entire body and then pass specific properties ---
        const requestBody = req.body; // Capture the entire body object

        console.log("Controller received requestBody:", requestBody); // <--- ADDED console.log here

        const userId = req.user.user_id;
        const userRole = req.user.role;

        if (userRole !== UserRole.DOCTOR) {
            return res.status(403).json({ message: "Forbidden: Only doctors can adjust session slots." });
        }

        const doctorRepo = AppDataSource.getRepository(Doctor);
        const doctorProfile = await doctorRepo.findOneBy({ id: doctorIdParam, user: { id: userId } });
        if (!doctorProfile) {
            return res.status(403).json({ message: "Forbidden: You are not authorized to adjust this doctor's session." });
        }

        // Validate essential parameters
        if (!dateParam || !requestBody.newStartTime || !requestBody.newEndTime) {
            return res.status(400).json({ message: "Date (from URL), newStartTime, and newEndTime (from body) are required." });
        }

        const result = await adjustDoctorSessionService({
            doctorId: doctorIdParam,
            date: dateParam,
            newStartTime: requestBody.newStartTime,
            newEndTime: requestBody.newEndTime,
            newConsultationDurationMinutes: requestBody.newConsultationDurationMinutes,
            // --- Pass parameters explicitly from the captured body object ---
            slotIdToAdjustCapacity: requestBody.slotIdToAdjustCapacity,
            newMaxCapacity: requestBody.newMaxCapacity
        });

        return res.status(200).json(result);

    } catch (error: any) {
        console.error("❌ Error adjusting doctor session:", error);
        return res.status(error.status || 500).json({ error: error.message || "Internal server error" });
    }
};