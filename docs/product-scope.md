# Moja Kuchnia — zakres produktu

Dokument jest jednym z trzech aktualnych źródeł prawdy (obok `docs/architecture.md` i `docs/project-status.md`). Opisuje ustalenia produktowe przyjęte na starcie projektu. Nie jest specyfikacją implementacji.

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

## Dane osobiste użytkownika

- dziennik zjedzonych posiłków,
- kalorie i makroskładniki,
- cele żywieniowe,
- osobiste statystyki.

## Przepisy

Przepisy są domyślnie prywatne. Można je udostępnić:

- kuchni,
- konkretnemu użytkownikowi,
- przez prywatny link.

Docelowo możliwe będzie importowanie przepisów ze stron internetowych.

## Uwierzytelnianie (decyzja docelowa)

- Better Auth,
- wspólne konta dla webu i mobile,
- dane uwierzytelniania w PostgreSQL,
- sesja webowa przez bezpieczne cookies,
- bezpieczna obsługa sesji w Expo.

Pełny proces logowania nie należy do tego etapu.

## Poza zakresem tego dokumentu

Szczegóły architektury, hostingu i stosu technologicznego są w `docs/architecture.md`.
