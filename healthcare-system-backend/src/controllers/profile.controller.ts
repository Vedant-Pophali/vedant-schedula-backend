import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";

export const getProfile = async (req: Request, res: Response) => {
  try {
    // req.user is injected by verifyToken middleware
    const { user_id } = req.user;

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: user_id });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("❌ Error fetching profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};