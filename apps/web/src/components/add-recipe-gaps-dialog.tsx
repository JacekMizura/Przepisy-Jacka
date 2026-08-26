"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { readApiError, UNIT_LABELS } from "@/lib/errors";
import {
  formatPackagePurchase,
  formatQuantityNumber,
  formatQuantityWithUnit,
  toApiQuantityString,
} from "@/lib/format-quantity";
import {
  AVAILABILITY_STATUS_LABELS,
  formatRecipeIngredientQuantity,
} from "@/lib/recipe-labels";
import { type BaseUnit } from "@/lib/quantity-input";
import { cn } from "@/lib/utils";

type AvailabilityIngredient =
  components["schemas"]["RecipeIngredientAvailabilityDto"];
type RecipeGapSelection = components["schemas"]["RecipeGapSelectionDto"];

type GapRowState = {
  skip: boolean;
  purchaseOptionId: string | null;
  packageCount: number;
  exactQuantity: string;
  useExact: boolean;
  configPath: null | "packaged" | "exact";
  optionName: string;
  optionQuantity: string;
  optionUnit: BaseUnit;
  configError: string | null;
  configPending: boolean;
  exactAcknowledged: boolean;
};

type AddRecipeGapsDialogProps = {
  kitchenId: string;
  recipeName: string;
  servings: number;
  ingredients: AvailabilityIngredient[];
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (selections: RecipeGapSelection[]) => void;
  onProductConfigured: (productId: string) => void;
};

function isActionable(ingredient: AvailabilityIngredient): boolean {
  return (
    ingredient.status === "partial" ||
    ingredient.status === "missing" ||
    ingredient.status === "unknown"
  );
}

function isUnconfigured(ingredient: AvailabilityIngredient): boolean {
  return (
    ingredient.purchaseMode === "unconfigured" ||
    ingredient.purchaseProposal?.mode === "unconfigured"
  );
}

function defaultUnitFor(ingredient: AvailabilityIngredient): BaseUnit {
  const unit =
    ingredient.gapUnit ??
    ingredient.availableUnit ??
    ingredient.unit;
  if (unit === "gram" || unit === "kilogram") {
    return "gram";
  }
  if (unit === "milliliter" || unit === "liter") {
    return "milliliter";
  }
  return "piece";
}

function defaultRowState(ingredient: AvailabilityIngredient): GapRowState {
  const proposal = ingredient.purchaseProposal;
  const usePackages = proposal?.mode === "packages" && proposal.packageCount;
  const unconfigured = isUnconfigured(ingredient);
  return {
    skip: ingredient.status === "unknown",
    purchaseOptionId: proposal?.purchaseOptionId ?? null,
    packageCount: proposal?.packageCount ?? 1,
    exactQuantity: formatQuantityNumber(
      proposal?.totalPurchaseQuantity ?? ingredient.gapQuantity ?? "",
    ),
    useExact: unconfigured ? false : !usePackages,
    configPath: null,
    optionName: "",
    optionQuantity: "",
    optionUnit: defaultUnitFor(ingredient),
    configError: null,
    configPending: false,
    exactAcknowledged: !unconfigured && !usePackages,
  };
}

function formatPurchasePreview(
  ingredient: AvailabilityIngredient,
  row: GapRowState,
): string {
  if (row.skip) {
    return "—";
  }
  if (isUnconfigured(ingredient) && !row.exactAcknowledged) {
    return "Wybierz sposób zakupu";
  }
  if (row.useExact) {
    const unit =
      ingredient.purchaseProposal?.totalPurchaseUnit ??
      ingredient.gapUnit ??
      ingredient.unit;
    return formatQuantityWithUnit(row.exactQuantity, unit);
  }
  const proposal = ingredient.purchaseProposal;
  const optionName =
    proposal?.alternatives.find(
      (alt) => alt.purchaseOptionId === row.purchaseOptionId,
    )?.purchaseOptionName ??
    proposal?.purchaseOptionName ??
    null;
  return formatPackagePurchase(row.packageCount, optionName, null, null);
}

