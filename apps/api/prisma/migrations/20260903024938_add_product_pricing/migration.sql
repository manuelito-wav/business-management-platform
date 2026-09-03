-- CreateEnum
CREATE TYPE "PricingInputMode" AS ENUM ('sale_price', 'profit', 'margin_percent');

-- CreateTable
CREATE TABLE "product_pricing" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "cost_price" INTEGER NOT NULL,
    "sale_price" INTEGER NOT NULL,
    "profit" INTEGER NOT NULL,
    "margin_percent_basis_points" INTEGER,
    "input_mode" "PricingInputMode" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_pricing_business_id_idx" ON "product_pricing"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_pricing_product_id_business_id_key" ON "product_pricing"("product_id", "business_id");

-- AddForeignKey
ALTER TABLE "product_pricing" ADD CONSTRAINT "product_pricing_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_pricing" ADD CONSTRAINT "product_pricing_product_id_business_id_fkey" FOREIGN KEY ("product_id", "business_id") REFERENCES "products"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;
