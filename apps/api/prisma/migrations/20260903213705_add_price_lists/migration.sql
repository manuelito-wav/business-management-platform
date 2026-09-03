-- CreateEnum
CREATE TYPE "PriceListStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PriceListStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_entries" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "price_list_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sale_price" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_lists_business_id_idx" ON "price_lists"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_business_id_name_key" ON "price_lists"("business_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_id_business_id_key" ON "price_lists"("id", "business_id");

-- CreateIndex
CREATE INDEX "price_list_entries_business_id_idx" ON "price_list_entries"("business_id");

-- CreateIndex
CREATE INDEX "price_list_entries_product_id_idx" ON "price_list_entries"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_entries_price_list_id_product_id_key" ON "price_list_entries"("price_list_id", "product_id");

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_price_list_id_business_id_fkey" FOREIGN KEY ("price_list_id", "business_id") REFERENCES "price_lists"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_product_id_business_id_fkey" FOREIGN KEY ("product_id", "business_id") REFERENCES "products"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;
