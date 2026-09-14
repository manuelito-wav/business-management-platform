-- CreateEnum
CREATE TYPE "OutboxEventStatus" AS ENUM ('pending', 'processed', 'failed');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "operation_id" TEXT,
ADD COLUMN     "register_session_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'pending',
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events"("status", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_business_id_idx" ON "outbox_events"("business_id");

-- CreateIndex
CREATE INDEX "sales_register_session_id_idx" ON "sales"("register_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_business_id_operation_id_key" ON "sales"("business_id", "operation_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_register_session_id_business_id_fkey" FOREIGN KEY ("register_session_id", "business_id") REFERENCES "register_sessions"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
