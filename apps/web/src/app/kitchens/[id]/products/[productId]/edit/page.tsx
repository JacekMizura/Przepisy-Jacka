"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ProductEntryForm } from "@/components/product-entry/product-entry-form";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";

export default function EditProductPage() {
  const params = useParams<{ id: string; productId: string }>();
  const kitchenId = params.id;
  const productId = params.productId;
  const router = useRouter();

  const productQuery = useQuery({
    queryKey: ["products", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error, response } = await client.GET(
        "/api/kitchens/{kitchenId}/products",
        { params: { path: { kitchenId } } },
      );
      if (response.status === 404) {
        throw new Error("Nie znaleziono kuchni albo nie masz do niej dostępu.");
      }
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać produktów."));
      }
      return data ?? [];
    },
  });

  const product = productQuery.data?.find((entry) => entry.id === productId);

  return (
    <AppShell kitchenId={kitchenId}>
      {productQuery.isPending ? (
        <p className="p-8 text-center text-sm text-gray-500">
          Ładowanie produktu…
        </p>
      ) : null}
      {productQuery.isError ? (
        <p className="p-8 text-center text-sm text-red-600" role="alert">
          {readApiError(productQuery.error)}
        </p>
      ) : null}
      {productQuery.isSuccess && !product ? (
        <p className="p-8 text-center text-sm text-gray-600">
          Nie znaleziono produktu w katalogu. Mógł zostać zarchiwizowany.
        </p>
      ) : null}
      {product ? (
        <ProductEntryForm
          kitchenId={kitchenId}
          mode="edit"
          productId={productId}
          initialProduct={product}
          onSuccess={() => {
            router.refresh();
          }}
        />
      ) : null}
    </AppShell>
  );
}
