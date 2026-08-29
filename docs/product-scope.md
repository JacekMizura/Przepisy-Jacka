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
- `purchasePriceMinor` — opcjonalna łączna cena zakupu całej początkowej partii w groszach (brak = nieznana cena),
- `currency` — domyślnie `PLN`.

Cena nie zmienia znaczenia po częściowym zużyciu. Ilości w JSON są decimal stringami z maksymalnie 3 miejscami, np. `"500.000"`.

Ten sam produkt z katalogu może mieć wiele partii (np. zakupy w różnych sklepach). W widoku zbiorczym zapasów grupujemy po `productId` — jedna pozycja na produkt z łączną ilością i rozwinięciem partii (sklep, data, termin ważności, cena jednostkowa, odnośnik do zakupu). Nie scalamy automatycznie produktów o podobnych nazwach.

Zmiana pozostałej ilości odbywa się wyłącznie przez akcję **„Zużyj”** (`StockConsumption` + linie pobrania z konkretnych partii). Edycja partii nie pozwala nadpisać `quantity` — tylko metadane (miejsce, daty, EAN, zdjęcie). Koszt zatwierdzonego zużycia liczymy narastająco z cen partii: `round(cena × zużytePo / początkowa) − round(cena × zużytePrzed / początkowa)` (grosze), dzięki czemu kolejne częściowe odpisy sumują się do ceny zakupu. Brak ceny w partii oznacza niekompletny koszt, nie zero. Szacunek kosztu przepisu z ostatnich zakupów pozostaje bez zmian.

Automatyczny dobór partii do zużycia (FIFO): najpierw partie z najbliższym terminem ważności (pomijamy przeterminowane), potem partie bez terminu od najstarszego przyjęcia; remisy rozstrzyga data przyjęcia i identyfikator partii. Użytkownik może też ręcznie wskazać partie (w tym jawny odpis przeterminowanych). Podgląd zużycia nic nie odejmuje; zatwierdzenie jest idempotentne (`idempotencyKey`) i wymaga zgodności `previewFingerprint` ze stanem partii **oraz** wybranym podziałem. Historia zużyć jest dostępna w API/UI; cofnięcie przywraca ilości do tych samych partii bez kasowania rekordów. Fizyczne usunięcie partii jest dozwolone wyłącznie dla ręcznie utworzonej partii bez powiązania z zakupem/paragonem i bez żadnych linii `StockConsumption` (również po cofnięciu). Partie z zakupem lub historią zużycia usuwa się wyłącznie przez „Odpisz”. Wyzerowane partie nie pojawiają się na domyślnej liście aktywnych zapasów (`quantity > 0`), ale pozostają w historii.

Nazwy produktów są unikalne w kuchni po normalizacji (trim, lowercase, zbiciu spacji). Wyświetlana pozostaje oryginalna `name`.

Produkt może mieć **sposób zakupu** (`purchaseMode`):

- `unconfigured` — domyślny dla nowych produktów; wymaga konfiguracji przed dodaniem braków do listy i przed checkoutem,
- `packaged` — zakup w opakowaniach (`ProductPurchaseOption`); wymaga ≥1 aktywnej opcji i dokładnie jednej domyślnej,
- `exact` — zakup dokładnej ilości (opcje mogą istnieć historycznie, ale nie są używane).

Istniejące produkty z dowolną opcją zakupu migracja ustawia na `packaged`; bez opcji pozostają `unconfigured` (nigdy auto-`exact`).

Produkt może mieć konfigurowalne **warianty zakupu** (`ProductPurchaseOption`): np. „Karton 1 l” = 1000 ml. Jeden wariant może być domyślny (unikalnie w bazie).

Produkt może mieć opcjonalnie:

- `ean` — kod EAN/GTIN (8, 12, 13 lub 14 cyfr), unikalny w kuchni,
- `imageUrl` — starsze źródło zdjęcia: URL http(s) albo skompresowany data URL obrazu,
- `image` — zdjęcie z magazynu zdjęć (patrz „Zdjęcia”), ma pierwszeństwo nad `imageUrl`,
- `nutrition` — wartości odżywcze na wybraną ilość odniesienia,
- `category` — etykieta kategorii do filtrowania i grupowania w stanie magazynowym.

