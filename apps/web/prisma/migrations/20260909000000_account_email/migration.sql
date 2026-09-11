ALTER TABLE "AdminUser" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "AccountLink" (
  "id" TEXT PRIMARY KEY,
  "adminId" TEXT NOT NULL REFERENCES "AdminUser"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "purpose" TEXT NOT NULL CHECK ("purpose" IN ('INVITE', 'RESET')),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AccountLink_adminId_idx" ON "AccountLink"("adminId");
CREATE TABLE "AccountEmailLimit" (
  "key" TEXT PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
