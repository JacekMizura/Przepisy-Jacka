import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPackageUnitCompatible,
  packageCountToBaseQuantity,
  suggestedPackageUnitsFor,
} from "./package-quantity.ts";

describe("package-quantity", () => {
  it("converts 2 × 125 g to 250 g", () => {
    const result = packageCountToBaseQuantity({
      packageCount: "2",
      packageQuantity: "125",
      packageUnit: "gram",
      defaultUnit: "gram",
    });
    assert.deepEqual(result, { ok: true, quantity: "250.000" });
  });

  it("converts 1 × 1 kg to 1000 g", () => {
    const result = packageCountToBaseQuantity({
      packageCount: "1",
      packageQuantity: "1",
      packageUnit: "kilogram",
      defaultUnit: "gram",
    });
    assert.deepEqual(result, { ok: true, quantity: "1000.000" });
  });

  it("converts 3 × 0,5 l to 1500 ml", () => {
    const result = packageCountToBaseQuantity({
      packageCount: "3",
      packageQuantity: "0,5",
      packageUnit: "liter",
      defaultUnit: "milliliter",
    });
    assert.deepEqual(result, { ok: true, quantity: "1500.000" });
  });

  it("rejects mass package for milliliter product", () => {
    const result = packageCountToBaseQuantity({
      packageCount: "1",
      packageQuantity: "100",
      packageUnit: "gram",
      defaultUnit: "milliliter",
    });
    assert.equal(result.ok, false);
  });

  it("checks package unit compatibility", () => {
    assert.equal(isPackageUnitCompatible("kilogram", "gram"), true);
    assert.equal(isPackageUnitCompatible("liter", "gram"), false);
    assert.deepEqual(suggestedPackageUnitsFor("gram"), ["gram", "kilogram"]);
  });
});
