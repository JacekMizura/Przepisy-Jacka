import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  usdaLookupUi,
  usdaVariantStateLabel,
} from "./nutrition-usda-lookup-ui.ts";

describe("nutrition-usda-lookup UI copy", () => {
  it("używa zrozumiałej nazwy przycisku i apply", () => {
    assert.equal(usdaLookupUi.buttonLabel, "Znajdź produkt bez EAN");
    assert.equal(usdaLookupUi.applyLabel, "Użyj tych wartości");
    assert.equal(usdaLookupUi.sourceNote, "USDA — wartości referencyjne");
  });

  it("wyciąga stan produktu z variantLabel", () => {
    assert.equal(usdaVariantStateLabel("słodka, czerwona, surowa"), "słodka");
    assert.equal(usdaVariantStateLabel("raw"), "raw");
    assert.equal(usdaVariantStateLabel("  "), null);
  });
});
