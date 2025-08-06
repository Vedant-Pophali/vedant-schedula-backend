import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWaveSchedulingFields1753413416414 implements MigrationInterface {
    name = 'AddWaveSchedulingFields1753413416414'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointment" ADD "expectedCheckInTime" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE TYPE "public"."availability_slot_slottype_enum" AS ENUM('stream', 'wave')`);
        await queryRunner.query(`ALTER TABLE "availability_slot" ADD "slotType" "public"."availability_slot_slottype_enum" NOT NULL DEFAULT 'stream'`);
        await queryRunner.query(`ALTER TABLE "availability_slot" ADD "maxCapacity" integer`);
        await queryRunner.query(`ALTER TABLE "availability_slot" ADD "bookedCount" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "appointment" DROP CONSTRAINT "FK_b463fce395ead7791607a5c33eb"`);
        await queryRunner.query(`ALTER TABLE "appointment" DROP CONSTRAINT "UQ_b463fce395ead7791607a5c33eb"`);
        await queryRunner.query(`ALTER TABLE "appointment" ADD CONSTRAINT "FK_b463fce395ead7791607a5c33eb" FOREIGN KEY ("slotId") REFERENCES "availability_slot"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointment" DROP CONSTRAINT "FK_b463fce395ead7791607a5c33eb"`);
        await queryRunner.query(`ALTER TABLE "appointment" ADD CONSTRAINT "UQ_b463fce395ead7791607a5c33eb" UNIQUE ("slotId")`);
        await queryRunner.query(`ALTER TABLE "appointment" ADD CONSTRAINT "FK_b463fce395ead7791607a5c33eb" FOREIGN KEY ("slotId") REFERENCES "availability_slot"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "availability_slot" DROP COLUMN "bookedCount"`);
        await queryRunner.query(`ALTER TABLE "availability_slot" DROP COLUMN "maxCapacity"`);
        await queryRunner.query(`ALTER TABLE "availability_slot" DROP COLUMN "slotType"`);
        await queryRunner.query(`DROP TYPE "public"."availability_slot_slottype_enum"`);
        await queryRunner.query(`ALTER TABLE "appointment" DROP COLUMN "expectedCheckInTime"`);
    }

}