### Wartości odżywcze produktu

Wartości odżywcze podaje się dla ilości odniesienia w jednostce bazowej produktu (np. 100 ml mleka): `kcal`, białko, węglowodany, tłuszcz oraz opcjonalnie błonnik i sól. Wszystkie liczby są nieujemnymi decimal stringami. Jednostka odniesienia musi być zgodna z `defaultUnit` produktu. Dane wprowadza dowolny członek kuchni.

Można też **pobrać podgląd z Open Food Facts po EAN** (wyłącznie przez NestJS API). Podgląd nie zapisuje się automatycznie — użytkownik zatwierdza „Użyj danych”, a zapis idzie istniejącym zapisem produktu/wartości. Brakujące pola nie są uzupełniane zerami. API nie przelicza g↔ml ani na sztuki. Przy zapisie z OFF zapisujemy źródło (`open_food_facts`), datę pobrania oraz etykietę/markę z podglądu. Nie wysyłamy do OFF prywatnych danych ani zdjęć użytkowników. Dane OFF podlegają ODbL / DbCL — w UI pokazujemy atrybucję.

Dla produktów **bez EAN** można **wybrać wartości z wspólnego katalogu USDA** (Foundation Foods / SR Legacy, public domain/CC0). Wyszukiwanie po polsku (nazwy i aliasy) działa lokalnie w NestJS. Użytkownik wybiera dokładny wariant, widzi podgląd (baza 100 g części jadalnej, makro, źródło, braki) z oznaczeniem „Wartości referencyjne — szacunkowe”, zatwierdza „Użyj danych”, a dopiero zwykły zapis produktu kopiuje wartości do `ProductNutrition` (`source=usda_fdc`) wraz z identyfikatorem wpisu katalogu. Aktualizacja katalogu **nie** zmienia zapisanych produktów. Dla sztuki wymagana jest **jawna masa części jadalnej 1 szt. w gramach**. g↔kg przeliczamy bezpiecznie; ml/l oraz łyżki/szklanki — nie. Ręczna edycja po USDA ustawia `source=manual`. Szczegóły: `apps/api/data/usda-catalog/README.md`.

## Zdjęcia

Zdjęcia produktów, okładek przepisów i kroków przepisu trzymamy w magazynie obiektowym (S3-kompatybilnym), nie w bazie. W bazie jest tylko `MediaAsset` z kluczem obiektu i statusem.

Wysyłka jest dwuetapowa: klient prosi o adres wysyłki, wysyła plik, a potem potwierdza. Dopiero przy potwierdzeniu API sprawdza rzeczywistą zawartość pliku po nagłówku bajtowym (JPEG / PNG / WebP), obraca zdjęcie zgodnie z EXIF, **usuwa metadane EXIF** (w tym lokalizację), konwertuje do WebP i skaluje: produkt do 800 px, okładka przepisu do 1600 px, krok przepisu do 1200 px, miniatura do 400 px.

Adresy zdjęć są krótko żyjącymi podpisanymi linkami generowanymi przy odczycie. Nigdy nie zapisujemy podpisanych adresów w bazie.

Zasady dostępu:

- zdjęcia produktów: wszyscy członkowie kuchni,
- zdjęcia przepisu prywatnego: wyłącznie autor,
- zdjęcia przepisu udostępnionego kuchni: odczyt dla członków, zmiany wyłącznie dla autora,
- nie można przypiąć zdjęcia z innej kuchni ani zdjęcia nieprzetworzonego.

Podmiana lub odpięcie zdjęcia usuwa poprzednie pliki, jeśli nic już ich nie używa. Usunięcie przepisu usuwa jego okładkę i zdjęcia kroków.

Gdy magazyn zdjęć nie jest skonfigurowany, API działa normalnie, a operacje wysyłki zwracają kontrolowany błąd „Magazyn zdjęć nie jest skonfigurowany.”. Istniejące `imageUrl` nadal się wyświetla i nie jest automatycznie przenoszone do magazynu.

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

