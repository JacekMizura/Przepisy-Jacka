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

Produkt może mieć konfigurowalne **warianty zakupu** (`ProductPurchaseOption`): np. „Karton 1 l” = 1000 ml. Jeden wariant może być domyślny (unikalnie w bazie). Brak wariantu oznacza zakup dokładnej ilości.

Produkt może mieć opcjonalnie:

- `ean` — kod EAN/GTIN (8, 12, 13 lub 14 cyfr), unikalny w kuchni,
- `imageUrl` — URL http(s) albo skompresowany data URL obrazu,
- `category` — etykieta kategorii do filtrowania i grupowania w stanie magazynowym.

Partia (`StockItem`) może mieć własne opcjonalne `ean` i `imageUrl` (zdjęcie partii ma pierwszeństwo w widoku zapasów). Przy dodawaniu partii brakujące EAN/zdjęcie produktu są uzupełniane z partii.

Usunięcie produktu, który ma partie, wymaga jawnego potwierdzenia. Potwierdzenie usuwa produkt i jego partie kaskadowo.

## Lista zakupów i zakupy

Każda kuchnia ma jedną aktywną, wspólną listę zakupów widoczną dla wszystkich członków.

Pozycja listy może być powiązana z produktem z katalogu albo być własną pozycją tekstową (bez produktu). Statusy: `pending` (do kupienia), `bought` (kupione), `skipped` (pominięte). Oznaczenie „kupione” nie dodaje od razu partii do zapasów. Pozycja rozróżnia wymaganie (np. brak 100 ml z przepisu) od formy zakupu (np. 1 × karton 1 l) i planowanej ilości trafiającej do zapasu.

Rozliczenie zakupu (`checkout`) obejmuje pozycje ze statusem `bought`. Użytkownik podaje faktyczną ilość, jednostkę wejściową, miejsce przechowywania, łączną cenę pozycji w groszach oraz opcjonalną datę ważności. Dla całego zakupu: opcjonalna nazwa sklepu, data (domyślnie bieżąca), waluta `PLN`. Przy zakupie opakowań do `StockItem` trafia zawartość pełnych opakowań, nie sama różnica braku.

Pozycja tekstowa bez produktu wymaga przy rozliczeniu wyboru istniejącego produktu albo potwierdzenia utworzenia nowego w katalogu.

Rozliczenie jest idempotentne (`idempotencyKey`) i transakcyjne: tworzy zapis zakupu, partie zapasów (`StockItem`) oraz rozlicza pozycje listy. Pozycje `pending` i `skipped` nie trafiają do zapasów.

Duplikat tego samego produktu na aktywnej liście (status `pending`) zwraca konflikt; klient może scalić ilość (`mergeQuantity`).

Historia zakupów pokazuje datę, sklep, liczbę pozycji i łączną wartość w PLN, ze szczegółami linii.

## Przepisy

Przepis należy do kuchni i ma autora. Widoczność:

- `private` — widzi wyłącznie autor,
- `kitchen` — widzą wszyscy członkowie kuchni.

Domyślnie nowy przepis jest prywatny. Tylko autor może edytować, usuwać i zmieniać widoczność.

Przepis zawiera składniki (z opcjonalnym powiązaniem z `Product`) i kroki w ustalonej kolejności. Jednostki przepisu (`RecipeIngredientUnit`) są oddzielne od jednostek produktu i listy zakupów.

API zwraca dostępność składników względem zapasów (`available`, `partial`, `missing`, `unknown`) z bezpiecznym skalowaniem porcji oraz przeliczeniami g/kg i ml/l. Dla braków proponuje pełne opakowania (`ceil(brak / zawartość)`). Braki można dodać do istniejącej listy zakupów z wyborem wariantu i idempotencją. Etapy przepisu mogą mieć opcjonalny tytuł i czas trwania.

Publiczne linki, import ze stron, zdjęcia, kalorie i planowanie posiłków — poza tym etapem.

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
