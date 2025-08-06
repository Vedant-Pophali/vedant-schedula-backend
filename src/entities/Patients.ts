import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn
} from "typeorm";
import { User } from "./User";

export enum Gender {
  MALE = "male",
  FEMALE = "female",
  OTHER = "other"
}

@Entity()
export class Patient {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @OneToOne(() => User, (user) => user.patient)
  @JoinColumn()
  user!: User;

  @Column()
  fullName!: string;

  @Column()
  age!: number;

  @Column({
    type: "enum",
    enum: Gender,
  })
  gender!: Gender;
}