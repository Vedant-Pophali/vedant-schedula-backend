// src/routes/auth.routes.ts
import { Router } from "express";
import {
  registerDoctor,
  registerPatient,
  loginUser,
  logoutUser,
} from "../controllers/auth.controller";
import { verifyToken } from "../middlewares/verifyToken";

const router = Router();

// 🔹 Patient & Doctor Signup (Role-Specific)
router.post("/patient/register", registerPatient);
router.post("/doctor/register", registerDoctor);

// 🔹 Shared Auth Routes
router.post("/login", loginUser);
router.post("/logout", verifyToken, logoutUser);

// 🔹 Test Route
router.get("/protected", verifyToken, (req, res) => {
  res.json({
    message: "Protected route accessed successfully",
    user: req.user,
  });
});

export default router;