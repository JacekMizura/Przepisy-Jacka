"use client";

import type { components } from "@moja-kuchnia/api-client";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";

type RecipeCategory = components["schemas"]["RecipeCategoryDto"];

type RecipeCategoriesDialogProps = {
  kitchenId: string;
  open: boolean;
  onClose: () => void;
};

function RecipeCategoriesDialogBody({
  kitchenId,
  onClose,
}: {
  kitchenId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["recipe-categories", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/recipe-categories",
        { params: { path: { kitchenId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać kategorii."));
      }
      return data ?? [];
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["recipe-categories", kitchenId],
    });
    await queryClient.invalidateQueries({ queryKey: ["recipes", kitchenId] });
  };

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const client = createWebApiClient();
      const { data, error, response } = await client.POST(
        "/api/kitchens/{kitchenId}/recipe-categories",
        {
          params: { path: { kitchenId } },
          body: { name },
        },
      );
      if (response.status === 409) {
        throw new Error("Kategoria o tej nazwie już istnieje w kuchni.");
      }
      if (error) {
        throw new Error(readApiError(error, "Nie udało się dodać kategorii."));
      }
      return data;
    },
    onSuccess: async () => {
      setNewName("");
      setFormError(null);
      await invalidate();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const client = createWebApiClient();
      const { data, error, response } = await client.PATCH(
        "/api/kitchens/{kitchenId}/recipe-categories/{categoryId}",
        {
          params: { path: { kitchenId, categoryId: id } },
          body: { name },
        },
      );
      if (response.status === 409) {
        throw new Error("Kategoria o tej nazwie już istnieje w kuchni.");
      }
      if (error) {
        throw new Error(readApiError(error, "Nie udało się zmienić kategorii."));
      }
      return data;
    },
    onSuccess: async () => {
      setEditingId(null);
      setEditingName("");
      setFormError(null);
      await invalidate();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (category: RecipeCategory) => {
      const client = createWebApiClient();
      const { error } = await client.DELETE(
        "/api/kitchens/{kitchenId}/recipe-categories/{categoryId}",
        {
          params: { path: { kitchenId, categoryId: category.id } },
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się usunąć kategorii."));
      }
    },
    onSuccess: async () => {
      setFormError(null);
      await invalidate();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-categories-dialog-title"
        className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2
              id="recipe-categories-dialog-title"
              className="text-lg font-bold text-gray-900"
            >
              Zarządzaj kategoriami
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Kategorie są wspólne dla kuchni. Usunięcie nie kasuje przepisów.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Zamknij"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = newName.trim();
              if (!trimmed) {
                return;
              }
              createMutation.mutate(trimmed);
            }}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="new-recipe-category">Nowa kategoria</Label>
              <Input
                id="new-recipe-category"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="np. Grill"
                maxLength={80}
              />
            </div>
            <Button
              type="submit"
              className="mt-6 shrink-0"
              disabled={createMutation.isPending || !newName.trim()}
            >
              <Plus size={16} className="mr-1" />
              Dodaj
            </Button>
          </form>

          {formError ? (
            <p className="text-sm text-red-600" role="alert">
              {formError}
            </p>
          ) : null}

          {categoriesQuery.isPending ? (
            <p className="py-6 text-center text-sm text-gray-500">
              Ładowanie kategorii…
            </p>
          ) : null}

          {categoriesQuery.isError ? (
            <p className="py-6 text-center text-sm text-red-600" role="alert">
              {readApiError(categoriesQuery.error)}
            </p>
          ) : null}

          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
            {(categoriesQuery.data ?? []).map((category) => (
              <li
                key={category.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2.5"
              >
                {editingId === category.id ? (
                  <form
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const trimmed = editingName.trim();
                      if (!trimmed) {
                        return;
                      }
                      updateMutation.mutate({ id: category.id, name: trimmed });
                    }}
                  >
                    <Input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      className="min-w-0 flex-1"
                      maxLength={80}
                      aria-label={`Nowa nazwa kategorii ${category.name}`}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={updateMutation.isPending}
                    >
                      Zapisz
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(null);
                        setEditingName("");
                      }}
                    >
                      Anuluj
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">
                      {category.name}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                      aria-label={`Zmień nazwę ${category.name}`}
                      onClick={() => {
                        setEditingId(category.id);
                        setEditingName(category.name);
                        setFormError(null);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                      aria-label={`Usuń kategorię ${category.name}`}
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        const confirmed = window.confirm(
                          `Usunąć kategorię „${category.name}”?\n\nPrzepisy pozostaną — zniknie tylko przypisanie do tej kategorii.`,
                        );
                        if (!confirmed) {
                          return;
                        }
                        deleteMutation.mutate(category);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function RecipeCategoriesDialog({
  kitchenId,
  open,
  onClose,
}: RecipeCategoriesDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <RecipeCategoriesDialogBody
      key={kitchenId}
      kitchenId={kitchenId}
      onClose={onClose}
    />
  );
}
