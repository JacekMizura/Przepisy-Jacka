"use client";

import { Receipt } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ProductThumb } from "@/components/product-thumb";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { productImageUrls } from "@/lib/product-image";
import { formatPriceMinor } from "@/lib/shopping-labels";

export default function PurchasesPage() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;

  const purchasesQuery = useQuery({
    queryKey: ["purchases", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error, response } = await client.GET(
        "/api/kitchens/{kitchenId}/purchases",
        { params: { path: { kitchenId } } },
      );
      if (response.status === 404) {
        throw new Error("Nie znaleziono kuchni albo nie masz do niej dostępu.");
      }
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać historii zakupów."),
        );
      }
      return data ?? [];
    },
  });

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Historia zakupów
          </h1>
          <p className="mt-2 text-gray-500">
            Rozliczone zakupy tej kuchni — daty, sklepy i łączne kwoty.
          </p>
        </header>

        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          {purchasesQuery.isPending ? (
            <div className="p-12 text-center text-sm text-gray-500">
              Ładowanie historii…
            </div>
          ) : null}
          {purchasesQuery.isError ? (
            <div className="p-12 text-center text-sm text-red-600" role="alert">
              {readApiError(purchasesQuery.error)}
            </div>
          ) : null}
          {!purchasesQuery.isPending &&
          !purchasesQuery.isError &&
          (purchasesQuery.data ?? []).length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Receipt size={32} />
              </div>
              <p className="text-lg font-semibold text-gray-900">
                Brak rozliczonych zakupów
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                Oznacz pozycje jako kupione na{" "}
                <Link
                  href={`/kitchens/${kitchenId}/shopping-list`}
                  className="font-medium text-emerald-700 hover:underline"
                >
                  liście zakupów
                </Link>
                , a potem użyj „Podsumuj zakupy”.
              </p>
            </div>
          ) : null}

          {!purchasesQuery.isPending &&
          !purchasesQuery.isError &&
          (purchasesQuery.data ?? []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-gray-100 bg-emerald-50/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-700">
                      Produkty
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700">
                      Data
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700">
                      Sklep
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700">
                      Pozycje
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700">
                      Suma
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700">
                      Szczegóły
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(purchasesQuery.data ?? []).map((purchase) => (
                    <tr
                      key={purchase.id}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center -space-x-2">
                          {(purchase.previewProducts ?? []).map((product) => (
                            <ProductThumb
                              key={product.productId}
                              src={productImageUrls(product).thumbnail}
                              alt={product.name}
                              size="sm"
                              className="ring-2 ring-white"
                            />
                          ))}
                          {(purchase.previewProducts ?? []).length === 0 ? (
                            <ProductThumb src={null} alt="" size="sm" />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {new Date(purchase.purchasedAt).toLocaleDateString(
                          "pl-PL",
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {purchase.storeName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {purchase.itemCount}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {formatPriceMinor(
                          purchase.totalPriceMinor,
                          purchase.currency,
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/kitchens/${kitchenId}/purchases/${purchase.id}`}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          Zobacz
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
