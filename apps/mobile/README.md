# @moja-kuchnia/mobile

Klient mobilny Moja Kuchnia (Expo Router ~54), scheme: `mojakuchnia://`.

## Konfiguracja

1. Skopiuj `.env.example` → `.env` i ustaw `EXPO_PUBLIC_API_URL` (publiczny origin API, bez sekretów).
2. Po stronie API w `AUTH_TRUSTED_ORIGINS` musi być **dokładnie** `mojakuchnia://`
   (obok originów weba). Bez `*`, bez `exp://`.
3. Sesja: Better Auth 1.7.2 + `@better-auth/expo` 1.7.2 + SecureStore;
   domenowe API: nagłówek `Cookie`, `credentials: 'omit'`.

### `EXPO_PUBLIC_API_URL`

| Środowisko | Wartość |
|------------|---------|
| API lokalne + iOS simulator | `http://localhost:3001` |
| API lokalne + Android emulator | `http://10.0.2.2:3001` |
| API lokalne + telefon w LAN | `http://<LAN-IP>:3001` |
| API Railway (tylko dane testowe) | `https://<twoje-api>.up.railway.app` |

Nie używaj produkcyjnych kont ani mutacji na żywych danych kuchni użytkowników.

## Development build (natywny smoke)

Expo Go (`exp://`) **nie** jest wspierane w `AUTH_TRUSTED_ORIGINS`. Użyj development
build ze scheme `mojakuchnia` z `app.json`.

### Wymagania (instaluje użytkownik — agent nie instaluje SDK)

- Node ≥ 24, pnpm z monorepo
- Dla Androida: Android Studio + SDK + emulator **albo** fizyczny telefon z USB/wireless debugging
- Dla iOS (macOS): Xcode + symulator / urządzenie
- Opcjonalnie: konto Expo do `eas build --profile development` (tylko za zgodą)

### Ścieżka A — lokalny emulator Android (`expo run:android`)

```bash
# 1. API + Postgres lokalnie (osobny terminal)
pnpm --filter @moja-kuchnia/api dev

# 2. apps/api/.env — AUTH_TRUSTED_ORIGINS zawiera mojakuchnia://
# 3. apps/mobile/.env
echo EXPO_PUBLIC_API_URL=http://10.0.2.2:3001 > apps/mobile/.env

# 4. Development build + uruchomienie na emulatorze
pnpm --filter @moja-kuchnia/mobile exec expo run:android
```

Pierwsze `expo run:android` generuje projekt `android/` i buduje natywnie (długo).
Scheme deep-link: `mojakuchnia://`.

### Ścieżka B — fizyczny telefon (development build)

```bash
# Lokalne API z telefonu (ten sam Wi‑Fi):
# EXPO_PUBLIC_API_URL=http://<LAN-IP-komputera>:3001
#
# Albo API Railway (konto / kuchnia wyłącznie testowa):
# EXPO_PUBLIC_API_URL=https://<railway-api>.up.railway.app

pnpm --filter @moja-kuchnia/mobile exec expo run:android --device
# albo (za zgodą) EAS:
# eas build --profile development --platform android
# eas device:create  # rejestracja urządzenia
```

Na urządzeniu: zaloguj się kontem testowym → sprawdź przywrócenie sesji po restarcie
aplikacji → zapasy / zakupy / aparat.

### Checklist przed udostępnieniem aplikacji

- [ ] W Railway / prod `AUTH_TRUSTED_ORIGINS` dopisane dokładne `mojakuchnia://`
      (nie zmieniać w tym PR — tylko checklista wdrożenia)
- [ ] Smoke na emulatorze lub fizycznym telefonie (SecureStore, Cookie, aparat)
- [ ] Brak sekretów w `EXPO_PUBLIC_*`

## Zakres tego etapu

- logowanie / rejestracja / sesja / 401
- kuchnie, Zapasy (partie, zużycie, **odpis z powodem**, historia/cofnięcie, zdjęcie)
- Zakupy (lista, checkout, paragon R2), Przepisy placeholder, Więcej

## Weryfikacja CI / lokalnie

```bash
pnpm --filter @moja-kuchnia/mobile lint
pnpm --filter @moja-kuchnia/mobile typecheck
pnpm --filter @moja-kuchnia/mobile test
pnpm --filter @moja-kuchnia/mobile run doctor
pnpm --filter @moja-kuchnia/mobile run export:android
pnpm --filter @moja-kuchnia/mobile run export:ios
```

`pnpm doctor` (bez `run`) to narzędzie pnpm, nie Expo.

Zrzuty w `verification-screenshots/mobile/` to **mockupy**, nie smoke urządzenia.
