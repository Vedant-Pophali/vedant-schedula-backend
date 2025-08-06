// src/routes/doctorSession.routes.ts
import { Router } from "express";
import { adjustDoctorSession } from "../controllers/doctorSession.controller";
import { verifyToken } from "../middlewares/verifyToken";

// IMPORTANT: { mergeParams: true } is needed to access params from parent router (e.g., :id for doctorId)
const router = Router({ mergeParams: true });

// PATCH /api/doctors/:id/sessions/:date/adjust
router.patch("/:date/adjust", verifyToken, adjustDoctorSession);

export default router;