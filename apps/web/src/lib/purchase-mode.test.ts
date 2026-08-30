import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coercePurchaseModeChoice } from "./purchase-mode.ts";
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
  });

  it("loose paprika has no package size; nutrition still 100 g reference", () => {
    assert.equal(coercePurchaseModeChoice("exact", false), "exact");
    assert.equal(defaultBaseQuantityForUnit("gram"), "100");
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
