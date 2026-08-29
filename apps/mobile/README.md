# @moja-kuchnia/mobile

Klient mobilny Moja Kuchnia (Expo Router ~54).

## Konfiguracja

1. Skopiuj `.env.example` → `.env` i ustaw `EXPO_PUBLIC_API_URL` na origin API
   (nie origin weba). Android emulator: `http://10.0.2.2:3001`.
2. Po stronie API w `AUTH_TRUSTED_ORIGINS` dodaj dokładnie `mojakuchnia://`
   (scheme z `app.json`). Plugin `@better-auth/expo` jest włączony w `create-auth`.
   Bez `*`, bez `exp://` — lokalnie używaj development build ze scheme aplikacji.
3. Sesja: Better Auth + `expo-secure-store` (Cookie w nagłówku, `credentials: omit`).

## Uruchomienie

```bash
pnpm --filter @moja-kuchnia/mobile start
```

## Zakres tego etapu

- logowanie / rejestracja / wylogowanie / 401 → login
- wybór kuchni (SecureStore)
- zakładki: Zapasy, Zakupy, Przepisy (placeholder), Więcej
- zapasy: lista, partie, zużycie auto/ręczne + 409, historia/cofnięcie, zdjęcie produktu
- zakupy: lista CRUD, checkout z paragonem (R2), historia zakupów
- media: aparat/galeria → begin → PUT → complete

## Weryfikacja

```bash
pnpm --filter @moja-kuchnia/mobile lint
pnpm --filter @moja-kuchnia/mobile typecheck
pnpm --filter @moja-kuchnia/mobile test
pnpm --filter @moja-kuchnia/mobile run doctor
pnpm --filter @moja-kuchnia/mobile run export:android
pnpm --filter @moja-kuchnia/mobile run export:ios
```

Uwaga: `pnpm doctor` (bez `run`) to narzędzie pnpm, nie Expo.

Pełniejsze instrukcje monorepo: [README główny](../../README.md).
