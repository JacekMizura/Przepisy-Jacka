import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emptyCookingSession,
  resumeStepNumber,
  sanitizeCookingSession,
  shouldOfferResume,
} from "./cooking-session.ts";
import {
  formatCountdown,
  isTimerComplete,
  pauseTimer,
  resumeTimer,
  startTimer,
  timerRemainingMs,
} from "./cooking-timer.ts";

describe("cooking-session", () => {
  it("drops stale step and ingredient ids after recipe change", () => {
    const dirty = {
      ...emptyCookingSession(),
      started: true,
      currentStepId: "old-step",
      completedStepIds: ["old-step", "keep-step"],
      checkedIngredientIds: ["gone", "keep-ing"],
      timers: {
        "old-step": {
          endsAt: 1,
          pausedRemainingMs: null,
          durationMinutes: 5,
        },
        "keep-step": {
          endsAt: null,
          pausedRemainingMs: 12_000,
          durationMinutes: 2,
        },
      },
      lastActivityAt: 10,
    };
    const next = sanitizeCookingSession(
      dirty,
      ["keep-step", "other"],
      ["keep-ing"],
    );
    assert.equal(next.started, false);
    assert.equal(next.currentStepId, "keep-step");
    assert.deepEqual(next.completedStepIds, ["keep-step"]);
    assert.deepEqual(next.checkedIngredientIds, ["keep-ing"]);
    assert.equal(next.timers["old-step"], undefined);
    assert.equal(next.timers["keep-step"]?.pausedRemainingMs, 12_000);
  });

  it("clears progress when the recipe version changes", () => {
    const dirty = {
      ...emptyCookingSession(),
      recipeUpdatedAt: "2026-01-01T00:00:00.000Z",
      started: true,
      currentStepId: "keep-step",
      lastActivityAt: 10,
    };
    const next = sanitizeCookingSession(
      dirty,
      ["keep-step"],
      [],
      "2026-02-01T00:00:00.000Z",
    );
    assert.equal(next.started, false);
    assert.equal(shouldOfferResume(next), false);
  });

  it("offers resume from the stored step number", () => {
    const session = {
      ...emptyCookingSession(),
      started: true,
      currentStepId: "b",
      lastActivityAt: 1,
    };
    assert.equal(shouldOfferResume(session), true);
    assert.equal(resumeStepNumber(session, ["a", "b", "c"]), 2);
    assert.equal(shouldOfferResume(emptyCookingSession()), false);
  });
});

describe("cooking-timer", () => {
  it("counts down from an absolute end time", () => {
    const timer = startTimer(2, 1_000);
    assert.equal(timerRemainingMs(timer, 1_000), 120_000);
    assert.equal(timerRemainingMs(timer, 31_000), 90_000);
    assert.equal(isTimerComplete(timer, 121_000), true);
    assert.equal(formatCountdown(90_000), "01:30");
  });

  it("pauses and resumes without using interval drift", () => {
    const running = startTimer(1, 0);
    const paused = pauseTimer(running, 15_000);
    assert.equal(paused.endsAt, null);
    assert.equal(paused.pausedRemainingMs, 45_000);
    const resumed = resumeTimer(paused, 100_000);
    assert.equal(resumed.endsAt, 145_000);
    assert.equal(timerRemainingMs(resumed, 100_000), 45_000);
  });
});
