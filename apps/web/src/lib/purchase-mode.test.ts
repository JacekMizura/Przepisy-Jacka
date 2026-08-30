import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coercePurchaseModeChoice, formatProductPackageSizeLabel, packageFieldsForPurchaseMode, showsProductPackageSize } from "./purchase-mode.ts";
import { defaultBaseQuantityForUnit } from "./product-nutrition-payload.ts";
import { packageCountToBaseQuantity } from "./package-quantity.ts";

describe("purchase mode UX helpers", () => {
  it("packaged mozzarella keeps package size independent of nutrition 100 g", () => {
    const converted = packageCountToBaseQuantity({
      packageCount: "2",
      packageQuantity: "125",
      packageUnit: "gram",
      defaultUnit: "gram",
    });
    assert.equal(converted.ok, true);
    if (converted.ok) {
      assert.equal(converted.quantity, "250.000");
    }
    assert.equal(defaultBaseQuantityForUnit("gram"), "100");
    assert.equal(
      formatProductPackageSizeLabel({
        purchaseMode: "packaged",
        packageQuantity: "125",
        packageUnitLabel: "g",
      }),
      "125\u00A0g w opakowaniu",
    );
  });

  it("loose paprika has no package size; nutrition still 100 g reference", () => {
    assert.equal(coercePurchaseModeChoice("exact", false), "exact");
    assert.equal(showsProductPackageSize("exact"), false);
    assert.equal(
      formatProductPackageSizeLabel({
        purchaseMode: "exact",
        packageQuantity: "100",
        packageUnitLabel: "g",
      }),
      null,
    );
    assert.deepEqual(
      packageFieldsForPurchaseMode({
        purchaseMode: "exact",
        packageQuantity: "100",
        packageUnit: "gram",
      }),
      { packageQuantity: null, packageUnit: null },
    );
    assert.equal(defaultBaseQuantityForUnit("gram"), "100");
  });

  it("purchase mode config is single source — exact clears package fields", () => {
    assert.equal(showsProductPackageSize("packaged"), true);
    assert.equal(showsProductPackageSize(null), false);
  });

  it("does not auto-convert piece ingredient to grams", () => {
    const result = packageCountToBaseQuantity({
      packageCount: "1",
      packageQuantity: "1",
      packageUnit: "piece",
      defaultUnit: "gram",
    });
    assert.equal(result.ok, false);
  });
});
