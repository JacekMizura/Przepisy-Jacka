import type { BaseUnit, InputUnit } from "@/lib/quantity-input";

export type PackageUnit = InputUnit;

export const PACKAGE_UNIT_OPTIONS: Array<{
  value: PackageUnit;
  label: string;
}> = [
  { value: "piece", label: "szt." },
  { value: "gram", label: "g" },
  { value: "kilogram", label: "kg" },
  { value: "milliliter", label: "ml" },
  { value: "liter", label: "l" },
];

/**
 * Przelicza liczbę opakowań × zawartość na ilość w jednostce bazowej produktu.
 * Bezpieczne konwersje: piece↔piece, g↔kg, ml↔l.
 */
export function packageCountToBaseQuantity(params: {
  packageCount: string;
  packageQuantity: string;
  packageUnit: PackageUnit;
  defaultUnit: BaseUnit;
}):
  | { ok: true; quantity: string }
  | { ok: false; message: string } {
  const countRaw = params.packageCount.trim().replace(",", ".");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(countRaw)) {
    return {
      ok: false,
      message: "Podaj liczbę opakowań (max. 3 miejsca po przecinku).",
    };
  }
  const count = Number(countRaw);
  if (!Number.isFinite(count) || count <= 0) {
    return { ok: false, message: "Liczba opakowań musi być większa od zera." };
  }

  const qtyRaw = params.packageQuantity.trim().replace(",", ".");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(qtyRaw)) {
    return {
      ok: false,
      message: "Podaj ilość w opakowaniu (max. 3 miejsca po przecinku).",
    };
  }
  const packageQuantity = Number(qtyRaw);
  if (!Number.isFinite(packageQuantity) || packageQuantity <= 0) {
    return {
      ok: false,
      message: "Ilość w opakowaniu musi być większa od zera.",
    };
  }

  const content = count * packageQuantity;
  const converted = convertPackageContentToBase(
    content,
    params.packageUnit,
    params.defaultUnit,
  );
  if (!converted.ok) {
    return converted;
  }
  return { ok: true, quantity: converted.quantity.toFixed(3) };
}

export function convertPackageContentToBase(
  content: number,
  packageUnit: PackageUnit,
  defaultUnit: BaseUnit,
): { ok: true; quantity: number } | { ok: false; message: string } {
  if (packageUnit === "piece") {
    if (defaultUnit !== "piece") {
      return incompatible(packageUnit, defaultUnit);
    }
    return { ok: true, quantity: content };
  }

  if (packageUnit === "gram" || packageUnit === "kilogram") {
    if (defaultUnit !== "gram") {
      return incompatible(packageUnit, defaultUnit);
    }
    return {
      ok: true,
      quantity: packageUnit === "kilogram" ? content * 1000 : content,
    };
  }

  if (packageUnit === "milliliter" || packageUnit === "liter") {
    if (defaultUnit !== "milliliter") {
      return incompatible(packageUnit, defaultUnit);
    }
    return {
      ok: true,
      quantity: packageUnit === "liter" ? content * 1000 : content,
    };
  }

  return incompatible(packageUnit, defaultUnit);
}

function incompatible(
  packageUnit: PackageUnit,
  defaultUnit: BaseUnit,
): { ok: false; message: string } {
  return {
    ok: false,
    message: `Nie można przeliczyć opakowania (${packageUnit}) na jednostkę produktu (${defaultUnit}).`,
  };
}

/** Czy jednostka opakowania jest zgodna z jednostką bazową produktu. */
export function isPackageUnitCompatible(
  packageUnit: PackageUnit,
  defaultUnit: BaseUnit,
): boolean {
  return convertPackageContentToBase(1, packageUnit, defaultUnit).ok;
}

export function suggestedPackageUnitsFor(
  defaultUnit: BaseUnit,
): PackageUnit[] {
  if (defaultUnit === "piece") {
    return ["piece"];
  }
  if (defaultUnit === "gram") {
    return ["gram", "kilogram"];
  }
  return ["milliliter", "liter"];
}
