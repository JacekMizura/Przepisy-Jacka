"use client";

import { Plus, Users } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { readApiError } from "@/lib/errors";

function initialsFrom(name: string, email: string): string {
  const source = (name.trim() || email).trim();
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase() || "MK";
}

export default function KitchenDetailsPage() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const [email, setEmail] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const detailsQuery = useQuery({
    queryKey: ["kitchen", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error, response } = await client.GET(
        "/api/kitchens/{kitchenId}",
        { params: { path: { kitchenId } } },
      );
      if (response.status === 404) {
        throw new Error("Nie znaleziono kuchni albo nie masz do niej dostępu.");
      }
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać kuchni."));
      }
      if (!data) {
        throw new Error("Nie znaleziono kuchni albo nie masz do niej dostępu.");
      }
      return data;
    },
  });

  const isOwner = detailsQuery.data?.members.some(
    (member) =>
      member.role === "owner" && member.userId === session.data?.user?.id,
  );

  const invitesQuery = useQuery({
    queryKey: ["invites", kitchenId],
    enabled: Boolean(isOwner),
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/invites",
        { params: { path: { kitchenId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać zaproszeń."));
      }
      return data ?? [];
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (inviteEmail: string) => {
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/invites",
        {
          params: { path: { kitchenId } },
          body: { email: inviteEmail },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się utworzyć zaproszenia."),
        );
      }
      if (!data) {
        throw new Error("API nie zwróciło zaproszenia.");
      }
      return data;
    },
    onSuccess: async (invite) => {
      await queryClient.invalidateQueries({ queryKey: ["invites", kitchenId] });
      await navigator.clipboard.writeText(invite.inviteUrl);
      setCopiedId(invite.id);
      setEmail("");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const client = createWebApiClient();
      const { error } = await client.POST(
        "/api/kitchens/{kitchenId}/invites/{inviteId}/revoke",
        { params: { path: { kitchenId, inviteId } } },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się unieważnić zaproszenia."),
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invites", kitchenId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
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
    onSuccess: async () => {
      setConfirmDelete(false);
      await queryClient.invalidateQueries({ queryKey: ["kitchens"] });
      router.push("/kitchens");
    },
  });

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    inviteMutation.mutate(email.trim());
  }

  const pendingInvites = (invitesQuery.data ?? []).filter(
    (invite) => !invite.acceptedAt && !invite.revokedAt,
  );

  return (
    <AppShell kitchenId={kitchenId}>
      {detailsQuery.isPending ? (
        <p className="text-sm text-gray-500">Ładowanie kuchni…</p>
      ) : null}
      {detailsQuery.isError ? (
        <p className="text-sm text-red-600" role="alert">
          {readApiError(detailsQuery.error)}
        </p>
      ) : null}
      {detailsQuery.data ? (
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="mb-2 text-2xl font-bold text-gray-900">
                Zarządzanie dostępem: {detailsQuery.data.name}
              </h1>
              <p className="text-gray-500">
                Zaproś domowników do wspólnego zarządzania tą kuchnią.
              </p>
            </div>
            {isOwner ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
              >
                Usuń kuchnię
              </Button>
            ) : null}
          </div>

          {deleteMutation.error ? (
            <p className="text-sm text-red-600" role="alert">
              {readApiError(deleteMutation.error)}
            </p>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-50 bg-gray-50/50 p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                <Users size={20} className="text-emerald-600" /> Obecni
                domownicy
              </h2>
            </div>
            <div>
              {detailsQuery.data.members.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between border-b border-gray-100 p-4 transition-colors last:border-0 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">
                      {initialsFrom(member.name, member.email)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {member.name}
                      </p>
                      <p className="text-sm text-gray-500">{member.email}</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {member.role === "owner" ? "Właściciel" : "Członek"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {isOwner ? (
            <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-50 bg-gray-50/50 p-5">
                <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                  <Plus size={20} className="text-emerald-600" /> Zaproś do
                  kuchni
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Wyślij link aktywacyjny znajomemu lub rodzinie.
                </p>
              </div>
              <div className="p-6">
                <form
                  onSubmit={onInvite}
                  className="flex flex-col gap-4 sm:flex-row"
                >
                  <div className="flex-1">
                    <Label htmlFor="invite-email">
                      E-mail zapraszanej osoby
                    </Label>
                    <Input
                      id="invite-email"
                      name="email"
                      type="email"
                      required
                      placeholder="adres@email.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="submit"
                      className="w-full whitespace-nowrap sm:w-auto"
                      disabled={inviteMutation.isPending}
                    >
                      {inviteMutation.isPending ? "Tworzenie…" : "Utwórz link"}
                    </Button>
                  </div>
                </form>
                {inviteMutation.error ? (
                  <p className="mt-3 text-sm text-red-600" role="alert">
                    {readApiError(inviteMutation.error)}
                  </p>
                ) : null}
                {copiedId ? (
                  <p className="mt-3 text-sm text-emerald-700">
                    Link zaproszenia skopiowano do schowka.
                  </p>
                ) : null}

                <div className="mt-8 border-t border-gray-100 pt-6">
                  <h3 className="mb-4 text-sm font-semibold text-gray-900">
                    Oczekujące zaproszenia
                  </h3>
                  {invitesQuery.isPending ? (
                    <p className="text-sm text-gray-500">Ładowanie…</p>
                  ) : null}
                  {pendingInvites.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-4 text-center text-sm text-gray-500">
                      Brak oczekujących zaproszeń.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {pendingInvites.map((invite) => (
                        <li
                          key={invite.id}
                          className="flex flex-col gap-2 rounded-xl border border-gray-100 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {invite.email}
                            </p>
                            <p className="text-sm text-gray-500">
                              Wygasa{" "}
                              {new Date(invite.expiresAt).toLocaleString(
                                "pl-PL",
                              )}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => revokeMutation.mutate(invite.id)}
                            disabled={revokeMutation.isPending}
                          >
                            Unieważnij
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <p className="text-sm text-gray-500">
              Zapraszać może wyłącznie właściciel kuchni.
            </p>
          )}
        </div>
      ) : null}

      {confirmDelete && detailsQuery.data ? (
        <ConfirmDialog
          title={`Usunąć kuchnię „${detailsQuery.data.name}”?`}
          description="Usunięcie jest trwałe. Znikną członkowie, zaproszenia, katalog produktów i wszystkie partie zapasów tej kuchni."
          confirmLabel="Usuń kuchnię"
          pending={deleteMutation.isPending}
          onCancel={() => {
            if (!deleteMutation.isPending) {
              setConfirmDelete(false);
            }
          }}
          onConfirm={() => deleteMutation.mutate()}
        />
      ) : null}
    </AppShell>
  );
}
