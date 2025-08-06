// src/controllers/auth.controller.ts
import { Request, Response } from "express";
import { signupUser, loginService } from "../services/auth.service";

// 🟢 Register Patient
export const registerPatient = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const response = await signupUser({ name, email, password, role: "patient" });
    return res.status(201).json(response);
  } catch (err: any) {
    if (err.message === "Email already exists") {
      return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

// 🟢 Register Doctor
export const registerDoctor = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const response = await signupUser({ name, email, password, role: "doctor" });
    return res.status(201).json(response);
  } catch (err: any) {
    if (err.message === "Email already exists") {
      return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

// 🟡 Login
export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Both email and password are required" });
    }

    const result = await loginService(email, password);
    return res.status(200).json({
      message: "Login successful",
      user: result,
    });
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

// 🔴 Logout (JWT-based stateless)
export const logoutUser = async (req: Request, res: Response) => {
  try {
    res.status(200).json({ message: "Logout successful" });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to logout" });
  }
};