export function AddRecipeGapsDialog({
  kitchenId,
  recipeName,
  servings,
  ingredients,
  pending,
  onCancel,
  onConfirm,
  onProductConfigured,
}: AddRecipeGapsDialogProps) {
  const actionable = useMemo(
    () => ingredients.filter(isActionable),
    [ingredients],
  );

  const baseRows = useMemo(() => {
    const initial: Record<string, GapRowState> = {};
    for (const ingredient of actionable) {
      initial[ingredient.ingredientId] = defaultRowState(ingredient);
    }
    return initial;
  }, [actionable]);

  const [overrides, setOverrides] = useState<Record<string, GapRowState>>({});

  const rows = useMemo(() => {
    const merged: Record<string, GapRowState> = { ...baseRows };
    for (const ingredient of actionable) {
      const override = overrides[ingredient.ingredientId];
      if (!override) {
        continue;
      }
      if (!isUnconfigured(ingredient)) {
        merged[ingredient.ingredientId] = {
          ...baseRows[ingredient.ingredientId]!,
          skip: override.skip,
        };
      } else {
        merged[ingredient.ingredientId] = override;
      }
    }
    return merged;
  }, [actionable, baseRows, overrides]);

  function updateRow(ingredientId: string, patch: Partial<GapRowState>) {
    setOverrides((current) => {
      const previous =
        current[ingredientId] ??
        rows[ingredientId] ??
        baseRows[ingredientId] ??
        defaultRowState(
          actionable.find((entry) => entry.ingredientId === ingredientId)!,
        );
      return {
        ...current,
        [ingredientId]: {
          ...previous,
          ...patch,
        },
      };
    });
  }

  function selectOption(
    ingredient: AvailabilityIngredient,
    optionId: string,
  ) {
    const alternative = ingredient.purchaseProposal?.alternatives.find(
      (alt) => alt.purchaseOptionId === optionId,
    );
    updateRow(ingredient.ingredientId, {
      purchaseOptionId: optionId,
      packageCount: alternative?.packageCount ?? 1,
      useExact: false,
    });
  }

  async function configureExact(ingredient: AvailabilityIngredient) {
    if (!ingredient.productId) {
      updateRow(ingredient.ingredientId, {
        configError: "Brak powiązanego produktu — pomiń lub powiąż składnik.",
      });
      return;
    }
    updateRow(ingredient.ingredientId, {
      configPending: true,
      configError: null,
      configPath: "exact",
    });
    try {
      const client = createWebApiClient();
      const { error } = await client.POST(
        "/api/kitchens/{kitchenId}/products/{productId}/configure-purchase",
        {
          params: {
            path: { kitchenId, productId: ingredient.productId },
          },
          body: { mode: "exact" },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się ustawić dokładnej ilości."),
        );
      }
      updateRow(ingredient.ingredientId, {
        configPending: false,
        useExact: true,
        exactAcknowledged: true,
        configPath: "exact",
      });
      onProductConfigured(ingredient.productId);
    } catch (error) {
      updateRow(ingredient.ingredientId, {
        configPending: false,
        configError: readApiError(error),
      });
    }
  }

  async function configurePackaged(ingredient: AvailabilityIngredient) {
    const row =
      rows[ingredient.ingredientId] ?? defaultRowState(ingredient);
    if (!ingredient.productId) {
      updateRow(ingredient.ingredientId, {
        configError: "Brak powiązanego produktu — pomiń lub powiąż składnik.",
      });
      return;
    }
    if (!row.optionName.trim()) {
      updateRow(ingredient.ingredientId, {
        configError: "Podaj nazwę opakowania.",
      });
      return;
    }
    if (!row.optionQuantity.trim()) {
      updateRow(ingredient.ingredientId, {
        configError: "Podaj zawartość opakowania.",
      });
      return;
    }
    updateRow(ingredient.ingredientId, {
      configPending: true,
      configError: null,
    });
    try {
      const client = createWebApiClient();
      const { error } = await client.POST(
        "/api/kitchens/{kitchenId}/products/{productId}/configure-purchase",
        {
          params: {
            path: { kitchenId, productId: ingredient.productId },
          },
          body: {
            mode: "packaged",
            option: {
              name: row.optionName.trim(),
              contentQuantity: toApiQuantityString(row.optionQuantity),
              contentUnit: row.optionUnit,
              isDefault: true,
            },
          },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się zapisać opakowania."),
        );
      }
      updateRow(ingredient.ingredientId, {
        configPending: false,
        configPath: null,
        useExact: false,
      });
      onProductConfigured(ingredient.productId);
    } catch (error) {
      updateRow(ingredient.ingredientId, {
        configPending: false,
        configError: readApiError(error),
      });
    }
  }

  const includedCount = actionable.filter(
    (ingredient) => !rows[ingredient.ingredientId]?.skip,
  ).length;

  const hasUnresolvedUnconfigured = actionable.some((ingredient) => {
    const row = rows[ingredient.ingredientId];
    if (!row || row.skip) {
      return false;
    }
    return isUnconfigured(ingredient);
  });

  function handleConfirm() {
    if (hasUnresolvedUnconfigured) {
      return;
    }
    const selections: RecipeGapSelection[] = actionable.map((ingredient) => {
      const row = rows[ingredient.ingredientId] ?? defaultRowState(ingredient);
      const selection: RecipeGapSelection = {
        ingredientId: ingredient.ingredientId,
        skip: row.skip,
      };
      if (!row.skip) {
        if (row.useExact) {
          selection.exactQuantity = row.exactQuantity.trim()
            ? toApiQuantityString(row.exactQuantity)
            : undefined;
        } else if (row.purchaseOptionId) {
          selection.purchaseOptionId = row.purchaseOptionId;
          selection.packageCount = row.packageCount;
        } else if (row.packageCount > 0) {
          selection.packageCount = row.packageCount;
        }
      }
      return selection;
    });
    onConfirm(selections);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={() => {
        if (!pending) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-gaps-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-gray-100 bg-white p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <ShoppingCart size={22} />
          </div>
          <div>
            <h2 id="add-gaps-title" className="text-lg font-semibold text-gray-900">
              Dodaj brakujące do listy zakupów
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Przepis „{recipeName}” · {servings}{" "}
              {servings === 1 ? "porcja" : "porcji"}
            </p>
          </div>
        </div>

        {actionable.length === 0 ? (
          <p className="text-sm text-gray-600">
            Brak składników do dodania — wszystkie powiązane produkty są dostępne.
          </p>
        ) : (
          <ul className="space-y-4">
            {actionable.map((ingredient) => {
              const row =
                rows[ingredient.ingredientId] ?? defaultRowState(ingredient);
              const displayName =
                ingredient.productName ?? ingredient.name;
              const hasPackageOptions =
                (ingredient.purchaseProposal?.alternatives.length ?? 0) > 0;
              const proposal = ingredient.purchaseProposal;
              const needsConfig = !row.skip && isUnconfigured(ingredient);
              const exactUnit =
                proposal?.totalPurchaseUnit ??
                ingredient.gapUnit ??
                ingredient.unit;

              return (
                <li
                  key={ingredient.ingredientId}
                  className={cn(
                    "rounded-xl border p-4",
                    row.skip
                      ? "border-gray-100 bg-gray-50/50 opacity-75"
                      : needsConfig
                        ? "border-amber-200 bg-amber-50/40"
                        : "border-gray-100 bg-white",
                  )}
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-900">{displayName}</p>
                      <span
                        className={cn(
                          "mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          availabilityBadgeClass(ingredient.status),
                        )}
                      >
                        {AVAILABILITY_STATUS_LABELS[ingredient.status]}
                      </span>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={!row.skip}
                        onChange={(event) =>
                          updateRow(ingredient.ingredientId, {
                            skip: !event.target.checked,
                          })
                        }
                      />
                      Dodaj do listy
                    </label>
                  </div>

                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-gray-500">Potrzebujesz</dt>
                      <dd className="font-medium text-gray-900">
                        {formatRecipeIngredientQuantity(
                          ingredient.scaledQuantity,
                          ingredient.unit,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Masz</dt>
                      <dd className="font-medium text-gray-900">
                        {ingredient.availableQuantity
                          ? formatQuantityWithUnit(
                              ingredient.availableQuantity,
                              ingredient.availableUnit,
                            )
                          : "0"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Brakuje</dt>
                      <dd className="font-medium text-amber-800">
                        {ingredient.gapQuantity
                          ? formatQuantityWithUnit(
                              ingredient.gapQuantity,
                              ingredient.gapUnit,
                            )
                          : ingredient.status === "unknown"
                            ? formatRecipeIngredientQuantity(
                                ingredient.scaledQuantity,
                                ingredient.unit,
                              )
                            : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Kup</dt>
                      <dd className="font-medium text-emerald-800">
                        {formatPurchasePreview(ingredient, row)}
                      </dd>
                    </div>
                  </dl>

                  {needsConfig ? (
                    <div className="mt-4 space-y-3 border-t border-amber-100 pt-3">
                      <p className="text-sm font-semibold text-amber-950">
                        Jak kupujesz ten produkt?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            row.configPath === "packaged"
                              ? "default"
                              : "outline"
                          }
                          disabled={row.configPending}
                          onClick={() =>
                            updateRow(ingredient.ingredientId, {
                              configPath: "packaged",
                              configError: null,
                              optionName: row.optionName || "Karton 1 l",
                              optionUnit: defaultUnitFor(ingredient),
                            })
                          }
                        >
                          W opakowaniach
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            row.configPath === "exact" ? "default" : "outline"
                          }
                          disabled={row.configPending}
                          onClick={() => configureExact(ingredient)}
                        >
                          Na dokładną ilość
                        </Button>
                      </div>

                      {row.configPath === "packaged" ? (
                        <div className="space-y-3 rounded-lg border border-amber-100 bg-white p-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Nazwa opakowania</Label>
                              <Input
                                placeholder="np. Karton 1 l"
                                value={row.optionName}
                                onChange={(event) =>
                                  updateRow(ingredient.ingredientId, {
                                    optionName: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Zawartość</Label>
                              <div className="flex gap-2">
                                <Input
                                  inputMode="decimal"
                                  placeholder="1000"
                                  value={row.optionQuantity}
                                  onChange={(event) =>
                                    updateRow(ingredient.ingredientId, {
                                      optionQuantity: event.target.value,
                                    })
                                  }
                                  className="flex-1"
                                />
                                <select
                                  className="rounded-lg border border-gray-200 bg-white px-2 text-sm"
                                  value={row.optionUnit}
                                  onChange={(event) =>
                                    updateRow(ingredient.ingredientId, {
                                      optionUnit: event.target
                                        .value as BaseUnit,
                                    })
                                  }
                                >
                                  {(Object.keys(UNIT_LABELS) as BaseUnit[]).map(
                                    (unit) => (
                                      <option key={unit} value={unit}>
                                        {UNIT_LABELS[unit]}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </div>
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked readOnly />
                            Domyślne opakowanie
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            disabled={row.configPending}
                            onClick={() => configurePackaged(ingredient)}
                          >
                            {row.configPending
                              ? "Zapisywanie…"
                              : "Zapisz opakowanie"}
                          </Button>
                        </div>
                      ) : null}

                      {row.configPath === "exact" && row.exactAcknowledged ? (
                        <p className="rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm text-amber-950">
                          Na listę trafi dokładna ilość{" "}
                          <span className="font-semibold">
                            {formatQuantityWithUnit(
                              row.exactQuantity,
                              exactUnit,
                            )}
                          </span>
                          .
                        </p>
                      ) : null}

                      {row.configError ? (
                        <p className="text-sm text-red-600" role="alert">
                          {row.configError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {!row.skip && !needsConfig ? (
                    <div className="mt-4 space-y-3 border-t border-gray-100 pt-3">
                      {hasPackageOptions ? (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs">Opakowanie</Label>
                            <select
                              className="block w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm"
                              value={row.purchaseOptionId ?? ""}
                              onChange={(event) =>
                                selectOption(ingredient, event.target.value)
                              }
                            >
                              {(proposal?.alternatives ?? []).map((alt) => (
                                <option
                                  key={alt.purchaseOptionId}
                                  value={alt.purchaseOptionId}
                                >
                                  {alt.purchaseOptionName} (
                                  {formatQuantityWithUnit(
                                    alt.packageContentQuantity,
                                    alt.packageContentUnit,
                                  )}
                                  )
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Liczba opakowań</Label>
                            <Input
                              inputMode="numeric"
                              min={1}
                              value={String(row.packageCount)}
                              onChange={(event) => {
                                const parsed = Number.parseInt(
                                  event.target.value,
                                  10,
                                );
                                updateRow(ingredient.ingredientId, {
                                  packageCount: Number.isFinite(parsed)
                                    ? Math.max(1, parsed)
                                    : 1,
                                  useExact: false,
                                });
                              }}
                              className="w-28"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="space-y-1">
                          <Label className="text-xs">Ilość do kupienia</Label>
                          <Input
                            inputMode="decimal"
                            value={row.exactQuantity}
                            onChange={(event) =>
                              updateRow(ingredient.ingredientId, {
                                exactQuantity: event.target.value,
                                useExact: true,
                              })
                            }
                            className="max-w-xs"
                          />
                          {row.useExact ? (
                            <p className="text-xs text-gray-500">
                              Potwierdzasz dodanie{" "}
                              {formatQuantityWithUnit(
                                row.exactQuantity,
                                exactUnit,
                              )}
                              .
                            </p>
                          ) : null}
                        </div>
                      )}

                      {hasPackageOptions ? (
                        <label className="flex items-center gap-2 text-xs text-gray-500">
                          <input
                            type="checkbox"
                            checked={row.useExact}
                            onChange={(event) =>
                              updateRow(ingredient.ingredientId, {
                                useExact: event.target.checked,
                              })
                            }
                          />
                          Podaj dokładną ilość zamiast opakowań
                        </label>
                      ) : null}

                      {row.useExact && hasPackageOptions ? (
                        <div className="space-y-1">
                          <Label className="text-xs">Dokładna ilość</Label>
                          <Input
                            inputMode="decimal"
                            value={row.exactQuantity}
                            onChange={(event) =>
                              updateRow(ingredient.ingredientId, {
                                exactQuantity: event.target.value,
                              })
                            }
                            className="max-w-xs"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {hasUnresolvedUnconfigured ? (
          <p className="mt-4 text-sm text-amber-800" role="status">
            Ustal sposób zakupu albo odznacz pozycje, zanim dodasz braki do
            listy.
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Anuluj
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              pending || includedCount === 0 || hasUnresolvedUnconfigured
            }
          >
            {pending
              ? "Dodawanie…"
              : `Dodaj ${includedCount} ${includedCount === 1 ? "pozycję" : "pozycje"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function availabilityBadgeClass(
  status: AvailabilityIngredient["status"],
) {
  return cn(
    "rounded-full px-2 py-0.5 text-xs font-medium",
    status === "available" && "bg-emerald-50 text-emerald-800",
    status === "partial" && "bg-amber-50 text-amber-800",
    status === "missing" && "bg-red-50 text-red-700",
    status === "unknown" && "bg-gray-100 text-gray-600",
  );
}
