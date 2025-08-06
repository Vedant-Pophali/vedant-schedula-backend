import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities/User";
import { hashPassword, comparePassword } from "../util/password";
import jwt from "jsonwebtoken";
interface SignupInput {
  name: string;
  email: string;
  password: string;
  role: "doctor" | "patient";
}

// Service: Signup
export const signupUser = async ({ name, email, password, role }: SignupInput) => {
  const userRepo = AppDataSource.getRepository(User);

  const existingUser = await userRepo.findOneBy({ email });
  if (existingUser) {
    throw new Error("Email already exists");
  }

  const hashedPassword = await hashPassword(password);

  const newUser = userRepo.create({
    email,
    password: hashedPassword,
    role: role as UserRole,
  });

  await userRepo.save(newUser);

  return { message: "Signup successful" };
};

// Service: Login
export const loginService = async (email: string, password: string) => {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOneBy({ email });

  if (!user) {
    const error = new Error("Invalid credentials") as any;
    error.status = 401;
    throw error;
  }

  const isMatch = await comparePassword(password, user.password);
  if (!isMatch) {
    const error = new Error("Invalid credentials") as any;
    error.status = 401;
    throw error;
  }

  const payload = {
    user_id: user.id,
    email: user.email,
    role: user.role,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "1h" });

  return {
    ...payload,
    token,
  };
};