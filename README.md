# Moja Kuchnia

Monorepo aplikacji do zarządzania wspólną kuchnią, przepisami, zapasami i żywieniem.

- Web: Next.js (`apps/web`) — pełne centrum zarządzania, hosting docelowy: Vercel
- API: NestJS + Fastify (`apps/api`) — jedyny backend i dostęp do PostgreSQL, hosting docelowy: Railway
- Mobile: Expo (`apps/mobile`) — codzienny klient, build: EAS

## Wymagania

- Node.js 24 LTS (zobacz `.nvmrc`)
- pnpm 11 (zobacz `packageManager` w `package.json`)
- Docker Desktop (lokalny PostgreSQL) albo inna instancja Postgresa zgodna z `DATABASE_URL`

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

Wartości w plikach przykładowych są niesekretne i przeznaczone wyłącznie do developmentu. `BETTER_AUTH_SECRET` w przykładzie nie nadaje się na produkcję.

### 3. Uruchom PostgreSQL i migracje

```bash
docker compose up -d
pnpm --filter @moja-kuchnia/api exec prisma migrate deploy
```

Opcjonalny seed demo (nigdy na produkcji, nigdy w starcie Railway):

```bash
# PowerShell
$env:ALLOW_DEMO_SEED="true"
$env:NODE_ENV="development"
pnpm --filter @moja-kuchnia/api exec prisma db seed
```

### 4. Wygeneruj klienta API (po zmianach endpointów)

```bash
pnpm api:generate
```

Better Auth (`/api/auth/*`) pozostaje poza `packages/api-client`. Endpointy domenowe korzystają z wygenerowanego klienta.

### 5. Uruchom aplikacje

Web + API:

```bash
pnpm dev
```

Adresy lokalne:

- Web: http://localhost:3000
- API: http://localhost:3001/api/health
- Swagger (poza produkcją): http://localhost:3001/docs

Przeglądarka woła wyłącznie względne `/api/*`. Next.js przekazuje je do serwerowego `API_ORIGIN`. Nie ustawiaj `NEXT_PUBLIC_API_URL` na adres Railway.

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
| `pnpm test:auth-blackbox` | black-box auth przez prawdziwy `next build` + `next start` |
| `pnpm api:generate` | OpenAPI z NestJS + typy klienta |

## Dokumentacja

- [Zakres produktu](docs/product-scope.md)
- [Architektura](docs/architecture.md)
- [Status projektu](docs/project-status.md)

## Zasada architektury

Jedynym właścicielem logiki biznesowej i PostgreSQL jest `apps/api`. Web i mobile mówią wyłącznie do REST API. Web używa `packages/api-client` dla endpointów domenowych oraz klienta Better Auth dla `/api/auth/*` na tym samym originie.
