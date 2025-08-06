import { Router } from "express";
import { getProfile } from "../controllers/profile.controller";
import { verifyToken } from "../middlewares/verifyToken";

const router = Router();

// Protected profile route
router.get("/", verifyToken, getProfile);

export default router;