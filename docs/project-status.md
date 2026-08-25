# Moja Kuchnia — status projektu

## Aktualnie ukończony etap

Etap: uwierzytelnianie Better Auth, wspólne kuchnie, zaproszenia, katalog produktów i zapasy na webie. Fundament repozytorium z Etapu 1 pozostaje w mocy.

`docs/faza-0-architektura.md` pochodzi z wcześniejszego, niezwiązanego projektu. Plik pozostaje na dysku jako materiał historyczny i nie jest źródłem prawdy.

## Co rzeczywiście działa

- monorepo pnpm + Turborepo,
- `apps/api` — NestJS + Fastify, prefix `/api`, Better Auth, Prisma, kuchnie, zaproszenia, produkty, partie zapasów, `GET /api/health`, walidacja env, CORS, Swagger poza produkcją,
- `packages/api-client` — `openapi-fetch` + typy z OpenAPI dla endpointów domenowych,
- `apps/web` — logowanie, rejestracja, kuchnie, zaproszenia, zapasy; względne `/api/*` przez serwerowy proxy do `API_ORIGIN`,
- `apps/mobile` — ekran kontrolny health z `EXPO_PUBLIC_API_URL` (bez zmian funkcjonalnych w tym etapie),
- lokalny PostgreSQL przez `docker-compose.yml` (obraz niezmieniony: `postgres:18-alpine`),
- GitHub Actions: instalacja z lockfile, lint, typecheck, testy, build web i API. Serwisu Postgres w CI nie dodano, bo major produkcyjnego Postgresa na Railway nie został odczytany,
- test helpera auth przez wspólny kod proxy (nie zastępuje black-boxu Next.js),
- black-box `pnpm test:auth-blackbox`: prawdziwy NestJS + `next build`/`next start`, wyłącznie HTTP przez origin weba.

## Co jest tylko decyzją docelową

- auth i zapasy na mobile / Expo Secure Store,
- przepisy, zakupy, dziennik żywienia, statystyki,
- import przepisów ze stron,
- preview Vercel z osobnym trusted origin,
- automatyczne pipeline’y deploy (wymagają najpierw `prisma migrate deploy` na Railway).

## Etap 4 — jakość / CI (niezamknięty)

Lokalne kontrole i migracje na czystej bazie mogą przechodzić, ale **Etapu 4 nie uznajemy za domknięty**, dopóki:

1. użytkownik nie poda wyniku `SHOW server_version;` z Railway,
2. CI nie otrzyma Postgresa z tym samym major,
3. migracje i e2e nie przejdą w CI na tej bazie.

Nie wpisujemy major wersji „na próbę” do Compose ani CI.

## Następny sugerowany etap

Mobile: sesja Better Auth w Expo oraz odczyt kuchni i zapasów. Albo przepisy, gdy webowy fundament kuchni ma zostać rozszerzony.

## Blokady przed pushem

- Odczytać major PostgreSQL na Railway. Nie zgadywać wersji.
- Ustawić na Railway komendę release/pre-deploy: `pnpm --filter @moja-kuchnia/api exec prisma migrate deploy` **przed** startem `node dist/main` (CLI `prisma` jest w `dependencies` pakietu API).
- Ustawić sekrety i originy na Vercel i Railway (bez `NEXT_PUBLIC_API_URL` na Railway).
