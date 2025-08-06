// src/routes/availability.route.ts
import { Router } from "express";
import {
    getDoctorAvailabilitySlots,
    addDoctorAvailabilitySlot,
    deleteDoctorAvailabilitySlot,
    updateDoctorAvailabilitySlot, // <--- ADD THIS IMPORT
} from "../controllers/availability.controller";
import { verifyToken } from "../middlewares/verifyToken";

// IMPORTANT: { mergeParams: true } is needed here because it's a nested router
const router = Router({ mergeParams: true });

router.get("/", getDoctorAvailabilitySlots); // GET /api/doctors/:id/slots
router.post("/", verifyToken, addDoctorAvailabilitySlot); // POST /api/doctors/:id/slots
router.delete("/:slotId", verifyToken, deleteDoctorAvailabilitySlot); // DELETE /api/doctors/:id/slots/:slotId

// NEW: Route to update an existing availability slot
router.patch("/:slotId", verifyToken, updateDoctorAvailabilitySlot); // <--- ADD THIS LINE

export default router;