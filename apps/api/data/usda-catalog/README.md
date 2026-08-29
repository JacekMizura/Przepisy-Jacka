# Katalog żywności USDA (bez EAN)

Wspólny, tylko-do-odczytu katalog wartości odżywczych oparty o oficjalne zbiory
**USDA FoodData Central: Foundation Foods** oraz **SR Legacy** (public domain / CC0).
Nie wymaga klucza API od użytkownika. Nie tworzy automatycznie produktów w kuchniach.

## Źródła

- [FoodData Central](https://fdc.nal.usda.gov/)
- [Pliki do pobrania](https://fdc.nal.usda.gov/download-datasets/)
- Znaczenie pól: [Foundation Foods Documentation](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/)
- Równoważnik soli (Na → sól): [Rozporządzenie UE 1169/2011](https://eur-lex.europa.eu/LexUriServ/LexUriServ.do?uri=OJ%3AL%3A2011%3A304%3A0018%3A0063%3Aen%3APDF) — sól (g) = sód (mg) × 2,5 / 1000

Przypięte wersje i sumy SHA-256: `data/usda-catalog/v1/manifest.json`.

**Nie commituj** pełnych archiwów USDA — trzymaj je lokalnie w `apps/api/tmp-usda/` (gitignore).

## Normalizacja nutrientów

Mapowanie po **identyfikatorze** nutrientu USDA (nie po kolejności):

| Pole aplikacji | USDA | Uwagi |
| --- | --- | --- |
| Energia (kcal) | 2048 → 2047 → 1008; potem 1009 (kJ÷4,184) | Jedno pole; bez sumowania metod; bez wzoru 4/4/9 |
| Białko | 1003 | g |
| Tłuszcz | 1004 | g |
| Węglowodany | preferuj 1005−1079 | USDA 1005 obejmuje błonnik; wynik oznaczany jako przybliżony |
| Błonnik | 1079 | brak ≠ 0 |
| Sól | z 1093 (sód mg) | brak sodu → sól nieuzupełniona |

Podstawa katalogu: **100 g części jadalnej**. Jednostki magazynowe produktu: `gram` / `piece` / `milliliter`. Dla `gram` zapisujemy bazę 100 g; składniki w kg w przepisach przelicza istniejąca warstwa `recipe-nutrition`. Dla `piece` wymagana jawna masa części jadalnej 1 szt. w gramach. `milliliter` — bez automatycznego przeliczenia z gramów.

## Aktualizacja katalogu

1. Pobierz JSON Foundation + SR Legacy do `apps/api/tmp-usda/`.
2. Dostosuj listę FDC w `src/usda-catalog/catalog-selection.ts` / `.json`.
3. Zbuduj wycinek: `pnpm --filter @moja-kuchnia/api usda:build-catalog`
4. Zsynchronizuj tabelę (idempotentnie, **bez** seeda aplikacji i **bez** zmiany `ProductNutrition`):

   ```bash
   pnpm --filter @moja-kuchnia/api usda:sync-catalog
   ```

Zatwierdzone wartości w produkcie to **kopia** (snapshot) z `source=usda_fdc` oraz `sourceGenericFoodId` / `sourceFdcId`. Aktualizacja katalogu nie nadpisuje produktów ani przepisów.
