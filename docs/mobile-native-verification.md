# Weryfikacja natywna mobile (Android)

Nie używaj Expo Web ani mockupów jako zamiennika smoke na urządzeniu.
Nie uruchamiaj EAS Build, publicznego tunelu ani zmian Railway bez osobnej zgody.

**Development Build** (`developmentClient: true`) wymaga Metro — to narzędzie programisty, **nie** natywny smoke produktu.
**Preview APK** (profil `preview`) to samodzielna aplikacja z wbudowanym bundle i HTTPS API — budować **dopiero po** merge PR + migracjach + `mojakuchnia://` na Railway (patrz checklista poniżej).

## Profile EAS

| Profil | Node | Dev Client | Cleartext | API | Artefakt |
| --- | --- | --- | --- | --- | --- |
| `development` | `24.13.0` | tak (Metro) | tak (LAN) | lokalne `.env` | APK wewnętrzny |
| `preview` | `24.13.0` | **nie** | **nie** | `https://przepisy-jacka-production-ae86.up.railway.app` | APK `versionCode: 2` |
| `production` | `24.13.0` | nie | nie | to samo HTTPS API | AAB |

Node `24.13.0` = major 24 jak CI (`node-version: "24"`) i `engines >=24` / lokalne `.nvmrc`.

## Checklist smoke (Preview na telefonie — po wdrożeniu API)

1. Start aplikacji — brak crasha, **bez** ekranu Expo Dev Client / Metro.
2. Rejestracja / logowanie na koncie testowym (nie produkcyjne dane użytkownika końcowego, jeśli to możliwe).
3. Zamknięcie aplikacji i odtworzenie sesji (SecureStore).
4. Wybór kuchni.
5. Lista zapasów i rozwinięcie partii.
6. Zużycie automatyczne oraz ręczne.
7. Odpis z powodem i cofnięcie.
8. Lista zakupów i checkout.
9. Aparat i galeria.
10. Upload zdjęcia produktu i paragonu: begin → PUT → complete.
11. Odmowa uprawnień, anulowanie zdjęcia, brak sieci.
12. Wylogowanie i usunięcie lokalnej sesji.

Logi: bez cookies, tokenów i sekretów. Zrzuty tylko z telefonu.

## Wariant A — lokalny emulator (`expo run:android`)

1. Android Studio + SDK + AVD; `adb devices` pokazuje emulator.
2. API: `pnpm --filter @moja-kuchnia/api dev`.
3. `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://10.0.2.2:3001`.
4. `pnpm --filter @moja-kuchnia/mobile exec expo run:android`.
5. Checklist smoke względem lokalnego API.

## Wariant B — Development Build (tylko dla developerów)

Wymaga komputera z Metro. Nie zastępuje Preview.

```bash
cd apps/mobile
eas build -p android --profile development
pnpm --filter @moja-kuchnia/mobile exec expo start --dev-client
```

## Wariant C — Preview APK (samodzielna aplikacja)

**Nie buduj Preview**, dopóki produkcyjne API nie zawiera zmian z PR mobile (Expo auth, `mojakuchnia://`, migracja odpisu itd.).

Po spełnieniu kolejności z [deploy-checklist.md](./deploy-checklist.md) → sekcja „Mobile Preview po merge”:

```bash
cd apps/mobile
eas build -p android --profile preview
```

Instalacja APK zastąpi Development Build (`versionCode: 2`). Aplikacja startuje offline względem Metro i woła Railway HTTPS.

## Stan agenta

Brak lokalnego `adb` / `ANDROID_HOME` w środowisku agenta — instalacja APK i smoke na telefonie po stronie użytkownika.
