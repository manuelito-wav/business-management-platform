-- CreateEnum
CREATE TYPE "InventoryLossReason" AS ENUM ('theft', 'damage', 'expiration', 'other');

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "loss_reason" "InventoryLossReason";
