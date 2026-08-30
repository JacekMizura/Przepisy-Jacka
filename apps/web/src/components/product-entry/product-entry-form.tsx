"use client";

import type { components } from "@moja-kuchnia/api-client";
import { Calendar, ChevronDown, MapPin, Package, Search } from "lucide-react";
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
import {
  initialKindFromGroupId,
  initialKindFromProduct,
  ProductKindField,
  type ProductKindSelection,
} from "@/components/product-entry/product-kind-field";
import {
  buildUpsertProductNutritionDto,
  createEmptyNutritionDraft,
  draftHasNutritionValues,
  initialNutritionDraft,
  ProductNutritionEditor,
  type NutritionFormDraft,
} from "@/components/product-entry/product-nutrition-editor";
import { ProductPhotoField } from "@/components/product-photo-field";
import { ProductPurchaseOptions } from "@/components/product-purchase-options";
import { Toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { LOCATION_LABELS, UNIT_LABELS, readApiError } from "@/lib/errors";
import {
  formatQuantityWithUnit,
  formatMoneyMinor,
} from "@/lib/format-quantity";
import { deleteKitchenMedia } from "@/lib/media-upload";
import {
  PACKAGE_UNIT_OPTIONS,
  packageCountToBaseQuantity,
  suggestedPackageUnitsFor,
  type PackageUnit,
} from "@/lib/package-quantity";
import {
  PRODUCT_CATEGORY_OPTIONS,
  validateOptionalEan,
} from "@/lib/product-media";
import {
  convertToBaseQuantity,
  inputUnitsFor,
  minorFromZloty,
  type BaseUnit,
  type InputUnit,
} from "@/lib/quantity-input";
import { cn } from "@/lib/utils";

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
  const requiresStock = mode === "add-batch" || isPurchaseCreate;

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
  const [purchaseMode, setPurchaseMode] = useState<
    UpdateProduct["purchaseMode"]
  >(initialProduct?.purchaseMode ?? "unconfigured");
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
  const [stockByPackages, setStockByPackages] = useState(false);
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
  const [extrasOpen, setExtrasOpen] = useState(
    () => Boolean(initialProduct?.category) || mode === "edit",
  );
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

  function buildStockPayload():
    | { ok: true; stock: CreateProductIntake["stock"] }
    | { ok: false; message: string } {
    if (!requiresStock && mode === "create") {
      return { ok: true, stock: undefined };
    }
    if (mode === "edit") {
      return { ok: true, stock: undefined };
    }

    const purchasePriceMinor = price.trim() ? minorFromZloty(price) : null;
    if (price.trim() && purchasePriceMinor === null) {
      return {
        ok: false,
        message: "Podaj cenę w złotych, np. 5,99, albo zostaw puste.",
      };
    }

    const stockMeta = {
      location,
      ...(purchasePriceMinor !== null ? { purchasePriceMinor } : {}),
      storeName: storeName.trim() || null,
      purchasedAt: purchasedAt
        ? new Date(purchasedAt).toISOString()
        : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    } as Omit<
      NonNullable<CreateProductIntake["stock"]>,
      "quantity" | "packageCount"
    >;

    if (stockByPackages && packageConfigured) {
      if (!packageCount.trim()) {
        return { ok: false, message: "Podaj liczbę opakowań." };
      }
      const converted = packageCountToBaseQuantity({
        packageCount,
        packageQuantity,
        packageUnit: packageUnit as PackageUnit,
        defaultUnit: stockUnit,
      });
      if (!converted.ok) {
        return { ok: false, message: converted.message };
      }
      return {
        ok: true,
        stock: {
          packageCount: packageCount.trim().replace(",", "."),
          ...stockMeta,
        } as CreateProductIntake["stock"],
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
      } as CreateProductIntake["stock"],
    };
  }

  function buildPackageFields(): {
    packageQuantity?: string | null;
    packageUnit?: PackageUnit | null;
  } {
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
      if (requiresStock && !stockResult.stock) {
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
        const kindFields = buildKindFields();
        const packageFields = buildPackageFields();
        if (
          (packageQuantity.trim() && !packageUnit) ||
          (!packageQuantity.trim() && packageUnit)
        ) {
          throw new Error(
            "Podaj zarówno ilość w opakowaniu, jak i jednostkę — albo wyczyść oba pola.",
          );
        }
        body.newProduct = {
          name: name.trim(),
          defaultUnit,
          ean: ean.trim() || null,
          category: category.trim() || null,
          brand: brand.trim() || null,
          variantLabel: variantLabel.trim() || null,
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

      if (isCatalogCreate && !existingProductId) {
        setCatalogSuccess(result.product);
        setToast({ message, durationMs: 4000 });
        return;
      }

      const canUndo = await resolveCanUndo(result);
      if (canUndo && (isPurchaseCreate || mode === "add-batch" || putStock)) {
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
      if (
        (packageQuantity.trim() && !packageUnit) ||
        (!packageQuantity.trim() && packageUnit)
      ) {
        throw new Error(
          "Podaj zarówno ilość w opakowaniu, jak i jednostkę — albo wyczyść oba pola.",
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
    if (isPurchaseCreate) {
      return "Dodaj produkt i odłóż";
    }
    return "Dodaj do katalogu";
  })();

  const headerTitle =
    mode === "edit"
      ? "Edycja produktu"
      : mode === "add-batch"
        ? "Dodaj kolejną partię"
        : isPurchaseCreate
          ? "Dodaj zakup"
          : "Dodaj do katalogu";

  const headerSubtitle =
    mode === "edit"
      ? "Zmień dane katalogowe i wartości odżywcze. Nowe partie dodasz osobno."
      : mode === "add-batch"
        ? `${resolvedProduct?.name ?? "Produkt"} — odłóż kupioną ilość do zapasów.`
        : existingProductId
          ? "Przyjmujesz partię dla istniejącego produktu."
          : isPurchaseCreate
            ? "Dodaj produkt do katalogu i od razu odłóż kupioną ilość."
            : "Dodaj produkt do katalogu kuchni — bez odkładania do zapasów.";

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
          setStockByPackages={setStockByPackages}
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
      className="relative mx-auto max-w-[1100px] space-y-6 pb-28"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {headerTitle}
        </h1>
        <p className="text-sm text-gray-500">{headerSubtitle}</p>
      </header>

      {mode === "create" && existingProductId ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950">
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

      {showProductFields ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(220px,320px)_minmax(0,1fr)] lg:items-start">
          <div>
            {mode === "edit" && resolvedProduct ? (
              <ProductPhotoField
                kitchenId={kitchenId}
                productId={resolvedProduct.id}
                image={resolvedProduct.image}
                label="Zdjęcie produktu"
              />
            ) : (
              <MediaImageField
                kitchenId={kitchenId}
                purpose="product"
                currentImage={null}
                label="Zdjęcie produktu"
                size="lg"
                onUploaded={(id) => setMediaAssetId(id)}
                onRemoved={async () => {
                  await discardPendingMedia();
                }}
              />
            )}
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Label htmlFor="product-entry-ean">EAN</Label>
                <Input
                  id="product-entry-ean"
                  inputMode="numeric"
                  value={ean}
                  onChange={(event) => setEan(event.target.value)}
                  placeholder="np. 5901234123457"
                  disabled={lockCatalogFields}
                />
                {fieldErrors.ean ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.ean}</p>
                ) : null}
              </div>
              {mode === "create" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  disabled={ean.trim().length < 8 || matchQuery.isFetching}
                  onClick={() => {
                    setDebouncedEan(ean.trim());
                    void matchQuery.refetch();
                  }}
                >
                  <Search size={16} className="mr-1.5" />
                  Szukaj
                </Button>
              ) : null}
            </div>

            <ProductKindField
              kitchenId={kitchenId}
              value={kind}
              onChange={setKind}
              suggestedGroups={
                mode === "create" ? (match?.suggestedGroups ?? []) : []
              }
              disabled={lockCatalogFields}
            />

            <div>
              <Label htmlFor="product-entry-name">Nazwa</Label>
              <Input
                id="product-entry-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (existingProductId && mode === "create") {
                    clearExistingSelection();
                  }
                }}
                placeholder="np. Mleko UHT 3,2%"
                required
                disabled={lockCatalogFields}
              />
              {fieldErrors.name ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="product-entry-brand">Marka</Label>
                <Input
                  id="product-entry-brand"
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  placeholder="np. Galbani"
                  disabled={lockCatalogFields}
                />
              </div>
              <div>
                <Label htmlFor="product-entry-variant">Wariant</Label>
                <Input
                  id="product-entry-variant"
                  value={variantLabel}
                  onChange={(event) => setVariantLabel(event.target.value)}
                  placeholder="np. kulka / light"
                  disabled={lockCatalogFields}
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {mode === "create" && bannerText && catalogHit && !existingProductId ? (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <p className="font-medium">{bannerText}</p>
          <p className="mt-1 text-amber-900/80">
            Dopasowanie: {catalogHit.name} ({UNIT_LABELS[catalogHit.defaultUnit]}
            )
            {catalogHit.isArchived ? " · w archiwum" : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {isPurchaseCreate ? (
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
            ) : (
              <Link
                href={`/kitchens/${kitchenId}/products/${catalogHit.id}/edit`}
                className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 hover:bg-gray-50"
              >
                Otwórz istniejący produkt
              </Link>
            )}
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

      {showProductFields ? (
        <section className="space-y-2">
          <Label>Opakowanie</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id="product-entry-package-qty"
              inputMode="decimal"
              value={packageQuantity}
              onChange={(event) => {
                setPackageQuantity(event.target.value);
                if (!event.target.value.trim()) {
                  setStockByPackages(false);
                }
              }}
              placeholder="Ilość w opakowaniu"
              disabled={lockCatalogFields}
              className="sm:max-w-[9rem]"
            />
            <select
              aria-label="Jednostka opakowania"
              className="field-input sm:max-w-[8rem]"
              value={packageUnit}
              onChange={(event) =>
                setPackageUnit(event.target.value as PackageUnit | "")
              }
              disabled={lockCatalogFields}
            >
              <option value="">Jednostka</option>
              {PACKAGE_UNIT_OPTIONS.filter((option) =>
                suggestedPackageUnitsFor(defaultUnit).includes(option.value),
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="hidden text-sm text-gray-400 sm:inline">·</span>
            <select
              id="product-entry-unit"
              aria-label="Jednostka bazowa"
              className="field-input sm:max-w-[12rem]"
              value={defaultUnit}
              onChange={(event) =>
                applyDefaultUnit(event.target.value as BaseUnit)
              }
              disabled={lockCatalogFields}
            >
              {(Object.keys(UNIT_OPTION_LABELS) as BaseUnit[]).map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_OPTION_LABELS[unit]}
                </option>
              ))}
            </select>
          </div>
          {stockByPackages || packageConfigured ? (
            <p className="text-xs text-gray-400">
              Ilość w opakowaniu × liczba opakowań przelicza się na jednostkę
              bazową przy odkładaniu.
            </p>
          ) : null}
        </section>
      ) : null}

      {(isPurchaseCreate || (mode === "create" && existingProductId)) ? (
        <PurchaseCard
          packageConfigured={packageConfigured}
          stockByPackages={stockByPackages}
          setStockByPackages={setStockByPackages}
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
      ) : null}

      {showProductFields ? (
        <ProductNutritionEditor
          kitchenId={kitchenId}
          productUnit={defaultUnit}
          ean={ean}
          value={nutrition}
          onChange={setNutrition}
          defaultOpen={mode === "edit" && hadNutritionInitially}
        />
      ) : null}

      {showProductFields ? (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50/80"
            aria-expanded={extrasOpen}
            onClick={() => setExtrasOpen((current) => !current)}
          >
            <span className="text-sm font-semibold text-gray-900">
              Dodatkowe informacje
              {category.trim() ? ` · ${category.trim()}` : ""}
            </span>
            <ChevronDown
              size={18}
              className={cn(
                "shrink-0 text-gray-400 transition-transform",
                extrasOpen && "rotate-180",
              )}
            />
          </button>
          {extrasOpen ? (
            <div className="space-y-4 border-t border-gray-100 px-4 py-4">
              <div>
                <Label htmlFor="product-entry-category">Kategoria</Label>
                <select
                  id="product-entry-category"
                  className="field-input"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  disabled={lockCatalogFields}
                >
                  <option value="">Bez kategorii</option>
                  {categoryOptions.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </div>
              {mode === "edit" ? (
                <div>
                  <Label htmlFor="product-entry-purchase-mode">
                    Sposób zakupu
                  </Label>
                  <select
                    id="product-entry-purchase-mode"
                    className="field-input"
                    value={purchaseMode}
                    onChange={(event) =>
                      setPurchaseMode(
                        event.target.value as UpdateProduct["purchaseMode"],
                      )
                    }
                  >
                    <option value="unconfigured">Nieustawiony</option>
                    <option value="packaged">Opakowania</option>
                    <option value="exact">Dokładna ilość</option>
                  </select>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "edit" ? (
        <section className="space-y-3 rounded-2xl border border-gray-200 bg-white px-4 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Zapasy</h2>
          {stockSummaryQuery.isPending ? (
            <p className="text-sm text-gray-500">Ładowanie zapasów…</p>
          ) : productStock ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-sm">
              <p className="font-medium text-gray-900">
                {formatQuantityWithUnit(
                  productStock.totalQuantity,
                  productStock.defaultUnit,
                )}{" "}
                · {productStock.batchCount}{" "}
                {productStock.batchCount === 1 ? "partia" : "partie"}
              </p>
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
            />
          ) : null}
        </section>
      ) : null}

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
        disableSubmit={
          pending || (mode === "edit" && !isDirty)
        }
      />

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
  setStockByPackages,
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
  setStockByPackages: (value: boolean) => void;
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

      {packageConfigured ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="radio"
              name="stock-qty-mode"
              className="text-emerald-600 focus:ring-emerald-500"
              checked={stockByPackages}
              onChange={() => setStockByPackages(true)}
            />
            Liczba opakowań
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="radio"
              name="stock-qty-mode"
              className="text-emerald-600 focus:ring-emerald-500"
              checked={!stockByPackages}
              onChange={() => setStockByPackages(false)}
            />
            Ilość
          </label>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stockByPackages && packageConfigured ? (
          <div>
            <Label htmlFor="entry-package-count">Opakowania</Label>
            <Input
              id="entry-package-count"
              inputMode="decimal"
              value={packageCount}
              onChange={(event) => setPackageCount(event.target.value)}
              placeholder="np. 2"
              required
            />
            {computedPackageStock?.ok ? (
              <p className="mt-1 text-xs text-emerald-700">
                Razem:{" "}
                {formatQuantityWithUnit(
                  computedPackageStock.quantity,
                  stockUnit,
                )}{" "}
                ({packageCount || "?"} × {packageQuantity}{" "}
                {PACKAGE_UNIT_OPTIONS.find(
                  (option) => option.value === packageUnit,
                )?.label ?? packageUnit}
                )
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
            <Label htmlFor="entry-qty">Ilość</Label>
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
          <Label htmlFor="entry-price">Cena łączna (zł)</Label>
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
          {price.trim() && minorFromZloty(price) != null ? (
            <p className="mt-1 text-xs text-gray-400">
              {formatMoneyMinor(minorFromZloty(price))}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="entry-store">Sklep</Label>
          <Input
            id="entry-store"
            value={storeName}
            onChange={(event) => setStoreName(event.target.value)}
            placeholder="np. Lidl"
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
