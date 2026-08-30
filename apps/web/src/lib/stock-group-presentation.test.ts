import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatGroupTotalQuantity } from "./format-quantity.ts";
import {
  buildGroupThumbCollage,
  formatGroupStockSubtitle,
  pluralizeVariants,
} from "./stock-group-presentation.ts";

describe("stock-group-presentation", () => {
  it("formats Pomidory-style subtitle", () => {
    assert.equal(
      formatGroupStockSubtitle({
        variantCount: 2,
        batchCount: 2,
        totalLabel: "2,4\u00A0kg",
      }),
      "2 warianty · 2 partie · łącznie 2,4\u00A0kg",
    );
  });

  it("always shows variant count wording", () => {
    assert.match(pluralizeVariants(2), /2 warianty/);
    assert.match(pluralizeVariants(1), /1 wariant/);
  });

  it("keeps collage images inside fixed 2x2 slots", () => {
    const two = buildGroupThumbCollage(["a", "b"]);
    assert.equal(two.layout, "grid");
    assert.equal(two.slots.length, 4);
    assert.ok(!two.overflowLabel);

    const many = buildGroupThumbCollage(["a", "b", "c", "d", "e"]);
    assert.equal(many.overflowLabel, "+1");
    assert.equal(many.slots.filter((s) => s.type === "image").length, 4);
  });

  it("aggregates group quantity for display", () => {
    assert.equal(
      formatGroupTotalQuantity([
        { totalQuantity: "400", defaultUnit: "gram" },
        { totalQuantity: "2000", defaultUnit: "gram" },
      ]),
      "2,4\u00A0kg",
    );
  });
});
