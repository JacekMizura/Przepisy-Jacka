# Moja Kuchnia

Monorepo aplikacji do zarządzania wspólną kuchnią, przepisami, zapasami i żywieniem.

- Web: Next.js (`apps/web`) — pełne centrum zarządzania, hosting docelowy: Vercel
- API: NestJS + Fastify (`apps/api`) — jedyny backend i dostęp do PostgreSQL, hosting docelowy: Railway
- Mobile: Expo (`apps/mobile`) — codzienny klient, build: EAS

## Wymagania

- Node.js 24 LTS (zobacz `.nvmrc`)
- pnpm 11 (zobacz `packageManager` w `package.json`)
- Docker Desktop (lokalny PostgreSQL)

## Uruchomienie lokalne

W katalogu głównym repozytorium, w tej kolejności:

### 1. Zainstaluj zależności

```bash
pnpm install
```

### 2. Skopiuj zmienne środowiskowe

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Wartości w plikach przykładowych są niesekretne i przeznaczone wyłącznie do developmentu.

### 3. Uruchom PostgreSQL

```bash
docker compose up -d
```

API na tym etapie nie wymaga migracji domenowych. Prisma jest skonfigurowana, ale schemat nie zawiera jeszcze modeli kuchni.

### 4. Wygeneruj klienta API (po zmianach endpointów)

```bash
pnpm api:generate
```

Przy pierwszym uruchomieniu krok jest opcjonalny — wygenerowany kontrakt health jest już w repozytorium.

### 5. Uruchom aplikacje

Web + API:

```bash
pnpm dev
```

Osobno:

```bash
pnpm dev:api
pnpm dev:web
pnpm dev:mobile
```

Adresy lokalne:

- API: http://localhost:3001/api/health
- Swagger (poza produkcją): http://localhost:3001/docs
- Web: http://localhost:3000

Na emulatorze Androida ustaw `EXPO_PUBLIC_API_URL=http://10.0.2.2:3001`. Na fizycznym urządzeniu użyj adresu IP komputera w sieci lokalnej.

## Polecenia

| Polecenie | Opis |
| --- | --- |
| `pnpm dev` | API + web |
| `pnpm dev:web` | tylko web |
| `pnpm dev:api` | tylko API |
| `pnpm dev:mobile` | Expo |
| `pnpm build` | build pakietów i aplikacji |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript `--noEmit` |
| `pnpm test` | testy |
| `pnpm api:generate` | OpenAPI z NestJS + typy klienta |

## Dokumentacja

- [Zakres produktu](docs/product-scope.md)
- [Architektura](docs/architecture.md)
- [Status projektu](docs/project-status.md)

## Zasada architektury

Jedynym właścicielem logiki biznesowej i PostgreSQL jest `apps/api`. Web i mobile mówią wyłącznie do REST API przez `packages/api-client`.
