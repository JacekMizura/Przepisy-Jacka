import { HealthStatus } from "@/components/health-status";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-16">
      <main className="flex w-full max-w-lg flex-col items-center gap-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Moja Kuchnia
          </h1>
          <p className="text-muted-foreground">
            Aplikacja webowa działa. To techniczny ekran kontrolny, nie docelowy
            pulpit.
          </p>
        </div>
        <HealthStatus />
      </main>
    </div>
  );
}
