import { MigrationInterface, QueryRunner } from "typeorm";

export class DropAvailabilitySlotUniqueIndex1753414813613 implements MigrationInterface {
    name = 'DropAvailabilitySlotUniqueIndex1753414813613'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_469a8fa087cf4beda1268a0aeb"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_469a8fa087cf4beda1268a0aeb" ON "availability_slot" ("doctorId", "startTime") `);
    }

}
