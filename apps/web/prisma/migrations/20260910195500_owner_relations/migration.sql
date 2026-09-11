-- CreateEnum
CREATE TYPE "OwnerScopeKind" AS ENUM ('ENTITY', 'PROPERTY');

-- CreateTable
CREATE TABLE "OwnerContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "passwordHash" TEXT,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OwnerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerScope" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "OwnerScopeKind" NOT NULL,

    CONSTRAINT "OwnerScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerGrant" (
    "contactId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,

    CONSTRAINT "OwnerGrant_pkey" PRIMARY KEY ("contactId","scopeId")
);

-- CreateTable
CREATE TABLE "OwnerStatement" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerStatementBytes" (
    "statementId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "OwnerStatementBytes_pkey" PRIMARY KEY ("statementId")
);

-- CreateTable
CREATE TABLE "OwnerLink" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerContact_email_key" ON "OwnerContact"("email");

-- CreateIndex
CREATE INDEX "OwnerGrant_scopeId_idx" ON "OwnerGrant"("scopeId");

-- CreateIndex
CREATE INDEX "OwnerStatement_scopeId_createdAt_idx" ON "OwnerStatement"("scopeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerLink_tokenHash_key" ON "OwnerLink"("tokenHash");

-- CreateIndex
CREATE INDEX "OwnerLink_contactId_idx" ON "OwnerLink"("contactId");

-- AddForeignKey
ALTER TABLE "OwnerGrant" ADD CONSTRAINT "OwnerGrant_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "OwnerContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerGrant" ADD CONSTRAINT "OwnerGrant_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "OwnerScope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerStatement" ADD CONSTRAINT "OwnerStatement_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "OwnerScope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerStatementBytes" ADD CONSTRAINT "OwnerStatementBytes_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "OwnerStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerLink" ADD CONSTRAINT "OwnerLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "OwnerContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;