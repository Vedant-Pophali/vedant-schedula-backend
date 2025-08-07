// src/config/data-source.ts
import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import { User } from "../entities/User";
import { Doctor } from "../entities/Doctor";
import { Patient } from "../entities/Patients";
import { AvailabilitySlot } from "../entities/AvailabilitySlot";
import { Appointment } from "../entities/Appointment";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

export const AppDataSource = new DataSource(
  isProduction
    ? {
        type: "postgres",
        url: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        synchronize: false,
        logging: true,
        entities: [User, Doctor, Patient, AvailabilitySlot, Appointment],
        migrations: ["dist/migrations/*.js"],
      }
    : {
        type: "postgres",
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || "5432"),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        synchronize: false,
        logging: true,
        entities: [User, Doctor, Patient, AvailabilitySlot, Appointment],
        migrations: ["src/migrations/*.ts"],
      }
);