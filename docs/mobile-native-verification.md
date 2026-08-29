# Weryfikacja natywna mobile (Android)

Nie używaj Expo Web ani mockupów jako zamiennika smoke na urządzeniu.
Nie uruchamiaj EAS Build, publicznego tunelu ani zmian Railway bez osobnej zgody.

## Wspólne wymagania

1. Lokalne API NestJS + Postgres Compose 18 (nie produkcja, nie konto produkcyjne).
2. W `apps/api/.env` (lokalnie):
   - `API_HOST=0.0.0.0`, `API_PORT=3001`
   - `AUTH_TRUSTED_ORIGINS` z dokładnym `mojakuchnia://` (np. `http://localhost:3000,mojakuchnia://`) — **nie** ustawiaj jeszcze na Railway
   - `MEDIA_STORAGE_DRIVER=memory`
   - lokalne `DATABASE_URL` / `BETTER_AUTH_SECRET` (nie produkcyjne)
3. W `apps/mobile/.env`: `EXPO_PUBLIC_API_URL` wskazujący adres osiągalny z telefonu (patrz wariant B).
4. Development build z `expo-dev-client` (scheme `mojakuchnia`) — nie Expo Go (`exp://` zabronione).

Logi: bez cookies, tokenów i sekretów. Zrzuty tylko z telefonu.

## Checklist smoke

1. Start aplikacji — brak crasha.
2. Rejestracja / logowanie na lokalnym koncie.
3. Zamknięcie aplikacji i odtworzenie sesji (SecureStore).
4. Wybór kuchni.
5. Lista zapasów i rozwinięcie partii.
6. Zużycie automatyczne oraz ręczne.
7. Odpis z powodem i cofnięcie.
8. Lista zakupów i checkout.
9. Aparat i galeria.
10. Upload zdjęcia produktu i paragonu: begin → PUT → complete (sterownik `memory`).
11. Odmowa uprawnień, anulowanie zdjęcia, brak sieci.
12. Wylogowanie i usunięcie lokalnej sesji.

## Wariant A — lokalny emulator (`expo run:android`)

1. Android Studio + SDK + AVD; `adb devices` pokazuje emulator.
2. API: `pnpm --filter @moja-kuchnia/api dev`.
3. `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://10.0.2.2:3001`.
4. `pnpm --filter @moja-kuchnia/mobile exec expo run:android`.
5. Checklist smoke.

## Wariant B — fizyczny telefon + EAS Development Build

### Udostępnienie lokalnego API telefonowi

**Preferowane (bez tunelu):** telefon i PC w tej samej sieci Wi‑Fi.

1. `ipconfig` → IPv4 PC (np. `192.168.0.42`).
2. Firewall Windows: zezwól na przychodzący TCP `3001` (profil sieci prywatnej).
3. `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://192.168.0.42:3001` (Twój IP).
4. Cleartext HTTP dla lokalnego `http://` jest włączany **tylko** przy profilu EAS `development` (`app.config.ts` + `expo-build-properties`). Preview/production → wyłączony.

**Opcjonalny tunel HTTPS** (Cloudflare Tunnel / ngrok): tylko gdy LAN nie działa. Tunel wystawia lokalne API publicznie — użyj jednorazowego URL, nie loguj sekretów, wyłącz po teście. **Nie uruchamiaj tunelu bez potwierdzenia.**

### Build i instalacja (po zgodzie na EAS)

Stan: projekt EAS `@jacekms-team/moja-kuchnia` jest powiązany (`owner` + `extra.eas.projectId` w `app.json`).

```bash
cd apps/mobile
eas build -p android --profile development
```

Profil: `development` (`developmentClient: true`, `distribution: internal`, APK, **Node `22.14.0`** — minimum dla `pnpm@11.20.0` na EAS; lokalnie/CI nadal Node 24 z `engines` / `.nvmrc`). Pakiet: `pl.mojakuchnia.app`. Scheme: `mojakuchnia`.

**Uwaga:** przyszłe profile `preview` / `production` w `eas.json` też muszą ustawić Node zgodny z `pnpm@11` (≥ 22.13; najlepiej ten sam major co CI/`.nvmrc`, obecnie 24), inaczej `pnpm install` na EAS padnie jak przy Node 20.

Po instalacji APK:

```bash
# terminal API
pnpm --filter @moja-kuchnia/api dev

# terminal Metro (dev client)
pnpm --filter @moja-kuchnia/mobile exec expo start --dev-client
```

Otwórz development build na telefonie i połącz z Metro (QR / URL). Wykonaj checklist smoke.

## Stan agenta

Brak lokalnego `adb` / `ANDROID_HOME` w środowisku agenta — instalacja APK i smoke na telefonie po stronie użytkownika.
