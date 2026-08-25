# Moja Kuchnia — zakres produktu

Dokument jest jednym z trzech aktualnych źródeł prawdy (obok `docs/architecture.md` i `docs/project-status.md`). Opisuje ustalenia produktowe. Nie jest specyfikacją implementacji.

## Cel

Moja Kuchnia to aplikacja dla wielu użytkowników, którzy prowadzą wspólną kuchnię: zapasy, przepisy, gotowe potrawy, zakupy i wydatki. Równolegle każdy użytkownik ma własne dane żywieniowe.

## Klienci

- Aplikacja webowa jest pełnym centrum zarządzania.
- Aplikacja mobilna ma węższy zakres codziennych funkcji.
- Oba klienty korzystają z tych samych kont, danych i REST API.

## Dane współdzielone w kuchni

Użytkownicy mogą tworzyć wspólne kuchnie i zapraszać do nich inne osoby. W ramach kuchni współdzielone są:

- produkty i zapasy,
- przepisy (gdy zostaną udostępnione kuchni),
- gotowe potrawy i pozostałe porcje,
- lista zakupów,
- zakupy, ceny i wydatki.

**Kuchnia** to wspólne gospodarstwo, nie pojedynczy przepis.

W tej wersji:

- twórca kuchni jest właścicielem (`owner`),
- zapraszać może wyłącznie owner,
- zaprosić można wyłącznie jako `member`,
- nie ma zmiany właściciela ani edycji ról,
- kuchnia nie może powstać bez ownera (tworzenie kuchni i członkostwa ownera jest transakcyjne),
- właściciel może usunąć kuchnię (kaskadowo: członkowie, zaproszenia, produkty i partie).

## Dane osobiste użytkownika

- dziennik zjedzonych posiłków,
- kalorie i makroskładniki,
- cele żywieniowe,
- osobiste statystyki.

## Produkty i zapasy

W bazie przechowujemy wyłącznie jednostki bazowe produktu: `piece`, `gram`, `milliliter`. Jednostka partii wynika z produktu.

Web może przyjmować sztuki, gramy/kilogramy oraz mililitry/litry. Przed wysłaniem do API kilogramy są przeliczane na gramy, a litry na mililitry.

Partia zapasu (`StockItem`) ma:

- `initialQuantity` — początkowa ilość,
- `quantity` — pozostała ilość,
- `purchasePriceMinor` — łączna cena zakupu całej początkowej partii w groszach,
- `currency` — domyślnie `PLN`.

Cena nie zmienia znaczenia po częściowym zużyciu. Ilości w JSON są decimal stringami z maksymalnie 3 miejscami, np. `"500.000"`.

Nazwy produktów są unikalne w kuchni po normalizacji (trim, lowercase, zbiciu spacji). Wyświetlana pozostaje oryginalna `name`.

Produkt może mieć opcjonalnie:

- `ean` — kod EAN/GTIN (8, 12, 13 lub 14 cyfr), unikalny w kuchni,
- `imageUrl` — URL http(s) albo skompresowany data URL obrazu,
- `category` — etykieta kategorii do filtrowania i grupowania w stanie magazynowym.

Partia (`StockItem`) może mieć własne opcjonalne `ean` i `imageUrl` (zdjęcie partii ma pierwszeństwo w widoku zapasów). Przy dodawaniu partii brakujące EAN/zdjęcie produktu są uzupełniane z partii.

Usunięcie produktu, który ma partie, wymaga jawnego potwierdzenia. Potwierdzenie usuwa produkt i jego partie kaskadowo.

## Przepisy

Przepisy są domyślnie prywatne. Można je udostępnić:

- kuchni,
- konkretnemu użytkownikowi,
- przez prywatny link.

Docelowo możliwe będzie importowanie przepisów ze stron internetowych.

## Uwierzytelnianie

- Better Auth (e-mail i hasło) w `apps/api`,
- wspólne konta dla webu i mobile,
- dane uwierzytelniania w PostgreSQL,
- sesja webowa przez first-party cookies (`HttpOnly`, `Path=/`, `SameSite=Lax`, `Secure` w produkcji, bez Domain),
- przeglądarka woła wyłącznie względne `/api/*`; Next.js przekazuje je serwerowo do `API_ORIGIN`,
- bezpieczna obsługa sesji w Expo (poza tym etapem).

Zaproszenia: kopiowany link, bez wysyłki e-mail. W bazie tylko hash SHA-256 surowego tokenu. Przyjęcie jest transakcyjne i wymaga zgodności e-maila.

## Poza zakresem tego dokumentu

Szczegóły architektury, hostingu i stosu technologicznego są w `docs/architecture.md`.
