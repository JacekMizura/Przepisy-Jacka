"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  MoreVertical,
  Plus,
  ShoppingCart,
  SkipForward,
  Trash2,
  Wallet,
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
import { createWebApiClient } from "@/lib/api";
import { readApiError, UNIT_LABELS } from "@/lib/errors";
import { productImageUrls } from "@/lib/product-image";
import { uploadKitchenMedia } from "@/lib/media-upload";
import { inputUnitsFor, type BaseUnit, type InputUnit } from "@/lib/quantity-input";
import {
  formatRequiredForRecipe,
  formatShoppingPurchaseLine,
  INPUT_UNIT_LABELS,
} from "@/lib/shopping-labels";
import { buildAddToShoppingListBody } from "@/lib/shopping-list-add";
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
      if (!productId || !selectedProduct) {
        setFormError("Wybierz produkt z katalogu.");
        return;
      }
      try {
        Object.assign(
          body,
          buildAddToShoppingListBody(selectedProduct),
        );
      } catch (error) {
        setFormError(
          error instanceof Error
            ? error.message
            : "Nie udało się przygotować pozycji.",
        );
        return;
      }
      if (
        selectedProduct.purchaseMode === "packaged" &&
        plannedQuantity.trim()
      ) {
        const packages = Number(plannedQuantity.replace(",", "."));
        if (!Number.isFinite(packages) || packages < 1) {
          setFormError("Podaj liczbę opakowań (co najmniej 1).");
          return;
        }
        body.packageCount = Math.round(packages);
      } else if (
        selectedProduct.purchaseMode !== "packaged" &&
        plannedQuantity.trim()
      ) {
        body.plannedQuantity = plannedQuantity.trim();
        body.plannedUnit = plannedUnit;
      }
    } else {
      if (!customName.trim()) {
        setFormError("Podaj nazwę pozycji.");
        return;
      }
      body.customName = customName.trim();
      if (plannedQuantity.trim()) {
        body.plannedQuantity = plannedQuantity.trim();
        body.plannedUnit = plannedUnit;
      }
    }
    if (note.trim()) {
      body.note = note.trim();
    }
    onSubmit(body);
  }

  const fieldClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-700 placeholder:text-slate-400 focus:border-[#009060] focus:outline-none focus:ring-1 focus:ring-[#009060]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        role="presentation"
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-shopping-title"
        className="relative z-10 w-full max-w-[460px] rounded-2xl bg-white p-7 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="add-shopping-title"
          className="text-xl font-bold text-slate-900"
        >
          Dodaj produkt
        </h2>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Dodaj produkt z katalogu lub własną pozycję tekstową.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-6 flex gap-2">
            <button
              type="button"
              onClick={() => setAddMode("product")}
              className={cn(
                "rounded-lg border px-4 py-1.5 text-[13px] font-semibold transition-all",
                addMode === "product"
                  ? "border-[#009060] bg-[#009060] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              Z katalogu
            </button>
            <button
              type="button"
              onClick={() => setAddMode("custom")}
              className={cn(
                "rounded-lg border px-4 py-1.5 text-[13px] font-semibold transition-all",
                addMode === "custom"
                  ? "border-[#009060] bg-[#009060] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              Własna pozycja
            </button>
          </div>

          <div className="space-y-4">
            {addMode === "product" ? (
              <div>
                <label
                  htmlFor="modal-product"
                  className="mb-1.5 block text-[13px] font-medium text-slate-700"
                >
                  Produkt
                </label>
                <div className="flex gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-50 text-zinc-400">
                    {selectedProduct ? (
                      <ProductThumb
                        src={productImageUrls(selectedProduct).thumbnail}
                        alt={selectedProduct.name}
                        className="!h-full !w-full rounded-none !bg-transparent object-contain p-1"
                        size="sm"
                      />
                    ) : (
                      <Box size={18} strokeWidth={1.5} />
                    )}
                  </div>
                  <select
                    id="modal-product"
                    className={cn(fieldClass, "appearance-none")}
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
                    <option value="">Wybierz produkt...</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({UNIT_LABELS[product.defaultUnit]})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="modal-custom"
                  className="mb-1.5 block text-[13px] font-medium text-slate-700"
                >
                  Nazwa
                </label>
                <input
                  id="modal-custom"
                  value={customName}
                  onChange={(event) => setCustomName(event.target.value)}
                  placeholder="np. Papryka czerwona"
                  className={fieldClass}
                />
              </div>
            )}

            <div className="flex gap-4">
              <div className="flex-1">
                <label
                  htmlFor="modal-qty"
                  className="mb-1.5 block text-[13px] font-medium text-slate-700"
                >
                  Ilość
                </label>
                <input
                  id="modal-qty"
                  value={plannedQuantity}
                  onChange={(event) => setPlannedQuantity(event.target.value)}
                  placeholder="opcjonalnie"
                  className={fieldClass}
                />
              </div>
              <div className="flex-1">
                <label
                  htmlFor="modal-unit"
                  className="mb-1.5 block text-[13px] font-medium text-slate-700"
                >
                  Jednostka
                </label>
                <select
                  id="modal-unit"
                  className={cn(fieldClass, "appearance-none")}
                  value={plannedUnit}
                  onChange={(event) =>
                    setPlannedUnit(event.target.value as InputUnit)
                  }
                >
                  {(unitOptions.length > 0
                    ? unitOptions
                    : Object.entries(INPUT_UNIT_LABELS).map(
                        ([value, label]) => ({
                          value: value as InputUnit,
                          label,
                        }),
                      )
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="modal-note"
                className="mb-1.5 block text-[13px] font-medium text-slate-700"
              >
                Notatka
              </label>
              <input
                id="modal-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="opcjonalnie"
                className={fieldClass}
              />
            </div>
          </div>

          {formError ? (
            <p className="mt-4 text-sm text-red-600" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="mt-8 flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-[14px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[#009060] px-5 py-2 text-[14px] font-medium text-white shadow-sm shadow-[#009060]/20 transition-colors hover:bg-[#007b52] disabled:opacity-60"
            >
              {pending ? "Dodawanie…" : "Dodaj do listy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShoppingRow({
  item,
  kitchenId,
  onToggleBought,
  onSkip,
  onDelete,
  onChangePurchaseMode,
  pending,
  showUnbuy,
}: {
  item: ShoppingListItem;
  kitchenId: string;
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
  const category = item.product?.category?.trim() || null;
  const unboundName = !item.productId
    ? (item.customName ?? item.product?.name ?? "").trim()
    : "";
  const metaLine = [purchaseLine, category].filter(Boolean).join(" • ");

  return (
    <div
      className={cn(
        "group flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition-colors",
        isBought
          ? "border-zinc-200 bg-white hover:bg-zinc-100"
          : "border-zinc-200 hover:border-zinc-400",
        isSkipped && "border-zinc-200 bg-zinc-50",
      )}
      onClick={() => {
        if (pending) {
          return;
        }
        if (item.status === "pending" || (isBought && showUnbuy)) {
          onToggleBought();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (pending) {
            return;
          }
          if (item.status === "pending" || (isBought && showUnbuy)) {
            onToggleBought();
          }
        }
      }}
      role="button"
      tabIndex={0}
    >
      {item.status === "pending" ? (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-zinc-300 transition-colors group-hover:border-zinc-500" />
      ) : isBought ? (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-emerald-600 bg-emerald-600">
          <Check size={14} className="text-white" strokeWidth={3} />
        </div>
      ) : (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-200 text-zinc-500">
          <SkipForward size={12} />
        </div>
      )}

      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden bg-zinc-50",
          isBought ? "h-12 w-12 rounded-lg" : "h-14 w-14 rounded-xl",
        )}
      >
        <ProductThumb
          src={thumb}
          alt={name}
          className="!h-full !w-full rounded-none !bg-transparent object-contain p-1"
          size="sm"
        />
      </div>

      <div className="min-w-0 flex-1">
        <h4
          className={cn(
            "truncate font-bold text-zinc-900",
            isBought ? "text-base line-through" : "text-lg",
            isSkipped && "text-zinc-500",
          )}
        >
          {name}
        </h4>
        {!isBought ? (
          <p className="text-sm font-medium text-zinc-500">{metaLine || "—"}</p>
        ) : null}
        {item.sourceRecipeName ? (
          <p className="mt-1 text-xs font-medium text-emerald-700">
            Z przepisu: {item.sourceRecipeName}
          </p>
        ) : null}
        {requiredHint ? (
          <p className="mt-1 text-xs text-zinc-500">
            brakuje {requiredHint} do przepisu
          </p>
        ) : null}
        {item.note &&
        !(
          item.sourceRecipeName &&
          item.note.trim() === `Przepis: ${item.sourceRecipeName}`
        ) ? (
          <p className="mt-0.5 text-xs text-zinc-400">{item.note}</p>
        ) : null}
      </div>

      <div className="relative shrink-0" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          aria-label="Menu pozycji"
          className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreVertical size={18} />
        </button>
        {menuOpen ? (
          <>
            <div
              className="fixed inset-0 z-10"
              role="presentation"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-zinc-100 bg-white py-1 shadow-lg">
              {!item.productId && unboundName ? (
                <Link
                  href={`/kitchens/${kitchenId}/products/new?stock=1&name=${encodeURIComponent(unboundName)}&from=shopping`}
                  className="block w-full px-4 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Utwórz produkt i odłóż
                </Link>
              ) : null}
              {canChangePurchaseMode && item.status === "pending" ? (
                <button
                  type="button"
                  className="block w-full px-4 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50"
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
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50"
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
                  className="block w-full px-4 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50"
                  onClick={() => {
                    setMenuOpen(false);
                    onToggleBought();
                  }}
                >
                  Przywróć
                </button>
              ) : null}
              <div className="my-1 h-px bg-zinc-100" />
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                <Trash2 size={14} />
                Usuń
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function SummaryPanel({
  totalCount,
  boughtCount,
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
  const canCheckout = boughtCount > 0;

  return (
    <aside
      className={cn(
        "w-full rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm lg:col-span-4",
        className,
      )}
    >
      <div className="mb-6 flex items-center gap-3 text-zinc-500">
        <Wallet size={22} aria-hidden />
        <span className="text-xs font-bold tracking-widest uppercase">
          Podsumowanie
        </span>
      </div>

      <div className="mb-6 space-y-3 text-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 py-3">
          <span className="font-medium text-zinc-500">Liczba pozycji</span>
          <span className="text-lg font-bold text-zinc-900">{totalCount}</span>
        </div>
        <div className="flex items-center justify-between border-b border-zinc-100 py-3">
          <span className="font-medium text-zinc-500">W koszyku</span>
          <span className="text-lg font-bold text-emerald-700">{boughtCount}</span>
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-2 flex items-end justify-between">
          <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">
            Postęp zakupów
          </span>
          <span className="font-bold text-zinc-900">{progress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <button
        type="button"
        disabled={!canCheckout}
        onClick={onCheckout}
        className={cn(
          "hidden w-full rounded-2xl py-4 text-base font-bold transition-all lg:block",
          canCheckout
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "cursor-not-allowed bg-zinc-100 text-zinc-400",
        )}
      >
        {canCheckout
          ? `Rozlicz zakupy (${boughtCount})`
          : "Czekam na zakupy…"}
      </button>
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
  const progress =
    totalCount > 0
      ? Math.round((grouped.bought.length / totalCount) * 100)
      : 0;

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
    mutationFn: async (payload: {
      idempotencyKey: string;
      storeName?: string;
      purchasedAt?: string;
      lines: components["schemas"]["CheckoutPurchaseLineDto"][];
      receiptFile: File | null;
    }) => {
      const { receiptFile, ...body } = payload;
      const purchase = await checkoutPurchase(kitchenId, body);
      if (receiptFile && purchase) {
        const asset = await uploadKitchenMedia({
          kitchenId,
          file: receiptFile,
          purpose: "purchase_receipt",
          target: { purchaseId: purchase.id },
        });
        const client = createWebApiClient();
        const { error: attachError } = await client.POST(
          "/api/kitchens/{kitchenId}/purchases/{purchaseId}/receipt",
          {
            params: { path: { kitchenId, purchaseId: purchase.id } },
            body: { mediaAssetId: asset.id },
          },
        );
        if (attachError) {
          throw new Error(
            readApiError(
              attachError,
              "Zakupy rozliczone, ale nie udało się dodać zdjęcia paragonu.",
            ),
          );
        }
      }
      return purchase;
    },
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
          "-mx-4 -my-4 min-h-[calc(100vh-2rem)] bg-[#F4F4F5] px-6 py-8 sm:-mx-8 sm:-my-8 sm:px-8 lg:-mx-10 lg:-my-10 lg:px-12 lg:py-12",
          hasBought &&
            "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-12",
        )}
      >
        <div className="mx-auto flex h-full max-w-[1400px] flex-col">
          <header className="mb-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="mb-4 text-4xl font-black tracking-tighter text-zinc-900 sm:text-5xl">
                Lista Zakupów
              </h1>
              <p className="text-lg font-medium text-zinc-500">
                {totalCount === 0
                  ? "Wspólna lista dla domowników"
                  : `${grouped.bought.length} kupione z ${totalCount}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              <Plus size={18} />
              Nowa pozycja
            </button>
          </header>

          {listQuery.isPending ? (
            <p className="text-center text-sm text-zinc-500">Ładowanie listy…</p>
          ) : null}

          {listQuery.isError ? (
            <p className="text-center text-sm text-red-600" role="alert">
              {readApiError(listQuery.error)}
            </p>
          ) : null}

          {!listQuery.isPending && !listQuery.isError && totalCount === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center pb-20 text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-200/70">
                <ShoppingCart size={24} className="text-zinc-500" />
              </div>
              <h3 className="mb-2 text-base font-bold text-zinc-900">
                Lista jest pusta
              </h3>
              <p className="text-sm text-zinc-500">
                Dodaj produkty ręcznie albo z ekranu{" "}
                <Link
                  href={`/kitchens/${kitchenId}/recipes`}
                  className="cursor-pointer font-medium text-emerald-700"
                >
                  przepisów
                </Link>
                .
              </p>
            </div>
          ) : null}

          {!listQuery.isPending && !listQuery.isError && totalCount > 0 ? (
            <div className="grid flex-1 grid-cols-1 items-start gap-8 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-8">
                <section className="rounded-[24px] border border-zinc-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-6 border-b border-zinc-100 pb-4 text-sm font-black tracking-widest text-zinc-900 uppercase">
                    Do kupienia ({grouped.pending.length})
                  </h3>
                  <div className="space-y-3">
                    {grouped.pending.map((item) => (
                      <ShoppingRow
                        key={item.id}
                        item={item}
                        kitchenId={kitchenId}
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
                    {grouped.pending.length === 0 ? (
                      <div className="py-12 text-center">
                        <CheckCircle2
                          size={48}
                          className="mx-auto mb-4 text-zinc-200"
                        />
                        <p className="text-lg font-bold text-zinc-400">
                          Wszystko kupione z tej sekcji!
                        </p>
                      </div>
                    ) : null}
                  </div>
                </section>

                {grouped.bought.length > 0 ? (
                  <section className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-6">
                    <h3 className="mb-6 border-b border-zinc-200 pb-4 text-sm font-black tracking-widest text-zinc-500 uppercase">
                      W koszyku ({grouped.bought.length})
                    </h3>
                    <div className="space-y-3 opacity-60 grayscale">
                      {grouped.bought.map((item) => (
                        <ShoppingRow
                          key={item.id}
                          item={item}
                          kitchenId={kitchenId}
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
                    </div>
                  </section>
                ) : null}

                {grouped.skipped.length > 0 ? (
                  <section className="rounded-[24px] border border-zinc-200 bg-white p-6 shadow-sm">
                    <button
                      type="button"
                      className="mb-4 flex w-full items-center gap-2 border-b border-zinc-100 pb-4 text-left"
                      onClick={() => setSkippedOpen((open) => !open)}
                    >
                      <ChevronDown
                        size={14}
                        className={cn(
                          "text-zinc-400 transition-transform",
                          !skippedOpen && "-rotate-90",
                        )}
                      />
                      <span className="text-sm font-black tracking-widest text-zinc-500 uppercase">
                        Pominięte ({grouped.skipped.length})
                      </span>
                    </button>
                    {skippedOpen ? (
                      <div className="space-y-3">
                        {grouped.skipped.map((item) => (
                          <ShoppingRow
                            key={item.id}
                            item={item}
                            kitchenId={kitchenId}
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
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>

              <SummaryPanel
                className="sticky top-8"
                totalCount={totalCount}
                boughtCount={grouped.bought.length}
                pendingCount={grouped.pending.length}
                progress={progress}
                onCheckout={() => setCheckoutOpen(true)}
              />
            </div>
          ) : null}
        </div>
      </div>

      {hasBought ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] backdrop-blur lg:hidden">
          <button
            type="button"
            className="w-full rounded-2xl bg-emerald-500 py-3.5 text-sm font-black text-zinc-950 transition-colors hover:bg-emerald-400"
            onClick={() => setCheckoutOpen(true)}
          >
            Rozlicz zakupy ({grouped.bought.length})
          </button>
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
