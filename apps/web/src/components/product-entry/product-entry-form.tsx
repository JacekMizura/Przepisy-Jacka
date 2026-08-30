"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  AlertCircle,
  Calendar,
  MapPin,
  Package,
  ScanBarcode,
  Store,
} from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MediaImageField } from "@/components/media-image-field";
import { ProductCategorySelector } from "@/components/product-entry/product-category-selector";
import {
  initialKindFromGroupId,
  initialKindFromProduct,
  ProductKindField,
  type ProductKindSelection,
} from "@/components/product-entry/product-kind-field";
import { ProductLivePreview } from "@/components/product-entry/product-live-preview";
import {
  buildUpsertProductNutritionDto,
  createEmptyNutritionDraft,
  draftHasNutritionValues,
  initialNutritionDraft,
  ProductNutritionEditor,
  type NutritionFormDraft,
} from "@/components/product-entry/product-nutrition-editor";
import { ProductPhotoField } from "@/components/product-photo-field";
import {
  PurchaseModeField,
  type PurchaseModeChoice,
} from "@/components/product-entry/purchase-mode-field";
import { ProductPurchaseOptions } from "@/components/product-purchase-options";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { LOCATION_LABELS, UNIT_LABELS, readApiError } from "@/lib/errors";
import {
  formatMoneyMinor,
  formatQuantityWithUnit,
} from "@/lib/format-quantity";
import { coercePurchaseModeChoice } from "@/lib/purchase-mode";
import {
  formatEditStockSummary,
} from "@/lib/stock-package-display";
import { deleteKitchenMedia, MEDIA_FILE_HINT } from "@/lib/media-upload";
import {
  PACKAGE_UNIT_OPTIONS,
  packageCountToBaseQuantity,
  suggestedPackageUnitsFor,
  type PackageUnit,
} from "@/lib/package-quantity";
import {
  packagePriceMinorFromInput,
  parsePositivePackageCount,
  totalPriceMinorFromPackages,
} from "@/lib/package-price";
import {
  PRODUCT_CATEGORY_OPTIONS,
  validateOptionalEan,
} from "@/lib/product-media";
import {
  convertToBaseQuantity,
  inputUnitsFor,
  minorFromZloty,
  zlotyFromMinor,
  type BaseUnit,
  type InputUnit,
} from "@/lib/quantity-input";
import { cn } from "@/lib/utils";
import { StoreNameCombobox } from "@/components/store-name-combobox";

const FIELD_CLASS =
  "w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500";

const FIELD_ORANGE_CLASS =
  "w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 sm:text-sm";

type Product = components["schemas"]["ProductDto"];
type ProductMatch = components["schemas"]["ProductMatchResultDto"];
type CreateProductIntake =
  components["schemas"]["CreateProductIntakeDto"];
type StockSummary = components["schemas"]["StockProductSummaryDto"];
type UpdateProduct = components["schemas"]["UpdateProductDto"];
type ProductIntakeResult = components["schemas"]["ProductIntakeResultDto"];

export type ProductEntryMode = "create" | "edit" | "add-batch";

/** Tryb tworzenia: zakup (z partią) albo tylko katalog. */
export type ProductCreateIntent = "purchase" | "catalog";

export type ProductEntrySuccess = {
  product: Product;
  putInStock: boolean;
  mode: ProductEntryMode;
  message: string;
};

type ToastState = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
};

type ProductEntryFormProps = {
  kitchenId: string;
  mode: ProductEntryMode;
  productId?: string;
  initialProduct?: Product | null;
  /**
   * @deprecated Prefer `createIntent`. Kept for call sites that still pass stock=1/0.
   */
  defaultPutInStock?: boolean;
  /** purchase = wymagana sekcja zakupu; catalog = bez zakupu. */
  createIntent?: ProductCreateIntent;
  initialName?: string;
  initialQuantity?: string;
  /** Prefill rodzaju (np. z `/products/new?groupId=`). */
  initialGroupId?: string | null;
  initialGroupName?: string | null;
  onSuccess: (result: ProductEntrySuccess) => void;
};

const UNIT_OPTION_LABELS: Record<BaseUnit, string> = {
  gram: "gramy (g)",
  piece: "sztuki (szt)",
  milliliter: "mililitry (ml)",
};

