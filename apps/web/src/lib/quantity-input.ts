import { UNIT_LABELS } from "@/lib/errors";

export type BaseUnit = keyof typeof UNIT_LABELS;
export type InputUnit = "piece" | "gram" | "kilogram" | "milliliter" | "liter";

export function inputUnitsFor(baseUnit: BaseUnit): Array<{
  value: InputUnit;
  label: string;
}> {
  if (baseUnit === "piece") {
    return [{ value: "piece", label: "sztuki" }];
  }
  if (baseUnit === "gram") {
    return [
      { value: "gram", label: "gramy" },
      { value: "kilogram", label: "kilogramy" },
    ];
  }
  return [
    { value: "milliliter", label: "mililitry" },
    { value: "liter", label: "litry" },
  ];
}

export function convertToBaseQuantity(
  rawValue: string,
  inputUnit: InputUnit,
  baseUnit: BaseUnit,
): { ok: true; quantity: string } | { ok: false; message: string } {
  const normalized = rawValue.trim().replace(",", ".");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(normalized)) {
    return {
      ok: false,
      message: "Podaj nieujemną liczbę z maksymalnie 3 miejscami po przecinku.",
    };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { ok: false, message: "Podaj nieujemną liczbę." };
  }

  const compatible =
    (baseUnit === "piece" && inputUnit === "piece") ||
    (baseUnit === "gram" &&
      (inputUnit === "gram" || inputUnit === "kilogram")) ||
    (baseUnit === "milliliter" &&
      (inputUnit === "milliliter" || inputUnit === "liter"));
  if (!compatible) {
    return {
      ok: false,
      message: "Jednostka nie zgadza się z jednostką bazową produktu.",
    };
  }

  const multiplier = inputUnit === "kilogram" || inputUnit === "liter" ? 1000 : 1;
  const baseValue = value * multiplier;
  if (baseValue <= 0) {
    return { ok: false, message: "Ilość musi być większa od zera." };
  }

  return { ok: true, quantity: baseValue.toFixed(3) };
}

export function zlotyFromMinor(minor: number): string {
  return (minor / 100).toFixed(2).replace(".", ",");
}

export function minorFromZloty(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  return Math.round(Number(normalized) * 100);
}
