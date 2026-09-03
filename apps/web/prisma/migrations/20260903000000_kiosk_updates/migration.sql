-- CreateEnum
CREATE TYPE "KioskUpdateState" AS ENUM ('CURRENT', 'AVAILABLE', 'DOWNLOADING', 'INSTALLING', 'INSTALLED', 'FAILED', 'DISMISSED');

-- CreateTable
CREATE TABLE "KioskRelease" (
    "id" TEXT NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "versionName" TEXT NOT NULL,
    "releaseNotes" TEXT NOT NULL,
    "apkFileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "certificateSha256" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT NOT NULL DEFAULT 'release-script',

    CONSTRAINT "KioskRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KioskDevice" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "installedVersionCode" INTEGER NOT NULL,
    "installedVersionName" TEXT NOT NULL,
    "updateState" "KioskUpdateState" NOT NULL DEFAULT 'CURRENT',
    "lastUpdateError" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetReleaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KioskDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KioskRelease_versionCode_key" ON "KioskRelease"("versionCode");

-- CreateIndex
CREATE UNIQUE INDEX "KioskRelease_apkFileName_key" ON "KioskRelease"("apkFileName");

-- CreateIndex
CREATE INDEX "KioskRelease_active_versionCode_idx" ON "KioskRelease"("active", "versionCode");

-- CreateIndex
CREATE INDEX "KioskDevice_active_lastSeenAt_idx" ON "KioskDevice"("active", "lastSeenAt");

-- CreateIndex
CREATE INDEX "KioskDevice_targetReleaseId_idx" ON "KioskDevice"("targetReleaseId");

-- AddForeignKey
ALTER TABLE "KioskDevice" ADD CONSTRAINT "KioskDevice_targetReleaseId_fkey" FOREIGN KEY ("targetReleaseId") REFERENCES "KioskRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
