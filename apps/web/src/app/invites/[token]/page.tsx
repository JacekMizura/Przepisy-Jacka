"use client";

import { ChefHat } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
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
      <div className="flex min-h-screen flex-1 items-center justify-center bg-[#F9FAFB] p-6 text-sm text-gray-500">
        Ładowanie sesji…
      </div>
    );
  }

  if (!session.data?.user) {
    const next = `/invites/${params.token}`;
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-[#F9FAFB] px-4 py-10">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-50 bg-gray-50/50 p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <ChefHat size={28} strokeWidth={2.5} />
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              Zaproszenie do kuchni
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Zaloguj się na konto z tym samym adresem e-mail, na który wystawiono
              zaproszenie.
            </p>
          </div>
          <div className="space-y-3 p-6">
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Zaloguj się, aby dołączyć
            </Link>
            <Link
              href="/register"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Nie mam konta — rejestracja
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-[#F9FAFB] px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-50 bg-gray-50/50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <ChefHat size={28} strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            Zaproszenie do kuchni
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Zalogowany jako {session.data.user.email}. Przyjmij zaproszenie, aby
            dołączyć do kuchni.
          </p>
        </div>
        <div className="space-y-3 p-6">
          {acceptMutation.error ? (
            <p className="text-sm text-red-600" role="alert">
              {acceptMutation.error.message}
            </p>
          ) : null}
          {result ? (
            <p className="text-sm text-emerald-700" role="status">
              {result}
            </p>
          ) : null}
          <Button
            type="button"
            className="w-full"
            disabled={acceptMutation.isPending}
            onClick={() => acceptMutation.mutate()}
          >
            {acceptMutation.isPending ? "Dołączanie…" : "Przyjmij zaproszenie"}
          </Button>
          <Link
            href="/kitchens"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Wróć do listy kuchni
          </Link>
        </div>
      </div>
    </div>
  );
}
