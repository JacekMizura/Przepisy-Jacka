import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatDisplayQuantityWithUnit,
  formatGroupTotalQuantity,
  formatMoneyMinor,
  formatNutritionNumber,
  formatPackagePurchase,
  formatQuantityNumber,
  formatQuantityWithUnit,
  splitDisplayQuantity,
  toApiQuantityString,
} from "./format-quantity.ts";

describe("format-quantity", () => {
  it("formats 100.000 as 100", () => {
    assert.equal(formatQuantityNumber("100.000"), "100");
  });

  it("splits display quantity into amount and unit for cards", () => {
    assert.deepEqual(splitDisplayQuantity("400.000", "gram"), {
      amount: "400",
      unit: "g",
    });
    assert.deepEqual(splitDisplayQuantity("2400.000", "gram"), {
      amount: "2,4",
      unit: "kg",
    });
  });

  it("formats 1.500 as 1,5", () => {
    assert.equal(formatQuantityNumber("1.500"), "1,5");
  });

  it("formats 0.250 as 0,25", () => {
    assert.equal(formatQuantityNumber("0.250"), "0,25");
  });

  it("formats 600.000 ml as 600 ml with non-breaking space", () => {
    assert.equal(
      formatQuantityWithUnit("600.000", "milliliter"),
      "600\u00A0ml",
    );
  });

  it("keeps piece unit glued to amount", () => {
    assert.equal(formatQuantityWithUnit("4.000", "piece"), "4\u00A0szt.");
  });

  it("formats package purchase line", () => {
    assert.equal(
      formatPackagePurchase(1, "Karton 1 l", "1000.000", "milliliter"),
      "1\u00A0×\u00A0Karton 1 l",
    );
  });

  it("converts UI quantity to API decimal string", () => {
    assert.equal(toApiQuantityString("1,5"), "1.500");
    assert.equal(toApiQuantityString("100"), "100.000");
  });

  it("formats minor price with currency suffix", () => {
    assert.equal(formatMoneyMinor(192), "1,92\u00A0zł");
    assert.equal(formatMoneyMinor(0), "0,00\u00A0zł");
    assert.equal(formatMoneyMinor(null), "—");
  });

  it("strips insignificant zeros in nutrition values", () => {
    assert.equal(formatNutritionNumber("384.00", 0), "384");
    assert.equal(formatNutritionNumber("19.20"), "19,2");
    assert.equal(formatNutritionNumber(null), "");
  });
});

describe("formatDisplayQuantityWithUnit", () => {
  it("converts 2400 g to 2,4 kg", () => {
    assert.equal(formatDisplayQuantityWithUnit("2400", "gram"), "2,4\u00A0kg");
    assert.equal(
      formatDisplayQuantityWithUnit("2400.000", "gram"),
      "2,4\u00A0kg",
    );
  });

  it("keeps 250 g as grams", () => {
    assert.equal(formatDisplayQuantityWithUnit("250", "gram"), "250\u00A0g");
  });

  it("converts 1500 ml to 1,5 l", () => {
    assert.equal(
      formatDisplayQuantityWithUnit("1500", "milliliter"),
      "1,5\u00A0l",
    );
  });

  it("keeps piece counts unchanged", () => {
    assert.equal(formatDisplayQuantityWithUnit("10", "piece"), "10\u00A0szt.");
  });

  it("does not convert below 1000 g / ml", () => {
    assert.equal(formatDisplayQuantityWithUnit("999", "gram"), "999\u00A0g");
    assert.equal(
      formatDisplayQuantityWithUnit("999", "milliliter"),
      "999\u00A0ml",
    );
  });

  it("aggregates group totals with kg conversion", () => {
    assert.equal(
      formatGroupTotalQuantity([
        { totalQuantity: "400.000", defaultUnit: "gram" },
        { totalQuantity: "2000.000", defaultUnit: "gram" },
      ]),
      "2,4\u00A0kg",
    );
  });
});
