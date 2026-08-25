# Moja Kuchnia — architektura

## Podział aplikacji

Monorepo zawiera trzy aplikacje i wspólne pakiety narzędziowe.

| Aplikacja | Rola | Hosting docelowy |
| --- | --- | --- |
| `apps/web` | Pełny klient HTTP (Next.js App Router) | Vercel |
| `apps/api` | Jedyny backend, jedyny dostęp do PostgreSQL | Railway |
| `apps/mobile` | Klient codzienny (Expo / React Native) | EAS Build i EAS Submit (Android i iOS) |

Pakiety:

- `packages/api-client` — typowany klient HTTP generowany z OpenAPI (endpointy domenowe; Better Auth pozostaje poza tym klientem),
- `packages/design-tokens` — kolory, odstępy i typografia,
- `packages/eslint-config` i `packages/typescript-config` — wspólna jakość kodu.

Nie ma wspólnej biblioteki komponentów UI dla Next.js i React Native. Interfejsy są różne.

## Odpowiedzialność

### `apps/api`

- jedyny właściciel logiki biznesowej,
- jedyny dostęp do PostgreSQL (Prisma),
- REST API z prefiksem `/api`,
- Better Auth (`/api/auth/*`) na NestJS + Fastify + Prisma,
- walidacja danych wejściowych,
- dokument OpenAPI / Swagger (Swagger UI poza produkcją).

### `apps/web`

- UI, routing, stan widoku, wywołania API,
- sesja przeglądarki przez first-party cookies Better Auth.

Web **nie** zawiera równoległej logiki biznesowej i **nie** łączy się z bazą.

Przeglądarka woła wyłącznie względne `/api/*`. Next.js przekazuje te żądania mechanicznie do serwerowego `API_ORIGIN` (handler `apps/web/src/app/api/[...path]/route.ts` + `api-proxy.ts`). Destynacja pochodzi wyłącznie z `API_ORIGIN`; brak logiki domenowej w Next.js. Przy niedostępności API proxy zwraca 502. Nie używamy `NEXT_PUBLIC_API_URL` wskazującego na Railway.

Weryfikacja same-origin: `pnpm test:auth-blackbox` uruchamia prawdziwy NestJS oraz `next build` + `next start` i woła wyłącznie HTTP przez origin weba (nie importuje `proxyToApi`).

### `apps/mobile`

- uproszczone UI codziennych funkcji,
- te same konta i to samo API,
- bezpieczne przechowywanie danych sesji (`expo-secure-store`).

W tym etapie mobile nie zostało zmienione funkcjonalnie.

## Przepływ danych

```
[Web Next.js]          [Mobile Expo]
        \                  /
         \                /
          v              v
     [REST API NestJS + Fastify]
                  |
             PostgreSQL
```

1. NestJS wystawia REST i generuje dokument OpenAPI.
2. `pnpm api:generate` buduje typy i klienta w `packages/api-client`.
3. Web i mobile importują ten klient dla endpointów domenowych. Klient Better Auth (`better-auth/react`) obsługuje `/api/auth/*` na tym samym originie weba.

## Współdzielić wolno

- typowany klient API,
- czyste typy i stałe niezależne od platformy,
- walidacje możliwe do użycia po obu stronach (np. Zod),
- tokeny kolorów, odstępów i typografii.

## Czego nie wolno duplikować

- modeli domenowych i dostępu do bazy poza `apps/api`,
- logiki biznesowej w Next.js (w tym Server Actions / Route Handlers z SQL),
- ręcznych typów odpowiedzi API w web i mobile,
- wspólnej biblioteki komponentów UI dla webu i React Native,
- sekretów w repozytorium.

## Uwierzytelnianie

Better Auth, wspólne konta, PostgreSQL.

Cookies sesji:

- host-only (bez `Domain`),
- `HttpOnly`,
- `Path=/`,
- `SameSite=Lax`,
- `Secure` tylko w produkcji.

`BETTER_AUTH_URL` to publiczny origin weba, nie origin Railway. `AUTH_TRUSTED_ORIGINS` zawiera wyłącznie jawne originy (localhost i produkcyjny URL weba). Brak wildcardu dla preview Vercela.

## Model danych (ten etap)

- Better Auth: `User`, `Session`, `Account` (w tym `issuer` wymagane od 1.7), `Verification`,
- `Kitchen`, `KitchenMember`, `KitchenInvite` (w bazie tylko `tokenHash`),
- `Product` (`normalizedName`, unikalność `(kitchenId, normalizedName)`, `defaultUnit`, opcjonalne `ean` / `imageUrl` / `category`),
- `StockItem` (`initialQuantity`, `quantity`, `purchasePriceMinor`, `currency`, miejsce, daty, opcjonalne `ean` / `imageUrl`). Ilości: `DECIMAL(12,3)`.
- `ShoppingList` (jedna na kuchnię), `ShoppingListItem` (status `pending` / `bought` / `skipped`, opcjonalny `productId`, `customName`, planowana ilość/jednostka, `resolvedAt` po rozliczeniu),
- `Purchase` (`storeName`, `purchasedAt`, `currency`, `totalPriceMinor`, unikalny `idempotencyKey`), `PurchaseLineItem` (powiązanie z produktem, opcjonalnie `stockItemId` i `shoppingListItemId`).

Endpointy listy i zakupów pod `kitchens/:kitchenId`: `shopping-list/items`, `purchases/checkout`, `purchases`. Każda operacja wymaga członkostwa w kuchni.

Migracje wykonuje wyłącznie Prisma. Seed demo działa tylko gdy `NODE_ENV !== "production"` oraz `ALLOW_DEMO_SEED=true`. Seed nie jest częścią startu ani pre-deploy Railway.

## PostgreSQL

- Produkcja (Railway): major **18**, sprawdzona `18.6 (Debian 18.6-1.pgdg13+2)`.
- Lokalnie: `postgres:18-alpine` w `docker-compose.yml` (bez pinu patcha).
- CI: usługa `postgres:18-alpine`, baza `moja_kuchnia_test`.

Checklist wdrożenia: `docs/deploy-checklist.md`.

## Źródło prawdy

Aktualne źródła prawdy dla Mojej Kuchni to ten dokument, `docs/product-scope.md` i `docs/project-status.md`.

`docs/faza-0-architektura.md` pochodzi z wcześniejszego, niezwiązanego projektu. Plik zostaje w repozytorium wyłącznie jako materiał historyczny. Nie korzystaj z niego przy decyzjach, nazwach, zakresie ani regułach tej aplikacji.

## Kompilacja API

`apps/api` jest kompilowane i uruchamiane przez Nest CLI (`nest start --watch` w development, `nest build` przy buildzie i generowaniu OpenAPI). Wspólny `tsconfig` Nest (`packages/typescript-config/nestjs.json`) włącza `emitDecoratorMetadata`, więc NestJS wstrzykuje zależności na podstawie typów konstruktorów. OpenAPI powstaje z skompilowanego JavaScriptu, nie z `tsx`.
