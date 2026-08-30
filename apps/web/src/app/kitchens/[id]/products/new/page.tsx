"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import {
  ProductEntryForm,
  type ProductCreateIntent,
} from "@/components/product-entry/product-entry-form";

function resolveCreateIntent(
  mode: string | null,
  stockParam: string | null,
): ProductCreateIntent {
  if (mode === "catalog" || stockParam === "0") {
    return "catalog";
  }
  return "purchase";
}

function NewProductPageInner() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode = searchParams.get("mode");
  const stockParam = searchParams.get("stock");
  const createIntent = resolveCreateIntent(mode, stockParam);
  const initialName = searchParams.get("name") ?? "";
  const initialGroupId = searchParams.get("groupId");
  const from = searchParams.get("from");

  return (
    <AppShell kitchenId={kitchenId}>
      <ProductEntryForm
        kitchenId={kitchenId}
        mode="create"
        createIntent={createIntent}
        initialName={initialName}
        initialGroupId={initialGroupId}
        onSuccess={({ putInStock, product }) => {
          if (from === "catalog" || createIntent === "catalog") {
            router.push(`/kitchens/${kitchenId}/stock?view=catalog`);
            return;
          }
          if (putInStock || from === "stock" || createIntent === "purchase") {
            router.push(`/kitchens/${kitchenId}/stock`);
            return;
          }
          if (from === "group" && product.groupId) {
            router.push(
              `/kitchens/${kitchenId}/product-groups/${product.groupId}`,
            );
            return;
          }
          router.push(`/kitchens/${kitchenId}/products/${product.id}/edit`);
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
