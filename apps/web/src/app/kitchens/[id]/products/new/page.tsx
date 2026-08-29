"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { ProductEntryForm } from "@/components/product-entry/product-entry-form";

function NewProductPageInner() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();

  const stockParam = searchParams.get("stock");
  const defaultPutInStock = stockParam !== "0";
  const initialName = searchParams.get("name") ?? "";
  const from = searchParams.get("from");

  return (
    <AppShell kitchenId={kitchenId}>
      <ProductEntryForm
        kitchenId={kitchenId}
        mode="create"
        defaultPutInStock={defaultPutInStock}
        initialName={initialName}
        onSuccess={({ putInStock, product }) => {
          if (putInStock || from === "stock") {
            router.push(`/kitchens/${kitchenId}/stock`);
            return;
          }
          router.push(
            `/kitchens/${kitchenId}/products/${product.id}/edit`,
          );
        }}
      />
    </AppShell>
  );
}

export default function NewProductPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-gray-500">
          Ładowanie formularza…
        </div>
      }
    >
      <NewProductPageInner />
    </Suspense>
  );
}
