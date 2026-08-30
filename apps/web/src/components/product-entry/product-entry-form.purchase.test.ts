import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("product entry purchase config placement", () => {
  const source = readFileSync(
    join(__dirname, "product-entry-form.tsx"),
    "utf8",
  );

  it("has a single PurchaseModeField and no Zapasy duplicate", () => {
    const purchaseFieldCount = (source.match(/<PurchaseModeField/g) ?? [])
      .length;
    assert.equal(purchaseFieldCount, 2); // create + edit branches, not Zapasy
    assert.doesNotMatch(source, /ProductPurchaseOptions/);
    assert.doesNotMatch(source, /Jak kupuję ten produkt/);
    assert.doesNotMatch(source, /Wielkość produktu:/);
  });
});
