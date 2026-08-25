"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";

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
import { authClient } from "@/lib/auth-client";
import { readApiError } from "@/lib/errors";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/kitchens";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await authClient.signIn.email({
      email,
      password,
    });
    setPending(false);
    if (result.error) {
      setError(readApiError(result.error, "Nie udało się zalogować."));
      return;
    }
    router.replace(nextPath.startsWith("/") ? nextPath : "/kitchens");
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Logowanie</CardTitle>
        <CardDescription>
          Zaloguj się, aby zarządzać kuchnią i zapasami.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Hasło</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Logowanie…" : "Zaloguj się"}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          Nie masz konta?{" "}
          <Link className="underline" href="/register">
            Zarejestruj się
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Ładowanie…</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
