// src/entities/Appointment.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from "typeorm";
import { Doctor } from "./Doctor";
import { Patient } from "./Patients";
import { AvailabilitySlot } from "./AvailabilitySlot"; // Ensure this import is correct

export enum AppointmentStatus {
    PENDING = "pending",
    CONFIRMED = "confirmed",
    COMPLETED = "completed",
    CANCELLED = "cancelled",
    RESCHEDULED = "rescheduled",
    REJECTED = "rejected",
}

@Entity()
@Index(["doctorId", "patientId", "appointmentTime"], { unique: false })
export class Appointment {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @ManyToOne(() => Doctor, { onDelete: "SET NULL" })
    @JoinColumn({ name: "doctorId" })
    doctor!: Doctor;

    @Column({ nullable: true })
    doctorId!: string;

    @ManyToOne(() => Patient, { onDelete: "SET NULL" })
    @JoinColumn({ name: "patientId" })
    patient!: Patient;

    @Column({ nullable: true })
    patientId!: string;

    // A single AvailabilitySlot can now have many Appointments (for wave scheduling)
    @ManyToOne(() => AvailabilitySlot, slot => slot.appointments, { nullable: true })
    @JoinColumn({ name: "slotId" })
    slot?: AvailabilitySlot;

    // Multiple appointments can now point to the same slotId in wave scheduling
    @Column({ nullable: true }) // Removed unique: true in a previous migration
    slotId?: string;

    @Column({ type: "timestamp with time zone" })
    appointmentTime!: Date; // This will be the specific time within the wave slot

    @Column({ type: "enum", enum: AppointmentStatus, default: AppointmentStatus.PENDING })
    status!: AppointmentStatus;

    @Column({ nullable: true })
    notes?: string;

    // This field is for wave scheduling, allowing a specific check-in time within a slot.
    @Column({ type: "timestamp with time zone", nullable: true })
    expectedCheckInTime?: Date;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
