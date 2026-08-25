"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  Check,
  RotateCcw,
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
import {
  formatPlannedQuantity,
  INPUT_UNIT_LABELS,
  SHOPPING_STATUS_LABELS,
} from "@/lib/shopping-labels";
import { inputUnitsFor, type BaseUnit, type InputUnit } from "@/lib/quantity-input";
import { cn } from "@/lib/utils";

type ShoppingListItem = components["schemas"]["ShoppingListItemDto"];
type ShoppingStatus = components["schemas"]["UpdateShoppingListItemStatusDto"]["status"];

export default function ShoppingListPage() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const queryClient = useQueryClient();

  const [addMode, setAddMode] = useState<"product" | "custom">("product");
  const [productId, setProductId] = useState("");
  const [customName, setCustomName] = useState("");
  const [plannedQuantity, setPlannedQuantity] = useState("");
  const [plannedUnit, setPlannedUnit] = useState<InputUnit>("piece");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ShoppingListItem | null>(
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCustomName, setEditCustomName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnit, setEditUnit] = useState<InputUnit>("piece");
  const [editNote, setEditNote] = useState("");
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

  const selectedProduct = useMemo(
    () => productsQuery.data?.find((entry) => entry.id === productId),
    [productId, productsQuery.data],
  );

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

  const grouped = useMemo(() => {
    const items = listQuery.data ?? [];
    return {
      pending: items.filter((item) => item.status === "pending"),
      bought: items.filter((item) => item.status === "bought"),
      skipped: items.filter((item) => item.status === "skipped"),
    };
  }, [listQuery.data]);

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
      setFormError(null);
      setCustomName("");
      setPlannedQuantity("");
      setNote("");
      invalidate();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const updateItem = useMutation({
    mutationFn: async ({
      itemId,
      body,
    }: {
      itemId: string;
      body: components["schemas"]["UpdateShoppingListItemDto"];
    }) => {
      const client = createWebApiClient();
      const { data, error } = await client.PATCH(
        "/api/kitchens/{kitchenId}/shopping-list/items/{itemId}",
        { params: { path: { kitchenId, itemId } }, body },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się zapisać pozycji."));
      }
      return data;
    },
    onSuccess: () => {
      setEditingId(null);
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

  function handleAddSubmit(event: FormEvent) {
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

    createItem.mutate(body);
  }

  function startEdit(item: ShoppingListItem) {
    setEditingId(item.id);
    setEditCustomName(item.customName ?? item.product?.name ?? "");
    setEditQuantity(item.plannedQuantity ?? "");
    setEditUnit((item.plannedUnit as InputUnit | null) ?? "piece");
    setEditNote(item.note ?? "");
  }

  function saveEdit(itemId: string) {
    updateItem.mutate({
      itemId,
      body: {
        customName: editCustomName.trim() || undefined,
        plannedQuantity: editQuantity.trim() || undefined,
        plannedUnit: editQuantity.trim() ? editUnit : undefined,
        note: editNote.trim() ? editNote.trim() : null,
      },
    });
  }

  function renderItem(item: ShoppingListItem) {
    const name =
      item.product?.name ?? item.customName ?? "Pozycja bez nazwy";
    const isEditing = editingId === item.id;

    return (
      <li
        key={item.id}
        className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 last:border-0 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="space-y-3">
              {!item.productId ? (
                <Input
                  aria-label="Nazwa pozycji"
                  value={editCustomName}
                  onChange={(event) => setEditCustomName(event.target.value)}
                />
              ) : (
                <p className="font-medium text-gray-900">{name}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label="Planowana ilość"
                  value={editQuantity}
                  onChange={(event) => setEditQuantity(event.target.value)}
                  className="w-28"
                />
                <select
                  aria-label="Jednostka"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={editUnit}
                  onChange={(event) =>
                    setEditUnit(event.target.value as InputUnit)
                  }
                >
                  {Object.entries(INPUT_UNIT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                aria-label="Notatka"
                value={editNote}
                onChange={(event) => setEditNote(event.target.value)}
                placeholder="Notatka (opcjonalnie)"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => saveEdit(item.id)}
                  disabled={updateItem.isPending}
                >
                  Zapisz
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingId(null)}
                >
                  Anuluj
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-gray-900">{name}</p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    item.status === "pending" && "bg-amber-50 text-amber-800",
                    item.status === "bought" && "bg-emerald-50 text-emerald-800",
                    item.status === "skipped" && "bg-gray-100 text-gray-600",
                  )}
                >
                  {SHOPPING_STATUS_LABELS[item.status]}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Plan:{" "}
                {formatPlannedQuantity(item.plannedQuantity, item.plannedUnit)}
              </p>
              {item.note ? (
                <p className="mt-1 text-sm text-gray-500">{item.note}</p>
              ) : null}
            </>
          )}
        </div>

        {!isEditing ? (
          <div className="flex flex-wrap gap-2">
            {item.status !== "bought" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => startEdit(item)}
              >
                Edytuj
              </Button>
            ) : null}
            {item.status === "pending" ? (
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    updateStatus.mutate({ itemId: item.id, status: "bought" })
                  }
                  disabled={updateStatus.isPending}
                >
                  <Check size={14} className="mr-1" />
                  Kupione
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateStatus.mutate({ itemId: item.id, status: "skipped" })
                  }
                  disabled={updateStatus.isPending}
                >
                  <SkipForward size={14} className="mr-1" />
                  Pomiń
                </Button>
              </>
            ) : null}
            {item.status !== "pending" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  updateStatus.mutate({ itemId: item.id, status: "pending" })
                }
                disabled={updateStatus.isPending}
              >
                <RotateCcw size={14} className="mr-1" />
                Przywróć
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setItemToDelete(item)}
            >
              <Trash2 size={14} className="mr-1" />
              Usuń
            </Button>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Lista zakupów
            </h1>
            <p className="mt-2 text-gray-500">
              Wspólna lista dla wszystkich domowników. Oznacz kupione pozycje,
              a potem rozlicz je w podsumowaniu.
            </p>
          </div>
          {grouped.bought.length > 0 ? (
            <Button onClick={() => setCheckoutOpen(true)}>
              Podsumuj zakupy ({grouped.bought.length})
            </Button>
          ) : null}
        </header>

        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-bold text-gray-900">Dodaj pozycję</h2>
          </div>
          <form onSubmit={handleAddSubmit} className="space-y-4 p-5">
            <div className="flex flex-wrap gap-3">
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
                <Label htmlFor="shopping-product">Produkt</Label>
                <select
                  id="shopping-product"
                  className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-sm"
                  value={productId}
                  onChange={(event) => {
                    setProductId(event.target.value);
                    const product = productsQuery.data?.find(
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
                  {(productsQuery.data ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({UNIT_LABELS[product.defaultUnit]})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="shopping-custom">Nazwa</Label>
                <Input
                  id="shopping-custom"
                  value={customName}
                  onChange={(event) => setCustomName(event.target.value)}
                  placeholder="np. Papryka czerwona"
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="shopping-qty">Planowana ilość</Label>
                <Input
                  id="shopping-qty"
                  value={plannedQuantity}
                  onChange={(event) => setPlannedQuantity(event.target.value)}
                  placeholder="opcjonalnie"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shopping-unit">Jednostka</Label>
                <select
                  id="shopping-unit"
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
              <div className="space-y-2">
                <Label htmlFor="shopping-note">Notatka</Label>
                <Input
                  id="shopping-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="opcjonalnie"
                />
              </div>
            </div>

            {formError ? (
              <p className="text-sm text-red-600" role="alert">
                {formError}
              </p>
            ) : null}

            <Button type="submit" disabled={createItem.isPending}>
              {createItem.isPending ? "Dodawanie…" : "Dodaj do listy"}
            </Button>
          </form>
        </section>

        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          {listQuery.isPending ? (
            <div className="p-12 text-center text-sm text-gray-500">
              Ładowanie listy…
            </div>
          ) : null}
          {listQuery.isError ? (
            <div className="p-12 text-center text-sm text-red-600" role="alert">
              {readApiError(listQuery.error)}
            </div>
          ) : null}
          {!listQuery.isPending &&
          !listQuery.isError &&
          (listQuery.data ?? []).length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <ShoppingCart size={32} />
              </div>
              <p className="text-lg font-semibold text-gray-900">
                Lista jest pusta
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                Dodaj produkty z katalogu albo własne pozycje tekstowe. Możesz
                też dodać brakujące produkty z ekranu{" "}
                <Link
                  href={`/kitchens/${kitchenId}/stock`}
                  className="font-medium text-emerald-700 hover:underline"
                >
                  Moje zapasy
                </Link>
                .
              </p>
            </div>
          ) : null}

          {!listQuery.isPending && !listQuery.isError ? (
            <div>
              {grouped.pending.length > 0 ? (
                <div>
                  <h3 className="border-b border-gray-100 bg-emerald-50/50 px-4 py-3 text-sm font-semibold text-emerald-900">
                    Do kupienia ({grouped.pending.length})
                  </h3>
                  <ul>{grouped.pending.map(renderItem)}</ul>
                </div>
              ) : null}
              {grouped.bought.length > 0 ? (
                <div>
                  <h3 className="border-b border-gray-100 bg-emerald-50/50 px-4 py-3 text-sm font-semibold text-emerald-900">
                    Kupione ({grouped.bought.length})
                  </h3>
                  <ul>{grouped.bought.map(renderItem)}</ul>
                </div>
              ) : null}
              {grouped.skipped.length > 0 ? (
                <div>
                  <h3 className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
                    Pominięte ({grouped.skipped.length})
                  </h3>
                  <ul>{grouped.skipped.map(renderItem)}</ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

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
