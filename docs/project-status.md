# Moja Kuchnia — status projektu

## Aktualnie ukończony etap

Etap: uwierzytelnianie Better Auth, wspólne kuchnie, zaproszenia, katalog produktów z wariantami zakupu (opakowania) i jawnym `purchaseMode` (`unconfigured` / `packaged` / `exact`), zapasy z podziałem na partie zakupowe (widok zbiorczy po produkcie, zużycie FIFO z kosztem z partii), lista zakupów z rozliczaniem zakupów oraz moduł przepisów (CRUD, kategorie kuchni z filtrowaniem, import z linku HTML/JSON-LD/microdata oraz wklejonego tekstu, dostępność składników, propozycje pełnych opakowań, braki do listy) na webie; na mobile — fundament sesji Expo, zapasów i zakupów (przepisy jako placeholder). Fundament repozytorium z Etapu 1 pozostaje w mocy.

W API są zdjęcia (produkty, okładki i kroki przepisów, paragony zakupów) w magazynie S3-kompatybilnym, wartości odżywcze produktów (podgląd z Open Food Facts po EAN oraz wybór z lokalnego katalogu USDA Foundation/SR Legacy bez EAN) oraz szacunek makroskładników i kosztu przepisu. Web ma już interfejs do tych funkcji: wysyłka zdjęć z postępem, podgląd w powiększeniu, edycja wartości odżywczych produktu z „Pobierz wartości po EAN” i „Wybierz wartości z bazy” oraz panel kosztu i makro w przepisie. Widok szczegółów przepisu jest w stylu czytelnego bloga kulinarnego (bez zmian API). Przepisy obsługują opcjonalne grupy składników oraz wskazówki przy krokach, a także wspólne kategorie kuchni (filtry na liście, zarządzanie z listy, wielokrotny wybór w formularzu). Lista zakupów i historia zakupów pokazują miniatury zdjęć produktów; historia pokazuje ilość z jednostką i opcjonalne zdjęcie paragonu. Mobile obsługuje paragony przy checkoutcie oraz upload mediów (produkt/paragon); miniatury produktów na liście zapasów zależą od danych katalogu (summary API bez URL zdjęcia — pełne join w kolejnym etapie).

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
- `apps/api` — NestJS + Fastify, prefix `/api`, Better Auth, Prisma, kuchnie, zaproszenia, produkty (archiwizacja `archivedAt` zamiast kasowania historii; `PATCH` name/ean/category/unit/`purchaseMode`/marka/wariant/opakowanie; `GET products/match` + `suggestedGroups`; rodzaje `ProductGroup` + `GET catalog`; atomowe `POST product-intakes` z idempotencją, `createGroupName` / `packageCount`), partie zapasów z `storeName` i podsumowaniem po produkcie oraz zużyciem (`stock-summary`, `consume/preview`, `consume`, historia `stock-consumptions`, cofnięcie), lista zakupów i zakupy (checkout idempotentny), moduł przepisów (CRUD, kategorie, import z HTTPS/JSON-LD/microdata/HTML witryn oraz wklejonego tekstu z SSRF-safe fetch i podglądem bez zapisu, dostępność, braki → lista), moduł zdjęć (dwuetapowa wysyłka, WebP + miniatura, usuwanie EXIF, podpisane URL-e), wartości odżywcze produktów z lookupiem Open Food Facts po EAN (cache, timeout, limity) oraz lokalnym katalogiem USDA (wyszukiwanie PL, suggest g/kg/szt.), szacunek makro i kosztu przepisu, `GET /api/health`, walidacja env, CORS, Swagger poza produkcją,
- `packages/api-client` — `openapi-fetch` + typy z OpenAPI dla endpointów domenowych (w tym `components`),
- `apps/web` — layout sidebar (Moja Kuchnia / zapasy / lista zakupów / historia zakupów / przepisy / domownicy), logowanie, rejestracja, kuchnie, zaproszenia, zapasy (widok zbiorczy z rozwinięciem partii, dialogiem zużycia z wyborem ręcznym oraz historią/cofnięciem); **dedykowany UX przyjęcia produktu** (`/products/new`, `/edit`, `/add-batch`) z atomowym `product-intakes`, **rodzajem produktu** (ProductGroup: wyszukiwanie / tworzenie / bez przypisania), marką, wariantem, opakowaniem (`packageCount`), dopasowaniem katalogu, wartościami odżywczymi (OFF/USDA) i odkładaniem partii; katalog na stronie zapasów pogrupowany według rodzajów (`GET …/catalog`) z sekcją „Pozostałe produkty” oraz szczegółami rodzaju (`/product-groups/:groupId`); przepisy (lista w układzie editorialnym jak blog kulinarny: tytuł nad kwadratowym zdjęciem, pasek meta na dole, siatka 3 kolumny; tworzenie z domyślną 1 porcją, auto-jednostką i zdjęciem produktu z katalogu oraz zdjęciami kroków już przy create, import „Z linku” / „Wklej tekst” → podgląd w edytorze → zapis prywatny ze źródłem; szczegóły w układzie editorialnym: hero, sticky składniki, narracyjne kroki, kopiowanie składników, print CSS, dostępność oraz koszt i makro, edycja); lista zakupów i historia z miniaturami produktów (pozycje tekstowe: skrót „Utwórz produkt i odłóż”); zdjęcia produktów, okładek i kroków przepisu przez magazyn mediów (`media-upload.ts` + `MediaImageField`), wartości odżywcze produktu w tworzeniu i edycji katalogu (OFF po EAN oraz USDA „Wybierz wartości z bazy”); względne `/api/*` przez serwerowy proxy do `API_ORIGIN`,
- `apps/mobile` — Expo Router: logowanie/rejestracja Better Auth 1.7.2 (SecureStore), wybór kuchni, zakładki Zapasy / Zakupy / Przepisy (placeholder) / Więcej; zapasy z zużyciem i **odpisem** (`kind`/`reason` w `StockConsumption`), historią oraz zdjęciem produktu; oznaczenie zarchiwizowanego produktu przy pozostałej ilości; checkout z kontrolowanym `PRODUCT_ARCHIVED_EXISTS`; lista zakupów, checkout z paragonem; profile EAS `development` (Metro) i `preview` (samodzielny APK → Railway HTTPS, po merge); lokalny smoke: [docs/mobile-native-verification.md](./mobile-native-verification.md); `AUTH_TRUSTED_ORIGINS` z dokładnym `mojakuchnia://` dopiero po wdrożeniu obsługującego API (patrz checklist),
- lokalny PostgreSQL 18 przez `docker-compose.yml`,
- GitHub Actions: Postgres 18, migracje, OpenAPI, lint, typecheck, unit, e2e API, black-box Next, build, mobile,
- black-box `pnpm test:auth-blackbox`: prawdziwy NestJS + `next build`/`next start`.

