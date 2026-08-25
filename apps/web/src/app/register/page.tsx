"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";

import {
  AuthMobileBrand,
  AuthShell,
  authFieldClassName,
} from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";
import { readApiError } from "@/lib/errors";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/kitchens";
  const loginHref =
    nextPath && nextPath !== "/kitchens"
      ? `/login?next=${encodeURIComponent(nextPath)}`
      : "/login";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 1) {
      setError("Podaj imię.");
      return;
    }
    setPending(true);
    const result = await authClient.signUp.email({
      email,
      password,
      name: name.trim(),
    });
    setPending(false);
    if (result.error) {
      setError(readApiError(result.error, "Nie udało się utworzyć konta."));
      return;
    }
    router.replace(nextPath.startsWith("/") ? nextPath : "/kitchens");
  }

  return (
    <>
      <AuthMobileBrand />

      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900">
          Dołącz do nas
        </h2>
        <p className="text-base text-gray-500">
          Utwórz konto i zacznij mądrzej zarządzać domową kuchnią.
        </p>
      </div>

      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-semibold text-gray-700">
            Imię
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="np. Jan"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={authFieldClassName}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-semibold text-gray-700">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="adres@email.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={authFieldClassName}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="text-sm font-semibold text-gray-700"
          >
            Hasło
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={authFieldClassName}
          />
          <p className="mt-1 text-xs text-gray-500">
            Hasło musi składać się z minimum 8 znaków.
          </p>
        </div>

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="group mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow-sm shadow-emerald-200 transition-all duration-200 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Tworzenie…" : "Utwórz konto"}
          {!pending ? (
            <ArrowRight
              size={18}
              className="transition-transform group-hover:translate-x-1"
            />
          ) : null}
        </button>
      </form>

      <div className="pt-2 text-center">
        <p className="text-sm text-gray-600">
          Masz już konto?{" "}
          <Link
            href={loginHref}
            className="font-semibold text-emerald-600 transition-colors hover:text-emerald-700"
          >
            Zaloguj się
          </Link>
        </p>
      </div>
    </>
  );
}

export default function RegisterPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={<p className="text-sm text-gray-500">Ładowanie…</p>}
      >
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
