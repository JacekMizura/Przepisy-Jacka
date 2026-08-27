"use client";

import type { components } from "@moja-kuchnia/api-client";
import { Plus, Star, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { readApiError, UNIT_LABELS } from "@/lib/errors";
import {
  formatQuantityWithUnit,
  formatQuantityNumber,
  toApiQuantityString,
} from "@/lib/format-quantity";
import { type BaseUnit } from "@/lib/quantity-input";
import { cn } from "@/lib/utils";

type PurchaseOption = components["schemas"]["PurchaseOptionDto"];
type PurchaseMode = components["schemas"]["ProductDto"]["purchaseMode"];

type ProductPurchaseOptionsProps = {
  kitchenId: string;
  productId: string;
  defaultUnit: BaseUnit;
  purchaseMode: PurchaseMode;
};

const MODE_CHOICES: Array<{
  value: PurchaseMode;
  title: string;
  description: string;
}> = [
  {
    value: "unconfigured",
    title: "Sposób nieustalony",
    description: "Wybierz sposób przed dodaniem braków do listy zakupów.",
  },
  {
    value: "packaged",
    title: "W opakowaniach",
    description: "Kupujesz pełne opakowania (np. karton 1 l).",
  },
  {
    value: "exact",
    title: "Na dokładną ilość",
    description: "Na liście pojawia się dokładnie brakująca ilość.",
  },
];

export function ProductPurchaseOptions({
  kitchenId,
  productId,
  defaultUnit,
  purchaseMode,
}: ProductPurchaseOptionsProps) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [awaitingFirstOption, setAwaitingFirstOption] = useState(false);
  const [name, setName] = useState("");
  const [contentQuantity, setContentQuantity] = useState("");
  const [contentUnit, setContentUnit] = useState<BaseUnit>(defaultUnit);
  const [isDefault, setIsDefault] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");

  const optionsQuery = useQuery({
    queryKey: ["purchase-options", kitchenId, productId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/products/{productId}/purchase-options",
        { params: { path: { kitchenId, productId } } },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać opcji zakupu."),
        );
      }
      return data ?? [];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["purchase-options", kitchenId, productId],
    });
    queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
  };

  const setPurchaseMode = useMutation({
    mutationFn: async (mode: PurchaseMode) => {
      const client = createWebApiClient();
      if (mode === "packaged" || mode === "exact" || mode === "unconfigured") {
        const { data, error } = await client.PATCH(
          "/api/kitchens/{kitchenId}/products/{productId}",
          {
            params: { path: { kitchenId, productId } },
            body: { purchaseMode: mode },
          },
        );
        if (error) {
          throw new Error(
            readApiError(error, "Nie udało się zmienić sposobu zakupu."),
          );
        }
        return data;
      }
      return null;
    },
    onSuccess: () => {
      setModeError(null);
      setAwaitingFirstOption(false);
      invalidate();
    },
    onError: (error: Error) => setModeError(error.message),
  });

  const configureFirstOption = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/products/{productId}/configure-purchase",
        {
          params: { path: { kitchenId, productId } },
          body: {
            mode: "packaged",
            option: {
              name: name.trim(),
              contentQuantity: toApiQuantityString(contentQuantity),
              contentUnit,
              isDefault: true,
            },
          },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się ustawić opakowania."),
        );
      }
      return data;
    },
    onSuccess: () => {
      setAwaitingFirstOption(false);
      setAdding(false);
      setName("");
      setContentQuantity("");
      setIsDefault(true);
      setFormError(null);
      setModeError(null);
      invalidate();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const createOption = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/products/{productId}/purchase-options",
        {
          params: { path: { kitchenId, productId } },
          body: {
            name: name.trim(),
            contentQuantity: toApiQuantityString(contentQuantity),
            contentUnit,
            isDefault,
          },
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się dodać opcji."));
      }
      return data;
    },
    onSuccess: () => {
      setAdding(false);
      setName("");
      setContentQuantity("");
      setIsDefault(false);
      setFormError(null);
      invalidate();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const updateOption = useMutation({
    mutationFn: async ({
      optionId,
      body,
    }: {
      optionId: string;
      body: components["schemas"]["UpdatePurchaseOptionDto"];
    }) => {
      const client = createWebApiClient();
      const { data, error } = await client.PATCH(
        "/api/kitchens/{kitchenId}/products/{productId}/purchase-options/{optionId}",
        {
          params: { path: { kitchenId, productId, optionId } },
          body,
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się zapisać opcji."));
      }
      return data;
    },
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
  });

  const deleteOption = useMutation({
    mutationFn: async (optionId: string) => {
      const client = createWebApiClient();
      const { error } = await client.DELETE(
        "/api/kitchens/{kitchenId}/products/{productId}/purchase-options/{optionId}",
        { params: { path: { kitchenId, productId, optionId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się usunąć opcji."));
      }
    },
    onSuccess: invalidate,
  });

  function handleModeSelect(mode: PurchaseMode) {
    setModeError(null);
    if (mode === purchaseMode && !(mode === "packaged" && awaitingFirstOption)) {
      return;
    }
    if (mode === "packaged") {
      const options = optionsQuery.data ?? [];
      if (options.length === 0) {
        setAwaitingFirstOption(true);
        setAdding(false);
        setContentUnit(defaultUnit);
        setIsDefault(true);
        setName("");
        setContentQuantity("");
        setFormError(null);
        return;
      }
      setAwaitingFirstOption(false);
      setPurchaseMode.mutate("packaged");
      return;
    }
    setAwaitingFirstOption(false);
    setPurchaseMode.mutate(mode);
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Podaj nazwę opakowania.");
      return;
    }
    if (!contentQuantity.trim()) {
      setFormError("Podaj zawartość opakowania.");
      return;
    }
    if (awaitingFirstOption || purchaseMode !== "packaged") {
      configureFirstOption.mutate();
      return;
    }
    createOption.mutate();
  }

  function startEdit(option: PurchaseOption) {
    setEditingId(option.id);
    setEditName(option.name);
    setEditQuantity(formatQuantityNumber(option.contentQuantity));
  }

  function saveEdit(option: PurchaseOption) {
    updateOption.mutate({
      optionId: option.id,
      body: {
        name: editName.trim() || undefined,
        contentQuantity: editQuantity.trim()
          ? toApiQuantityString(editQuantity)
          : undefined,
      },
    });
  }

  const options = optionsQuery.data ?? [];
  const showPackagedUi =
    purchaseMode === "packaged" || awaitingFirstOption;
  const showFirstOptionForm =
    awaitingFirstOption || (showPackagedUi && adding);
  const modeBusy =
    setPurchaseMode.isPending || configureFirstOption.isPending;

  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">
          Jak kupuję ten produkt
        </h3>
      </div>

      <fieldset
        className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3"
        disabled={modeBusy}
      >
        <legend className="sr-only">Sposób zakupu</legend>
        {MODE_CHOICES.map((choice) => {
          const selected =
            awaitingFirstOption && choice.value === "packaged"
              ? true
              : !awaitingFirstOption && purchaseMode === choice.value;
          return (
            <label
              key={choice.value}
              className={cn(
                "flex h-full cursor-pointer gap-2 rounded-lg border px-3 py-2.5 transition-colors sm:flex-col sm:gap-1.5",
                selected
                  ? "border-emerald-300 bg-white ring-1 ring-emerald-200"
                  : "border-gray-100 bg-white/70 hover:border-gray-200",
              )}
            >
              <input
                type="radio"
                name={`purchase-mode-${productId}`}
                className="mt-1 shrink-0 sm:mt-0.5"
                checked={selected}
                onChange={() => handleModeSelect(choice.value)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">
                  {choice.title}
                </span>
                <span className="block text-xs text-gray-500">
                  {choice.description}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {modeError ? (
        <p className="mb-3 text-sm text-red-600" role="alert">
          {modeError}
        </p>
      ) : null}

      {showPackagedUi ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-gray-600">Opakowania</p>
            {!showFirstOptionForm && !awaitingFirstOption ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setAdding(true);
                  setContentUnit(defaultUnit);
                  setIsDefault(options.length === 0);
                }}
              >
                <Plus size={14} className="mr-1" />
                Dodaj
              </Button>
            ) : null}
          </div>

          {optionsQuery.isPending ? (
            <p className="text-sm text-gray-500">Ładowanie opcji…</p>
          ) : null}

          {options.length === 0 &&
          !showFirstOptionForm &&
          !optionsQuery.isPending ? (
            <p className="text-sm text-gray-500">
              Dodaj pierwsze opakowanie, żeby zapisywać braki jako pełne
              opakowania.
            </p>
          ) : null}

          {options.length > 0 ? (
            <ul className="mb-3 divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white">
              {options.map((option) => (
                <li
                  key={option.id}
                  className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  {editingId === option.id ? (
                    <div className="flex flex-1 flex-wrap items-end gap-2">
                      <div className="min-w-[8rem] flex-1 space-y-1">
                        <Label className="text-xs">Nazwa</Label>
                        <Input
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                        />
                      </div>
                      <div className="w-28 space-y-1">
                        <Label className="text-xs">Zawartość</Label>
                        <Input
                          value={editQuantity}
                          onChange={(event) =>
                            setEditQuantity(event.target.value)
                          }
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => saveEdit(option)}
                        disabled={updateOption.isPending}
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
                  ) : (
                    <>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">
                          {option.name}
                          {option.isDefault ? (
                            <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                              <Star size={10} />
                              domyślne
                            </span>
                          ) : null}
                          {!option.isActive ? (
                            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                              nieaktywne
                            </span>
                          ) : null}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatQuantityWithUnit(
                            option.contentQuantity,
                            option.contentUnit,
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {!option.isDefault && option.isActive ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateOption.mutate({
                                optionId: option.id,
                                body: { isDefault: true },
                              })
                            }
                            disabled={updateOption.isPending}
                          >
                            Ustaw domyślne
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(option)}
                        >
                          Edytuj
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteOption.mutate(option.id)}
                          disabled={deleteOption.isPending}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {showFirstOptionForm ? (
            <form
              onSubmit={handleCreate}
              className="space-y-3 rounded-lg border border-emerald-100 bg-white p-3"
            >
              {awaitingFirstOption ? (
                <p className="text-sm text-amber-800">
                  Podaj pierwsze opakowanie, żeby ustawić zakup w opakowaniach.
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`po-name-${productId}`}>
                    Nazwa opakowania
                  </Label>
                  <Input
                    id={`po-name-${productId}`}
                    placeholder="np. Karton 1 l"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`po-qty-${productId}`}>Zawartość</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`po-qty-${productId}`}
                      inputMode="decimal"
                      placeholder="1"
                      value={contentQuantity}
                      onChange={(event) =>
                        setContentQuantity(event.target.value)
                      }
                      className="flex-1"
                    />
                    <select
                      className="rounded-lg border border-gray-200 bg-white px-2 text-sm"
                      value={contentUnit}
                      onChange={(event) =>
                        setContentUnit(event.target.value as BaseUnit)
                      }
                    >
                      {(Object.keys(UNIT_LABELS) as BaseUnit[]).map((unit) => (
                        <option key={unit} value={unit}>
                          {UNIT_LABELS[unit]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {!awaitingFirstOption ? (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(event) => setIsDefault(event.target.checked)}
                  />
                  Ustaw jako domyślne opakowanie
                </label>
              ) : null}
              {formError ? (
                <p className={cn("text-sm text-red-600")} role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    createOption.isPending || configureFirstOption.isPending
                  }
                >
                  {createOption.isPending || configureFirstOption.isPending
                    ? "Zapisywanie…"
                    : awaitingFirstOption
                      ? "Zapisz i ustaw opakowania"
                      : "Zapisz opakowanie"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAdding(false);
                    setAwaitingFirstOption(false);
                    setFormError(null);
                  }}
                >
                  Anuluj
                </Button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}

      {purchaseMode === "exact" ? (
        <p className="text-sm text-gray-500">
          Braki trafią na listę jako dokładna ilość w{" "}
          {UNIT_LABELS[defaultUnit]}.
        </p>
      ) : null}

      {purchaseMode === "unconfigured" && !awaitingFirstOption ? (
        <p className="text-sm text-amber-800">
          Bez wybranego sposobu nie dodasz tego produktu do listy z braków
          przepisu.
        </p>
      ) : null}
    </div>
  );
}
