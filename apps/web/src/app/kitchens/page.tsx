"use client";

import { Plus, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";

type KitchenSummary = {
  id: string;
  name: string;
  role: "owner" | "member";
};

export default function KitchensPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [kitchenToDelete, setKitchenToDelete] = useState<KitchenSummary | null>(
    null,
  );

  const kitchensQuery = useQuery({
    queryKey: ["kitchens"],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET("/api/kitchens");
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać kuchni."));
      }
      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (kitchenName: string) => {
      const client = createWebApiClient();
      const { data, error } = await client.POST("/api/kitchens", {
        body: { name: kitchenName },
      });
      if (error) {
        throw new Error(readApiError(error, "Nie udało się utworzyć kuchni."));
      }
      if (!data) {
        throw new Error("API nie zwróciło kuchni.");
      }
      return data;
    },
    onSuccess: async (kitchen) => {
      await queryClient.invalidateQueries({ queryKey: ["kitchens"] });
      setName("");
      router.push(`/kitchens/${kitchen.id}/stock`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (kitchenId: string) => {
      const client = createWebApiClient();
      const { error, response } = await client.DELETE(
        "/api/kitchens/{kitchenId}",
        { params: { path: { kitchenId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się usunąć kuchni."));
      }
      if (response.status !== 204 && response.status !== 200) {
        throw new Error("Nie udało się usunąć kuchni.");
      }
    },
    onSuccess: async (_void, kitchenId) => {
      setKitchenToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["kitchens"] });
      await queryClient.removeQueries({ queryKey: ["kitchen", kitchenId] });
    },
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Podaj nazwę kuchni.");
      return;
    }
    setFormError(null);
    createMutation.mutate(trimmed);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Twoje kuchnie</h1>
          <p className="text-gray-500">
            Zarządzaj swoimi kuchniami i twórz nowe (np. dla domku letniskowego).
          </p>
        </div>

        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-50 bg-gray-50/50 p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <Plus size={20} className="text-emerald-600" /> Nowa kuchnia
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Stworzysz nową, pustą przestrzeń dla zapasów. Zostaniesz jej
              właścicielem.
            </p>
          </div>
          <div className="p-6">
            <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:flex-row">
              <div className="flex-1">
                <Label htmlFor="kitchen-name">Nazwa kuchni</Label>
                <Input
                  id="kitchen-name"
                  name="name"
                  required
                  maxLength={80}
                  placeholder="np. Mieszkanie Wrocław"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="submit"
                  className="w-full whitespace-nowrap sm:w-auto"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Tworzenie…" : "Utwórz kuchnię"}
                </Button>
              </div>
            </form>
            {formError || createMutation.error ? (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {formError ?? readApiError(createMutation.error)}
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Lista Twoich kuchni</h2>
          {kitchensQuery.isPending ? (
            <p className="text-sm text-gray-500">Ładowanie kuchni…</p>
          ) : null}
          {kitchensQuery.isError ? (
            <p className="text-sm text-red-600" role="alert">
              {readApiError(kitchensQuery.error)}
            </p>
          ) : null}
          {kitchensQuery.data?.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              Nie należysz jeszcze do żadnej kuchni. Utwórz pierwszą albo przyjmij
              zaproszenie.
            </div>
          ) : null}
          {deleteMutation.error ? (
            <p className="text-sm text-red-600" role="alert">
              {readApiError(deleteMutation.error)}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(kitchensQuery.data ?? []).map((kitchen) => (
              <div
                key={kitchen.id}
                className="group flex cursor-pointer items-start justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-emerald-200"
                onClick={() => router.push(`/kitchens/${kitchen.id}/stock`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/kitchens/${kitchen.id}/stock`);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div>
                  <h3 className="mb-1 text-lg font-bold text-gray-900">
                    {kitchen.name}
                  </h3>
                  <p className="flex items-center gap-1 text-sm text-gray-500">
                    <Users size={14} />{" "}
                    {kitchen.role === "owner" ? "Właściciel" : "Członek"}
                  </p>
                </div>
                {kitchen.role === "owner" ? (
                  <button
                    type="button"
                    className="rounded-lg p-2 text-gray-400 opacity-0 transition-colors group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
                    title="Usuń kuchnię"
                    aria-label={`Usuń kuchnię ${kitchen.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setKitchenToDelete(kitchen);
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      {kitchenToDelete ? (
        <ConfirmDialog
          title={`Usunąć kuchnię „${kitchenToDelete.name}”?`}
          description="Usunięcie jest trwałe. Znikną członkowie, zaproszenia, katalog produktów i wszystkie partie zapasów tej kuchni."
          confirmLabel="Usuń kuchnię"
          pending={deleteMutation.isPending}
          onCancel={() => {
            if (!deleteMutation.isPending) {
              setKitchenToDelete(null);
            }
          }}
          onConfirm={() => deleteMutation.mutate(kitchenToDelete.id)}
        />
      ) : null}
    </AppShell>
  );
}
