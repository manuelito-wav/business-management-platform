-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('in_progress', 'completed', 'cancelled', 'abandoned');

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'in_progress',
    "total" INTEGER NOT NULL DEFAULT 0,
    "first_item_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "abandoned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_lines" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sale_mode" "ProductSaleMode" NOT NULL,
    "weight_unit" "ProductWeightUnit",
    "quantity" INTEGER NOT NULL,
    "unit_cost_price" INTEGER NOT NULL,
    "unit_sale_price" INTEGER NOT NULL,
    "line_total" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_business_id_status_idx" ON "sales"("business_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_id_business_id_key" ON "sales"("id", "business_id");

-- CreateIndex
CREATE INDEX "sale_lines_sale_id_idx" ON "sale_lines"("sale_id");

-- CreateIndex
CREATE INDEX "sale_lines_business_id_product_id_idx" ON "sale_lines"("business_id", "product_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_business_id_fkey" FOREIGN KEY ("sale_id", "business_id") REFERENCES "sales"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_id_business_id_fkey" FOREIGN KEY ("product_id", "business_id") REFERENCES "products"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;
