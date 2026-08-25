# Moja Kuchnia — architektura

## Podział aplikacji

Monorepo zawiera trzy aplikacje i wspólne pakiety narzędziowe.

| Aplikacja | Rola | Hosting docelowy |
| --- | --- | --- |
| `apps/web` | Pełny klient HTTP (Next.js App Router) | Vercel |
| `apps/api` | Jedyny backend, jedyny dostęp do PostgreSQL | Railway |
| `apps/mobile` | Klient codzienny (Expo / React Native) | EAS Build i EAS Submit (Android i iOS) |

Pakiety:

- `packages/api-client` — typowany klient HTTP generowany z OpenAPI,
- `packages/design-tokens` — kolory, odstępy i typografia,
- `packages/eslint-config` i `packages/typescript-config` — wspólna jakość kodu.

Nie ma wspólnej biblioteki komponentów UI dla Next.js i React Native. Interfejsy są różne.

## Odpowiedzialność

### `apps/api`

- jedyny właściciel logiki biznesowej,
- jedyny dostęp do PostgreSQL (Prisma),
- REST API z prefiksem `/api`,
- walidacja danych wejściowych,
- dokument OpenAPI / Swagger (Swagger UI poza produkcją).

### `apps/web`

- UI, routing, stan widoku, wywołania API,
- sesja przeglądarki (docelowo cookies Better Auth).

Web **nie** zawiera równoległej logiki biznesowej i **nie** łączy się z bazą.

### `apps/mobile`

- uproszczone UI codziennych funkcji,
- te same konta i to samo API,
- bezpieczne przechowywanie danych sesji (`expo-secure-store`).

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
3. Web i mobile importują wyłącznie ten klient. Nie tworzymy ręcznych typów odpowiedzi API w aplikacjach klienckich.

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

## Uwierzytelnianie (docelowo, nie w tym etapie)

Better Auth, wspólne konta, PostgreSQL, cookies na webie, bezpieczny magazyn sesji w Expo.

## Źródło prawdy

Aktualne źródła prawdy dla Mojej Kuchni to ten dokument, `docs/product-scope.md` i `docs/project-status.md`.

`docs/faza-0-architektura.md` pochodzi z wcześniejszego, niezwiązanego projektu. Plik zostaje w repozytorium wyłącznie jako materiał historyczny. Nie korzystaj z niego przy decyzjach, nazwach, zakresie ani regułach tej aplikacji.

## Kompilacja API

`apps/api` jest kompilowane i uruchamiane przez Nest CLI (`nest start --watch` w development, `nest build` przy buildzie i generowaniu OpenAPI). Wspólny `tsconfig` Nest (`packages/typescript-config/nestjs.json`) włącza `emitDecoratorMetadata`, więc NestJS wstrzykuje zależności na podstawie typów konstruktorów. OpenAPI powstaje z skompilowanego JavaScriptu, nie z `tsx`.
