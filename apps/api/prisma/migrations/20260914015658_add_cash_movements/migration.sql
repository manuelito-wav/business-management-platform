-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('deposit', 'withdrawal', 'supplier_payment', 'expense', 'opening_fund', 'sale_settlement', 'refund_reversal');

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "register_session_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "correlation_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_movements_business_id_idx" ON "cash_movements"("business_id");

-- CreateIndex
CREATE INDEX "cash_movements_register_session_id_idx" ON "cash_movements"("register_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "register_sessions_id_business_id_key" ON "register_sessions"("id", "business_id");

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_register_session_id_business_id_fkey" FOREIGN KEY ("register_session_id", "business_id") REFERENCES "register_sessions"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;
