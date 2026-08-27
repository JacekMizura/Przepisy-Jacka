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
import { ChangePurchaseModeDialog } from "@/components/change-purchase-mode-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ProductThumb } from "@/components/product-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { readApiError, UNIT_LABELS } from "@/lib/errors";
import { productImageUrls } from "@/lib/product-image";
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
              <div className="flex items-center gap-3">
                <ProductThumb
                  src={productImageUrls(selectedProduct).thumbnail}
                  alt={selectedProduct?.name ?? "Produkt"}
                />
                <select
                  id="modal-product"
                  className="block min-w-0 flex-1 rounded-lg border border-gray-200 bg-white p-3 text-sm"
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
  onChangePurchaseMode,
  pending,
  showUnbuy,
}: {
  item: ShoppingListItem;
  onToggleBought: () => void;
  onSkip: () => void;
  onDelete: () => void;
  onChangePurchaseMode?: () => void;
  pending?: boolean;
  showUnbuy?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const name = item.product?.name ?? item.customName ?? "Pozycja bez nazwy";
  const purchaseLine = formatShoppingPurchaseLine(item);
  const requiredHint = formatRequiredForRecipe(
    item.requiredQuantity,
    item.requiredUnit,
  );
  const isBought = item.status === "bought";
  const isSkipped = item.status === "skipped";
  const canChangePurchaseMode =
    Boolean(item.productId) && Boolean(onChangePurchaseMode);
  const thumb = productImageUrls(item.product).thumbnail;

  return (
    <li
      className={cn(
        "flex items-center gap-3 border-b border-gray-100 px-3 py-3.5 last:border-0 sm:px-4",
        isBought && "bg-emerald-50/40",
        isSkipped && "bg-gray-50/80",
      )}
    >
      {item.status === "pending" ? (
        <button
          type="button"
          aria-label={`Oznacz ${name} jako kupione`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-gray-300 bg-white hover:border-emerald-500"
          onClick={onToggleBought}
          disabled={pending}
        />
      ) : isBought ? (
        <button
          type="button"
          aria-label={
            showUnbuy ? `Cofnij kupione: ${name}` : `${name} kupione`
          }
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500 text-white"
          onClick={showUnbuy ? onToggleBought : undefined}
          disabled={!showUnbuy || pending}
        >
          <Check size={14} strokeWidth={3} />
        </button>
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-200 text-gray-500">
          <SkipForward size={12} />
        </span>
      )}

      <ProductThumb src={thumb} alt={name} />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[15px] font-semibold text-gray-900",
            isBought && "text-gray-500 line-through",
            isSkipped && "text-gray-500",
          )}
        >
          {name}
        </p>
        <p
          className={cn(
            "mt-0.5 text-sm text-gray-700",
            isBought && "text-gray-400 line-through",
          )}
        >
          {purchaseLine}
        </p>
        {item.sourceRecipeName ? (
          <p className="mt-1 text-xs text-emerald-700">
            Z przepisu: {item.sourceRecipeName}
          </p>
        ) : null}
        {requiredHint ? (
          <p className="mt-1 text-xs text-gray-500">
            brakuje {requiredHint} do przepisu
          </p>
        ) : null}
        {item.note &&
        !(
          item.sourceRecipeName &&
          item.note.trim() === `Przepis: ${item.sourceRecipeName}`
        ) ? (
          <p className="mt-0.5 text-xs text-gray-400">{item.note}</p>
        ) : null}
      </div>

      <div className="relative shrink-0 self-start sm:self-center">
        <button
          type="button"
          aria-label="Menu pozycji"
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreVertical size={18} />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 z-10 mt-1 w-52 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
            {canChangePurchaseMode && item.status === "pending" ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                onClick={() => {
                  setMenuOpen(false);
                  onChangePurchaseMode?.();
                }}
              >
                Zmień sposób zakupu
              </button>
            ) : null}
            {item.status === "pending" ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                onClick={() => {
                  setMenuOpen(false);
                  onSkip();
                }}
              >
                <SkipForward size={14} />
                Pomiń
              </button>
            ) : null}
            {item.status === "skipped" ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                onClick={() => {
                  setMenuOpen(false);
                  onToggleBought();
                }}
              >
                Przywróć
              </button>
            ) : null}
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50"
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

