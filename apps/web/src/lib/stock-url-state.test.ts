import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activeFilterChips,
  applyStockListPatch,
  clearAllFiltersPatch,
  parseStockListUrlState,
  serializeStockListUrlState,
} from "./stock-url-state.ts";

describe("stock-url-state", () => {
  it("parses defaults for stock view", () => {
    const state = parseStockListUrlState(new URLSearchParams());
    assert.equal(state.view, "stock");
    assert.equal(state.search, "");
    assert.equal(state.sort, "expiry");
    assert.equal(state.archived, "all");
    assert.equal(state.expiryStatus, "any");
    assert.equal(state.page, 1);
    assert.equal(state.hasStock, false);
  });

  it("parses catalog defaults and aliases", () => {
    const state = parseStockListUrlState(
      new URLSearchParams({
        view: "catalog",
        search: "pomidor",
        location: "fridge",
        expiryStatus: "expiring",
        page: "3",
      }),
    );
    assert.equal(state.view, "catalog");
    assert.equal(state.search, "pomidor");
    assert.equal(state.place, "fridge");
    assert.equal(state.expiryStatus, "expiring");
    assert.equal(state.sort, "name");
    assert.equal(state.archived, "active");
    assert.equal(state.page, 3);
  });

  it("serializes omitting defaults", () => {
    const params = serializeStockListUrlState({
      view: "stock",
      search: "",
      category: "",
      place: "",
      unit: "",
      expiryStatus: "any",
      archived: "all",
      sort: "expiry",
      hasStock: false,
      page: 1,
    });
    assert.equal(params.toString(), "");
  });

  it("serializes non-default filters with q= and place=", () => {
    const params = serializeStockListUrlState({
      view: "catalog",
      search: "mleko",
      category: "Nabiał",
      place: "fridge",
      unit: "milliliter",
      expiryStatus: "expired",
      archived: "all",
      sort: "newest",
      hasStock: true,
      page: 2,
    });
    assert.equal(params.get("view"), "catalog");
    assert.equal(params.get("q"), "mleko");
    assert.equal(params.get("category"), "Nabiał");
    assert.equal(params.get("place"), "fridge");
    assert.equal(params.get("unit"), "milliliter");
    assert.equal(params.get("expiry"), "expired");
    assert.equal(params.get("archived"), "all");
    assert.equal(params.get("sort"), "newest");
    assert.equal(params.get("hasStock"), "1");
    assert.equal(params.get("page"), "2");
  });

  it("resets page to 1 when filters change", () => {
    const current = parseStockListUrlState(
      new URLSearchParams({ page: "4", q: "a" }),
    );
    const next = applyStockListPatch(current, { category: "Pieczywo" });
    assert.equal(next.page, 1);
    assert.equal(next.category, "Pieczywo");
  });

  it("preserves explicit page in patch", () => {
    const current = parseStockListUrlState(new URLSearchParams());
    const next = applyStockListPatch(current, { page: 3 });
    assert.equal(next.page, 3);
  });

  it("builds active chips and clear-all", () => {
    const state = parseStockListUrlState(
      new URLSearchParams({
        q: "x",
        unit: "gram",
        expiry: "ok",
      }),
    );
    const chips = activeFilterChips(state);
    assert.ok(chips.some((c) => c.id === "search"));
    assert.ok(chips.some((c) => c.id === "unit"));
    assert.ok(chips.some((c) => c.id === "expiry"));
    const cleared = applyStockListPatch(state, clearAllFiltersPatch(state));
    assert.equal(cleared.search, "");
    assert.equal(cleared.unit, "");
    assert.equal(cleared.expiryStatus, "any");
  });

  it("rejects invalid sort for view", () => {
    const state = parseStockListUrlState(
      new URLSearchParams({ view: "catalog", sort: "qty_desc" }),
    );
    assert.equal(state.sort, "name");
  });
});
