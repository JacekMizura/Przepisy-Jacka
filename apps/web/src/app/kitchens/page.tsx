"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      router.push(`/kitchens/${kitchen.id}`);
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
      await queryClient.removeQueries({ queryKey: ["invites", kitchenId] });
      await queryClient.removeQueries({ queryKey: ["stock", kitchenId] });
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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Twoje kuchnie</h1>
          <p className="text-sm text-muted-foreground">
            Kuchnia to wspólne gospodarstwo: katalog produktów i zapasy.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Nowa kuchnia</CardTitle>
            <CardDescription>
              Twórca zostaje właścicielem. Zapraszać może wyłącznie właściciel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="kitchen-name">Nazwa</Label>
                <Input
                  id="kitchen-name"
                  name="name"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Tworzenie…" : "Utwórz"}
              </Button>
            </form>
            {formError || createMutation.error ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {formError ?? readApiError(createMutation.error)}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {kitchensQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Ładowanie kuchni…</p>
        ) : null}
        {kitchensQuery.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {readApiError(kitchensQuery.error)}
          </p>
        ) : null}
        {kitchensQuery.data?.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            Nie należysz jeszcze do żadnej kuchni. Utwórz pierwszą albo przyjmij
            zaproszenie.
          </p>
        ) : null}
        {deleteMutation.error ? (
          <p className="text-sm text-destructive" role="alert">
            {readApiError(deleteMutation.error)}
          </p>
        ) : null}
        <ul className="grid gap-3 sm:grid-cols-2">
          {(kitchensQuery.data ?? []).map((kitchen) => (
            <li key={kitchen.id}>
              <div className="rounded-xl border bg-card p-4">
                <button
                  type="button"
                  className="w-full text-left hover:opacity-90"
                  onClick={() => router.push(`/kitchens/${kitchen.id}`)}
                >
                  <p className="font-medium">{kitchen.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {kitchen.role === "owner" ? "Właściciel" : "Członek"}
                  </p>
                </button>
                {kitchen.role === "owner" ? (
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setKitchenToDelete(kitchen)}
                    >
                      Usuń
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
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
