// src/routes/patient.route.ts
import { Router } from "express";
import {
  getPatientById,
  updatePatientById,
  createPatientProfile
} from "../controllers/patient.controller";
import { verifyToken } from '../middlewares/verifyToken';

const router = Router();

// Create patient profile (after user registers as a patient)
router.post("/", verifyToken, createPatientProfile); // Protected: A patient user creates their profile

router.get("/:id", verifyToken, getPatientById); // <--- NOW PROTECTED: Added 'verifyToken'
router.patch("/:id", verifyToken, updatePatientById); // Protected (with owner check in controller)

export default router;