// src/entities/AvailabilitySlot.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    OneToMany
} from "typeorm";
import { Doctor } from "./Doctor";
import { Appointment } from "./Appointment"; // Import for reverse relation

// Enum for slot types
export enum SlotType {
    STREAM = "stream",
    WAVE = "wave"
}

@Entity()
// IMPORTANT: This index was dropped in a previous migration.
// Ensure it is commented out or removed from the entity definition
// so TypeORM doesn't try to re-create it or expect it.
// @Index(["doctorId", "startTime"], { unique: true })
export class AvailabilitySlot {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ type: "timestamp with time zone" })
    startTime!: Date;

    @Column({ type: "timestamp with time zone" })
    endTime!: Date;

    @Column({ default: true })
    isAvailable!: boolean;

    @Column({
        type: "enum",
        enum: SlotType,
        default: SlotType.STREAM
    })
    slotType!: SlotType; // Added for wave scheduling

    @Column({ nullable: true, type: "int" })
    maxCapacity?: number; // Added for wave scheduling, nullable for stream

    @Column({ default: 0 })
    bookedCount!: number; // Added for wave scheduling, tracks current bookings

    @ManyToOne(() => Doctor, (doctor) => doctor.id, { onDelete: "CASCADE" })
    @JoinColumn({ name: "doctorId" })
    doctor!: Doctor;

    @Column()
    doctorId!: string;

    @OneToMany(() => Appointment, appointment => appointment.slot)
    appointments?: Appointment[];
}