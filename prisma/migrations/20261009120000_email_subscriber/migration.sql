-- Marketing list (spec 2026-10-09 §5). One row per address; account holders and
-- signup-form subscribers share it so every unsubscribe path flips one status.

-- CreateEnum
CREATE TYPE "SubscriberStatus" AS ENUM ('PENDING', 'ACTIVE', 'UNSUBSCRIBED');

-- CreateTable
CREATE TABLE "EmailSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "status" "SubscriberStatus" NOT NULL,
    "confirmTokenHash" TEXT,
    "confirmSentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "unsubscribeToken" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_email_key" ON "EmailSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_userId_key" ON "EmailSubscriber"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_confirmTokenHash_key" ON "EmailSubscriber"("confirmTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_unsubscribeToken_key" ON "EmailSubscriber"("unsubscribeToken");

-- AddForeignKey
ALTER TABLE "EmailSubscriber" ADD CONSTRAINT "EmailSubscriber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Account holders are on the weekly digest by default (spec §5.5); this gives every
-- existing user their row. Raw SQL has to supply "id" because Prisma's cuid() default
-- is client-side. gen_random_uuid() is built into Postgres 13+; gen_random_bytes()
-- would need pgcrypto, which this database does not enable. The token is two UUIDs
-- with the dashes stripped: 64 hex characters, ~244 random bits. ON CONFLICT covers
-- two accounts whose addresses differ only by case; the second is linked lazily by
-- ensureAccountSubscriber, which leaves an address held by another account alone.
-- tests/email-subscriber-backfill.test.ts executes exactly the text between the markers.
-- backfill:begin
INSERT INTO "EmailSubscriber" ("id", "email", "userId", "source", "status", "confirmedAt", "unsubscribeToken", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  lower(btrim(u."email")),
  u."id",
  'account',
  'ACTIVE'::"SubscriberStatus",
  CURRENT_TIMESTAMP,
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "user" u
ON CONFLICT ("email") DO NOTHING;
-- backfill:end
