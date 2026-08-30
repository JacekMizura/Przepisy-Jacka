import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCategoryTileButtonStates,
  FALLBACK_CATEGORY_ICON,
  getProductCategoryPresentation,
  listProductCategoryTiles,
  PRODUCT_CATEGORY_OPTIONS,
  UNCATED_CATEGORY_LABEL,
} from "./product-category-presentation.ts";

test("getProductCategoryPresentation maps known categories", () => {
  const dairy = getProductCategoryPresentation("Nabiał");
  assert.equal(dairy.label, "Nabiał");
  assert.equal(dairy.value, "Nabiał");
  assert.match(dairy.selectedClassName, /blue/);
});

test("getProductCategoryPresentation falls back for unknown category", () => {
  const unknown = getProductCategoryPresentation("Kosmiczne przekąski");
  assert.equal(unknown.label, "Kosmiczne przekąski");
  assert.equal(unknown.value, "Kosmiczne przekąski");
  assert.equal(unknown.icon, FALLBACK_CATEGORY_ICON);
  assert.match(unknown.selectedClassName, /slate/);
});

test("empty category is Bez kategorii", () => {
  const empty = getProductCategoryPresentation("");
  assert.equal(empty.label, UNCATED_CATEGORY_LABEL);
  assert.equal(empty.value, "");
});

test("listProductCategoryTiles includes all app categories plus Bez kategorii", () => {
  const tiles = listProductCategoryTiles();
  assert.equal(tiles[0]?.label, UNCATED_CATEGORY_LABEL);
  for (const option of PRODUCT_CATEGORY_OPTIONS) {
    assert.ok(
      tiles.some((tile) => tile.value === option),
      `missing tile for ${option}`,
    );
  }
});

test("category tile selection sets aria-pressed equivalent", () => {
  const states = buildCategoryTileButtonStates("Nabiał");
  for (const state of states) {
    assert.equal(state.type, "button");
  }
  const nabial = states.find((state) => state.value === "Nabiał");
  const none = states.find((state) => state.value === "");
  assert.equal(nabial?.pressed, true);
  assert.equal(none?.pressed, false);
});

test("category tile selection can change", () => {
  let selected = "Nabiał";
  selected = "Mięso i wędliny";
  const after = buildCategoryTileButtonStates(selected);
  assert.equal(
    after.find((state) => state.value === "Mięso i wędliny")?.pressed,
    true,
  );
  assert.equal(after.find((state) => state.value === "Nabiał")?.pressed, false);
});

test("unknown category tile uses fallback and can be pressed", () => {
  const states = buildCategoryTileButtonStates("Kosmiczne przekąski", [
    "Kosmiczne przekąski",
  ]);
  const unknown = states.find((state) => state.value === "Kosmiczne przekąski");
  assert.ok(unknown);
  assert.equal(unknown?.pressed, true);
  assert.equal(
    getProductCategoryPresentation("Kosmiczne przekąski").icon,
    FALLBACK_CATEGORY_ICON,
  );
});
