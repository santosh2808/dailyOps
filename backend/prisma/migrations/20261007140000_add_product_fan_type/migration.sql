-- QA feature upgrade: HVLS Fans products must specify how the fan is
-- mounted (Roof / Floor / Pole) before they can be saved. Nullable at the
-- DB level — a non-fan product (motor, drive, BMS, IoT, etc.) is never
-- forced to pick one; ProductsService.create()/update() is what actually
-- enforces "must be set whenever category is HVLS Fans" (app-level, same
-- conditional-required convention as Customer.gstNumber/isGstRegistered).
-- CreateEnum
CREATE TYPE "FanType" AS ENUM ('ROOF', 'FLOOR', 'POLE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "fanType" "FanType";
