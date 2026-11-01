-- Cartilla: el dueño puede registrar vacunas y desparasitaciones desde la app.
-- Aditiva: las filas existentes quedan como VACCINE / registradas por la clínica.

-- CreateEnum
CREATE TYPE "VaccinationKind" AS ENUM ('VACCINE', 'DEWORMING');

-- AlterTable
ALTER TABLE "Vaccination" ADD COLUMN     "kind" "VaccinationKind" NOT NULL DEFAULT 'VACCINE',
ADD COLUMN     "recordedByOwner" BOOLEAN NOT NULL DEFAULT false;
