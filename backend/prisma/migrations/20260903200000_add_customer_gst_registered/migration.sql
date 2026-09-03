-- Business rule: GST number is mandatory for GST-registered (B2B) customers,
-- optional for unregistered/retail (B2C) ones. Enforced at the DTO/service
-- layer; this flag records which rule applies to a given customer.
ALTER TABLE "Customer" ADD COLUMN "isGstRegistered" BOOLEAN NOT NULL DEFAULT false;
