import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAddToShoppingListBody } from "./shopping-list-add.ts";

describe("buildAddToShoppingListBody", () => {
  it("sends only productId for exact mode", () => {
    const body = buildAddToShoppingListBody({
      id: "p1",
      purchaseMode: "exact",
      purchaseOptions: [],
    });
    assert.deepEqual(body, { productId: "p1" });
  });

  it("adds default purchase option and packageCount for packaged", () => {
    const body = buildAddToShoppingListBody({
      id: "p2",
      purchaseMode: "packaged",
      purchaseOptions: [
        {
          id: "opt-1",
          productId: "p2",
          name: "6 szt",
          contentQuantity: "6.000",
          contentUnit: "piece",
          isDefault: true,
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    assert.equal(body.productId, "p2");
    assert.equal(body.purchaseOptionId, "opt-1");
    assert.equal(body.packageCount, 1);
  });

  it("throws when packaged product has no active options", () => {
    assert.throws(
      () =>
        buildAddToShoppingListBody({
          id: "p3",
          purchaseMode: "packaged",
          purchaseOptions: [],
        }),
      /opcji zakupu/,
    );
  });
});
