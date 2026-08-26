"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  Check,
  ChevronDown,
  MoreVertical,
  Plus,
  ShoppingCart,
  SkipForward,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import {
  CheckoutPurchaseDialog,
  checkoutPurchase,
} from "@/components/checkout-purchase-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { readApiError, UNIT_LABELS } from "@/lib/errors";
import { inputUnitsFor, type BaseUnit, type InputUnit } from "@/lib/quantity-input";
import {
  formatRequiredForRecipe,
  formatShoppingPurchaseLine,
  INPUT_UNIT_LABELS,
} from "@/lib/shopping-labels";
import { cn } from "@/lib/utils";

type ShoppingListItem = components["schemas"]["ShoppingListItemDto"];
type ShoppingStatus = components["schemas"]["UpdateShoppingListItemStatusDto"]["status"];

function AddProductModal({
  products,
  pending,
  onClose,
  onSubmit,
}: {
  products: components["schemas"]["ProductDto"][];
  pending?: boolean;
  onClose: () => void;
  onSubmit: (body: components["schemas"]["CreateShoppingListItemDto"]) => void;
}) {
  const [addMode, setAddMode] = useState<"product" | "custom">("product");
  const [productId, setProductId] = useState("");
  const [customName, setCustomName] = useState("");
  const [plannedQuantity, setPlannedQuantity] = useState("");
  const [plannedUnit, setPlannedUnit] = useState<InputUnit>("piece");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const selectedProduct = products.find((entry) => entry.id === productId);
  const unitOptions = useMemo(() => {
    if (addMode === "custom") {
      return Object.entries(INPUT_UNIT_LABELS).map(([value, label]) => ({
        value: value as InputUnit,
        label,
      }));
    }
    if (!selectedProduct) {
      return [];
    }
    return inputUnitsFor(selectedProduct.defaultUnit as BaseUnit);
  }, [addMode, selectedProduct]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const body: components["schemas"]["CreateShoppingListItemDto"] = {};
    if (addMode === "product") {
      if (!productId) {
        setFormError("Wybierz produkt z katalogu.");
        return;
      }
      body.productId = productId;
    } else {
      if (!customName.trim()) {
        setFormError("Podaj nazwę pozycji.");
        return;
      }
      body.customName = customName.trim();
    }
    if (plannedQuantity.trim()) {
      body.plannedQuantity = plannedQuantity.trim();
      body.plannedUnit = plannedUnit;
    }
    if (note.trim()) {
      body.note = note.trim();
    }
    onSubmit(body);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={() => {
        if (!pending) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-shopping-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-100 bg-white p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="add-shopping-title" className="text-lg font-semibold text-gray-900">
          Dodaj produkt
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Dodaj produkt z katalogu lub własną pozycję tekstową.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={addMode === "product" ? "default" : "outline"}
              onClick={() => setAddMode("product")}
            >
              Z katalogu
            </Button>
            <Button
              type="button"
              size="sm"
              variant={addMode === "custom" ? "default" : "outline"}
              onClick={() => setAddMode("custom")}
            >
              Własna pozycja
            </Button>
          </div>

          {addMode === "product" ? (
            <div className="space-y-2">
              <Label htmlFor="modal-product">Produkt</Label>
              <select
                id="modal-product"
                className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-sm"
                value={productId}
                onChange={(event) => {
                  setProductId(event.target.value);
                  const product = products.find(
                    (entry) => entry.id === event.target.value,
                  );
                  if (product) {
                    setPlannedUnit(
                      inputUnitsFor(product.defaultUnit as BaseUnit)[0]
                        ?.value ?? "piece",
                    );
                  }
                }}
              >
                <option value="">Wybierz produkt…</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({UNIT_LABELS[product.defaultUnit]})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="modal-custom">Nazwa</Label>
              <Input
                id="modal-custom"
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="np. Papryka czerwona"
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="modal-qty">Ilość</Label>
              <Input
                id="modal-qty"
                value={plannedQuantity}
                onChange={(event) => setPlannedQuantity(event.target.value)}
                placeholder="opcjonalnie"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modal-unit">Jednostka</Label>
              <select
                id="modal-unit"
                className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-sm"
                value={plannedUnit}
                onChange={(event) =>
                  setPlannedUnit(event.target.value as InputUnit)
                }
              >
                {(unitOptions.length > 0
                  ? unitOptions
                  : Object.entries(INPUT_UNIT_LABELS).map(([value, label]) => ({
                      value: value as InputUnit,
                      label,
                    }))
                ).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="modal-note">Notatka</Label>
            <Input
              id="modal-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="opcjonalnie"
            />
          </div>

          {formError ? (
            <p className="text-sm text-red-600" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Dodawanie…" : "Dodaj do listy"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShoppingRow({
  item,
  onToggleBought,
  onSkip,
  onDelete,
  pending,
}: {
  item: ShoppingListItem;
  onToggleBought: () => void;
  onSkip: () => void;
  onDelete: () => void;
  pending?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const name = item.product?.name ?? item.customName ?? "Pozycja bez nazwy";
  const purchaseLine = formatShoppingPurchaseLine(item);
  const requiredHint = formatRequiredForRecipe(
    item.requiredQuantity,
    item.requiredUnit,
  );

  return (
    <li className="flex items-start gap-3 border-b border-gray-50 px-1 py-3 last:border-0">
      {item.status === "pending" ? (
        <button
          type="button"
          aria-label={`Oznacz ${name} jako kupione`}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300 bg-white hover:border-emerald-500"
          onClick={onToggleBought}
          disabled={pending}
        />
      ) : item.status === "bought" ? (
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-500 text-white">
          <Check size={12} />
        </span>
      ) : (
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-200 text-gray-500">
          <SkipForward size={10} />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "font-medium text-gray-900",
            item.status !== "pending" && "text-gray-600",
          )}
        >
          {name}
        </p>
        <p className="text-sm text-gray-700">{purchaseLine}</p>
        {requiredHint ? (
          <p className="text-xs text-gray-500">
            brakuje {requiredHint} do przepisu
          </p>
        ) : null}
        {item.sourceRecipeName ? (
          <p className="text-xs text-emerald-700">{item.sourceRecipeName}</p>
        ) : null}
        {item.note ? (
          <p className="text-xs text-gray-400">{item.note}</p>
        ) : null}
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="Menu pozycji"
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreVertical size={16} />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
            {item.status === "pending" ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                onClick={() => {
                  setMenuOpen(false);
                  onSkip();
                }}
              >
                <SkipForward size={14} />
                Pomiń
              </button>
            ) : null}
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            >
              <Trash2 size={14} />
              Usuń
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default function ShoppingListPage() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [skippedOpen, setSkippedOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ShoppingListItem | null>(
    null,
  );
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["products", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/products",
        { params: { path: { kitchenId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać produktów."));
      }
      return data ?? [];
    },
  });

  const listQuery = useQuery({
    queryKey: ["shopping-list", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error, response } = await client.GET(
        "/api/kitchens/{kitchenId}/shopping-list/items",
        { params: { path: { kitchenId } } },
      );
      if (response.status === 404) {
        throw new Error("Nie znaleziono kuchni albo nie masz do niej dostępu.");
      }
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać listy zakupów."),
        );
      }
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const items = listQuery.data ?? [];
    return {
      pending: items.filter((item) => item.status === "pending"),
      bought: items.filter((item) => item.status === "bought"),
      skipped: items.filter((item) => item.status === "skipped"),
    };
  }, [listQuery.data]);

  const totalCount =
    grouped.pending.length + grouped.bought.length + grouped.skipped.length;
  const doneCount = grouped.bought.length + grouped.skipped.length;
  const progress =
    totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shopping-list", kitchenId] });
    queryClient.invalidateQueries({ queryKey: ["stock", kitchenId] });
    queryClient.invalidateQueries({ queryKey: ["purchases", kitchenId] });
  };

  const createItem = useMutation({
    mutationFn: async (
      body: components["schemas"]["CreateShoppingListItemDto"],
    ) => {
      const client = createWebApiClient();
      const { data, error, response } = await client.POST(
        "/api/kitchens/{kitchenId}/shopping-list/items",
        { params: { path: { kitchenId } }, body },
      );
      if (response.status === 409) {
        throw new Error(
          "Ten produkt jest już na liście. Zwiększ ilość istniejącej pozycji albo wybierz inny produkt.",
        );
      }
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się dodać pozycji do listy."),
        );
      }
      return data;
    },
    onSuccess: () => {
      setAddOpen(false);
      invalidate();
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      itemId,
      status,
    }: {
      itemId: string;
      status: ShoppingStatus;
    }) => {
      const client = createWebApiClient();
      const { data, error } = await client.PATCH(
        "/api/kitchens/{kitchenId}/shopping-list/items/{itemId}/status",
        {
          params: { path: { kitchenId, itemId } },
          body: { status },
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się zmienić statusu."));
      }
      return data;
    },
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const client = createWebApiClient();
      const { error } = await client.DELETE(
        "/api/kitchens/{kitchenId}/shopping-list/items/{itemId}",
        { params: { path: { kitchenId, itemId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się usunąć pozycji."));
      }
    },
    onSuccess: () => {
      setItemToDelete(null);
      invalidate();
    },
  });

  const checkout = useMutation({
    mutationFn: async (
      body: components["schemas"]["CheckoutPurchaseDto"],
    ) => checkoutPurchase(kitchenId, body),
    onSuccess: () => {
      setCheckoutOpen(false);
      invalidate();
    },
  });

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                Lista zakupów
              </h1>
              {totalCount > 0 ? (
                <p className="mt-1 text-sm text-gray-500">
                  {doneCount} z {totalCount} pozycji · {progress}%
                </p>
              ) : (
                <p className="mt-1 text-sm text-gray-500">
                  Wspólna lista dla domowników
                </p>
              )}
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={16} className="mr-1" />
              Dodaj produkt
            </Button>
          </div>

          {totalCount > 0 ? (
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
        </header>

        {listQuery.isPending ? (
          <p className="text-center text-sm text-gray-500">Ładowanie listy…</p>
        ) : null}

        {listQuery.isError ? (
          <p className="text-center text-sm text-red-600" role="alert">
            {readApiError(listQuery.error)}
          </p>
        ) : null}

        {!listQuery.isPending &&
        !listQuery.isError &&
        totalCount === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <ShoppingCart size={28} />
            </div>
            <p className="font-medium text-gray-900">Lista jest pusta</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
              Dodaj produkty ręcznie albo z ekranu{" "}
              <Link
                href={`/kitchens/${kitchenId}/recipes`}
                className="text-emerald-700 hover:underline"
              >
                przepisów
              </Link>
              .
            </p>
          </div>
        ) : null}

        {!listQuery.isPending && !listQuery.isError && totalCount > 0 ? (
          <div className="space-y-6">
            {grouped.pending.length > 0 ? (
              <section>
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                  Do kupienia ({grouped.pending.length})
                </h2>
                <ul>
                  {grouped.pending.map((item) => (
                    <ShoppingRow
                      key={item.id}
                      item={item}
                      pending={updateStatus.isPending}
                      onToggleBought={() =>
                        updateStatus.mutate({
                          itemId: item.id,
                          status: "bought",
                        })
                      }
                      onSkip={() =>
                        updateStatus.mutate({
                          itemId: item.id,
                          status: "skipped",
                        })
                      }
                      onDelete={() => setItemToDelete(item)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {grouped.bought.length > 0 ? (
              <section>
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-emerald-700 uppercase">
                  Kupione ({grouped.bought.length})
                </h2>
                <ul className="opacity-80">
                  {grouped.bought.map((item) => (
                    <ShoppingRow
                      key={item.id}
                      item={item}
                      onToggleBought={() => {}}
                      onSkip={() => {}}
                      onDelete={() => setItemToDelete(item)}
                    />
                  ))}
                </ul>
                <Button
                  className="mt-4 w-full sm:w-auto"
                  onClick={() => setCheckoutOpen(true)}
                >
                  Rozlicz zakupy ({grouped.bought.length})
                </Button>
              </section>
            ) : null}

            {grouped.skipped.length > 0 ? (
              <section>
                <button
                  type="button"
                  className="mb-2 flex w-full items-center gap-1 text-xs font-semibold tracking-wide text-gray-500 uppercase"
                  onClick={() => setSkippedOpen((open) => !open)}
                >
                  <ChevronDown
                    size={14}
                    className={cn(
                      "transition-transform",
                      !skippedOpen && "-rotate-90",
                    )}
                  />
                  Pominięte ({grouped.skipped.length})
                </button>
                {skippedOpen ? (
                  <ul className="opacity-60">
                    {grouped.skipped.map((item) => (
                      <ShoppingRow
                        key={item.id}
                        item={item}
                        onToggleBought={() =>
                          updateStatus.mutate({
                            itemId: item.id,
                            status: "pending",
                          })
                        }
                        onSkip={() => {}}
                        onDelete={() => setItemToDelete(item)}
                      />
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </div>

      {addOpen ? (
        <AddProductModal
          products={productsQuery.data ?? []}
          pending={createItem.isPending}
          onClose={() => {
            if (!createItem.isPending) {
              setAddOpen(false);
            }
          }}
          onSubmit={(body) => createItem.mutate(body)}
        />
      ) : null}

      {createItem.isError ? (
        <div className="fixed bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-600 shadow-lg">
          {readApiError(createItem.error)}
        </div>
      ) : null}

      {itemToDelete ? (
        <ConfirmDialog
          title={`Usunąć „${itemToDelete.product?.name ?? itemToDelete.customName}”?`}
          description="Pozycja zniknie z aktywnej listy zakupów."
          confirmLabel="Usuń"
          pending={deleteItem.isPending}
          onConfirm={() => deleteItem.mutate(itemToDelete.id)}
          onCancel={() => setItemToDelete(null)}
        />
      ) : null}

      {checkoutOpen ? (
        <CheckoutPurchaseDialog
          key={grouped.bought.map((item) => item.id).join("-")}
          kitchenId={kitchenId}
          items={grouped.bought}
          products={productsQuery.data ?? []}
          pending={checkout.isPending}
          onCancel={() => {
            if (!checkout.isPending) {
              setCheckoutOpen(false);
            }
          }}
          onConfirm={(payload) => checkout.mutate(payload)}
        />
      ) : null}

      {checkout.isError ? (
        <div className="fixed bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-600 shadow-lg">
          {readApiError(checkout.error)}
        </div>
      ) : null}
    </AppShell>
  );
}
