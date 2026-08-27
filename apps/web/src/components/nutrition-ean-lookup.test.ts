import { draftHasNutritionValues } from "@/components/nutrition-ean-lookup";

describe("draftHasNutritionValues", () => {
  it("is false for empty draft", () => {
    expect(
      draftHasNutritionValues({
        kcal: "",
        proteinGrams: "",
        carbsGrams: "",
        fatGrams: "",
      }),
    ).toBe(false);
  });

  it("is true when any macro is filled", () => {
    expect(
      draftHasNutritionValues({
        kcal: "10",
        proteinGrams: "",
        carbsGrams: "",
        fatGrams: "",
      }),
    ).toBe(true);
  });
});
