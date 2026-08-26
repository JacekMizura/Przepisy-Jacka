import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatPackagePurchase,
  formatQuantityNumber,
  formatQuantityWithUnit,
  toApiQuantityString,
} from "./format-quantity.ts";

describe("format-quantity", () => {
  it("formats 100.000 as 100", () => {
    assert.equal(formatQuantityNumber("100.000"), "100");
  });

  it("formats 1.500 as 1,5", () => {
    assert.equal(formatQuantityNumber("1.500"), "1,5");
  });

  it("formats 0.250 as 0,25", () => {
    assert.equal(formatQuantityNumber("0.250"), "0,25");
  });

  it("formats 600.000 ml as 600 ml", () => {
    assert.equal(formatQuantityWithUnit("600.000", "milliliter"), "600 ml");
  });

  it("formats package purchase line", () => {
    assert.equal(
      formatPackagePurchase(1, "Karton 1 l", "1000.000", "milliliter"),
      "1 × Karton 1 l",
    );
  });

  it("converts UI quantity to API decimal string", () => {
    assert.equal(toApiQuantityString("1,5"), "1.500");
    assert.equal(toApiQuantityString("100"), "100.000");
  });
});
