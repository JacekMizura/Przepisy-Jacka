# Weryfikacja natywna mobile (Android)

Nie używaj Expo Web ani mockupów jako zamiennika smoke na urządzeniu.
Nie uruchamiaj EAS Build bez osobnej zgody.

Środowisko agenta (stan przy przygotowaniu instrukcji): brak `adb` w PATH, puste `ANDROID_HOME` / `ANDROID_SDK_ROOT`, brak lokalnego Android SDK — smoke na emulatorze/telefonie wymaga Twojej decyzji i lokalnej instalacji narzędzi.

Wspólne wymagania przed oboma wariantami:

1. Lokalne API NestJS z kontrolowaną bazą (Compose Postgres 18), nie produkcja.
2. W `apps/api/.env`: `AUTH_TRUSTED_ORIGINS` zawiera origin weba lokalnego **oraz** dokładne `mojakuchnia://` (np. `http://localhost:3000,mojakuchnia://`).
3. W `apps/mobile/.env` ustaw `EXPO_PUBLIC_API_URL` zgodnie z wariantem poniżej.
4. Development build (CNG) — nie Expo Go (`exp://` jest zabronione w trusted origins).

Checklist smoke (oba warianty): logowanie, odtworzenie sesji po restarcie aplikacji, wybór kuchni, zapasy, ręczne zużycie, odpis, zakupy, aparat (produkt/paragon). Bez mutacji produkcyjnych.

## Wariant A — lokalny emulator (Android Studio + `expo run:android`)

1. Zainstaluj [Android Studio](https://developer.android.com/studio) i w SDK Manager: Android SDK Platform, Platform-Tools, Emulator oraz jeden system image (np. API 35).
2. Ustaw zmienne użytkownika Windows, potem nowy terminal:
   - `ANDROID_HOME` = katalog SDK (zwykle `%LOCALAPPDATA%\Android\Sdk`)
   - dopisz do PATH: `%ANDROID_HOME%\platform-tools`, `%ANDROID_HOME%\emulator`
3. W Device Manager utwórz AVD i uruchom emulator. Sprawdź: `adb devices` (powinno pokazać `emulator-….device`).
4. Terminal 1 (root monorepo): `pnpm --filter @moja-kuchnia/api dev` (API na `3001`).
5. W `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://10.0.2.2:3001` (alias hosta z emulatora).
6. Terminal 2: `pnpm --filter @moja-kuchnia/mobile exec expo run:android`  
   (pierwszy build native przez Gradle; kolejne starty szybsze).
7. Wykonaj checklist smoke powyżej.

## Wariant B — fizyczny telefon + development build

1. Te same kroki SDK / `ANDROID_HOME` / `platform-tools` co w wariancie A (Android Studio pełne nie jest wymagane do samego `adb`, ale SDK Platform-Tools tak).
2. Na telefonie: tryb deweloperski + debugowanie USB; kabel USB; potwierdź `adb devices` (`device`, nie `unauthorized`).
3. Telefon i PC w tej samej sieci Wi‑Fi. Ustal IPv4 komputera (`ipconfig`).
4. Terminal 1: lokalne API jak wyżej; firewall Windows musi przepuszczać TCP `3001` z LAN.
5. W `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://<IPv4-PC>:3001` (nie `localhost`).
6. Terminal 2: `pnpm --filter @moja-kuchnia/mobile exec expo run:android --device`  
   albo zainstaluj wcześniej zbudowany development APK i `pnpm --filter @moja-kuchnia/mobile start`, potem otwórz build na telefonie.
7. Wykonaj checklist smoke powyżej.

## Decyzja

Wybierz **jeden** wariant (A albo B). Agent nie uruchamia EAS ani nie wybiera za Ciebie.
