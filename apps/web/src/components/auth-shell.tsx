import { ChefHat } from "lucide-react";
import { type ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white font-sans selection:bg-emerald-100 selection:text-emerald-900">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-emerald-900 p-12 lg:flex lg:w-1/2 lg:p-16">
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-emerald-800 opacity-50 mix-blend-multiply blur-3xl filter" />
          <div className="absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-emerald-700 opacity-50 mix-blend-multiply blur-3xl filter" />
          <div className="absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-emerald-950 opacity-50 mix-blend-multiply blur-3xl filter" />
        </div>

        <div className="relative z-10 flex items-center gap-3 text-white">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/20 p-3 shadow-xl backdrop-blur-md">
            <ChefHat size={32} strokeWidth={2.5} />
          </div>
          <span className="text-3xl font-bold tracking-tight">Moja Kuchnia</span>
        </div>

        <div className="relative z-10 max-w-lg">
          <h1 className="mb-6 text-4xl leading-tight font-bold text-white lg:text-5xl">
            Twój domowy pomocnik kuchenny.
          </h1>
          <p className="text-lg leading-relaxed text-emerald-100/90">
            Zarządzaj zapasami, planuj posiłki i współdziel kuchnię z
            domownikami w jednym, nowoczesnym miejscu. Pożegnaj się z
            wyrzucaniem jedzenia.
          </p>
        </div>

        <div className="relative z-10 text-sm font-medium text-emerald-300/60">
          © {new Date().getFullYear()} Moja Kuchnia. Wszystkie prawa zastrzeżone.
        </div>
      </div>

      <div className="relative flex w-full items-center justify-center bg-white p-6 sm:p-12 lg:w-1/2">
        <div className="auth-panel w-full max-w-md space-y-8">{children}</div>
      </div>
    </div>
  );
}

export function AuthMobileBrand() {
  return (
    <div className="mb-8 flex items-center gap-3 text-emerald-700 lg:hidden">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 shadow-sm">
        <ChefHat size={28} strokeWidth={2.5} />
      </div>
      <span className="text-3xl font-bold tracking-tight">Moja Kuchnia</span>
    </div>
  );
}

export const authFieldClassName =
  "block w-full rounded-xl border border-gray-200 bg-white p-3.5 text-sm text-gray-900 shadow-sm outline-none transition-shadow hover:border-gray-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";
