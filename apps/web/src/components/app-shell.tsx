"use client";

import {
  BookOpen,
  ChefHat,
  ChevronDown,
  Menu,
  Package,
  Receipt,
  ShoppingCart,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { cn } from "@/lib/utils";

function initialsFrom(email: string, name?: string | null): string {
  const source = (name?.trim() || email).trim();
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase() || "MK";
}

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const activeKitchenId = kitchenId ?? "";
  const activeView = useMemo(() => {
    if (pathname === "/kitchens" || pathname.startsWith("/kitchens?")) {
      return "kuchnie";
    }
    if (pathname.includes("/stock")) {
      return "zapasy";
    }
    if (pathname.includes("/shopping-list")) {
      return "lista-zakupow";
    }
    if (pathname.includes("/purchases")) {
      return "historia-zakupow";
    }
    if (pathname.includes("/recipes") || pathname.includes("/przepisy")) {
      return "przepisy";
    }
    if (kitchenId && pathname === `/kitchens/${kitchenId}`) {
      return "czlonkowie";
    }
    return "kuchnie";
  }, [kitchenId, pathname]);

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

  function closeSidebar() {
    setSidebarOpen(false);
  }

  if (session.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] text-sm text-gray-500">
        Ładowanie sesji…
      </div>
    );
  }

  if (!session.data?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] text-sm text-gray-500">
        Wymagane logowanie…
      </div>
    );
  }

  const user = session.data.user;
  const navItems = [
    {
      id: "zapasy",
      label: "Moje zapasy",
      icon: Package,
      href: activeKitchenId ? `/kitchens/${activeKitchenId}/stock` : "/kitchens",
      disabled: !activeKitchenId,
    },
    {
      id: "lista-zakupow",
      label: "Lista zakupów",
      icon: ShoppingCart,
      href: activeKitchenId
        ? `/kitchens/${activeKitchenId}/shopping-list`
        : "/kitchens",
      disabled: !activeKitchenId,
    },
    {
      id: "historia-zakupow",
      label: "Historia zakupów",
      icon: Receipt,
      href: activeKitchenId
        ? `/kitchens/${activeKitchenId}/purchases`
        : "/kitchens",
      disabled: !activeKitchenId,
    },
    {
      id: "przepisy",
      label: "Przepisy",
      icon: BookOpen,
      href: activeKitchenId
        ? `/kitchens/${activeKitchenId}/recipes`
        : "/kitchens",
      disabled: !activeKitchenId,
    },
    {
      id: "czlonkowie",
      label: "Domownicy",
      icon: Users,
      href: activeKitchenId ? `/kitchens/${activeKitchenId}` : "/kitchens",
      disabled: !activeKitchenId,
    },
  ] as const;

  const sidebar = (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col border-r border-gray-100 bg-white shadow-sm transition-transform duration-300",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
    >
      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-gray-100 p-6">
          <div className="mb-6 flex items-center justify-between gap-3 text-emerald-700">
            <Link
              href="/kitchens"
              onClick={closeSidebar}
              className="flex items-center gap-3"
            >
              <div className="rounded-xl bg-emerald-50 p-2">
                <ChefHat size={28} strokeWidth={2.5} />
              </div>
              <span className="text-2xl font-bold tracking-tight">
                Moja Kuchnia
              </span>
            </Link>
            <button
              type="button"
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 md:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Zamknij menu"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-1">
            <div className="mb-1 flex items-center justify-between px-1">
              <label className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
                Aktywna Kuchnia
              </label>
              <Link
                href="/kitchens"
                onClick={closeSidebar}
                className="text-xs font-medium text-emerald-600 transition-colors hover:text-emerald-700"
              >
                Zarządzaj
              </Link>
            </div>
            <div className="relative">
              <select
                aria-label="Aktywna kuchnia"
                value={activeKitchenId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  closeSidebar();
                  if (!nextId) {
                    router.push("/kitchens");
                    return;
                  }
                  if (activeView === "czlonkowie") {
                    router.push(`/kitchens/${nextId}`);
                  } else if (activeView === "przepisy") {
                    router.push(`/kitchens/${nextId}/recipes`);
                  } else if (activeView === "lista-zakupow") {
                    router.push(`/kitchens/${nextId}/shopping-list`);
                  } else if (activeView === "historia-zakupow") {
                    router.push(`/kitchens/${nextId}/purchases`);
                  } else {
                    router.push(`/kitchens/${nextId}/stock`);
                  }
                }}
                className="block w-full cursor-pointer appearance-none rounded-lg border border-gray-200 bg-gray-50 p-3 pr-8 text-sm text-gray-800 shadow-sm transition-colors focus:border-emerald-500 focus:ring-emerald-500"
              >
                <option value="">Wybierz kuchnię</option>
                {(kitchensQuery.data ?? []).map((kitchen) => (
                  <option key={kitchen.id} value={kitchen.id}>
                    {kitchen.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                <ChevronDown size={16} />
              </div>
            </div>
          </div>
        </div>

        <nav className="space-y-1 p-4">
          <div className="mt-4 mb-2 px-3 text-xs font-semibold tracking-wider text-gray-400 uppercase">
            Narzędzia
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <Link
                key={item.id}
                href={item.disabled ? "/kitchens" : item.href}
                onClick={(event) => {
                  closeSidebar();
                  if (item.disabled) {
                    event.preventDefault();
                    router.push("/kitchens");
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
                  active
                    ? "bg-emerald-50 font-medium text-emerald-700 shadow-sm"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  item.disabled && "opacity-60",
                )}
              >
                <Icon
                  size={20}
                  className={active ? "text-emerald-600" : "text-gray-400"}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-gray-100 bg-gray-50 p-4">
        <form
          onSubmit={handleSignOut}
          className="flex items-center gap-3 px-2"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
            {initialsFrom(user.email, user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">
              {user.email}
            </p>
            <button
              type="submit"
              disabled={signingOut}
              className="truncate text-left text-xs text-gray-500 hover:text-emerald-700"
            >
              {signingOut ? "Wylogowywanie…" : "Wyloguj się"}
            </button>
          </div>
        </form>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-[#F9FAFB] font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {sidebar}

      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Zamknij menu"
          className="fixed inset-0 z-40 bg-gray-900/20 backdrop-blur-sm transition-opacity md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <main className="min-w-0 flex-1 md:ml-72">
        <div className="p-4 md:p-8 lg:p-10">
          <header className="mb-8 flex items-center justify-between md:hidden">
            <div className="flex items-center gap-2 text-emerald-700">
              <ChefHat size={24} strokeWidth={2.5} />
              <span className="text-xl font-bold tracking-tight">
                Moja Kuchnia
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="-mr-2 rounded-lg p-2 text-gray-600 hover:bg-gray-100"
              aria-label="Otwórz menu"
            >
              <Menu size={24} />
            </button>
          </header>
          <div className="animate-in">{children}</div>
        </div>
      </main>
    </div>
  );
}
