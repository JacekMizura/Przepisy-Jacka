# Moja Kuchnia — status projektu

## Aktualnie ukończony etap

Etap: uwierzytelnianie Better Auth, wspólne kuchnie, zaproszenia, katalog produktów i zapasy na webie. Fundament repozytorium z Etapu 1 pozostaje w mocy. **Etap 4 (jakość / CI / PostgreSQL 18) jest domknięty lokalnie**; pierwszy przebieg GitHub Actions wymaga pusha feature brancha.

`docs/faza-0-architektura.md` pochodzi z wcześniejszego, niezwiązanego projektu. Plik pozostaje na dysku jako materiał historyczny i nie jest źródłem prawdy.

## PostgreSQL — zgodność major 18

| Środowisko | Obraz / wersja |
| --- | --- |
| Railway (produkcja) | major **18**, sprawdzona: `18.6 (Debian 18.6-1.pgdg13+2)` |
| Lokalny Compose | `postgres:18-alpine` (bez pinu patcha) |
| GitHub Actions CI | `postgres:18-alpine` (baza `moja_kuchnia_test`) |

Nie wymagamy identycznego patcha `18.6` lokalnie ani w CI — tylko major 18.

## Co rzeczywiście działa

- monorepo pnpm + Turborepo,
- `apps/api` — NestJS + Fastify, prefix `/api`, Better Auth, Prisma, kuchnie, zaproszenia, produkty, partie zapasów, `GET /api/health`, walidacja env, CORS, Swagger poza produkcją,
- `packages/api-client` — `openapi-fetch` + typy z OpenAPI dla endpointów domenowych,
- `apps/web` — layout sidebar (Moja Kuchnia / zapasy / przepisy placeholder / domownicy), logowanie, rejestracja, kuchnie (w tym usuwanie przez ownera), zaproszenia, zapasy z EAN/zdjęciem/kategorią; względne `/api/*` przez serwerowy proxy do `API_ORIGIN`,
- `apps/mobile` — ekran kontrolny health z `EXPO_PUBLIC_API_URL` (bez zmian funkcjonalnych w tym etapie),
- lokalny PostgreSQL 18 przez `docker-compose.yml`,
- GitHub Actions: Postgres 18, migracje, OpenAPI, lint, typecheck, unit, e2e API, black-box Next, build, mobile,
- black-box `pnpm test:auth-blackbox`: prawdziwy NestJS + `next build`/`next start`.

## Co jest tylko decyzją docelową

- auth i zapasy na mobile / Expo Secure Store,
- przepisy, zakupy, dziennik żywienia, statystyki,
- import przepisów ze stron,
- preview Vercel z osobnym trusted origin.

## Następny sugerowany etap

Mobile: sesja Better Auth w Expo oraz odczyt kuchni i zapasów. Albo przepisy, gdy webowy fundament kuchni ma zostać rozszerzony.

## Checklist przed pierwszym wdrożeniem (nie ustawiane automatycznie)

Szczegóły: [docs/deploy-checklist.md](./deploy-checklist.md).

Krótko:

1. Railway: pre-deploy `pnpm --filter @moja-kuchnia/api exec prisma migrate deploy`, potem start API.
2. Railway: zmienne produkcyjne (originy = `https://przepisy-jacka-web.vercel.app`, nowy `BETTER_AUTH_SECRET`).
3. Vercel: serwerowe `API_ORIGIN=https://przepisy-jacka-production-ae86.up.railway.app`; usuń zbędne `NEXT_PUBLIC_API_URL`.
4. Push feature brancha / PR — pierwszy prawdziwy przebieg GitHub Actions.
5. Dopiero potem merge i deploy.
