-- AlterTable
ALTER TABLE "register_sessions" ADD COLUMN     "closed_by_user_id" TEXT,
ADD COLUMN     "closing_observations" TEXT,
ADD COLUMN     "counted_amount" INTEGER,
ADD COLUMN     "discrepancy" INTEGER,
ADD COLUMN     "expected_amount" INTEGER;
