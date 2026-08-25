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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/kitchens";
  const registerHref =
    nextPath && nextPath !== "/kitchens"
      ? `/register?next=${encodeURIComponent(nextPath)}`
      : "/register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);
    const result = await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(readApiError(result.error, "Nie udało się zalogować."));
      return;
    }
    router.replace(nextPath.startsWith("/") ? nextPath : "/kitchens");
  }

  return (
    <>
      <AuthMobileBrand />

      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900">
          Witaj z powrotem
        </h2>
        <p className="text-base text-gray-500">
          Zaloguj się, aby zarządzać swoją kuchnią i zapasami.
        </p>
      </div>

      <form className="space-y-5" onSubmit={onSubmit}>
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
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="text-sm font-semibold text-gray-700"
            >
              Hasło
            </label>
            <button
              type="button"
              className="text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-700"
              onClick={() =>
                setInfo("Reset hasła będzie dostępny w kolejnym etapie.")
              }
            >
              Zapomniałeś hasła?
            </button>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={authFieldClassName}
          />
        </div>

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="text-sm text-gray-500" role="status">
            {info}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="group mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow-sm shadow-emerald-200 transition-all duration-200 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Logowanie…" : "Zaloguj się"}
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
          Nie masz jeszcze konta?{" "}
          <Link
            href={registerHref}
            className="font-semibold text-emerald-600 transition-colors hover:text-emerald-700"
          >
            Zarejestruj się
          </Link>
        </p>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={<p className="text-sm text-gray-500">Ładowanie…</p>}
      >
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
