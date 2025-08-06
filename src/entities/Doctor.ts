// src/entities/Doctor.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User"; // <-- FIX THIS LINE: Changed '=>' to 'from' and removed space

@Entity()
export class Doctor {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  fullName!: string;

  @Column()
  phone!: string;

  @Column()
  specialization!: string;

  @Column()
  experience!: number;

  @Column()
  bio!: string;

  @Column()
  profilePictureUrl!: string;

  @Column()
  consultationFee!: number;

  @Column()
  location!: string;

  @Column("text", { array: true })
  availableDays!: string[];

  @Column("text", { array: true })
  availableHours!: string[];

  @Column({ default: true })
  isActive!: boolean;

  @OneToOne(() => User, (user) => user.doctor)
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ unique: true })
  userId!: string;
}