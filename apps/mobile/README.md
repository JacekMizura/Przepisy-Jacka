# @moja-kuchnia/mobile

Klient mobilny Moja Kuchnia (Expo Router ~54).

## Konfiguracja

1. Skopiuj `.env.example` → `.env` i ustaw `EXPO_PUBLIC_API_URL` na origin API
   (nie origin weba). Android emulator: `http://10.0.2.2:3001`.
2. Po stronie API w `AUTH_TRUSTED_ORIGINS` dodaj `mojakuchnia://` (i opcjonalnie
   `mojakuchnia://*`). Plugin `@better-auth/expo` jest włączony w `create-auth`.
3. Sesja: Better Auth + `expo-secure-store` (Cookie w nagłówku, `credentials: omit`).

## Uruchomienie

```bash
pnpm --filter @moja-kuchnia/mobile start
```

## Zakres tego etapu

- logowanie / rejestracja / wylogowanie / 401 → login
- wybór kuchni (SecureStore)
- zakładki: Zapasy, Zakupy, Przepisy (placeholder), Więcej
- zapasy: lista, partie, zużycie auto/ręczne + 409, historia/cofnięcie
- zakupy: lista CRUD, checkout z paragonem (R2), historia zakupów
- media: aparat/galeria → begin → PUT → complete

## Weryfikacja

```bash
pnpm --filter @moja-kuchnia/mobile lint
pnpm --filter @moja-kuchnia/mobile typecheck
pnpm --filter @moja-kuchnia/mobile test
pnpm --filter @moja-kuchnia/mobile exec npx expo-doctor
```

`expo export` (android/ios) na tym środowisku Windows może paść na `hermesc` / private class fields w zależności bundla — sprawdzane lokalnie; CI / EAS Build to inna ścieżka. Emulator Android nie był dostępny (`adb` brak) — placeholdery layoutu: `verification-screenshots/mobile/*.png` (390×844).

Pełniejsze instrukcje monorepo: [README główny](../../README.md).

Kontrole: `pnpm run typecheck`, `pnpm test`, `pnpm run doctor` (expo-doctor),
`pnpm run export:android` / `export:ios`. Nie używaj samego `pnpm doctor` —
to wbudowane narzędzie pnpm, nie Expo.
