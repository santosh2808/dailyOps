-- Dispatch gate is moving from "any advance > 0" to "advance >= 50% of
-- grandTotal", with a documented exception: below 50%, an Administrator
-- may still dispatch if one of two fixed named approvers (Santosh Kumar
-- Chegondi / Amarpal Gampa) authorizes it. Neither approver is a real User
-- account, so this is recorded as a plain scalar (validated against a fixed
-- allow-list at the DTO layer), alongside the existing dispatchOverride*
-- audit fields.
-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN "dispatchOverrideApprovedBy" TEXT;
