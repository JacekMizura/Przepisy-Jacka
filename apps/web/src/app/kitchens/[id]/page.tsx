"use client";

import { useParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
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
import { authClient } from "@/lib/auth-client";

export default function KitchenDetailsPage() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const [email, setEmail] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
        throw new Error(readApiError(error, "Nie udało się utworzyć zaproszenia."));
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
        throw new Error(readApiError(error, "Nie udało się unieważnić zaproszenia."));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invites", kitchenId] });
    },
  });

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    inviteMutation.mutate(email.trim());
  }

  return (
    <AppShell kitchenId={kitchenId}>
      {detailsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Ładowanie kuchni…</p>
      ) : null}
      {detailsQuery.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {readApiError(detailsQuery.error)}
        </p>
      ) : null}
      {detailsQuery.data ? (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">{detailsQuery.data.name}</h1>
            <p className="text-sm text-muted-foreground">
              Członkowie i zaproszenia. Zmiana właściciela nie jest dostępna.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Członkowie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {detailsQuery.data.members.map((member) => (
                <div
                  key={member.userId}
                  className="flex flex-col rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                  <p className="text-sm">
                    {member.role === "owner" ? "Właściciel" : "Członek"}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          {isOwner ? (
            <Card>
              <CardHeader>
                <CardTitle>Zaproszenia</CardTitle>
                <CardDescription>
                  Zaprosić można wyłącznie jako członka. Link z tokenem pokazywany
                  jest tylko raz — skopiuj go od razu.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={onInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="invite-email">E-mail zapraszanej osoby</Label>
                    <Input
                      id="invite-email"
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={inviteMutation.isPending}>
                    {inviteMutation.isPending ? "Tworzenie…" : "Utwórz i kopiuj link"}
                  </Button>
                </form>
                {inviteMutation.error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {readApiError(inviteMutation.error)}
                  </p>
                ) : null}
                {copiedId ? (
                  <p className="text-sm text-muted-foreground">
                    Link zaproszenia skopiowano do schowka.
                  </p>
                ) : null}
                {invitesQuery.isPending ? (
                  <p className="text-sm text-muted-foreground">Ładowanie zaproszeń…</p>
                ) : null}
                {(invitesQuery.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Brak zaproszeń.
                  </p>
                ) : null}
                <ul className="space-y-2">
                  {(invitesQuery.data ?? []).map((invite) => (
                    <li
                      key={invite.id}
                      className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{invite.email}</p>
                        <p className="text-sm text-muted-foreground">
                          {invite.acceptedAt
                            ? "Przyjęte"
                            : invite.revokedAt
                              ? "Unieważnione"
                              : `Wygasa ${new Date(invite.expiresAt).toLocaleString("pl-PL")}`}
                        </p>
                      </div>
                      {!invite.acceptedAt && !invite.revokedAt ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => revokeMutation.mutate(invite.id)}
                          disabled={revokeMutation.isPending}
                        >
                          Unieważnij
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">
              Zapraszać może wyłącznie właściciel kuchni.
            </p>
          )}
        </div>
      ) : null}
    </AppShell>
  );
}
