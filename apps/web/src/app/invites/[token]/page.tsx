"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const session = authClient.useSession();
  const [result, setResult] = useState<string | null>(null);

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.POST("/api/invites/{token}/accept", {
        params: { path: { token: params.token } },
      });
      if (error) {
        throw new Error(readApiError(error, "Nie udało się przyjąć zaproszenia."));
      }
      if (!data) {
        throw new Error("API nie zwróciło kuchni.");
      }
      return data;
    },
    onSuccess: (kitchen) => {
      setResult(`Dołączono do kuchni „${kitchen.name}”.`);
      router.replace(`/kitchens/${kitchen.id}`);
    },
  });

  if (session.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Ładowanie sesji…
      </div>
    );
  }

  if (!session.data?.user) {
    const next = `/invites/${params.token}`;
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Zaproszenie do kuchni</CardTitle>
            <CardDescription>
              Zaloguj się na konto z tym samym adresem e-mail, na który wystawiono
              zaproszenie.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Zaloguj się, aby dołączyć
            </Link>
            <Link
              href="/register"
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium"
            >
              Nie mam konta — rejestracja
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Przyjęcie zaproszenia</CardTitle>
          <CardDescription>
            Zalogowano jako {session.data.user.email}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {acceptMutation.error ? (
            <p className="text-sm text-destructive" role="alert">
              {readApiError(acceptMutation.error)}
            </p>
          ) : null}
          {result ? (
            <p className="text-sm text-muted-foreground">{result}</p>
          ) : null}
          <Button
            className="w-full"
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
          >
            {acceptMutation.isPending ? "Dołączanie…" : "Dołącz do kuchni"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
