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
- `Product` (`normalizedName`, unikalność `(kitchenId, normalizedName)`, `defaultUnit`, opcjonalne `ean` / `imageUrl` / `imageMediaId` / `category`, `ProductPurchaseOption` — warianty zakupu z jednym domyślnym),
- `ProductNutrition` (1:1 z produktem: ilość i jednostka odniesienia, `kcal`, białko, węglowodany, tłuszcz, opcjonalny błonnik i sól — wszystko `DECIMAL(12,3)`; opcjonalne `source` / `sourceFetchedAt` / `sourceLabel` / `sourceBrand` dla zatwierdzonych danych z Open Food Facts),
- `OpenFoodFactsCache` (cache odpowiedzi lookup po EAN, bez danych użytkownika),
- `MediaAsset` (kuchnia, autor wysyłki, przeznaczenie `product` / `recipe_cover` / `recipe_step`, klucz obiektu i miniatury, status `pending` / `processing` / `ready` / `failed`); `Product.imageMediaId`, `Recipe.coverMediaId` i `RecipeStep.imageMediaId` są unikalne i mają `ON DELETE SET NULL`,
- `StockItem` (`initialQuantity`, `quantity`, `purchasePriceMinor`, `currency`, miejsce, daty, opcjonalne `ean` / `imageUrl`). Ilości: `DECIMAL(12,3)`.
- `ShoppingList` (jedna na kuchnię), `ShoppingListItem` (status `pending` / `bought` / `skipped`, planowana ilość/opakowania, wymagana ilość z przepisu, źródło przepisu, `resolvedAt` po rozliczeniu),
- `Purchase` (`storeName`, `purchasedAt`, `currency`, `totalPriceMinor`, unikalny `idempotencyKey`), `PurchaseLineItem` (powiązanie z produktem, opcjonalnie `stockItemId` i `shoppingListItemId`; do zapasu trafia zawartość opakowań).
- `Recipe`, `RecipeIngredient`, `RecipeIngredientGroup`, `RecipeStep` (opcjonalny tytuł, wskazówka i czas etapu), `RecipeGapAddition` (idempotencja dodawania braków do listy).

Endpointy listy, zakupów i przepisów pod `kitchens/:kitchenId`. Każda operacja wymaga członkostwa w kuchni; prywatne przepisy tylko dla autora. Lookup wartości odżywczych: `GET …/nutrition-lookups/by-ean` (Open Food Facts przez NestJS; timeout, cache, obsługa 429/503; testy CI używają lokalnego mocka HTTP).

Migracje wykonuje wyłącznie Prisma. Seed demo działa tylko gdy `NODE_ENV !== "production"` oraz `ALLOW_DEMO_SEED=true`. Seed nie jest częścią startu ani pre-deploy Railway.

## Zdjęcia (magazyn obiektowy)

Pliki zdjęć leżą w magazynie S3-kompatybilnym (Railway), nigdy w PostgreSQL. Baza trzyma tylko klucze obiektów w `MediaAsset`.

Warstwa `apps/api/src/media/storage` ma interfejs `MediaStorage` i dwie implementacje: `S3MediaStorage` (AWS SDK v3, `forcePathStyle: true`) oraz `InMemoryMediaStorage` do testów. Implementację wybiera token `MEDIA_STORAGE` na podstawie `MEDIA_STORAGE_DRIVER`; wartość `memory` jest odrzucana w produkcji. Testy e2e ustawiają `MEDIA_STORAGE_DRIVER=memory` w `apps/api/test/test-env.ts`, więc nie dotykają prawdziwego S3.

Przetwarzanie obrazu (`sharp`) usuwa EXIF, obraca zgodnie z orientacją, konwertuje do WebP i tworzy miniaturę. Format pliku sprawdzamy po bajtach nagłówka, nie po nagłówku `Content-Type` z żądania.

Konfiguracja jest opcjonalna: `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY`, `MEDIA_MAX_UPLOAD_BYTES` (domyślnie 10 MiB). Produkcyjny magazyn to prywatny Cloudflare R2 (S3 API, `region=auto`); CORS bucketa musi zezwalać na `PUT`/`GET` z originu weba z nagłówkiem `Content-Type`. Bez pełnej konfiguracji API startuje normalnie, a endpointy wysyłki zwracają 503 z komunikatem po polsku.

Podpisane URL-e do odczytu (15 minut) powstają na żądanie w `MediaService` i nie są zapisywane w bazie.

Po stronie weba całą wysyłkę obsługuje `apps/web/src/lib/media-upload.ts`: walidacja pliku (JPEG/PNG/WebP, maks. 10 MB), `POST …/media/uploads`, transfer zawartości i `POST …/media/{id}/complete`. Dla sterownika `s3` plik leci `PUT` na podpisany URL przez `XMLHttpRequest` (postęp wysyłki), dla sterownika `memory` idzie base64 na endpoint API. Widok pola wysyłki to `apps/web/src/components/media-image-field.tsx`; przypisanie zdjęcia do produktu, okładki albo kroku robią osobne endpointy `image` / `cover`.

Okładka przepisu i zdjęcie kroku wymagają istniejącego celu, więc przy tworzeniu przepisu web wysyła okładkę po zapisie, a zdjęcia kroków są dostępne w edycji. Przy `PATCH …/recipes/{id}` zdjęcie kroku jest zachowywane, gdy w payloadzie kroku jest istniejące `id`; kroki bez `id` powstają na nowo bez zdjęcia. Edycja pomija w żądaniu niezmienione kolekcje składników, grup i kroków.

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
