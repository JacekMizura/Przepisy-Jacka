"use client";

import { CheckCircle2, Image as ImageIcon } from "lucide-react";

import { LOCATION_LABELS } from "@/lib/errors";
import {
  PACKAGE_UNIT_OPTIONS,
  type PackageUnit,
} from "@/lib/package-quantity";
import { type BaseUnit, type InputUnit } from "@/lib/quantity-input";

const UNIT_OPTION_LABELS: Record<BaseUnit, string> = {
  gram: "gramy (g)",
  piece: "sztuki (szt)",
  milliliter: "mililitry (ml)",
};

const INPUT_UNIT_LABELS: Record<InputUnit, string> = {
  piece: "sztuki",
  gram: "gramy",
  kilogram: "kilogramy",
  milliliter: "mililitry",
  liter: "litry",
};

export type ProductLivePreviewProps = {
  name: string;
  brand: string;
  variantLabel: string;
  category: string;
  kindLabel: string | null;
  defaultUnit: BaseUnit;
  packageQuantity: string;
  packageUnit: PackageUnit | "";
  photoUrl: string | null;
  putInStock: boolean;
  quantity: string;
  packageCount: string;
  stockByPackages: boolean;
  inputUnit: InputUnit;
  location: keyof typeof LOCATION_LABELS;
  expiresAt: string;
  /** Gdy true — bez zewnętrznej karty/sticky (np. mobile details). */
  embedded?: boolean;
};

function displayQty(params: {
  stockByPackages: boolean;
  packageCount: string;
  quantity: string;
  inputUnit: InputUnit;
}): string {
  if (params.stockByPackages) {
    const count = params.packageCount.trim();
    if (!count) {
      return "—";
    }
    return `${count} opak.`;
  }
  const qty = params.quantity.trim();
  if (!qty) {
    return "—";
  }
  return `${qty} ${INPUT_UNIT_LABELS[params.inputUnit]}`;
}

export function ProductLivePreview({
  name,
  brand,
  variantLabel,
  category,
  kindLabel,
  defaultUnit,
  packageQuantity,
  packageUnit,
  photoUrl,
  putInStock,
  quantity,
  packageCount,
  stockByPackages,
  inputUnit,
  location,
  expiresAt,
  embedded = false,
}: ProductLivePreviewProps) {
  const brandLine = [brand.trim(), variantLabel.trim()]
    .filter(Boolean)
    .join(variantLabel.trim() ? " - " : "");

  const packageUnitLabel =
    PACKAGE_UNIT_OPTIONS.find((option) => option.value === packageUnit)
      ?.label ?? packageUnit;

  const qtyDisplay = displayQty({
    stockByPackages,
    packageCount,
    quantity,
    inputUnit,
  });

  const body = (
    <>
      {!embedded ? (
        <h3 className="mb-4 border-b pb-2 text-lg font-semibold text-gray-900">
          Podgląd produktu
        </h3>
      ) : null}

      <div className="mb-6 flex flex-col items-center">
        <div className="mb-4 flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-gray-300 bg-gray-100">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- lokalny / podpisany podgląd
            <img
              src={photoUrl}
              alt="Podgląd"
              className="h-full w-full object-contain"
            />
          ) : (
            <ImageIcon className="h-8 w-8 text-gray-400" />
          )}
        </div>

        <div className="w-full text-center">
          <h4 className="break-words text-xl font-bold text-gray-900">
            {name.trim() || "Nazwa produktu"}
          </h4>
          <p className="mt-1 h-5 text-sm text-gray-500">
            {brandLine || "\u00A0"}
          </p>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between border-b border-gray-100 py-2">
          <span className="text-gray-500">Kategoria</span>
          <span className="font-medium text-gray-900">
            {category.trim() || "Bez kategorii"}
          </span>
        </div>
        <div className="flex justify-between border-b border-gray-100 py-2">
          <span className="text-gray-500">Rodzaj</span>
          <span className="font-medium text-gray-900">{kindLabel || "—"}</span>
        </div>
        <div className="flex justify-between border-b border-gray-100 py-2">
          <span className="text-gray-500">Jednostka</span>
          <span className="font-medium text-gray-900">
            {UNIT_OPTION_LABELS[defaultUnit]}
          </span>
        </div>
        {packageQuantity.trim() ? (
          <div className="flex justify-between border-b border-gray-100 py-2">
            <span className="text-gray-500">W opakowaniu</span>
            <span className="font-medium text-gray-900">
              {packageQuantity.trim()}
              {packageUnitLabel ? ` ${packageUnitLabel}` : ""}
            </span>
          </div>
        ) : null}
      </div>

      {putInStock ? (
        <div className="mt-6 rounded-lg border border-orange-100 bg-orange-50 p-4">
          <h5 className="mb-2 flex items-center gap-2 text-sm font-semibold text-orange-800">
            <CheckCircle2 className="h-4 w-4" />
            Zostanie dodane do zapasów:
          </h5>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="block text-xs text-orange-600/70">Ilość</span>
              <span className="font-medium text-orange-900">{qtyDisplay}</span>
            </div>
            <div>
              <span className="block text-xs text-orange-600/70">Miejsce</span>
              <span className="font-medium text-orange-900">
                {LOCATION_LABELS[location]}
              </span>
            </div>
            {expiresAt ? (
              <div className="col-span-2 mt-1">
                <span className="block text-xs text-orange-600/70">Ważność</span>
                <span className="font-medium text-orange-900">{expiresAt}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="p-4">{body}</div>;
  }

  return (
    <div className="sticky top-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      {body}
    </div>
  );
}