function todayDateInput(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function matchMessage(match: ProductMatch | undefined): string | null {
  if (!match) {
    return null;
  }
  const rawMessage = match.message as unknown;
  if (typeof rawMessage === "string" && rawMessage.trim()) {
    return rawMessage;
  }
  if (match.exactEan || match.exactName) {
    return "Ten produkt jest już w katalogu. Możesz odłożyć nową kupioną ilość do zapasów.";
  }
  if (match.archivedMatch) {
    return "Znaleziono zarchiwizowany produkt o tym samym EAN lub nazwie. Przywróć go zamiast tworzyć nowy.";
  }
  return null;
}

function matchedProduct(match: ProductMatch | undefined): Product | null {
  if (!match) {
    return null;
  }
  return match.exactEan ?? match.exactName ?? match.archivedMatch ?? null;
}

function resolveCreateIntent(
  createIntent: ProductCreateIntent | undefined,
  defaultPutInStock: boolean,
): ProductCreateIntent {
  if (createIntent) {
    return createIntent;
  }
  return defaultPutInStock ? "purchase" : "catalog";
}

export function ProductEntryForm({
  kitchenId,
  mode,
  productId,
  initialProduct = null,
  defaultPutInStock = true,
  createIntent: createIntentProp,
  initialName = "",
  initialQuantity = "",
  initialGroupId = null,
  initialGroupName = null,
  onSuccess,
}: ProductEntryFormProps) {
  const queryClient = useQueryClient();
  const createIntent = resolveCreateIntent(createIntentProp, defaultPutInStock);
  const isPurchaseCreate = mode === "create" && createIntent === "purchase";
  const isCatalogCreate = mode === "create" && createIntent === "catalog";
  /** Create: stock checkbox default ON; purchase / existing-match force stock. */
  const [putInStock, setPutInStock] = useState(true);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  const [name, setName] = useState(
    initialProduct?.name ?? initialName,
  );
  const [ean, setEan] = useState(initialProduct?.ean ?? "");
  const [defaultUnit, setDefaultUnit] = useState<BaseUnit>(
    (initialProduct?.defaultUnit as BaseUnit | undefined) ?? "gram",
  );
  const [category, setCategory] = useState(initialProduct?.category ?? "");
  const [brand, setBrand] = useState(initialProduct?.brand ?? "");
  const [variantLabel, setVariantLabel] = useState(
    initialProduct?.variantLabel ?? "",
  );
  const [packageQuantity, setPackageQuantity] = useState(
    initialProduct?.packageQuantity
      ? String(Number(initialProduct.packageQuantity))
      : "",
  );
  const [packageUnit, setPackageUnit] = useState<PackageUnit | "">(
    (initialProduct?.packageUnit as PackageUnit | null | undefined) ?? "",
  );
  const [kind, setKind] = useState<ProductKindSelection>(() =>
    mode === "edit" || initialProduct
      ? initialKindFromProduct(initialProduct)
      : initialKindFromGroupId(initialGroupId, initialGroupName),
  );
  const [purchaseMode, setPurchaseMode] = useState<PurchaseModeChoice | null>(
    () =>
      coercePurchaseModeChoice(
        initialProduct?.purchaseMode,
        Boolean(initialProduct?.packageQuantity && initialProduct?.packageUnit),
      ),
  );
  const [confirmClearPackage, setConfirmClearPackage] = useState(false);
  const [mediaAssetId, setMediaAssetId] = useState<string | null>(null);
  const [nutrition, setNutrition] = useState<NutritionFormDraft>(() =>
    initialNutritionDraft(
      initialProduct?.nutrition,
      (initialProduct?.defaultUnit as BaseUnit | undefined) ?? "gram",
    ),
  );
  const [hadNutritionInitially] = useState(
    () => Boolean(initialProduct?.nutrition),
  );

  const [quantity, setQuantity] = useState(initialQuantity);
  const [packageCount, setPackageCount] = useState("");
  const [inputUnit, setInputUnit] = useState<InputUnit>(
    () =>
      inputUnitsFor(
        (initialProduct?.defaultUnit as BaseUnit | undefined) ?? "gram",
      )[0]?.value ?? "gram",
  );
  const [price, setPrice] = useState("");
  const [storeName, setStoreName] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(todayDateInput);
  const [expiresAt, setExpiresAt] = useState("");
  const [location, setLocation] =
    useState<keyof typeof LOCATION_LABELS>("pantry");

  const [existingProductId, setExistingProductId] = useState<string | null>(
    mode === "create" ? null : (productId ?? initialProduct?.id ?? null),
  );
  const [restoreArchived, setRestoreArchived] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [catalogSuccess, setCatalogSuccess] = useState<Product | null>(null);
  const [debouncedName, setDebouncedName] = useState(name.trim());
  const [debouncedEan, setDebouncedEan] = useState(ean.trim());
  const successNavTimer = useRef<number | null>(null);
  const [baselineSnapshot, setBaselineSnapshot] = useState<string | null>(() => {
    if (mode !== "edit" || !initialProduct) {
      return null;
    }
    return JSON.stringify({
      name: initialProduct.name,
      ean: initialProduct.ean ?? "",
      defaultUnit: initialProduct.defaultUnit,
      category: initialProduct.category ?? "",
      brand: initialProduct.brand ?? "",
      variantLabel: initialProduct.variantLabel ?? "",
      packageQuantity: initialProduct.packageQuantity
        ? String(Number(initialProduct.packageQuantity))
        : "",
      packageUnit: initialProduct.packageUnit ?? "",
      kind: kindSnapshot(initialKindFromProduct(initialProduct)),
      purchaseMode: initialProduct.purchaseMode,
      nutrition: initialNutritionDraft(
        initialProduct.nutrition,
        initialProduct.defaultUnit as BaseUnit,
      ),
    });
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedName(name.trim());
      setDebouncedEan(ean.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [name, ean]);

  useEffect(() => {
    return () => {
      if (successNavTimer.current !== null) {
        window.clearTimeout(successNavTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (mode !== "create" || !initialGroupId || initialGroupName) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/product-groups/{groupId}",
        {
          params: {
            path: { kitchenId, groupId: initialGroupId },
          },
        },
      );
      if (cancelled || error || !data) {
        return;
      }
      setKind({
        mode: "existing",
        group: {
          id: data.id,
          kitchenId: data.kitchenId,
          name: data.name,
          normalizedName: data.normalizedName,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [initialGroupId, initialGroupName, kitchenId, mode]);

  function applyDefaultUnit(nextUnit: BaseUnit) {
    setDefaultUnit(nextUnit);
    const units = inputUnitsFor(nextUnit);
    setInputUnit((current) =>
      units.some((unit) => unit.value === current)
        ? current
        : (units[0]?.value ?? "gram"),
    );
    const packageUnits = suggestedPackageUnitsFor(nextUnit);
    setPackageUnit((current) =>
      current && packageUnits.includes(current)
        ? current
        : (packageUnits[0] ?? ""),
    );
    setNutrition((current) => {
      if (draftHasNutritionValues(current)) {
        return current.baseUnit === nextUnit
          ? current
          : { ...current, baseUnit: nextUnit };
      }
      return createEmptyNutritionDraft(nextUnit);
    });
  }

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

  const resolvedProduct = useMemo(() => {
    if (initialProduct) {
      return initialProduct;
    }
    const id = productId ?? existingProductId;
    if (!id) {
      return null;
    }
    return productsQuery.data?.find((entry) => entry.id === id) ?? null;
  }, [existingProductId, initialProduct, productId, productsQuery.data]);

  const matchQuery = useQuery({
    queryKey: ["product-match", kitchenId, debouncedName, debouncedEan],
    enabled:
      mode === "create" &&
      !existingProductId &&
      (debouncedName.length >= 2 || debouncedEan.length >= 8),
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/products/match",
        {
          params: {
            path: { kitchenId },
            query: {
              ...(debouncedName ? { name: debouncedName } : {}),
              ...(debouncedEan ? { ean: debouncedEan } : {}),
            },
          },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się sprawdzić katalogu."),
        );
      }
      return data;
    },
  });

  const stockSummaryQuery = useQuery({
    queryKey: ["stock-summary", kitchenId],
    enabled: mode === "edit" && Boolean(productId ?? resolvedProduct?.id),
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/stock-summary",
        { params: { path: { kitchenId } } },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać podsumowania zapasów."),
        );
      }
      return data ?? [];
    },
  });

  const productStock = useMemo(() => {
    const id = productId ?? resolvedProduct?.id;
    if (!id) {
      return null as StockSummary | null;
    }
    return (
      stockSummaryQuery.data?.find((entry) => entry.productId === id) ?? null
    );
  }, [productId, resolvedProduct?.id, stockSummaryQuery.data]);

  const categoryOptions = useMemo(() => {
    const fromCatalog = new Set<string>(PRODUCT_CATEGORY_OPTIONS);
    for (const product of productsQuery.data ?? []) {
      if (product.category) {
        fromCatalog.add(product.category);
      }
    }
    return Array.from(fromCatalog).sort((a, b) => a.localeCompare(b, "pl"));
  }, [productsQuery.data]);

  const isDirty = useMemo(() => {
    if (mode === "edit" && baselineSnapshot) {
      const current = JSON.stringify({
        name: name.trim(),
        ean: ean.trim(),
        defaultUnit,
        category: category.trim(),
        brand: brand.trim(),
        variantLabel: variantLabel.trim(),
        packageQuantity: packageQuantity.trim(),
        packageUnit,
        kind: kindSnapshot(kind),
        purchaseMode,
        nutrition,
      });
      return current !== baselineSnapshot;
    }
    if (mode === "create" || mode === "add-batch") {
      return Boolean(
        name.trim() ||
          ean.trim() ||
          brand.trim() ||
          variantLabel.trim() ||
          category.trim() ||
          packageQuantity.trim() ||
          quantity.trim() ||
          packageCount.trim() ||
          price.trim() ||
          storeName.trim() ||
          expiresAt ||
          mediaAssetId ||
          draftHasNutritionValues(nutrition) ||
          kind.mode !== "none",
      );
    }
    return false;
  }, [
    baselineSnapshot,
    brand,
    category,
    defaultUnit,
    ean,
    expiresAt,
    kind,
    mediaAssetId,
    mode,
    name,
    nutrition,
    packageCount,
    packageQuantity,
    packageUnit,
    price,
    purchaseMode,
    quantity,
    storeName,
    variantLabel,
  ]);

  const packageConfigured =
    Boolean(packageQuantity.trim()) && Boolean(packageUnit);

  const stockByPackages =
    packageConfigured && purchaseMode !== "exact";

  function applyPurchaseMode(next: PurchaseModeChoice) {
    setPurchaseMode(next);
    if (next === "exact") {
      setPackageQuantity("");
      setPackageUnit("");
      setPackageCount("");
    }
  }

  function requestPurchaseModeChange(next: PurchaseModeChoice) {
    if (next === purchaseMode) {
      return;
    }
    if (
      next === "exact" &&
      purchaseMode === "packaged" &&
      (packageQuantity.trim() || packageUnit)
    ) {
      setConfirmClearPackage(true);
      return;
    }
    applyPurchaseMode(next);
  }

  const stockUnit =
    mode === "add-batch"
      ? ((resolvedProduct?.defaultUnit as BaseUnit | undefined) ?? defaultUnit)
      : existingProductId
        ? ((matchedProduct(matchQuery.data)?.defaultUnit as BaseUnit) ??
          (resolvedProduct?.defaultUnit as BaseUnit | undefined) ??
          defaultUnit)
        : defaultUnit;

  const computedPackageStock = useMemo(() => {
    if (!stockByPackages || !packageConfigured || !packageUnit) {
      return null;
    }
    return packageCountToBaseQuantity({
      packageCount,
      packageQuantity,
      packageUnit,
      defaultUnit: stockUnit,
    });
  }, [
    packageConfigured,
    packageCount,
    packageQuantity,
    packageUnit,
    stockByPackages,
    stockUnit,
  ]);

  async function discardPendingMedia() {
    if (mediaAssetId) {
      try {
        await deleteKitchenMedia(kitchenId, mediaAssetId);
      } catch {
        // ignore cleanup errors
      }
      setMediaAssetId(null);
    }
  }

  const stockForced =
    isPurchaseCreate || Boolean(mode === "create" && existingProductId);
  const effectivelyPutInStock =
    mode === "add-batch" ||
    (mode === "create" && (stockForced || putInStock));

  function buildStockPayload():
    | { ok: true; stock: CreateProductIntake["stock"] }
    | { ok: false; message: string } {
    if (mode === "edit") {
      return { ok: true, stock: undefined };
    }
    if (mode === "create" && !effectivelyPutInStock) {
      return { ok: true, stock: undefined };
    }

    const stockMeta = {
      location,
      storeName: storeName.trim() || null,
      purchasedAt: purchasedAt
        ? new Date(purchasedAt).toISOString()
        : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    } as Omit<
      NonNullable<CreateProductIntake["stock"]>,
      "quantity" | "packageCount" | "purchasePriceMinor"
    >;

    if (stockByPackages && packageConfigured) {
      if (!packageCount.trim()) {
        return { ok: false, message: "Podaj liczbę opakowań." };
      }
      const countInt = parsePositivePackageCount(packageCount);
      if (countInt === null) {
        return {
          ok: false,
          message: "Podaj całkowitą liczbę opakowań (np. 2).",
        };
      }
      const converted = packageCountToBaseQuantity({
        packageCount: String(countInt),
        packageQuantity,
        packageUnit: packageUnit as PackageUnit,
        defaultUnit: stockUnit,
      });
      if (!converted.ok) {
        return { ok: false, message: converted.message };
      }

      let purchasePriceMinor: number | undefined;
      if (price.trim()) {
        const perPackage = packagePriceMinorFromInput(price);
        if (perPackage === null) {
          return {
            ok: false,
            message: "Podaj cenę za opakowanie w złotych, np. 2,99, albo zostaw puste.",
          };
        }
        const total = totalPriceMinorFromPackages(perPackage, countInt);
        if (total === null) {
          return { ok: false, message: "Nie udało się policzyć ceny łącznej." };
        }
        purchasePriceMinor = total;
      }

      return {
        ok: true,
        stock: {
          packageCount: String(countInt),
          ...stockMeta,
          ...(purchasePriceMinor !== undefined ? { purchasePriceMinor } : {}),
        } as CreateProductIntake["stock"],
      };
    }

    const purchasePriceMinor = price.trim() ? minorFromZloty(price) : null;
    if (price.trim() && purchasePriceMinor === null) {
      return {
        ok: false,
        message: "Podaj cenę w złotych, np. 5,99, albo zostaw puste.",
      };
    }

    const converted = convertToBaseQuantity(quantity, inputUnit, stockUnit);
    if (!converted.ok) {
      return { ok: false, message: converted.message };
    }
    return {
      ok: true,
      stock: {
        quantity: converted.quantity,
        ...stockMeta,
        ...(purchasePriceMinor !== null ? { purchasePriceMinor } : {}),
      } as CreateProductIntake["stock"],
    };
  }

  function buildPackageFields(): {
    packageQuantity?: string | null;
    packageUnit?: PackageUnit | null;
  } {
    if (purchaseMode === "exact") {
      return { packageQuantity: null, packageUnit: null };
    }
    if (!packageQuantity.trim() && !packageUnit) {
      return { packageQuantity: null, packageUnit: null };
    }
    if (!packageQuantity.trim() || !packageUnit) {
      return {};
    }
    return {
      packageQuantity: toApiDecimal(packageQuantity),
      packageUnit,
    };
  }

  function buildKindFields(): {
    groupId?: string | null;
    createGroupName?: string;
  } {
    if (kind.mode === "existing") {
      return { groupId: kind.group.id };
    }
    if (kind.mode === "create") {
      return { createGroupName: kind.name };
    }
    return { groupId: null };
  }

  async function invalidateAfterWrite() {
    await queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
    await queryClient.invalidateQueries({
      queryKey: ["stock-summary", kitchenId],
    });
    await queryClient.invalidateQueries({ queryKey: ["stock", kitchenId] });
    await queryClient.invalidateQueries({ queryKey: ["catalog", kitchenId] });
    await queryClient.invalidateQueries({
      queryKey: ["product-groups", kitchenId],
    });
  }

  async function resolveCanUndo(
    result: ProductIntakeResult,
  ): Promise<boolean> {
    if (result.removalHint?.canUndo) {
      return true;
    }
    try {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/products/{productId}/removal-preview",
        {
          params: {
            path: { kitchenId, productId: result.product.id },
          },
        },
      );
      if (error || !data) {
        return false;
      }
      return data.canUndo === true || data.mode === "undo";
    } catch {
      return false;
    }
  }

  function scheduleSuccess(
    result: ProductEntrySuccess,
    options?: { delayMs?: number },
  ) {
    if (successNavTimer.current !== null) {
      window.clearTimeout(successNavTimer.current);
      successNavTimer.current = null;
    }
    const delay = options?.delayMs ?? 0;
    if (delay <= 0) {
      onSuccess(result);
      return;
    }
    successNavTimer.current = window.setTimeout(() => {
      successNavTimer.current = null;
      onSuccess(result);
    }, delay);
  }

  const undoAddition = useMutation({
    mutationFn: async (targetProductId: string) => {
      const client = createWebApiClient();
      const { error } = await client.POST(
        "/api/kitchens/{kitchenId}/products/{productId}/undo-addition",
        {
          params: { path: { kitchenId, productId: targetProductId } },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się cofnąć dodania produktu."),
        );
      }
    },
    onSuccess: async () => {
      if (successNavTimer.current !== null) {
        window.clearTimeout(successNavTimer.current);
        successNavTimer.current = null;
      }
      await invalidateAfterWrite();
      setToast({
        message: "Cofnięto dodanie produktu.",
        durationMs: 3500,
      });
    },
    onError: (error) => {
      setToast({
        message: readApiError(error, "Nie udało się cofnąć dodania."),
        durationMs: 4500,
      });
    },
  });

  const createIntake = useMutation({
    mutationFn: async () => {
      setFormError(null);
      setFieldErrors({});

      const eanError = validateOptionalEan(ean);
      if (eanError && !existingProductId) {
        setFieldErrors({ ean: eanError });
        throw new Error(eanError);
      }
      if (!existingProductId && !name.trim()) {
        setFieldErrors({ name: "Podaj nazwę produktu." });
        throw new Error("Podaj nazwę produktu.");
      }

      const nutritionResult = buildUpsertProductNutritionDto(nutrition);
      if (!nutritionResult.ok) {
        throw new Error(nutritionResult.message);
      }

      const stockResult = buildStockPayload();
      if (!stockResult.ok) {
        throw new Error(stockResult.message);
      }
      if (effectivelyPutInStock && !stockResult.stock) {
        throw new Error("Podaj ilość do odłożenia.");
      }

      const body: CreateProductIntake = {
        idempotencyKey: crypto.randomUUID(),
        restoreArchived,
        ...(nutritionResult.value
          ? { nutrition: nutritionResult.value }
          : {}),
        ...(stockResult.stock ? { stock: stockResult.stock } : {}),
      };

      if (existingProductId || mode === "add-batch") {
        const id =
          existingProductId ??
          productId ??
          resolvedProduct?.id;
        if (!id) {
          throw new Error("Brak produktu do przyjęcia.");
        }
        body.existingProductId = id;
      } else {
        if (purchaseMode !== "packaged" && purchaseMode !== "exact") {
          throw new Error("Wybierz sposób zakupu produktu.");
        }
        if (purchaseMode === "packaged" && !packageConfigured) {
          throw new Error(
            "Podaj zawartość opakowania (ilość i jednostkę) albo wybierz „Na wagę / luzem”.",
          );
        }
        const kindFields = buildKindFields();
        const packageFields = buildPackageFields();
        if (
          purchaseMode === "packaged" &&
          ((packageQuantity.trim() && !packageUnit) ||
            (!packageQuantity.trim() && packageUnit))
        ) {
          throw new Error(
            "Podaj zarówno zawartość opakowania, jak i jednostkę.",
          );
        }
        body.newProduct = {
          name: name.trim(),
          defaultUnit,
          ean: ean.trim() || null,
          category: category.trim() || null,
          brand: brand.trim() || null,
          variantLabel: variantLabel.trim() || null,
          purchaseMode,
          ...packageFields,
          ...(kindFields.groupId !== undefined
            ? { groupId: kindFields.groupId }
            : {}),
          ...(kindFields.createGroupName
            ? { createGroupName: kindFields.createGroupName }
            : {}),
          ...(mediaAssetId ? { imageMediaId: mediaAssetId } : {}),
        };
      }

      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/product-intakes",
        {
          params: { path: { kitchenId } },
          body,
        },
      );
      if (error || !data) {
        throw new Error(
          readApiError(error, "Nie udało się dodać produktu."),
        );
      }
      return data;
    },
    onSuccess: async (result) => {
      await invalidateAfterWrite();
      setMediaAssetId(null);
      const putStock = Boolean(result.stockItem);
      const message = result.restoredFromArchive
        ? putStock
          ? "Przywrócono produkt z archiwum i odłożono do zapasów."
          : "Przywrócono produkt z archiwum."
        : putStock
          ? "Dodano produkt i odłożono do zapasów."
          : "Dodano produkt do katalogu.";

      const successPayload: ProductEntrySuccess = {
        product: result.product,
        putInStock: putStock,
        mode,
        message,
      };

      if (isCatalogCreate && !existingProductId && !putStock) {
        setCatalogSuccess(result.product);
        setToast({ message, durationMs: 4000 });
        return;
      }

      const canUndo = await resolveCanUndo(result);
      if (canUndo && (putStock || mode === "add-batch")) {
        setToast({
          message,
          actionLabel: "Cofnij dodanie",
          durationMs: 8000,
          onAction: () => undoAddition.mutate(result.product.id),
        });
        scheduleSuccess(successPayload, { delayMs: 4500 });
        return;
      }

      setToast({ message, durationMs: 3500 });
      scheduleSuccess(successPayload, { delayMs: 600 });
    },
    onError: (error) => {
      setFormError(readApiError(error));
    },
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      setFormError(null);
      setFieldErrors({});
      const id = productId ?? resolvedProduct?.id;
      if (!id) {
        throw new Error("Brak produktu do edycji.");
      }
      const eanError = validateOptionalEan(ean);
      if (eanError) {
        setFieldErrors({ ean: eanError });
        throw new Error(eanError);
      }
      if (!name.trim()) {
        setFieldErrors({ name: "Podaj nazwę produktu." });
        throw new Error("Podaj nazwę produktu.");
      }

      const nutritionResult = buildUpsertProductNutritionDto(nutrition);
      if (!nutritionResult.ok) {
        throw new Error(nutritionResult.message);
      }

      const client = createWebApiClient();
      if (purchaseMode !== "packaged" && purchaseMode !== "exact") {
        throw new Error("Wybierz sposób zakupu produktu.");
      }
      if (purchaseMode === "packaged" && !packageConfigured) {
        throw new Error(
          "Podaj zawartość opakowania albo wybierz „Na wagę / luzem”.",
        );
      }
      if (
        purchaseMode === "packaged" &&
        ((packageQuantity.trim() && !packageUnit) ||
          (!packageQuantity.trim() && packageUnit))
      ) {
        throw new Error(
          "Podaj zarówno zawartość opakowania, jak i jednostkę.",
        );
      }
      const packageFields = buildPackageFields();
      const patchBody: UpdateProduct = {
        name: name.trim(),
        defaultUnit,
        ean: ean.trim() || null,
        category: category.trim() || null,
        brand: brand.trim() || null,
        variantLabel: variantLabel.trim() || null,
        ...packageFields,
        purchaseMode,
      };
      const { data, error } = await client.PATCH(
        "/api/kitchens/{kitchenId}/products/{productId}",
        {
          params: { path: { kitchenId, productId: id } },
          body: patchBody,
        },
      );
      if (error || !data) {
        throw new Error(
          readApiError(error, "Nie udało się zapisać produktu."),
        );
      }

      const nextGroupId =
        kind.mode === "existing"
          ? kind.group.id
          : kind.mode === "create"
            ? null
            : null;
      const previousGroupId = initialProduct?.groupId ?? resolvedProduct?.groupId ?? null;

      if (kind.mode === "create") {
        const { data: createdGroup, error: createGroupError } = await client.POST(
          "/api/kitchens/{kitchenId}/product-groups",
          {
            params: { path: { kitchenId } },
            body: { name: kind.name },
          },
        );
        if (createGroupError || !createdGroup) {
          throw new Error(
            readApiError(
              createGroupError,
              "Zapisano produkt, ale nie udało się utworzyć rodzaju.",
            ),
          );
        }
        const { error: assignError } = await client.POST(
          "/api/kitchens/{kitchenId}/products/{productId}/assign-group",
          {
            params: { path: { kitchenId, productId: id } },
            body: { groupId: createdGroup.id },
          },
        );
        if (assignError) {
          throw new Error(
            readApiError(
              assignError,
              "Zapisano produkt, ale nie udało się przypisać rodzaju.",
            ),
          );
        }
        setKind({ mode: "existing", group: createdGroup });
      } else if (nextGroupId !== previousGroupId) {
        const { error: assignError } = await client.POST(
          "/api/kitchens/{kitchenId}/products/{productId}/assign-group",
          {
            params: { path: { kitchenId, productId: id } },
            body: { groupId: nextGroupId },
          },
        );
        if (assignError) {
          throw new Error(
            readApiError(
              assignError,
              "Zapisano produkt, ale nie udało się zmienić rodzaju.",
            ),
          );
        }
      }

      if (nutritionResult.value) {
        const { error: nutritionError } = await client.PUT(
          "/api/kitchens/{kitchenId}/products/{productId}/nutrition",
          {
            params: { path: { kitchenId, productId: id } },
            body: nutritionResult.value,
          },
        );
        if (nutritionError) {
          throw new Error(
            readApiError(
              nutritionError,
              "Zapisano produkt, ale nie udało się zapisać wartości odżywczych.",
            ),
          );
        }
      } else if (hadNutritionInitially || resolvedProduct?.nutrition) {
        const { error: deleteError } = await client.DELETE(
          "/api/kitchens/{kitchenId}/products/{productId}/nutrition",
          { params: { path: { kitchenId, productId: id } } },
        );
        if (deleteError) {
          throw new Error(
            readApiError(
              deleteError,
              "Zapisano produkt, ale nie udało się usunąć wartości odżywczych.",
            ),
          );
        }
      }

      return data;
    },
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
      await queryClient.invalidateQueries({ queryKey: ["catalog", kitchenId] });
      await queryClient.invalidateQueries({
        queryKey: ["product-groups", kitchenId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["product-nutrition", kitchenId, product.id],
      });
      setBaselineSnapshot(
        JSON.stringify({
          name: product.name,
          ean: product.ean ?? "",
          defaultUnit: product.defaultUnit,
          category: product.category ?? "",
          brand: brand.trim(),
          variantLabel: variantLabel.trim(),
          packageQuantity: packageQuantity.trim(),
          packageUnit,
          kind: kindSnapshot(kind),
          purchaseMode: product.purchaseMode,
          nutrition,
        }),
      );
      setToast({ message: "Zapisano zmiany produktu.", durationMs: 3500 });
      onSuccess({
        product,
        putInStock: false,
        mode: "edit",
        message: "Zapisano zmiany produktu.",
      });
    },
    onError: (error) => {
      setFormError(readApiError(error));
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === "edit") {
      saveEdit.mutate();
      return;
    }
    createIntake.mutate();
  }

  function applyCatalogHit(catalogHit: Product) {
    setExistingProductId(catalogHit.id);
    setRestoreArchived(Boolean(catalogHit.isArchived));
    setName(catalogHit.name);
    setEan(catalogHit.ean ?? "");
    applyDefaultUnit(catalogHit.defaultUnit as BaseUnit);
    setCategory(catalogHit.category ?? "");
    setBrand(catalogHit.brand ?? "");
    setVariantLabel(catalogHit.variantLabel ?? "");
    setPackageQuantity(
      catalogHit.packageQuantity
        ? String(Number(catalogHit.packageQuantity))
        : "",
    );
    setPackageUnit((catalogHit.packageUnit as PackageUnit | null) ?? "");
    setKind(initialKindFromProduct(catalogHit));
  }

  function clearExistingSelection() {
    setExistingProductId(null);
    setRestoreArchived(false);
  }

  const pending = createIntake.isPending || saveEdit.isPending;
  const match = matchQuery.data;
  const catalogHit = matchedProduct(match);
  const bannerText = matchMessage(match);
  const lockCatalogFields =
    Boolean(existingProductId) && mode === "create";
  const showProductFields =
    mode === "edit" || (mode === "create" && !existingProductId);
  const cancelHref =
    isCatalogCreate
      ? `/kitchens/${kitchenId}/stock?view=catalog`
      : `/kitchens/${kitchenId}/stock`;

  const submitLabel = (() => {
    if (pending) {
      return "Zapisywanie…";
    }
    if (mode === "edit") {
      return "Zapisz";
    }
    if (mode === "add-batch" || existingProductId) {
      return "Odłóż do zapasów";
    }
    if (effectivelyPutInStock) {
      return "Dodaj produkt i odłóż";
    }
    return "Dodaj produkt";
  })();

  const headerTitle =
    mode === "edit"
      ? "Edycja produktu"
      : mode === "add-batch"
        ? "Dodaj kolejną partię"
        : "Nowy produkt";

  const headerSubtitle =
    mode === "edit"
      ? "Zmień dane katalogowe i wartości odżywcze. Nowe partie dodasz osobno."
      : mode === "add-batch"
        ? `${resolvedProduct?.name ?? "Produkt"} — odłóż kupioną ilość do zapasów.`
        : existingProductId
          ? "Przyjmujesz partię dla istniejącego produktu."
          : "Dodaj produkt do katalogu i od razu odłóż kupioną ilość.";

  const kindLabel =
    kind.mode === "existing"
      ? kind.group.name || null
      : kind.mode === "create"
        ? kind.name
        : null;

  if (catalogSuccess) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-6 px-1 pb-8">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-5 py-6">
          <h1 className="text-xl font-bold text-emerald-950">
            Dodano do katalogu
          </h1>
          <p className="mt-1 text-sm text-emerald-900/80">
            „{catalogSuccess.name}” jest już w katalogu. Możesz od razu dodać
            pierwszą partię albo wrócić później.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={`/kitchens/${kitchenId}/products/${catalogSuccess.id}/add-batch`}
              className="inline-flex h-11 items-center rounded-xl bg-emerald-600 px-6 text-sm font-medium text-white shadow-sm shadow-emerald-200 hover:bg-emerald-700"
            >
              Dodaj pierwszą partię
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onSuccess({
                  product: catalogSuccess,
                  putInStock: false,
                  mode: "create",
                  message: "Dodano produkt do katalogu.",
                })
              }
            >
              Gotowe
            </Button>
          </div>
        </div>
        <Toast
          message={toast?.message ?? null}
          onDismiss={() => setToast(null)}
          durationMs={toast?.durationMs}
          actionLabel={toast?.actionLabel}
          onAction={toast?.onAction}
        />
      </div>
    );
  }

  if (mode === "add-batch") {
    return (
      <form
        onSubmit={onSubmit}
        className="relative mx-auto max-w-xl space-y-6 pb-28"
      >
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {headerTitle}
          </h1>
          <p className="text-sm text-gray-500">{headerSubtitle}</p>
        </header>
        <PurchaseCard
          packageConfigured={packageConfigured}
          stockByPackages={stockByPackages}
          packageCount={packageCount}
          setPackageCount={setPackageCount}
          packageQuantity={packageQuantity}
          packageUnit={packageUnit}
          computedPackageStock={computedPackageStock}
          stockUnit={stockUnit}
          quantity={quantity}
          setQuantity={setQuantity}
          inputUnit={inputUnit}
          setInputUnit={setInputUnit}
          price={price}
          setPrice={setPrice}
          storeName={storeName}
          setStoreName={setStoreName}
          purchasedAt={purchasedAt}
          setPurchasedAt={setPurchasedAt}
          expiresAt={expiresAt}
          setExpiresAt={setExpiresAt}
          location={location}
          setLocation={setLocation}
        />
        {formError ? (
          <p className="text-sm text-red-600" role="alert">
            {formError}
          </p>
        ) : null}
        <StickyFooter
          pending={pending}
          dirty={isDirty}
          submitLabel={submitLabel}
          cancelHref={cancelHref}
          disableSubmit={pending}
        />
        {confirmClearPackage ? (
          <ConfirmDialog
            title="Wyczyścić dane opakowania?"
            description="Przejście na „Na wagę / luzem” usunie zapisaną zawartość opakowania. Wartości odżywcze (np. na 100 g) pozostaną bez zmian."
            confirmLabel="Wyczyść i przełącz"
            confirmVariant="amber"
            onConfirm={() => {
              setConfirmClearPackage(false);
              applyPurchaseMode("exact");
            }}
            onCancel={() => setConfirmClearPackage(false)}
          />
        ) : null}
        <Toast
          message={toast?.message ?? null}
          onDismiss={() => setToast(null)}
          durationMs={toast?.durationMs}
          actionLabel={toast?.actionLabel}
          onAction={toast?.onAction}
        />
      </form>
    );
  }

  if (mode === "create") {
    const stockChecked = stockForced || putInStock;

    return (
      <form
        onSubmit={onSubmit}
        className="mx-auto max-w-6xl px-0 sm:px-2 lg:px-0"
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{headerTitle}</h1>
          <p className="mt-1 text-gray-500">{headerSubtitle}</p>
        </div>

        {existingProductId ? (
          <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950">
            <p>
              Przyjmujesz partię dla istniejącego produktu
              {restoreArchived ? " (z przywróceniem z archiwum)" : ""}.
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-emerald-800 underline"
              onClick={clearExistingSelection}
            >
              Wróć do tworzenia nowego
            </button>
          </div>
        ) : null}

        {bannerText && catalogHit && !existingProductId ? (
          <div
            className="mb-8 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950"
            role="status"
          >
            <p className="font-medium">{bannerText}</p>
            <p className="mt-1 text-amber-900/80">
              Dopasowanie: {catalogHit.name} (
              {UNIT_LABELS[catalogHit.defaultUnit]})
              {catalogHit.isArchived ? " · w archiwum" : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => applyCatalogHit(catalogHit)}
              >
                {catalogHit.isArchived
                  ? "Przywróć i odłóż partię"
                  : "Użyj istniejącego i odłóż partię"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={clearExistingSelection}
              >
                Kontynuuj jako nowy
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="flex-1 space-y-10">
            {showProductFields ? (
              <section>
                <h2 className="mb-5 text-sm font-bold tracking-wider text-emerald-700 uppercase">
                  Produkt
                </h2>
                <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <ProductKindField
                    kitchenId={kitchenId}
                    value={kind}
                    onChange={setKind}
                    suggestedGroups={match?.suggestedGroups ?? []}
                    disabled={lockCatalogFields}
                  />

                  <div>
                    <label
                      htmlFor="product-entry-name"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Nazwa <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="product-entry-name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        if (existingProductId) {
                          clearExistingSelection();
                        }
                      }}
                      placeholder="np. Mleko UHT 3,2%"
                      required
                      disabled={lockCatalogFields}
                      className={FIELD_CLASS}
                    />
                    {fieldErrors.name ? (
                      <p className="mt-1 text-xs text-red-600">
                        {fieldErrors.name}
                      </p>
                    ) : null}
                  </div>

                  <MediaImageField
                    kitchenId={kitchenId}
                    purpose="product"
                    currentImage={null}
                    label="Zdjęcie produktu (opcjonalnie)"
                    hint={MEDIA_FILE_HINT}
                    layout="inline"
                    onUploaded={(id) => setMediaAssetId(id)}
                    onRemoved={async () => {
                      await discardPendingMedia();
                    }}
                    onPreviewUrlChange={setPhotoPreviewUrl}
                  />

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="product-entry-brand"
                        className="mb-1 block text-sm font-medium text-gray-700"
                      >
                        Marka (opcjonalnie)
                      </label>
                      <input
                        id="product-entry-brand"
                        value={brand}
                        onChange={(event) => setBrand(event.target.value)}
                        placeholder="np. Galbani"
                        disabled={lockCatalogFields}
                        className={FIELD_CLASS}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="product-entry-variant"
                        className="mb-1 block text-sm font-medium text-gray-700"
                      >
                        Wariant (opcjonalnie)
                      </label>
                      <input
                        id="product-entry-variant"
                        value={variantLabel}
                        onChange={(event) => setVariantLabel(event.target.value)}
                        placeholder="np. kulka / light"
                        disabled={lockCatalogFields}
                        className={FIELD_CLASS}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="product-entry-ean"
                        className="mb-1 block text-sm font-medium text-gray-700"
                      >
                        EAN (opcjonalnie)
                      </label>
                      <div className="relative">
                        <input
                          id="product-entry-ean"
                          inputMode="numeric"
                          value={ean}
                          onChange={(event) => setEan(event.target.value)}
                          placeholder="np. 5901234123457"
                          disabled={lockCatalogFields}
                          className={cn(FIELD_CLASS, "pr-10")}
                        />
                        <button
                          type="button"
                          className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 disabled:opacity-40"
                          disabled={
                            ean.trim().length < 8 || matchQuery.isFetching
                          }
                          aria-label="Szukaj po EAN"
                          onClick={() => {
                            setDebouncedEan(ean.trim());
                            void matchQuery.refetch();
                          }}
                        >
                          <ScanBarcode className="h-5 w-5" />
                        </button>
                      </div>
                      {fieldErrors.ean ? (
                        <p className="mt-1 text-xs text-red-600">
                          {fieldErrors.ean}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label
                        htmlFor="product-entry-unit"
                        className="mb-1 block text-sm font-medium text-gray-700"
                      >
                        Jednostka bazowa
                      </label>
                      <select
                        id="product-entry-unit"
                        value={defaultUnit}
                        onChange={(event) =>
                          applyDefaultUnit(event.target.value as BaseUnit)
                        }
                        disabled={lockCatalogFields}
                        className={cn(FIELD_CLASS, "bg-white")}
                      >
                        {(Object.keys(UNIT_OPTION_LABELS) as BaseUnit[]).map(
                          (unit) => (
                            <option key={unit} value={unit}>
                              {UNIT_OPTION_LABELS[unit]}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  </div>

                  <PurchaseModeField
                    value={purchaseMode}
                    onChange={requestPurchaseModeChange}
                    disabled={lockCatalogFields}
                  />

                  {purchaseMode === "packaged" ? (
                    <div>
                      <label
                        htmlFor="product-entry-package-qty"
                        className="mb-1 block text-sm font-medium text-gray-700"
                      >
                        Zawartość opakowania
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="product-entry-package-qty"
                          inputMode="decimal"
                          value={packageQuantity}
                          onChange={(event) => {
                            setPackageQuantity(event.target.value);
                          }}
                          placeholder="np. 125"
                          disabled={lockCatalogFields}
                          className="w-32 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm disabled:bg-gray-50"
                        />
                        <select
                          aria-label="Jednostka opakowania"
                          value={packageUnit}
                          onChange={(event) =>
                            setPackageUnit(
                              event.target.value as PackageUnit | "",
                            )
                          }
                          disabled={lockCatalogFields}
                          className="w-24 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-gray-50"
                        >
                          <option value="">—</option>
                          {PACKAGE_UNIT_OPTIONS.filter((option) =>
                            suggestedPackageUnitsFor(defaultUnit).includes(
                              option.value,
                            ),
                          ).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}

                  <ProductCategorySelector
                    value={category}
                    onChange={setCategory}
                    extraOptions={categoryOptions}
                    disabled={lockCatalogFields}
                  />
                </div>
              </section>
            ) : null}

            {showProductFields ? (
              <section>
                <ProductNutritionEditor
                  kitchenId={kitchenId}
                  productUnit={defaultUnit}
                  ean={ean}
                  productName={name}
                  value={nutrition}
                  onChange={setNutrition}
                />
              </section>
            ) : null}

            <section>
              <h2 className="mb-5 text-sm font-bold tracking-wider text-orange-600 uppercase">
                Zakup i Zapasy
              </h2>
              <div
                className={cn(
                  "rounded-xl border p-6 shadow-sm transition-colors",
                  stockChecked
                    ? "border-orange-200 bg-orange-50/30"
                    : "border-gray-200 bg-white",
                )}
              >
                <div className="mb-6 flex items-center">
                  <input
                    id="addToInventory"
                    name="addToInventory"
                    type="checkbox"
                    checked={stockChecked}
                    disabled={stockForced}
                    onChange={(event) => setPutInStock(event.target.checked)}
                    className="h-5 w-5 cursor-pointer rounded border-gray-300 text-orange-600 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-70"
                  />
                  <label
                    htmlFor="addToInventory"
                    className="ml-3 block cursor-pointer text-base font-medium text-gray-900 select-none"
                  >
                    Odłóż od razu do zapasów
                  </label>
                </div>

                {stockChecked ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="entry-qty"
                          className="mb-1 block text-sm font-medium text-gray-700"
                        >
                          {stockByPackages && packageConfigured
                            ? "Liczba opakowań"
                            : "Kupiona ilość"}
                        </label>
                        <div className="flex gap-2">
                          {stockByPackages && packageConfigured ? (
                            <input
                              id="entry-qty"
                              inputMode="decimal"
                              value={packageCount}
                              onChange={(event) =>
                                setPackageCount(event.target.value)
                              }
                              placeholder="0"
                              required
                              className={FIELD_ORANGE_CLASS}
                            />
                          ) : (
                            <input
                              id="entry-qty"
                              inputMode="decimal"
                              value={quantity}
                              onChange={(event) =>
                                setQuantity(event.target.value)
                              }
                              placeholder="0"
                              required
                              className={FIELD_ORANGE_CLASS}
                            />
                          )}
                          {stockByPackages && packageConfigured ? (
                            <span className="inline-flex w-32 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
                              opak.
                            </span>
                          ) : (
                            <select
                              aria-label="Jednostka ilości"
                              value={inputUnit}
                              onChange={(event) =>
                                setInputUnit(event.target.value as InputUnit)
                              }
                              className="w-32 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 sm:text-sm bg-white"
                            >
                              {inputUnitsFor(stockUnit).map((unit) => (
                                <option key={unit.value} value={unit.value}>
                                  {unit.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        {stockByPackages &&
                        packageConfigured &&
                        computedPackageStock?.ok ? (
                          <p className="mt-1 text-xs text-orange-800">
                            Razem:{" "}
                            {formatQuantityWithUnit(
                              computedPackageStock.quantity,
                              stockUnit,
                            )}
                          </p>
                        ) : null}
                        {stockByPackages &&
                        packageConfigured &&
                        computedPackageStock &&
                        !computedPackageStock.ok ? (
                          <p className="mt-1 text-xs text-red-600">
                            {computedPackageStock.message}
                          </p>
                        ) : null}
                      </div>

                      <div>
                        <label
                          htmlFor="entry-price"
                          className="mb-1 block text-sm font-medium text-gray-700"
                        >
                          {stockByPackages && packageConfigured
                            ? "Cena za opakowanie (zł)"
                            : "Cena łączna (zł, opcjonalnie)"}
                        </label>
                        <div className="relative">
                          <input
                            id="entry-price"
                            inputMode="decimal"
                            value={price}
                            onChange={(event) => setPrice(event.target.value)}
                            placeholder="0,00"
                            className={cn(
                              FIELD_ORANGE_CLASS,
                              "pr-10 text-right",
                            )}
                          />
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                            <span className="text-gray-500 sm:text-sm">zł</span>
                          </div>
                        </div>
                        {stockByPackages && packageConfigured ? (
                          <PackagePriceHints
                            packageCount={packageCount}
                            packageQuantity={packageQuantity}
                            packageUnit={packageUnit}
                            price={price}
                            computedPackageStock={computedPackageStock}
                            stockUnit={stockUnit}
                          />
                        ) : (
                          <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                            <AlertCircle className="h-3 w-3" /> Cena to łączna
                            kwota za tę partię.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="entry-store"
                          className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700"
                        >
                          <Store className="h-4 w-4 text-gray-400" /> Sklep
                          (opcjonalnie)
                        </label>
                        <StoreNameCombobox
                          id="entry-store"
                          value={storeName}
                          onChange={setStoreName}
                          inputClassName={FIELD_ORANGE_CLASS}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="entry-location"
                          className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700"
                        >
                          <MapPin className="h-4 w-4 text-gray-400" /> Miejsce{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <select
                          id="entry-location"
                          value={location}
                          onChange={(event) =>
                            setLocation(
                              event.target.value as keyof typeof LOCATION_LABELS,
                            )
                          }
                          className={cn(FIELD_ORANGE_CLASS, "bg-white")}
                        >
                          {Object.entries(LOCATION_LABELS).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="entry-purchased"
                          className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700"
                        >
                          <Calendar className="h-4 w-4 text-gray-400" /> Data
                          zakupu
                        </label>
                        <input
                          id="entry-purchased"
                          type="date"
                          value={purchasedAt}
                          onChange={(event) =>
                            setPurchasedAt(event.target.value)
                          }
                          className={FIELD_ORANGE_CLASS}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="entry-expires"
                          className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700"
                        >
                          <Calendar className="h-4 w-4 text-gray-400" /> Data
                          ważności
                        </label>
                        <input
                          id="entry-expires"
                          type="date"
                          value={expiresAt}
                          onChange={(event) => setExpiresAt(event.target.value)}
                          className={cn(FIELD_ORANGE_CLASS, "text-gray-500")}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {formError ? (
              <p className="text-sm text-red-600" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="lg:hidden">
              <details className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gray-900 marker:content-none [&::-webkit-details-marker]:hidden">
                  Podgląd produktu
                </summary>
                <div className="border-t border-gray-100">
                  <ProductLivePreview
                    name={name}
                    brand={brand}
                    variantLabel={variantLabel}
                    category={category}
                    kindLabel={kindLabel}
                    defaultUnit={defaultUnit}
                    packageQuantity={packageQuantity}
                    packageUnit={packageUnit}
                    photoUrl={photoPreviewUrl}
                    putInStock={stockChecked}
                    quantity={quantity}
                    packageCount={packageCount}
                    stockByPackages={stockByPackages && packageConfigured}
                    inputUnit={inputUnit}
                    location={location}
                    expiresAt={expiresAt}
                    embedded
                  />
                </div>
              </details>
            </div>

            <div className="flex items-center gap-4 border-t border-gray-200 pt-4">
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg border border-transparent bg-orange-500 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-orange-600 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitLabel}
              </button>
              <Link
                href={cancelHref}
                className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:outline-none"
              >
                Anuluj
              </Link>
            </div>
          </div>

          <div className="hidden w-80 flex-shrink-0 lg:block">
            <ProductLivePreview
              name={name}
              brand={brand}
              variantLabel={variantLabel}
              category={category}
              kindLabel={kindLabel}
              defaultUnit={defaultUnit}
              packageQuantity={packageQuantity}
              packageUnit={packageUnit}
              photoUrl={photoPreviewUrl}
              putInStock={stockChecked}
              quantity={quantity}
              packageCount={packageCount}
              stockByPackages={stockByPackages && packageConfigured}
              inputUnit={inputUnit}
              location={location}
              expiresAt={expiresAt}
            />
          </div>
        </div>

        {confirmClearPackage ? (
          <ConfirmDialog
            title="Wyczyścić dane opakowania?"
            description="Przejście na „Na wagę / luzem” usunie zapisaną zawartość opakowania. Wartości odżywcze (np. na 100 g) pozostaną bez zmian."
            confirmLabel="Wyczyść i przełącz"
            confirmVariant="amber"
            onConfirm={() => {
              setConfirmClearPackage(false);
              applyPurchaseMode("exact");
            }}
            onCancel={() => setConfirmClearPackage(false)}
          />
        ) : null}
        <Toast
          message={toast?.message ?? null}
          onDismiss={() => setToast(null)}
          durationMs={toast?.durationMs}
          actionLabel={toast?.actionLabel}
          onAction={toast?.onAction}
        />
      </form>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative mx-auto max-w-6xl space-y-6 pb-28"
    >
      <header className="mb-2 space-y-1">
        <h1 className="text-3xl font-bold text-gray-900">{headerTitle}</h1>
        <p className="mt-1 text-gray-500">{headerSubtitle}</p>
      </header>

      {showProductFields ? (
        <section>
          <h2 className="mb-5 text-sm font-bold tracking-wider text-emerald-700 uppercase">
            Produkt
          </h2>
          <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            {resolvedProduct ? (
              <ProductPhotoField
                kitchenId={kitchenId}
                productId={resolvedProduct.id}
                image={resolvedProduct.image}
                label="Zdjęcie produktu (opcjonalnie)"
              />
            ) : null}

            <ProductKindField
              kitchenId={kitchenId}
              value={kind}
              onChange={setKind}
              disabled={lockCatalogFields}
            />

            <div>
              <label
                htmlFor="product-entry-name"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Nazwa <span className="text-red-500">*</span>
              </label>
              <input
                id="product-entry-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="np. Mleko UHT 3,2%"
                required
                className={FIELD_CLASS}
              />
              {fieldErrors.name ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="product-entry-brand"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Marka (opcjonalnie)
                </label>
                <input
                  id="product-entry-brand"
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  placeholder="np. Galbani"
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label
                  htmlFor="product-entry-variant"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Wariant (opcjonalnie)
                </label>
                <input
                  id="product-entry-variant"
                  value={variantLabel}
                  onChange={(event) => setVariantLabel(event.target.value)}
                  placeholder="np. kulka / light"
                  className={FIELD_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="product-entry-ean"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  EAN (opcjonalnie)
                </label>
                <input
                  id="product-entry-ean"
                  inputMode="numeric"
                  value={ean}
                  onChange={(event) => setEan(event.target.value)}
                  placeholder="np. 5901234123457"
                  className={FIELD_CLASS}
                />
                {fieldErrors.ean ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.ean}</p>
                ) : null}
              </div>
              <div>
                <label
                  htmlFor="product-entry-unit"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Jednostka bazowa
                </label>
                <select
                  id="product-entry-unit"
                  value={defaultUnit}
                  onChange={(event) =>
                    applyDefaultUnit(event.target.value as BaseUnit)
                  }
                  className={cn(FIELD_CLASS, "bg-white")}
                >
                  {(Object.keys(UNIT_OPTION_LABELS) as BaseUnit[]).map(
                    (unit) => (
                      <option key={unit} value={unit}>
                        {UNIT_OPTION_LABELS[unit]}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>

            <PurchaseModeField
              value={
                purchaseMode === "packaged" || purchaseMode === "exact"
                  ? purchaseMode
                  : packageConfigured
                    ? "packaged"
                    : "exact"
              }
              onChange={requestPurchaseModeChange}
            />

            {purchaseMode !== "exact" ? (
              <div>
                <label
                  htmlFor="product-entry-package-qty"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Zawartość opakowania
                </label>
                <div className="flex gap-2">
                  <input
                    id="product-entry-package-qty"
                    inputMode="decimal"
                    value={packageQuantity}
                    onChange={(event) =>
                      setPackageQuantity(event.target.value)
                    }
                    placeholder="np. 125"
                    className="w-32 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                  />
                  <select
                    aria-label="Jednostka opakowania"
                    value={packageUnit}
                    onChange={(event) =>
                      setPackageUnit(event.target.value as PackageUnit | "")
                    }
                    className="w-24 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-gray-50"
                  >
                    <option value="">—</option>
                    {PACKAGE_UNIT_OPTIONS.filter((option) =>
                      suggestedPackageUnitsFor(defaultUnit).includes(
                        option.value,
                      ),
                    ).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            <ProductCategorySelector
              value={category}
              onChange={setCategory}
              extraOptions={categoryOptions}
            />
          </div>
        </section>
      ) : null}

      {showProductFields ? (
        <section>
          <ProductNutritionEditor
            kitchenId={kitchenId}
            productUnit={defaultUnit}
            ean={ean}
            productName={name}
            value={nutrition}
            onChange={setNutrition}
            defaultOpen={hadNutritionInitially}
          />
        </section>
      ) : null}

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white px-6 py-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Zapasy</h2>
        {stockSummaryQuery.isPending ? (
          <p className="text-sm text-gray-500">Ładowanie zapasów…</p>
        ) : productStock ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-sm">
            <p className="font-medium text-gray-900">
              {formatEditStockSummary({
                totalQuantity: productStock.totalQuantity,
                defaultUnit: productStock.defaultUnit,
                batchCount: productStock.batchCount,
                batches: productStock.batches,
              })}
            </p>
            {packageConfigured ? (
              <p className="mt-1 text-xs text-gray-600">
                Wielkość produktu: {packageQuantity.trim()}{" "}
                {PACKAGE_UNIT_OPTIONS.find((o) => o.value === packageUnit)
                  ?.label ?? packageUnit}{" "}
                w opakowaniu
              </p>
            ) : null}
            {productStock.nearestExpiry ? (
              <p className="mt-1 text-xs text-amber-700">
                Najbliższa ważność:{" "}
                {new Date(productStock.nearestExpiry).toLocaleDateString(
                  "pl-PL",
                )}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Brak partii w zapasach.</p>
        )}
        <Link
          href={`/kitchens/${kitchenId}/products/${productId ?? resolvedProduct?.id}/add-batch`}
          className="inline-flex text-sm font-medium text-emerald-800 hover:underline"
        >
          Dodaj kolejną partię
        </Link>
        {resolvedProduct ? (
          <ProductPurchaseOptions
            kitchenId={kitchenId}
            productId={resolvedProduct.id}
            defaultUnit={resolvedProduct.defaultUnit as BaseUnit}
            purchaseMode={resolvedProduct.purchaseMode}
            packageQuantity={resolvedProduct.packageQuantity}
            packageUnit={resolvedProduct.packageUnit}
          />
        ) : null}
      </section>

      {formError ? (
        <p className="text-sm text-red-600" role="alert">
          {formError}
        </p>
      ) : null}

      <StickyFooter
        pending={pending}
        dirty={isDirty}
        submitLabel={submitLabel}
        cancelHref={cancelHref}
        disableSubmit={pending || !isDirty}
      />

      {confirmClearPackage ? (
        <ConfirmDialog
          title="Wyczyścić dane opakowania?"
          description="Przejście na „Na wagę / luzem” usunie zapisaną zawartość opakowania. Wartości odżywcze (np. na 100 g) pozostaną bez zmian."
          confirmLabel="Wyczyść i przełącz"
          confirmVariant="amber"
          onConfirm={() => {
            setConfirmClearPackage(false);
            applyPurchaseMode("exact");
          }}
          onCancel={() => setConfirmClearPackage(false)}
        />
      ) : null}
      <Toast
        message={toast?.message ?? null}
        onDismiss={() => setToast(null)}
        durationMs={toast?.durationMs}
        actionLabel={toast?.actionLabel}
        onAction={toast?.onAction}
      />
    </form>
  );
}

function StickyFooter({
  pending,
  dirty,
  submitLabel,
  cancelHref,
  disableSubmit,
}: {
  pending: boolean;
  dirty: boolean;
  submitLabel: string;
  cancelHref: string;
  disableSubmit: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {pending
            ? "Zapisywanie…"
            : dirty
              ? "Masz niezapisane zmiany"
              : "Brak zmian do zapisania"}
        </p>
        <div className="flex gap-2">
          <Link
            href={cancelHref}
            className="inline-flex h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Anuluj
          </Link>
          <Button type="submit" disabled={disableSubmit}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PurchaseCard({
  packageConfigured,
  stockByPackages,
  packageCount,
  setPackageCount,
  packageQuantity,
  packageUnit,
  computedPackageStock,
  stockUnit,
  quantity,
  setQuantity,
  inputUnit,
  setInputUnit,
  price,
  setPrice,
  storeName,
  setStoreName,
  purchasedAt,
  setPurchasedAt,
  expiresAt,
  setExpiresAt,
  location,
  setLocation,
}: {
  packageConfigured: boolean;
  stockByPackages: boolean;
  packageCount: string;
  setPackageCount: (value: string) => void;
  packageQuantity: string;
  packageUnit: PackageUnit | "";
  computedPackageStock:
    | { ok: true; quantity: string }
    | { ok: false; message: string }
    | null;
  stockUnit: BaseUnit;
  quantity: string;
  setQuantity: (value: string) => void;
  inputUnit: InputUnit;
  setInputUnit: (value: InputUnit) => void;
  price: string;
  setPrice: (value: string) => void;
  storeName: string;
  setStoreName: (value: string) => void;
  purchasedAt: string;
  setPurchasedAt: (value: string) => void;
  expiresAt: string;
  setExpiresAt: (value: string) => void;
  location: keyof typeof LOCATION_LABELS;
  setLocation: (value: keyof typeof LOCATION_LABELS) => void;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 px-4 py-4">
      <div className="flex items-center gap-2">
        <Package size={16} className="text-emerald-700" />
        <h2 className="text-sm font-semibold text-emerald-950">
          Zakup i zapasy
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stockByPackages && packageConfigured ? (
          <div>
            <Label htmlFor="entry-package-count">Liczba opakowań</Label>
            <Input
              id="entry-package-count"
              inputMode="numeric"
              value={packageCount}
              onChange={(event) => setPackageCount(event.target.value)}
              placeholder="np. 2"
              required
            />
            {packageQuantity && packageUnit ? (
              <p className="mt-1 text-xs text-gray-500">
                Zawartość:{" "}
                {formatQuantityWithUnit(packageQuantity, packageUnit)}
              </p>
            ) : null}
            {computedPackageStock?.ok ? (
              <p className="mt-1 text-xs text-emerald-700">
                {formatPackagePurchaseSummary({
                  packageCount,
                  packageQuantity,
                  packageUnit,
                  totalQuantity: computedPackageStock.quantity,
                  stockUnit,
                })}
              </p>
            ) : computedPackageStock && !computedPackageStock.ok ? (
              <p className="mt-1 text-xs text-red-600">
                {computedPackageStock.message}
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Podaj liczbę opakowań, aby zobaczyć przeliczoną ilość.
              </p>
            )}
          </div>
        ) : (
          <div>
            <Label htmlFor="entry-qty">Kupiona ilość</Label>
            <div className="flex gap-2">
              <Input
                id="entry-qty"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="0"
                required
                className="flex-1"
              />
              <select
                aria-label="Jednostka ilości"
                className="rounded-lg border border-gray-200 bg-white px-2 text-sm"
                value={inputUnit}
                onChange={(event) =>
                  setInputUnit(event.target.value as InputUnit)
                }
              >
                {inputUnitsFor(stockUnit).map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="entry-price">
            {stockByPackages && packageConfigured
              ? "Cena za opakowanie (zł)"
              : "Cena łączna (zł)"}
          </Label>
          <div className="relative">
            <Input
              id="entry-price"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="0,00"
              className="pr-10"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-gray-400">
              zł
            </span>
          </div>
          {stockByPackages && packageConfigured ? (
            <PackagePriceHints
              packageCount={packageCount}
              packageQuantity={packageQuantity}
              packageUnit={packageUnit}
              price={price}
              computedPackageStock={computedPackageStock}
              stockUnit={stockUnit}
              hideQuantity
            />
          ) : price.trim() && minorFromZloty(price) != null ? (
            <p className="mt-1 text-xs text-gray-400">
              {formatMoneyMinor(minorFromZloty(price))}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="entry-store">Sklep</Label>
          <StoreNameCombobox
            id="entry-store"
            value={storeName}
            onChange={setStoreName}
            inputClassName="field-input"
          />
        </div>

        <div>
          <Label htmlFor="entry-purchased" className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" /> Data zakupu
          </Label>
          <Input
            id="entry-purchased"
            type="date"
            value={purchasedAt}
            onChange={(event) => setPurchasedAt(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="entry-expires" className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" /> Data ważności
          </Label>
          <Input
            id="entry-expires"
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="entry-location" className="flex items-center gap-2">
            <MapPin size={14} className="text-gray-400" /> Miejsce
          </Label>
          <select
            id="entry-location"
            className="field-input"
            value={location}
            onChange={(event) =>
              setLocation(event.target.value as keyof typeof LOCATION_LABELS)
            }
          >
            {Object.entries(LOCATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}

function formatPackagePurchaseSummary(args: {
  packageCount: string;
  packageQuantity: string;
  packageUnit: PackageUnit | "";
  totalQuantity: string;
  stockUnit: BaseUnit;
}): string {
  const count = parsePositivePackageCount(args.packageCount);
  const unitLabel =
    PACKAGE_UNIT_OPTIONS.find((option) => option.value === args.packageUnit)
      ?.label ?? args.packageUnit;
  const size = `${args.packageQuantity}\u00A0${unitLabel}`;
  const total = formatQuantityWithUnit(args.totalQuantity, args.stockUnit);
  if (count == null) {
    return `? opakowań × ${size} = ${total}`;
  }
  return `${count} opakowania × ${size} = ${total}`.replace(
    /^1 opakowania/,
    "1 opakowanie",
  );
}

function PackagePriceHints({
  packageCount,
  packageQuantity,
  packageUnit,
  price,
  computedPackageStock,
  stockUnit,
  hideQuantity = false,
}: {
  packageCount: string;
  packageQuantity: string;
  packageUnit: PackageUnit | "";
  price: string;
  computedPackageStock:
    | { ok: true; quantity: string }
    | { ok: false; message: string }
    | null;
  stockUnit: BaseUnit;
  hideQuantity?: boolean;
}) {
  const count = parsePositivePackageCount(packageCount);
  const perPackage = price.trim() ? packagePriceMinorFromInput(price) : null;
  const total =
    count != null && perPackage != null
      ? totalPriceMinorFromPackages(perPackage, count)
      : null;

  return (
    <div className="mt-1 space-y-0.5 text-xs text-emerald-700">
      {!hideQuantity && computedPackageStock?.ok ? (
        <p>
          {formatPackagePurchaseSummary({
            packageCount,
            packageQuantity,
            packageUnit,
            totalQuantity: computedPackageStock.quantity,
            stockUnit,
          })}
        </p>
      ) : null}
      {total != null && count != null && perPackage != null ? (
        <p>
          {count} × {zlotyFromMinor(perPackage)} zł = {zlotyFromMinor(total)} zł
        </p>
      ) : price.trim() && perPackage == null ? (
        <p className="text-red-600">Podaj cenę jak 2,99 albo 2.99</p>
      ) : null}
    </div>
  );
}

function kindSnapshot(kind: ProductKindSelection): string {
  if (kind.mode === "existing") {
    return `existing:${kind.group.id}`;
  }
  if (kind.mode === "create") {
    return `create:${kind.name}`;
  }
  return "none";
}

function toApiDecimal(value: string): string {
  const normalized = value.trim().replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return normalized;
  }
  return numeric.toFixed(3);
}
