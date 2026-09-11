-- Additive only: all existing administrators retain their existing access.
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'GLOBAL_ADMIN');
ALTER TABLE "AdminUser" ADD COLUMN "role" "AdminRole" NOT NULL DEFAULT 'ADMIN';
-- Account promotion is a separate, explicit operator action, never a seed side effect.
