import { UNIT_LABELS } from "./errors";
import {
  formatDisplayQuantityWithUnit,
  formatQuantityNumber,
} from "./format-quantity";

function zlotyFromMinor(minor: number): string {
  return (minor / 100).toFixed(2).replace(".", ",");
}

type PackageUnit =
  | "piece"
  | "gram"
  | "kilogram"
  | "milliliter"
  | "liter";

const PACKAGE_UNIT_SHORT: Record<PackageUnit, string> = {
  piece: "szt.",
  gram: "g",
  kilogram: "kg",
  milliliter: "ml",
  liter: "l",
};

export function pluralizePackages(count: number): string {
  if (count === 1) return "1 opakowanie";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return `${count} opakowania`;
  }
  return `${count} opakowań`;
}

export function formatPackageSize(
  quantity: string,
  unit: PackageUnit | string | null | undefined,
): string {
  if (!unit || !(unit in PACKAGE_UNIT_SHORT)) {
    return formatQuantityNumber(quantity);
  }
  return `${formatQuantityNumber(quantity)}\u00A0${PACKAGE_UNIT_SHORT[unit as PackageUnit]}`;
}

export type BatchPackageSnapshot = {
  quantity: string;
  initialQuantity: string;
  packageCount?: number | null;
  packageQuantitySnapshot?: string | null;
  packageUnitSnapshot?: string | null;
  purchasePriceMinor?: number | null;
  unitPriceMinor?: number | null;
};

function quantitiesEqual(a: string, b: string): boolean {
  return Number(a) === Number(b);
}

export function isBatchIntact(batch: BatchPackageSnapshot): boolean {
  return quantitiesEqual(batch.quantity, batch.initialQuantity);
}

export function hasPackageSnapshot(batch: BatchPackageSnapshot): boolean {
  return (
    batch.packageCount != null &&
    batch.packageCount >= 1 &&
    Boolean(batch.packageQuantitySnapshot) &&
    Boolean(batch.packageUnitSnapshot)
  );
}

/** Linia ilości partii (bez ceny). */
export function formatBatchQuantityPresentation(
  batch: BatchPackageSnapshot,
  defaultUnit: keyof typeof UNIT_LABELS,
): { primary: string; secondary: string | null } {
  const remaining = formatDisplayQuantityWithUnit(batch.quantity, defaultUnit);
  const initial = formatDisplayQuantityWithUnit(
    batch.initialQuantity,
    defaultUnit,
  );

  if (hasPackageSnapshot(batch) && isBatchIntact(batch)) {
    const size = formatPackageSize(
      batch.packageQuantitySnapshot!,
      batch.packageUnitSnapshot,
    );
    return {
      primary: `${pluralizePackages(batch.packageCount!)} × ${size} = ${remaining}`,
      secondary: null,
    };
  }

  if (hasPackageSnapshot(batch) && !isBatchIntact(batch)) {
    const size = formatPackageSize(
      batch.packageQuantitySnapshot!,
      batch.packageUnitSnapshot,
    );
    return {
      primary: `Pozostało ${remaining} z ${initial}`,
      secondary: `Zakupiono jako ${pluralizePackages(batch.packageCount!)} × ${size}`,
    };
  }

  if (!isBatchIntact(batch)) {
    return {
      primary: `Pozostało ${remaining} z ${initial}`,
      secondary: null,
    };
  }

  return { primary: remaining, secondary: null };
}

/** Cena partii — bez PLN/gram. */
export function formatBatchPricePresentation(
  batch: BatchPackageSnapshot,
): string | null {
  if (batch.purchasePriceMinor == null) {
    return null;
  }
  const total = `${zlotyFromMinor(batch.purchasePriceMinor)}\u00A0zł`;

  if (hasPackageSnapshot(batch) && batch.packageCount != null) {
    const perPackageMinor = Math.trunc(
      batch.purchasePriceMinor / batch.packageCount,
    );
    if (
      perPackageMinor * batch.packageCount === batch.purchasePriceMinor &&
      perPackageMinor >= 0
    ) {
      return `${zlotyFromMinor(perPackageMinor)}\u00A0zł/opak. · razem ${total}`;
    }
  }

  return `razem ${total}`;
}

export function formatProductStockHeadline(args: {
  totalQuantity: string;
  defaultUnit: keyof typeof UNIT_LABELS;
  batchCount: number;
  batches: BatchPackageSnapshot[];
}): string {
  const qty = formatDisplayQuantityWithUnit(args.totalQuantity, args.defaultUnit);
  const batchesLabel =
    args.batchCount === 1 ? "1 partia" : `${args.batchCount} partie`;

  const allIntactPackaged =
    args.batches.length > 0 &&
    args.batches.every(
      (batch) => hasPackageSnapshot(batch) && isBatchIntact(batch),
    );

  if (allIntactPackaged) {
    const totalPackages = args.batches.reduce(
      (sum, batch) => sum + (batch.packageCount ?? 0),
      0,
    );
    return `${pluralizePackages(totalPackages)} · ${qty} · ${batchesLabel}`;
  }

  return `${qty} · ${batchesLabel}`;
}

/** Edycja produktu: „2 opakowania · razem 250 g · 1 partia”. */
export function formatEditStockSummary(args: {
  totalQuantity: string;
  defaultUnit: keyof typeof UNIT_LABELS;
  batchCount: number;
  batches: BatchPackageSnapshot[];
}): string {
  const qty = formatDisplayQuantityWithUnit(args.totalQuantity, args.defaultUnit);
  const batchesLabel =
    args.batchCount === 1 ? "1 partia" : `${args.batchCount} partie`;

  const allIntactPackaged =
    args.batches.length > 0 &&
    args.batches.every(
      (batch) => hasPackageSnapshot(batch) && isBatchIntact(batch),
    );

  if (allIntactPackaged) {
    const totalPackages = args.batches.reduce(
      (sum, batch) => sum + (batch.packageCount ?? 0),
      0,
    );
    return `${pluralizePackages(totalPackages)} · razem ${qty} · ${batchesLabel}`;
  }

  return `razem ${qty} · ${batchesLabel}`;
}
