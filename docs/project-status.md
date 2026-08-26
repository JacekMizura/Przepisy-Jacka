# Moja Kuchnia — status projektu

## Aktualnie ukończony etap

Etap: uwierzytelnianie Better Auth, wspólne kuchnie, zaproszenia, katalog produktów z wariantami zakupu (opakowania) i jawnym `purchaseMode` (`unconfigured` / `packaged` / `exact`), zapasy, lista zakupów z rozliczaniem zakupów oraz moduł przepisów (CRUD, dostępność składników, propozycje pełnych opakowań, braki do listy) na webie. Fundament repozytorium z Etapu 1 pozostaje w mocy.

W API są zdjęcia (produkty, okładki i kroki przepisów) w magazynie S3-kompatybilnym, wartości odżywcze produktów oraz szacunek makroskładników i kosztu przepisu. Web ma już interfejs do tych funkcji: wysyłka zdjęć z postępem, podgląd w powiększeniu, edycja wartości odżywczych produktu oraz panel kosztu i makro w przepisie. Mobile nadal ich nie obsługuje.

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
- `apps/api` — NestJS + Fastify, prefix `/api`, Better Auth, Prisma, kuchnie, zaproszenia, produkty, partie zapasów, lista zakupów i zakupy (checkout idempotentny), moduł przepisów (CRUD, dostępność, braki → lista), moduł zdjęć (dwuetapowa wysyłka, WebP + miniatura, usuwanie EXIF, podpisane URL-e), wartości odżywcze produktów, szacunek makro i kosztu przepisu, `GET /api/health`, walidacja env, CORS, Swagger poza produkcją,
- `packages/api-client` — `openapi-fetch` + typy z OpenAPI dla endpointów domenowych (w tym `components`),
- `apps/web` — layout sidebar (Moja Kuchnia / zapasy / lista zakupów / historia zakupów / przepisy / domownicy), logowanie, rejestracja, kuchnie, zaproszenia, zapasy, przepisy (kafelki z okładkami, tworzenie, szczegóły z dostępnością oraz kosztem i makro, edycja); zdjęcia produktów, okładek i kroków przepisu przez magazyn mediów (`media-upload.ts` + `MediaImageField`), wartości odżywcze produktu w szczegółach katalogu; względne `/api/*` przez serwerowy proxy do `API_ORIGIN`,
- `apps/mobile` — ekran kontrolny health z `EXPO_PUBLIC_API_URL` (bez zmian funkcjonalnych w tym etapie),
- lokalny PostgreSQL 18 przez `docker-compose.yml`,
- GitHub Actions: Postgres 18, migracje, OpenAPI, lint, typecheck, unit, e2e API, black-box Next, build, mobile,
- black-box `pnpm test:auth-blackbox`: prawdziwy NestJS + `next build`/`next start`.

## Co jest tylko decyzją docelową

- auth i zapasy na mobile / Expo Secure Store,
- interfejs mobilny dla zdjęć, wartości odżywczych i szacunku kosztu,
- przepisy (import, publiczne linki), dziennik żywienia, statystyki i budżety zakupów,
- import przepisów ze stron,
- preview Vercel z osobnym trusted origin.

## Następny sugerowany etap

Mobile: sesja Better Auth w Expo oraz odczyt kuchni, zapasów, listy zakupów i przepisów (razem ze zdjęciami z podpisanych URL-i).

Uwaga do zdjęć na webie: bez pełnej konfiguracji `MEDIA_S3_*` API zwraca 503, a pole wysyłki pokazuje ten komunikat po polsku. Sterownik `memory` zwraca URL-e `memory://`, których przeglądarka nie renderuje — web traktuje je jak brak zdjęcia.

## Konfiguracja zdjęć przed wdrożeniem

Zmienne `MEDIA_S3_*` są opcjonalne. Bez nich API działa, ale wysyłka zdjęć zwraca 503 z komunikatem „Magazyn zdjęć nie jest skonfigurowany.”. Placeholdery są w `.env.example` i `apps/api/.env.example`; sekrety ustawia się wyłącznie w Railway.

## Checklist przed pierwszym wdrożeniem (nie ustawiane automatycznie)

Szczegóły: [docs/deploy-checklist.md](./deploy-checklist.md).

Krótko:

1. Railway: pre-deploy `pnpm --filter @moja-kuchnia/api exec prisma migrate deploy`, potem start API.
2. Railway: zmienne produkcyjne (originy = `https://przepisy-jacka-web.vercel.app`, nowy `BETTER_AUTH_SECRET`).
3. Vercel: serwerowe `API_ORIGIN=https://przepisy-jacka-production-ae86.up.railway.app`; usuń zbędne `NEXT_PUBLIC_API_URL`.
4. Push feature brancha / PR — pierwszy prawdziwy przebieg GitHub Actions.
5. Dopiero potem merge i deploy.
