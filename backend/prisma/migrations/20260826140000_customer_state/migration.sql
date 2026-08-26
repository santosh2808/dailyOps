-- Additive: Dashboard Redesign v2 — India Sales Map. Nullable so existing
-- Customer rows are unaffected; new/edited customers pick one of the 36
-- India states/UTs from backend/src/common/india-states.ts via the
-- Customer form. Sales Orders have no state field of their own — they're
-- attributed to a state through this column on their Customer.
ALTER TABLE "Customer" ADD COLUMN "state" TEXT;
