"use client";

import {
  BookOpen,
  Box,
  Clock,
  Library,
  LogOut,
  MapPin,
  Menu,
  ShoppingCart,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  kitchenId,
}: {
  children: ReactNode;
  kitchenId?: string;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] text-sm text-gray-500">
          Ładowanie…
        </div>
      }
    >
      <AppShellInner kitchenId={kitchenId}>{children}</AppShellInner>
    </Suspense>
  );
}

function AppShellInner({
  children,
  kitchenId,
}: {
  children: ReactNode;
  kitchenId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
      const view = searchParams.get("view");
      if (view === "catalog") {
        return "katalog";
      }
      if (view === "history") {
        return "historia-zapasow";
      }
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
  }, [kitchenId, pathname, searchParams]);

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

  useEffect(() => {
    if (!sidebarOpen) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sidebarOpen]);

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

  const stockBase = activeKitchenId
    ? `/kitchens/${activeKitchenId}/stock`
    : "/kitchens";
  const navItems = [
    {
      id: "zapasy",
      label: "Moje zapasy",
      icon: Box,
      href: stockBase,
      disabled: !activeKitchenId,
    },
    {
      id: "katalog",
      label: "Baza produktów",
      icon: Library,
      href: activeKitchenId
        ? `/kitchens/${activeKitchenId}/stock?view=catalog`
        : "/kitchens",
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
      label: "Historia operacji",
      icon: Clock,
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

  const showMobileDrawer = sidebarOpen;
  const kitchenName =
    kitchensQuery.data?.find((kitchen) => kitchen.id === activeKitchenId)
      ?.name ?? "Wybierz kuchnię";

  function navigateForKitchen(nextId: string) {
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
    } else if (activeView === "katalog") {
      router.push(`/kitchens/${nextId}/stock?view=catalog`);
    } else if (activeView === "historia-zapasow") {
      router.push(`/kitchens/${nextId}/stock?view=history`);
    } else {
      router.push(`/kitchens/${nextId}/stock`);
    }
  }

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-[#F9FAFB] font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      <aside
        className="app-shell-chrome fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-gray-100 bg-white text-gray-900 md:flex"
        aria-label="Nawigacja"
      >
        <SidebarContent
          kitchens={kitchensQuery.data ?? []}
          activeKitchenId={activeKitchenId}
          kitchenName={kitchenName}
          activeView={activeView}
          navItems={navItems}
          signingOut={signingOut}
          onSignOut={handleSignOut}
          onNavigate={closeSidebar}
          onKitchenChange={navigateForKitchen}
          showClose={false}
          onClose={closeSidebar}
        />
      </aside>

      {showMobileDrawer ? (
        <>
          <button
            type="button"
            aria-label="Zamknij menu"
            className="app-shell-chrome fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
            onClick={closeSidebar}
          />
          <aside
            className="app-shell-chrome fixed inset-y-0 left-0 z-50 flex w-[min(18rem,100vw)] max-w-full flex-col border-r border-gray-100 bg-white text-gray-900 shadow-xl md:hidden"
            aria-label="Menu mobilne"
          >
            <SidebarContent
              kitchens={kitchensQuery.data ?? []}
              activeKitchenId={activeKitchenId}
              kitchenName={kitchenName}
              activeView={activeView}
              navItems={navItems}
              signingOut={signingOut}
              onSignOut={handleSignOut}
              onNavigate={closeSidebar}
              onKitchenChange={navigateForKitchen}
              showClose
              onClose={closeSidebar}
            />
          </aside>
        </>
      ) : null}

      <main className="app-shell-main min-w-0 flex-1 overflow-x-hidden md:ml-72">
        <div className="app-shell-main-inner w-full px-4 py-4 md:px-8 md:py-8 lg:px-10 lg:py-10">
          <header className="app-shell-chrome mb-6 flex w-full items-center justify-between md:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-sm font-black text-white">
                M
              </div>
              <span className="truncate text-lg font-black tracking-tight text-gray-900">
                Moja Kuchnia
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="-mr-1 rounded-lg p-2 text-gray-600 hover:bg-gray-100"
              aria-label="Otwórz menu"
            >
              <Menu size={24} />
            </button>
          </header>
          <div className="app-shell-content w-full max-w-[1600px]">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

type KitchenOption = { id: string; name: string };

function SidebarContent({
  kitchens,
  activeKitchenId,
  kitchenName,
  activeView,
  navItems,
  signingOut,
  onSignOut,
  onNavigate,
  onKitchenChange,
  showClose,
  onClose,
}: {
  kitchens: KitchenOption[];
  activeKitchenId: string;
  kitchenName: string;
  activeView: string;
  navItems: ReadonlyArray<{
    id: string;
    label: string;
    icon: typeof Box;
    href: string;
    disabled: boolean;
  }>;
  signingOut: boolean;
  onSignOut: (event: FormEvent) => void;
  onNavigate: () => void;
  onKitchenChange: (kitchenId: string) => void;
  showClose: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mb-12 flex items-center justify-between gap-3">
          <Link
            href="/kitchens"
            onClick={onNavigate}
            className="flex min-w-0 items-center gap-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-xl font-black text-white">
              M
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl leading-none font-black tracking-tight text-gray-900">
                Moja Kuchnia
              </h1>
              <p className="mt-1 text-xs font-semibold text-gray-400">
                SYSTEM ZARZĄDZANIA
              </p>
            </div>
          </Link>
          {showClose ? (
            <button
              type="button"
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              onClick={onClose}
              aria-label="Zamknij menu"
            >
              <X size={20} />
            </button>
          ) : null}
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <Link
                key={item.id}
                href={item.disabled ? "/kitchens" : item.href}
                onClick={(event) => {
                  onNavigate();
                  if (item.disabled) {
                    event.preventDefault();
                    router.push("/kitchens");
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all duration-200",
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  item.disabled && "opacity-60",
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-4 border-t border-gray-100 p-8">
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
          <p className="mb-1 text-xs font-semibold text-gray-400">
            AKTYWNA LOKALIZACJA
          </p>
          <label className="sr-only" htmlFor="kitchen-switcher">
            Aktywna kuchnia
          </label>
          <div className="relative">
            <MapPin
              size={14}
              className="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 text-emerald-600"
              aria-hidden
            />
            <select
              id="kitchen-switcher"
              aria-label="Aktywna kuchnia"
              value={activeKitchenId}
              onChange={(event) => onKitchenChange(event.target.value)}
              className="w-full cursor-pointer appearance-none bg-transparent py-0.5 pl-5 text-sm font-bold text-gray-900 focus:outline-none"
            >
              <option value="">Wybierz kuchnię</option>
              {kitchens.map((kitchen) => (
                <option key={kitchen.id} value={kitchen.id}>
                  {kitchen.name}
                </option>
              ))}
            </select>
          </div>
          {!activeKitchenId ? (
            <p className="mt-1 pl-5 text-sm font-bold text-gray-900">
              {kitchenName}
            </p>
          ) : null}
        </div>

        <form onSubmit={onSignOut}>
          <button
            type="submit"
            disabled={signingOut}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60"
          >
            <LogOut size={18} />
            {signingOut ? "Wylogowywanie…" : "Wyloguj"}
          </button>
        </form>
      </div>
    </>
  );
}
