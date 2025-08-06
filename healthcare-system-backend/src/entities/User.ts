// src/entities/User.ts (No change needed, already OneToOne)
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
} from "typeorm";
import { Doctor } from "./Doctor";
import { Patient } from "./Patients";

export enum UserRole {
  DOCTOR = "doctor",
  PATIENT = "patient"
}

@Entity()
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password!: string;

  @Column({
    type: "enum",
    enum: UserRole,
  })
  role!: UserRole;

  @OneToOne(() => Doctor, (doctor) => doctor.user, { cascade: true })
  doctor?: Doctor;

  @OneToOne(() => Patient, (patient) => patient.user, { cascade: true })
  patient?: Patient;
}