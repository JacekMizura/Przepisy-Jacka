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
import { formatQuantityWithUnit } from "@/lib/format-quantity";
import { type BaseUnit } from "@/lib/quantity-input";
import { cn } from "@/lib/utils";

type PurchaseOption = components["schemas"]["PurchaseOptionDto"];

type ProductPurchaseOptionsProps = {
  kitchenId: string;
  productId: string;
  productName: string;
  defaultUnit: BaseUnit;
};

export function ProductPurchaseOptions({
  kitchenId,
  productId,
  productName,
  defaultUnit,
}: ProductPurchaseOptionsProps) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [contentQuantity, setContentQuantity] = useState("");
  const [contentUnit, setContentUnit] = useState<BaseUnit>(defaultUnit);
  const [isDefault, setIsDefault] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
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

  const createOption = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/products/{productId}/purchase-options",
        {
          params: { path: { kitchenId, productId } },
          body: {
            name: name.trim(),
            contentQuantity: contentQuantity.trim(),
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
    createOption.mutate();
  }

  function startEdit(option: PurchaseOption) {
    setEditingId(option.id);
    setEditName(option.name);
    setEditQuantity(option.contentQuantity);
  }

  function saveEdit(option: PurchaseOption) {
    updateOption.mutate({
      optionId: option.id,
      body: {
        name: editName.trim() || undefined,
        contentQuantity: editQuantity.trim() || undefined,
      },
    });
  }

  const options = optionsQuery.data ?? [];

  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Jak kupuję ten produkt
          </h3>
          <p className="text-xs text-gray-500">
            Opakowania dla „{productName}” — używane przy brakach w przepisach.
          </p>
        </div>
        {!adding ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setAdding(true);
              setContentUnit(defaultUnit);
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

      {options.length === 0 && !adding && !optionsQuery.isPending ? (
        <p className="text-sm text-gray-500">
          Brak zdefiniowanych opakowań — przy brakach używana będzie dokładna
          ilość w {UNIT_LABELS[defaultUnit]}.
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
                      onChange={(event) => setEditQuantity(event.target.value)}
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

      {adding ? (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-lg border border-emerald-100 bg-white p-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`po-name-${productId}`}>Nazwa opakowania</Label>
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
                  onChange={(event) => setContentQuantity(event.target.value)}
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
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
            />
            Ustaw jako domyślne opakowanie
          </label>
          {formError ? (
            <p className={cn("text-sm text-red-600")} role="alert">
              {formError}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={createOption.isPending}>
              {createOption.isPending ? "Dodawanie…" : "Zapisz opakowanie"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setAdding(false);
                setFormError(null);
              }}
            >
              Anuluj
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
