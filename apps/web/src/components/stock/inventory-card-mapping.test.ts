import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { asStockSummaryPage } from "../../lib/stock-list-types.ts";
import { splitDisplayQuantity } from "../../lib/format-quantity.ts";

describe("stock cards data mapping", () => {
  it("maps API page items to product and group card entries", () => {
    const page = asStockSummaryPage({
      items: [
        {
          kind: "product",
          product: {
            productId: "p1",
            productName: "Cukinia",
            defaultUnit: "gram",
            isArchived: false,
            totalQuantity: "400.000",
            batchCount: 1,
            nearestExpiry: null,
            expiringBatchCount: 0,
            latestBatchAt: "2026-08-30T00:00:00.000Z",
            batches: [],
          },
        },
        {
          kind: "group",
          groupId: "g1",
          groupName: "Pomidory",
          variantCount: 2,
          batchCount: 2,
          totalQuantity: "2400.000",
          defaultUnit: "gram",
          nearestExpiry: null,
          expiringBatchCount: 0,
          primaryLocation: "fridge",
          variants: [
            {
              productId: "v1",
              productName: "Pomidor koktajlowy gałązka",
              defaultUnit: "gram",
              isArchived: false,
              totalQuantity: "400.000",
              batchCount: 1,
              nearestExpiry: null,
              expiringBatchCount: 0,
              latestBatchAt: "2026-08-30T00:00:00.000Z",
              batches: [],
            },
            {
              productId: "v2",
              productName: "Pomidory malinowe",
              defaultUnit: "gram",
              isArchived: false,
              totalQuantity: "2000.000",
              batchCount: 1,
              nearestExpiry: null,
              expiringBatchCount: 0,
              latestBatchAt: "2026-08-30T00:00:00.000Z",
              batches: [],
            },
          ],
        },
      ],
      page: 1,
      limit: 24,
      total: 2,
      pageCount: 1,
    });

    assert.equal(page.items.length, 2);
    assert.equal(page.limit, 24);
    assert.equal(page.items[0]?.kind, "product");
    assert.equal(page.items[1]?.kind, "group");
    if (page.items[1]?.kind === "group") {
      assert.equal(page.items[1].groupName, "Pomidory");
      assert.equal(page.items[1].variants.length, 2);
    }
  });

  it("splits display quantity for green card headline", () => {
    assert.deepEqual(splitDisplayQuantity("10.000", "piece"), {
      amount: "10",
      unit: "szt.",
    });
  });
});
