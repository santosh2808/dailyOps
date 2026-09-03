-- Scope of Work customization for Job Execution Orders — how the fan is
-- physically hung at site (fixed vocabulary: High Beam / RCC Slab Beam /
-- Pipe Truss), the pipe length used, and the fan colour (defaults to
-- Aluminium, the company's standard finish, rather than being left blank).
-- CreateEnum
CREATE TYPE "HangingStructureType" AS ENUM ('HIGH_BEAM', 'RCC_SLAB_BEAM', 'PIPE_TRUSS');

-- AlterTable
ALTER TABLE "JobExecutionOrder" ADD COLUMN "pipeLength" TEXT;
ALTER TABLE "JobExecutionOrder" ADD COLUMN "hangingStructureType" "HangingStructureType";
ALTER TABLE "JobExecutionOrder" ADD COLUMN "color" TEXT NOT NULL DEFAULT 'Aluminium';
