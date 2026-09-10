-- AlterTable
ALTER TABLE "products" ADD COLUMN     "expiration_tracking_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "product_expiration_batches" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "product_expiration_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_expiration_batches_business_id_idx" ON "product_expiration_batches"("business_id");

-- CreateIndex
CREATE INDEX "product_expiration_batches_product_id_idx" ON "product_expiration_batches"("product_id");

-- CreateIndex
CREATE INDEX "product_expiration_batches_business_id_resolved_at_expires__idx" ON "product_expiration_batches"("business_id", "resolved_at", "expires_at");

-- AddForeignKey
ALTER TABLE "product_expiration_batches" ADD CONSTRAINT "product_expiration_batches_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_expiration_batches" ADD CONSTRAINT "product_expiration_batches_product_id_business_id_fkey" FOREIGN KEY ("product_id", "business_id") REFERENCES "products"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;
