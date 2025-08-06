// src/routes/doctor.route.ts
import { Router } from "express";
import {
  getAllDoctors,
  getDoctorById,
  createDoctorProfile,
  updateDoctorProfile,
  getMyDoctorProfile
} from "../controllers/doctor.controller";
import { verifyToken } from "../middlewares/verifyToken";
import availabilityRoutes from "./availability.route"; // Import availability routes

const router = Router();

router.get("/", getAllDoctors);
router.get("/my-profile", verifyToken, getMyDoctorProfile);
router.get("/:id", getDoctorById);
router.post("/", verifyToken, createDoctorProfile);
router.patch("/:id", verifyToken, updateDoctorProfile);

router.use("/:id/slots", availabilityRoutes); // This is correct for nesting

export default router;