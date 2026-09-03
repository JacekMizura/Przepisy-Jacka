import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  nextServings,
  recipeCookStateKey,
  toggleIdInSet,
} from "./recipe-detail-state.ts";

describe("recipe-detail-state", () => {
  it("scales servings from base without going below 1", () => {
    assert.equal(nextServings(null, 4, 1), 5);
    assert.equal(nextServings(null, 4, -1), 3);
    assert.equal(nextServings(2, 4, -5), 1);
    assert.equal(nextServings(null, 0, 1), 2);
  });

  it("toggles ids in a set immutably", () => {
    const first = toggleIdInSet(new Set(), "a");
    assert.deepEqual([...first], ["a"]);
    const second = toggleIdInSet(first, "a");
    assert.deepEqual([...second], []);
    assert.ok(first.has("a"));
  });

  it("builds stable cook state keys", () => {
    assert.equal(
      recipeCookStateKey("r1", "ingredients"),
      "recipe-cook:r1:ingredients",
    );
    assert.equal(recipeCookStateKey("r1", "steps"), "recipe-cook:r1:steps");
  });
});
