import { describe, expect, it } from "@jest/globals";

import {
  formatPackagePurchase,
  formatQuantityNumber,
  formatQuantityWithUnit,
} from "./format-quantity";

describe("format-quantity", () => {
  it("formats 100.000 as 100", () => {
    expect(formatQuantityNumber("100.000")).toBe("100");
  });

  it("formats 1.500 as 1,5", () => {
    expect(formatQuantityNumber("1.500")).toBe("1,5");
  });

  it("formats 600.000 ml as 600 ml", () => {
    expect(formatQuantityWithUnit("600.000", "milliliter")).toBe("600 ml");
  });

  it("formats package purchase line", () => {
    expect(formatPackagePurchase(1, "Karton 1 l", "1000.000", "milliliter")).toBe(
      "1 × Karton 1 l",
    );
  });
});
