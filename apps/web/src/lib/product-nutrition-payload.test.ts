import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildUpsertProductNutritionDto,
  clearNutritionProvenance,
  createEmptyNutritionDraft,
} from "./product-nutrition-payload.ts";

describe("buildUpsertProductNutritionDto", () => {
  it("returns undefined for empty draft (no zeros)", () => {
    const result = buildUpsertProductNutritionDto(
      createEmptyNutritionDraft("gram"),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value, undefined);
    }
  });

  it("builds payload for 100 g values", () => {
    const result = buildUpsertProductNutritionDto({
      ...createEmptyNutritionDraft("gram"),
      baseQuantity: "100",
      baseUnit: "gram",
      kcal: "64",
      proteinGrams: "3,2",
      carbsGrams: "4.7",
      fatGrams: "3.6",
      fiberGrams: "",
      saltGrams: "0,1",
      source: "manual",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value, {
        baseQuantity: "100.000",
        baseUnit: "gram",
        kcal: "64.000",
        proteinGrams: "3.200",
        carbsGrams: "4.700",
        fatGrams: "3.600",
        fiberGrams: null,
        saltGrams: "0.100",
        source: "manual",
        sourceFetchedAt: null,
        sourceLabel: null,
        sourceBrand: null,
        sourceGenericFoodId: null,
        sourceFdcId: null,
        sourcePieceGrams: null,
      });
    }
  });

  it("manual edit clears OFF/USDA provenance via clearNutritionProvenance", () => {
    const cleared = clearNutritionProvenance({
      ...createEmptyNutritionDraft("gram"),
      kcal: "100",
      proteinGrams: "1",
      carbsGrams: "2",
      fatGrams: "3",
      source: "open_food_facts",
      sourceFetchedAt: "2026-01-01T00:00:00.000Z",
      sourceLabel: "Test",
      sourceBrand: "Brand",
      sourceFdcId: 123,
      sourceGenericFoodId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      sourcePieceGrams: "50",
    });
    assert.equal(cleared.source, "manual");
    assert.equal(cleared.sourceFetchedAt, null);
    assert.equal(cleared.sourceLabel, null);
    assert.equal(cleared.sourceBrand, null);
    assert.equal(cleared.sourceFdcId, null);
    assert.equal(cleared.sourceGenericFoodId, null);
    assert.equal(cleared.sourcePieceGrams, null);

    const result = buildUpsertProductNutritionDto(cleared);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value?.source, "manual");
      assert.equal(result.value?.sourceFetchedAt, null);
      assert.equal(result.value?.sourceLabel, null);
    }
  });
});