function SummaryPanel({
  totalCount,
  boughtCount,
  pendingCount,
  progress,
  className,
  onCheckout,
}: {
  totalCount: number;
  boughtCount: number;
  pendingCount: number;
  progress: number;
  className?: string;
  onCheckout: () => void;
}) {
  return (
    <aside
      className={cn(
        "rounded-2xl border border-gray-200/80 bg-white p-5",
        className,
      )}
    >
      <h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">
        Podsumowanie
      </h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-gray-500">Pozycje</dt>
          <dd className="font-semibold text-gray-900">{totalCount}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-gray-500">Kupione</dt>
          <dd className="font-semibold text-emerald-700">{boughtCount}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-gray-500">Do kupienia</dt>
          <dd className="font-semibold text-gray-900">{pendingCount}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-gray-500">Postęp</dt>
          <dd className="font-semibold text-gray-900">{progress}%</dd>
        </div>
      </dl>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-gray-600">
        {boughtCount > 0
          ? "Masz kupione pozycje — rozlicz je, żeby dodać zapasy do kuchni."
          : pendingCount > 0
            ? "Oznacz produkty jako kupione podczas zakupów."
            : "Lista jest pusta. Dodaj produkty lub braki z przepisu."}
      </p>
      {boughtCount > 0 ? (
        <Button className="mt-4 hidden w-full lg:inline-flex" onClick={onCheckout}>
          Rozlicz zakupy ({boughtCount})
        </Button>
      ) : null}
    </aside>
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
  const [itemToChangePurchase, setItemToChangePurchase] =
    useState<ShoppingListItem | null>(null);
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

  const hasBought = grouped.bought.length > 0;

  return (
    <AppShell kitchenId={kitchenId}>
      <div
        className={cn(
          "w-full",
          hasBought &&
            "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0",
        )}
      >
        <header className="mb-5 w-full">
          <div className="flex w-full items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                Lista zakupów
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {totalCount > 0
                  ? `${grouped.bought.length} kupione z ${totalCount}`
                  : "Wspólna lista dla domowników"}
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => setAddOpen(true)}
            >
              <Plus size={16} className="mr-1" />
              <span className="sm:hidden">Dodaj</span>
              <span className="hidden sm:inline">Dodaj produkt</span>
            </Button>
          </div>

          {totalCount > 0 ? (
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100">
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

        {!listQuery.isPending && !listQuery.isError && totalCount === 0 ? (
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
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
            <div className="min-w-0 space-y-5">
              {grouped.pending.length > 0 ? (
                <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white">
                  <h2 className="border-b border-gray-100 px-4 py-3 text-xs font-semibold tracking-wide text-gray-500 uppercase sm:px-5">
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
                        onChangePurchaseMode={
                          item.productId
                            ? () => setItemToChangePurchase(item)
                            : undefined
                        }
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {grouped.bought.length > 0 ? (
                <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white">
                  <h2 className="border-b border-gray-100 px-4 py-3 text-xs font-semibold tracking-wide text-emerald-700 uppercase sm:px-5">
                    Kupione ({grouped.bought.length})
                  </h2>
                  <ul>
                    {grouped.bought.map((item) => (
                      <ShoppingRow
                        key={item.id}
                        item={item}
                        showUnbuy
                        pending={updateStatus.isPending}
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
                </section>
              ) : null}

              {grouped.skipped.length > 0 ? (
                <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 border-b border-gray-100 px-4 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase sm:px-5"
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
                    <ul>
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

            <SummaryPanel
              className="lg:sticky lg:top-8"
              totalCount={totalCount}
              boughtCount={grouped.bought.length}
              pendingCount={grouped.pending.length}
              progress={progress}
              onCheckout={() => setCheckoutOpen(true)}
            />
          </div>
        ) : null}
      </div>

      {hasBought ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] backdrop-blur lg:hidden">
          <Button className="w-full" onClick={() => setCheckoutOpen(true)}>
            Rozlicz zakupy ({grouped.bought.length})
          </Button>
        </div>
      ) : null}

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

      {itemToChangePurchase?.productId ? (
        <ChangePurchaseModeDialog
          kitchenId={kitchenId}
          item={itemToChangePurchase}
          onClose={() => setItemToChangePurchase(null)}
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
