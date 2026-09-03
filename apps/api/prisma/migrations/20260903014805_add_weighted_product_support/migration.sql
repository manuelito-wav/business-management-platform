-- CreateEnum
CREATE TYPE "ProductWeightUnit" AS ENUM ('g', 'kg');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "weight_unit" "ProductWeightUnit";
