-- Placa QR de identificación + avisos de mascota encontrada.
-- Migración incremental y puramente aditiva: columnas nulas o con valor por
-- defecto y una tabla nueva. No toca filas existentes.
--
-- Aplicar:  npm run db:apply -- prisma/migrations/1_pet_tag/migration.sql

-- AlterTable
ALTER TABLE "Pet" ADD COLUMN     "lostMessage" TEXT,
ADD COLUMN     "lostMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lostSince" TIMESTAMP(3),
ADD COLUMN     "publicCode" TEXT,
ADD COLUMN     "showOwnerPhone" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PetFoundReport" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "message" TEXT,
    "contact" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetFoundReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PetFoundReport_petId_createdAt_idx" ON "PetFoundReport"("petId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Pet_publicCode_key" ON "Pet"("publicCode");

-- AddForeignKey
ALTER TABLE "PetFoundReport" ADD CONSTRAINT "PetFoundReport_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
