-- DropForeignKey
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_role_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "roles_id_business_id_key" ON "roles"("id", "business_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_business_id_fkey" FOREIGN KEY ("role_id", "business_id") REFERENCES "roles"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;
