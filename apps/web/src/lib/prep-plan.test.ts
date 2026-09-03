import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  blockedReason,
  classifyPrepSteps,
  findDependencyCycle,
  formatDependsOnPreview,
  suggestReadyStep,
  type PrepStepRef,
} from "./prep-plan.ts";
import {
  emptyPrepSession,
  sanitizePrepSession,
  shouldOfferPrepResume,
} from "./prep-session.ts";

function step(
  id: string,
  sortOrder: number,
  dependsOnStepIds: string[] = [],
  extra: Partial<PrepStepRef> = {},
): PrepStepRef {
  return {
    id,
    sortOrder,
    title: extra.title ?? id,
    instruction: extra.instruction ?? id,
    activeWorkMinutes: extra.activeWorkMinutes ?? null,
    waitMinutes: extra.waitMinutes ?? null,
    timerEnabled: extra.timerEnabled ?? false,
    durationMinutes: extra.durationMinutes ?? null,
    dependsOnStepIds,
  };
}

describe("prep-plan graph", () => {
  it("allows independent and parallel steps", () => {
    const cycle = findDependencyCycle([
      { stepId: "5", dependsOnStepId: "2" },
      { stepId: "5", dependsOnStepId: "3" },
      { stepId: "5", dependsOnStepId: "4" },
      { stepId: "6", dependsOnStepId: "1" },
      { stepId: "6", dependsOnStepId: "5" },
      { stepId: "8", dependsOnStepId: "6" },
      { stepId: "8", dependsOnStepId: "7" },
    ]);
    assert.equal(cycle, null);
  });

  it("detects cycles", () => {
    const cycle = findDependencyCycle([
      { stepId: "a", dependsOnStepId: "b" },
      { stepId: "b", dependsOnStepId: "a" },
    ]);
    assert.ok(cycle);
  });

  it("unlocks ready steps after dependencies complete", () => {
    const steps = [
      step("1", 0),
      step("2", 1),
      step("3", 2, ["1", "2"]),
    ];
    const before = classifyPrepSteps(steps, new Set(), new Set());
    assert.deepEqual(
      before.ready.map((item) => item.id),
      ["1", "2"],
    );
    assert.deepEqual(
      before.blocked.map((item) => item.id),
      ["3"],
    );
    const after = classifyPrepSteps(steps, new Set(), new Set(["1", "2"]));
    assert.deepEqual(
      after.ready.map((item) => item.id),
      ["3"],
    );
  });

  it("formats blocked reason and preview", () => {
    const steps = [step("a", 0, [], { title: "Zetrzyj ziemniaki" }), step("b", 1, ["a"], { title: "Połącz" })];
    assert.equal(formatDependsOnPreview([], steps), "Dostępne od początku");
    assert.equal(formatDependsOnPreview(["a"], steps), "Po kroku 1");
    assert.match(
      blockedReason(steps[1]!, steps, new Set()),
      /Zetrzyj ziemniaki/,
    );
  });

  it("suggests a short task during a running wait timer", () => {
    const sauce = step("sauce", 1, [], {
      title: "Przygotuj sos",
      activeWorkMinutes: 10,
    });
    const bake = step("bake", 0, [], { title: "Piecz", waitMinutes: 40 });
    const suggestion = suggestReadyStep(
      [sauce],
      [bake],
      { bake: { endsAt: 1_000 + 38 * 60_000, pausedRemainingMs: null, durationMinutes: 40 } },
      1_000,
    );
    assert.equal(suggestion.step?.id, "sauce");
    assert.match(suggestion.hint ?? "", /38 min/);
    assert.match(suggestion.hint ?? "", /10 min/);
  });
});

describe("prep-session isolation", () => {
  it("does not resume after recipe version change", () => {
    const dirty = {
      ...emptyPrepSession(2),
      recipeUpdatedAt: "old",
      startedAt: 10,
      startedStepIds: ["a"],
      lastActivityAt: 10,
    };
    const next = sanitizePrepSession(dirty, ["a"], [], "new", 4);
    assert.equal(shouldOfferPrepResume(next), false);
    assert.equal(next.servings, 4);
  });
});