Przepis zawiera składniki (z opcjonalnym powiązaniem z `Product`) i kroki w ustalonej kolejności. Jednostki przepisu (`RecipeIngredientUnit`) są oddzielne od jednostek produktu i listy zakupów. Składniki mogą być opcjonalnie pogrupowane (np. ciasto / nadzienie); przepisy bez grup pozostają płaską listą. Każdy krok może mieć opcjonalną wskazówkę autora (`tip`) pod instrukcją. Przepis może należeć do wielu kategorii kuchni albo do żadnej; kategorie są wspólne dla kuchni (członkowie zarządzają nazwami), a filtrowanie listy działa po stronie API (OR / bez kategorii) razem z wyszukiwaniem.

API zwraca dostępność składników względem zapasów (`available`, `partial`, `missing`, `unknown`) z bezpiecznym skalowaniem porcji oraz przeliczeniami g/kg i ml/l. Dla braków proponuje pełne opakowania (`ceil(brak / zawartość)`). Braki można dodać do istniejącej listy zakupów z wyborem wariantu i idempotencją. Etapy przepisu mogą mieć opcjonalny tytuł, wskazówkę i czas trwania.

Przepis może mieć okładkę, a każdy krok własne zdjęcie.

### Szacunek kalorii, makroskładników i kosztu

Dla wybranej liczby porcji API zwraca szacunek wartości odżywczych i kosztu przepisu.

Wartości odżywcze liczymy wyłącznie ze składników powiązanych z produktem, który ma zapisane wartości odżywcze i jednostkę przeliczalną na jednostkę bazową produktu (sztuki, g/kg, ml/l). Koszt liczymy z **ostatniego zakupu** danego produktu w tej kuchni: cena jednostkowa to cena linii zakupu podzielona przez jej ilość. Zaokrąglenie do pełnych groszy następuje dopiero po zsumowaniu całego przepisu.

Brak danych nigdy nie oznacza zera. Gdy żaden składnik nie ma danych, sumy są `null`. Odpowiedź podaje, ile składników policzono, których zabrakło i z jakich zakupów pochodzą ceny. Koszt jest oznaczony jako szacunkowy.

Publiczne linki i planowanie posiłków — poza tym etapem.

### Import przepisu

Członek kuchni może wybrać **Importuj przepis** w trybie **Z linku** albo **Wklej tekst**. Całe rozpoznawanie i normalizacja odbywa się w NestJS; web korzysta z wygenerowanego klienta OpenAPI. Podgląd wypełnia istniejący edytor; **nie tworzy** przepisów, produktów ani kategorii. Zapis jest jawny (prywatny przepis z `sourceUrl`, opcjonalnym `sourceAuthor`, `importedAt`, `importIdempotencyKey`).

**Z linku (jedna bezpieczna odpowiedź HTTPS, bez ponownego pobierania):** kolejno JSON-LD `Recipe`, microdata/RDFa `Recipe`, parser witryny (obecnie Ania Gotuje dla `aniagotuje.pl`), ogólny parser HTML (wyraźne sekcje składników i przygotowania; pomija nawigację, reklamy, komentarze, FAQ, polecane). Sam tytuł lub `og:description` nie wystarcza. Przy niepełnym wyniku API zwraca odczytane pola oraz `gaps`/`warnings` — bez zgadywania brakującej treści i bez mieszania kilku przepisów.

**Wklej tekst:** użytkownik wkleja przepis lub opis posta oraz opcjonalny adres źródła. API rozpoznaje jednoznaczne sekcje; nierozpoznane fragmenty wracają w `unassignedFragments` do ręcznego opracowania. Dla Instagrama/TikToka nie obiecujemy odczytu z filmu; gdy automatyczny import z linku nie daje przepisu, API sugeruje wklejenie opisu (`suggestPasteCaption`) z zachowaniem linku. Bez kluczy społecznościowych, pobierania filmów, OCR, AI i wykonywania JS strony.

Brakujących pól nie zgadujemy (brak czasu ≠ 0; „2 słoiki” nie staje się 2 porcjami; alternatywy typu „360 g — 2 sztuki” zostają do sprawdzenia). Ilości/jednostki tylko gdy jednoznaczne. Produkty i kategorie są podpowiadane z kuchni. Koszt i makro nadal z produktów/zakupów. Zewnętrznych zdjęć nie pobieramy — własny upload.

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
