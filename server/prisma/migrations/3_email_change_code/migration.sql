-- CreateTable
CREATE TABLE "EmailChangeCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChangeCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailChangeCode_userId_idx" ON "EmailChangeCode"("userId");

