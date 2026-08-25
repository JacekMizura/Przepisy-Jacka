"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { useQuery } from "@tanstack/react-query";

export function AppShell({
  children,
  kitchenId,
}: {
  children: ReactNode;
  kitchenId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const session = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);

  const kitchensQuery = useQuery({
    queryKey: ["kitchens"],
    enabled: Boolean(session.data?.user),
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET("/api/kitchens");
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać kuchni."));
      }
      return data ?? [];
    },
  });

  async function handleSignOut(event: FormEvent) {
    event.preventDefault();
    setSigningOut(true);
    await authClient.signOut();
    router.replace("/login");
  }

  useEffect(() => {
    if (!session.isPending && !session.data?.user) {
      router.replace(
        `/login?next=${encodeURIComponent(pathname || "/kitchens")}`,
      );
    }
  }, [pathname, router, session.data?.user, session.isPending]);

  if (session.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Ładowanie sesji…
      </div>
    );
  }

  if (!session.data?.user) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Wymagane logowanie…
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link href="/kitchens" className="text-lg font-semibold">
              Moja Kuchnia
            </Link>
            <form onSubmit={handleSignOut} className="sm:hidden">
              <Button type="submit" variant="ghost" size="sm" disabled={signingOut}>
                Wyloguj
              </Button>
            </form>
          </div>
          <nav className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm">
              <span className="whitespace-nowrap">Kuchnia</span>
              <select
                className="h-10 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm"
                aria-label="Wybór kuchni"
                value={kitchenId ?? ""}
                onChange={(event) => {
                  const nextId = event.target.value;
                  if (nextId) {
                    router.push(`/kitchens/${nextId}`);
                  } else {
                    router.push("/kitchens");
                  }
                }}
              >
                <option value="">Wybierz kuchnię</option>
                {(kitchensQuery.data ?? []).map((kitchen) => (
                  <option key={kitchen.id} value={kitchen.id}>
                    {kitchen.name}
                  </option>
                ))}
              </select>
            </label>
            {kitchenId ? (
              <div className="flex gap-2">
                <Link
                  href={`/kitchens/${kitchenId}`}
                  className="rounded-md px-3 py-2 text-sm hover:bg-secondary"
                >
                  Członkowie
                </Link>
                <Link
                  href={`/kitchens/${kitchenId}/stock`}
                  className="rounded-md px-3 py-2 text-sm hover:bg-secondary"
                >
                  Zapasy
                </Link>
              </div>
            ) : null}
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            <p className="text-sm text-muted-foreground">{session.data.user.email}</p>
            <form onSubmit={handleSignOut}>
              <Button type="submit" variant="outline" size="sm" disabled={signingOut}>
                {signingOut ? "Wylogowywanie…" : "Wyloguj"}
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6">
        {children}
      </main>
    </div>
  );
}
