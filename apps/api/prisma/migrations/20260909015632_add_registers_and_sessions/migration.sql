-- CreateEnum
CREATE TYPE "RegisterStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "RegisterSessionStatus" AS ENUM ('open', 'closed');

-- CreateTable
CREATE TABLE "registers" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RegisterStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "register_sessions" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "register_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "RegisterSessionStatus" NOT NULL DEFAULT 'open',
    "active_register_id" TEXT,
    "opening_amount" INTEGER,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "register_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registers_business_id_idx" ON "registers"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "registers_business_id_name_key" ON "registers"("business_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "registers_id_business_id_key" ON "registers"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "register_sessions_active_register_id_key" ON "register_sessions"("active_register_id");

-- CreateIndex
CREATE INDEX "register_sessions_business_id_idx" ON "register_sessions"("business_id");

-- CreateIndex
CREATE INDEX "register_sessions_register_id_idx" ON "register_sessions"("register_id");

-- CreateIndex
CREATE INDEX "register_sessions_user_id_idx" ON "register_sessions"("user_id");

-- AddForeignKey
ALTER TABLE "registers" ADD CONSTRAINT "registers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_sessions" ADD CONSTRAINT "register_sessions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_sessions" ADD CONSTRAINT "register_sessions_register_id_business_id_fkey" FOREIGN KEY ("register_id", "business_id") REFERENCES "registers"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;
