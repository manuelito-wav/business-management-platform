"use client";

import { useSearchParams } from "next/navigation";
import { ProductsScreen } from "../../../../components/catalog/products-screen";
import { useBusiness } from "../../../../lib/business/business-context";

export default function ProductsPage() {
  const { businessId } = useBusiness();
  const searchParams = useSearchParams();
  const initialOpenCreate = searchParams.get("new") === "1";

  return <ProductsScreen businessId={businessId} initialOpenCreate={initialOpenCreate} />;
}
