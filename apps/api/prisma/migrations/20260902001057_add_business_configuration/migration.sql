-- CreateTable
CREATE TABLE "business_configurations" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_configurations_business_id_idx" ON "business_configurations"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_configurations_business_id_key_key" ON "business_configurations"("business_id", "key");

-- AddForeignKey
ALTER TABLE "business_configurations" ADD CONSTRAINT "business_configurations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
