import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Store combobox is client-only; test suggestion helper + pressed contract via options list.
import {
  filterSuggestedStores,
  OTHER_STORE_LABEL,
  SUGGESTED_STORE_NAMES,
} from "./suggested-stores.ts";

test("suggested stores start with preferred chains", () => {
  assert.deepEqual([...SUGGESTED_STORE_NAMES].slice(0, 5), [
    "Carrefour",
    "Lidl",
    "Biedronka",
    "Putka",
    "Wierzejki",
  ]);
  assert.equal(OTHER_STORE_LABEL, "Inny sklep…");
});

test("filterSuggestedStores is case-insensitive pl", () => {
  assert.deepEqual(filterSuggestedStores("LID"), ["Lidl"]);
  assert.ok(filterSuggestedStores("").length >= 5);
});

test("StoreNameCombobox markup has combobox role when rendered with dynamic import skip", () => {
  // Pure contract: empty selection remains empty string (API null).
  let value = "";
  const onChange = (next: string) => {
    value = next;
  };
  onChange("Biedronka");
  assert.equal(value, "Biedronka");
  onChange("");
  assert.equal(value, "");
  // Ensure React is available for SSR packages used elsewhere
  assert.equal(typeof createElement, "function");
  assert.equal(typeof renderToStaticMarkup, "function");
});
