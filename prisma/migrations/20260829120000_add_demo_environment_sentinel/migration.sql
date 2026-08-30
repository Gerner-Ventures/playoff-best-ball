-- Marks a database as a DEMO database, where email+password sign-in is allowed.
-- The table is created everywhere; the row is inserted ONLY by `npm run demo:seed`,
-- run deliberately by an operator against the demo database. Production gets the
-- table and zero rows, permanently. See prisma/schema.prisma for the full rationale.

-- CreateTable
CREATE TABLE "DemoEnvironment" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoEnvironment_pkey" PRIMARY KEY ("id")
);
