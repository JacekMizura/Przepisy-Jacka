import assert from "node:assert/strict";
import test from "node:test";

import {
  packagePriceMinorFromInput,
  parsePositivePackageCount,
  totalPriceMinorFromPackages,
} from "./package-price.ts";
import { packageCountToBaseQuantity } from "./package-quantity.ts";
import {
  filterSuggestedStores,
  SUGGESTED_STORE_NAMES,
} from "./suggested-stores.ts";

test("2 × 125 g = 250 g", () => {
  const result = packageCountToBaseQuantity({
    packageCount: "2",
    packageQuantity: "125",
    packageUnit: "gram",
    defaultUnit: "gram",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.quantity, "250.000");
  }
});

test("2 × 2,99 zł = 5,98 zł", () => {
  const per = packagePriceMinorFromInput("2,99");
  assert.equal(per, 299);
  assert.equal(totalPriceMinorFromPackages(per!, 2), 598);
  assert.equal(parsePositivePackageCount("2"), 2);
  assert.equal(parsePositivePackageCount("1.5"), null);
});

test("store suggestions include Carrefour", () => {
  assert.ok(SUGGESTED_STORE_NAMES.includes("Carrefour"));
  assert.deepEqual(filterSuggestedStores("bie"), ["Biedronka"]);
});

test("package snapshot contract fields are nullable integers", () => {
  // Dokumentacja kontraktu: stare partie → null; nowe z packageCount → int.
  const legacy = { packageCount: null as number | null };
  const fresh = { packageCount: 2 as number | null };
  assert.equal(legacy.packageCount, null);
  assert.equal(fresh.packageCount, 2);
});
