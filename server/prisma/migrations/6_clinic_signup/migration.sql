-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "rifDocUrl" TEXT,
ADD COLUMN     "sanitaryPermitUrl" TEXT;

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "rejectionReason" TEXT;

