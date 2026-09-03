import type { CookingTimerState } from "./cooking-session";

export type PrepSession = {
  recipeUpdatedAt: string | null;
  servings: number;
  startedAt: number;
  lastActivityAt: number;
  startedStepIds: string[];
  pausedStepIds: string[];
  completedStepIds: string[];
  checkedIngredientIds: string[];
  timers: Record<string, CookingTimerState>;
  finished: boolean;
};

const PREFIX = "moja-kuchnia:prep-session:v1:";

export function prepSessionKey(
  userId: string,
  kitchenId: string,
  recipeId: string,
): string {
  return `${PREFIX}${userId}:${kitchenId}:${recipeId}`;
}

export function emptyPrepSession(servings: number): PrepSession {
  return {
    recipeUpdatedAt: null,
    servings,
    startedAt: 0,
    lastActivityAt: 0,
    startedStepIds: [],
    pausedStepIds: [],
    completedStepIds: [],
    checkedIngredientIds: [],
    timers: {},
    finished: false,
  };
}

export function loadPrepSession(key: string): PrepSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isPrepSession(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePrepSession(key: string, session: PrepSession): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ ...session, lastActivityAt: Date.now() }),
    );
  } catch {
    // ignore
  }
}

export function clearPrepSession(key: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function sanitizePrepSession(
  session: PrepSession,
  stepIds: string[],
  ingredientIds: string[],
  recipeUpdatedAt: string,
  defaultServings: number,
): PrepSession {
  if (session.recipeUpdatedAt && session.recipeUpdatedAt !== recipeUpdatedAt) {
    return emptyPrepSession(defaultServings);
  }
  const stepSet = new Set(stepIds);
  const ingredientSet = new Set(ingredientIds);
  const startedStepIds = session.startedStepIds.filter((id) => stepSet.has(id));
  const pausedStepIds = session.pausedStepIds.filter((id) =>
    startedStepIds.includes(id),
  );
  const completedStepIds = session.completedStepIds.filter((id) =>
    stepSet.has(id),
  );
  const timers: Record<string, CookingTimerState> = {};
  for (const [stepId, timer] of Object.entries(session.timers)) {
    if (stepSet.has(stepId)) {
      timers[stepId] = timer;
    }
  }

  return {
    recipeUpdatedAt,
    servings:
      Number.isInteger(session.servings) && session.servings >= 1
        ? session.servings
        : defaultServings,
    startedAt: session.startedAt,
    lastActivityAt: session.lastActivityAt,
    startedStepIds,
    pausedStepIds,
    completedStepIds,
    checkedIngredientIds: session.checkedIngredientIds.filter((id) =>
      ingredientSet.has(id),
    ),
    timers,
    finished: session.finished && completedStepIds.length === stepIds.length,
  };
}

export function shouldOfferPrepResume(session: PrepSession): boolean {
  return (
    session.startedAt > 0 &&
    !session.finished &&
    (session.startedStepIds.length > 0 || session.completedStepIds.length > 0)
  );
}

function isPrepSession(value: unknown): value is PrepSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const session = value as PrepSession;
  return (
    (session.recipeUpdatedAt === null ||
      typeof session.recipeUpdatedAt === "string") &&
    typeof session.servings === "number" &&
    typeof session.startedAt === "number" &&
    typeof session.lastActivityAt === "number" &&
    Array.isArray(session.startedStepIds) &&
    Array.isArray(session.pausedStepIds) &&
    Array.isArray(session.completedStepIds) &&
    Array.isArray(session.checkedIngredientIds) &&
    typeof session.timers === "object" &&
    session.timers !== null &&
    typeof session.finished === "boolean"
  );
}
