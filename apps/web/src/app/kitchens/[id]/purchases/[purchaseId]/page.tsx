"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { createWebApiClient } from "@/lib/api";
import { LOCATION_LABELS, readApiError } from "@/lib/errors";
import { formatQuantityNumber } from "@/lib/format-quantity";
import { formatPriceMinor } from "@/lib/shopping-labels";

export default function PurchaseDetailPage() {
  const params = useParams<{ id: string; purchaseId: string }>();
  const kitchenId = params.id;
  const purchaseId = params.purchaseId;

  const purchaseQuery = useQuery({
    queryKey: ["purchase", kitchenId, purchaseId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error, response } = await client.GET(
        "/api/kitchens/{kitchenId}/purchases/{purchaseId}",
        { params: { path: { kitchenId, purchaseId } } },
      );
      if (response.status === 404) {
        throw new Error("Nie znaleziono zakupu albo nie masz do niego dostępu.");
      }
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać szczegółów zakupu."),
        );
      }
      return data;
    },
  });

  const purchase = purchaseQuery.data;
  const linesTotal =
    purchase?.lines.reduce((sum, line) => sum + line.priceMinor, 0) ?? 0;

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-gray-500">
              <Link
                href={`/kitchens/${kitchenId}/purchases`}
                className="text-emerald-700 hover:underline"
              >
                ← Historia zakupów
              </Link>
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
              Szczegóły zakupu
            </h1>
            {purchase ? (
              <p className="mt-2 text-gray-500">
                {new Date(purchase.purchasedAt).toLocaleDateString("pl-PL")}
                {purchase.storeName ? ` · ${purchase.storeName}` : ""}
              </p>
            ) : null}
          </div>
          <Link
            href={`/kitchens/${kitchenId}/purchases`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Wróć do listy
          </Link>
        </header>

        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          {purchaseQuery.isPending ? (
            <div className="p-12 text-center text-sm text-gray-500">
              Ładowanie szczegółów…
            </div>
          ) : null}
          {purchaseQuery.isError ? (
            <div className="p-12 text-center text-sm text-red-600" role="alert">
              {readApiError(purchaseQuery.error)}
            </div>
          ) : null}

          {purchase ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-gray-100 bg-emerald-50/50">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Produkt
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Ilość
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Miejsce
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Ważność
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Cena
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchase.lines.map((line) => (
                      <tr
                        key={line.id}
                        className="border-b border-gray-100 last:border-0"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {line.displayName ?? line.productName}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {formatQuantityNumber(line.quantity)}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {LOCATION_LABELS[line.location]}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {line.expiresAt
                            ? new Date(line.expiresAt).toLocaleDateString(
                                "pl-PL",
                              )
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-900">
                          {formatPriceMinor(line.priceMinor, purchase.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-gray-200 bg-gray-50">
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-3 text-right font-semibold text-gray-700"
                      >
                        Suma z pozycji
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">
                        {formatPriceMinor(linesTotal, purchase.currency)}
                      </td>
                    </tr>
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-3 text-right font-semibold text-gray-700"
                      >
                        Suma zakupu
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-800">
                        {formatPriceMinor(
                          purchase.totalPriceMinor,
                          purchase.currency,
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