## Co jest tylko decyzją docelową

- pełny interfejs mobilny przepisów (lista, szczegóły, dostępność, braki → lista),
- wartości odżywcze i szacunek kosztu przepisu na mobile,
- przepisy (publiczne linki, szersze źródła importu poza obsługiwanymi parserami HTML/tekstu), dziennik żywienia, statystyki i budżety zakupów,
- preview Vercel z osobnym trusted origin,
- EAS Build / Submit produkcyjny.

## Następny sugerowany etap

Mobile: moduł przepisów (lista/szczegóły/dostępność/braki) oraz miniatury produktów na liście zapasów (join z katalogiem / rozszerzenie summary).

Uwaga do zdjęć na webie: bez pełnej konfiguracji `MEDIA_S3_*` API zwraca 503, a pole wysyłki pokazuje ten komunikat po polsku. Sterownik `memory` zwraca URL-e `memory://`, których przeglądarka nie renderuje — web traktuje je jak brak zdjęcia.

## Konfiguracja zdjęć przed wdrożeniem

Zmienne `MEDIA_S3_*` są opcjonalne. Bez nich API działa, ale wysyłka zdjęć zwraca 503 z komunikatem „Magazyn zdjęć nie jest skonfigurowany.”. Produkcja: prywatny Cloudflare R2 (`region=auto`) + CORS bucketa dla originu weba; sekrety wyłącznie w Railway.

## Checklist przed pierwszym wdrożeniem (nie ustawiane automatycznie)

Szczegóły: [docs/deploy-checklist.md](./deploy-checklist.md).

Krótko:

1. Railway: pre-deploy `pnpm --filter @moja-kuchnia/api exec prisma migrate deploy` (schema + seed katalogu USDA), potem start API.
2. Railway: zmienne produkcyjne (originy = `https://przepisy-jacka-web.vercel.app`, nowy `BETTER_AUTH_SECRET`).
3. Vercel: serwerowe `API_ORIGIN=https://przepisy-jacka-production-ae86.up.railway.app`; usuń zbędne `NEXT_PUBLIC_API_URL`.
4. Push feature brancha / PR — pierwszy prawdziwy przebieg GitHub Actions.
5. Dopiero potem merge i deploy.
