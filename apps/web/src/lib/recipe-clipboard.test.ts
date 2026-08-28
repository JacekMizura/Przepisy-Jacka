import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildIngredientClipboardSections,
  formatIngredientsClipboardText,
  formatRecipeClipboardText,
  formatStepsClipboardText,
} from "./recipe-clipboard.ts";

describe("recipe-clipboard", () => {
  const doughId = "group-dough";
  const fillingId = "group-filling";

  const groups = [
    { id: fillingId, name: "Nadzienie", sortOrder: 1 },
    { id: doughId, name: "Ciasto", sortOrder: 0 },
  ];

  const ingredients = [
    {
      id: "i-salt",
      name: "Sól",
      quantity: "1.000",
      unit: "teaspoon" as const,
      note: null,
      groupId: null,
      sortOrder: 3,
    },
    {
      id: "i-flour",
      name: "Mąka",
      quantity: "500.000",
      unit: "gram" as const,
      note: null,
      groupId: doughId,
      sortOrder: 0,
    },
    {
      id: "i-cheese",
      name: "Twaróg",
      quantity: "250.000",
      unit: "gram" as const,
      note: "półtłusty",
      groupId: fillingId,
      sortOrder: 2,
    },
    {
      id: "i-water",
      name: "Woda",
      quantity: "200.000",
      unit: "milliliter" as const,
      note: null,
      groupId: doughId,
      sortOrder: 1,
    },
  ];

  const steps = [
    {
      title: null,
      instruction: "Zlep pierogi.",
      tip: null,
      sortOrder: 2,
    },
    {
      title: "Przygotuj ciasto",
      instruction: "Wymieszaj mąkę z wodą.",
      tip: "Nie mieszaj zbyt długo.",
      sortOrder: 0,
    },
    {
      title: "Przygotuj nadzienie",
      instruction: "Ugotuj ziemniaki.",
      tip: null,
      sortOrder: 1,
    },
  ];

  it("orders groups and puts ungrouped ingredients last as Pozostałe", () => {
    const sections = buildIngredientClipboardSections(ingredients, groups);
    assert.deepEqual(
      sections.map((section) => section.title),
      ["Ciasto", "Nadzienie", "Pozostałe"],
    );
    assert.deepEqual(
      sections[0]?.ingredients.map((item) => item.name),
      ["Mąka", "Woda"],
    );
    assert.deepEqual(
      sections[1]?.ingredients.map((item) => item.name),
      ["Twaróg"],
    );
    assert.deepEqual(
      sections[2]?.ingredients.map((item) => item.name),
      ["Sól"],
    );
  });

  it("keeps a flat list when there are no groups", () => {
    const sections = buildIngredientClipboardSections(ingredients, []);
    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.title, null);
    assert.deepEqual(
      sections[0]?.ingredients.map((item) => item.name),
      ["Mąka", "Woda", "Twaróg", "Sól"],
    );
  });

  it("formats ingredient clipboard with group headers and notes", () => {
    assert.equal(
      formatIngredientsClipboardText(ingredients, groups),
      [
        "Ciasto:",
        "• Mąka — 500\u00A0g",
        "• Woda — 200\u00A0ml",
        "Nadzienie:",
        "• Twaróg — 250\u00A0g (półtłusty)",
        "Pozostałe:",
        "• Sól — 1\u00A0łyżeczka",
      ].join("\n"),
    );
  });

  it("formats steps with titles and tips in sort order", () => {
    assert.equal(
      formatStepsClipboardText(steps),
      [
        "Krok 1 · Przygotuj ciasto",
        "Wymieszaj mąkę z wodą.",
        "Wskazówka: Nie mieszaj zbyt długo.",
        "",
        "Krok 2 · Przygotuj nadzienie",
        "Ugotuj ziemniaki.",
        "",
        "Krok 3",
        "Zlep pierogi.",
      ].join("\n"),
    );
  });

  it("combines ingredients and steps for full recipe clipboard", () => {
    const text = formatRecipeClipboardText({
      ingredients,
      ingredientGroups: groups,
      steps,
    });
    assert.ok(text.startsWith("Ciasto:"));
    assert.ok(text.includes("\n\nPrzygotowanie:\nKrok 1 · Przygotuj ciasto"));
    assert.ok(text.includes("Wskazówka: Nie mieszaj zbyt długo."));
  });
});
