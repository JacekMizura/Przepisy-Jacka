"use client";

import { BookOpen } from "lucide-react";
import { useParams } from "next/navigation";

import { AppShell } from "@/components/app-shell";

export default function RecipesPlaceholderPage() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="flex h-[60vh] items-center justify-center px-4 text-center">
        <div>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <BookOpen size={32} className="text-emerald-600" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900">
            Moduł Przepisów
          </h2>
          <p className="mx-auto max-w-md text-gray-500">
            Tutaj w przyszłości będziesz mógł zapisywać swoje ulubione przepisy i
            automatycznie odliczać składniki z Zapasów podczas gotowania.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
