// src/config/data-source.ts
import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
// Import your entities directly as they are the source of truth
import { User } from "../entities/User";
import { Doctor } from "../entities/Doctor";
import { Patient } from "../entities/Patients";
import { AvailabilitySlot } from "../entities/AvailabilitySlot";
import { Appointment } from "../entities/Appointment";

dotenv.config();

export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432"),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [User, Doctor, Patient, AvailabilitySlot, Appointment, "dist/entities/*.js"],
    synchronize: false, 
    logging: true,
    migrations: ["src/migrations/*.ts", "dist/migrations/*.js"], 
});