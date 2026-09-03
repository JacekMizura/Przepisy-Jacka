export type CookingTextSize = "standard" | "large" | "xlarge";

export type CookingTimerState = {
  endsAt: number | null;
  pausedRemainingMs: number | null;
  durationMinutes: number;
};

export type CookingSession = {
  recipeUpdatedAt: string | null;
  currentStepId: string | null;
  completedStepIds: string[];
  checkedIngredientIds: string[];
  timers: Record<string, CookingTimerState>;
  lastActivityAt: number;
  started: boolean;
  finished: boolean;
};

const SESSION_PREFIX = "moja-kuchnia:cooking-session:v1:";
const TEXT_SIZE_KEY = "moja-kuchnia:cooking-text-size";

export function cookingSessionKey(
  userId: string,
  kitchenId: string,
  recipeId: string,
): string {
  return `${SESSION_PREFIX}${userId}:${kitchenId}:${recipeId}`;
}

export function emptyCookingSession(): CookingSession {
  return {
    recipeUpdatedAt: null,
    currentStepId: null,
    completedStepIds: [],
    checkedIngredientIds: [],
    timers: {},
    lastActivityAt: 0,
    started: false,
    finished: false,
  };
}

export function loadCookingTextSize(): CookingTextSize {
  if (typeof window === "undefined") {
    return "standard";
  }
  try {
    const raw = window.localStorage.getItem(TEXT_SIZE_KEY);
    if (raw === "large" || raw === "xlarge" || raw === "standard") {
      return raw;
    }
  } catch {
    // ignore
  }
  return "standard";
}

export function saveCookingTextSize(size: CookingTextSize): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(TEXT_SIZE_KEY, size);
  } catch {
    // ignore
  }
}

export function loadCookingSession(key: string): CookingSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isCookingSession(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCookingSession(key: string, session: CookingSession): void {
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

export function clearCookingSession(key: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function sanitizeCookingSession(
  session: CookingSession,
  stepIds: string[],
  ingredientIds: string[],
  recipeUpdatedAt?: string,
): CookingSession {
  if (
    recipeUpdatedAt &&
    session.recipeUpdatedAt &&
    session.recipeUpdatedAt !== recipeUpdatedAt
  ) {
    return {
      ...emptyCookingSession(),
      recipeUpdatedAt,
      currentStepId: stepIds[0] ?? null,
    };
  }

  const stepSet = new Set(stepIds);
  const ingredientSet = new Set(ingredientIds);
  const completedStepIds = session.completedStepIds.filter((id) =>
    stepSet.has(id),
  );
  const checkedIngredientIds = session.checkedIngredientIds.filter((id) =>
    ingredientSet.has(id),
  );
  const timers: Record<string, CookingTimerState> = {};
  for (const [stepId, timer] of Object.entries(session.timers)) {
    if (stepSet.has(stepId) && isCookingTimerState(timer)) {
      timers[stepId] = timer;
    }
  }
  const currentValid =
    session.currentStepId !== null && stepSet.has(session.currentStepId);

  return {
    recipeUpdatedAt: recipeUpdatedAt ?? session.recipeUpdatedAt,
    currentStepId: currentValid ? session.currentStepId : (stepIds[0] ?? null),
    completedStepIds,
    checkedIngredientIds,
    timers,
    lastActivityAt: currentValid ? session.lastActivityAt : 0,
    started: currentValid ? session.started : false,
    finished:
      currentValid &&
      session.finished &&
      completedStepIds.length === stepIds.length,
  };
}

export function shouldOfferResume(session: CookingSession): boolean {
  return (
    session.started &&
    !session.finished &&
    session.lastActivityAt > 0 &&
    Boolean(session.currentStepId)
  );
}

export function resumeStepNumber(
  session: CookingSession,
  stepIds: string[],
): number {
  const index = session.currentStepId
    ? stepIds.indexOf(session.currentStepId)
    : 0;
  return Math.max(1, index + 1);
}

function isCookingTimerState(value: unknown): value is CookingTimerState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const timer = value as CookingTimerState;
  return (
    (timer.endsAt === null || typeof timer.endsAt === "number") &&
    (timer.pausedRemainingMs === null ||
      typeof timer.pausedRemainingMs === "number") &&
    typeof timer.durationMinutes === "number"
  );
}

function isCookingSession(value: unknown): value is CookingSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const session = value as CookingSession;
  return (
    (session.recipeUpdatedAt === undefined ||
      session.recipeUpdatedAt === null ||
      typeof session.recipeUpdatedAt === "string") &&
    (session.currentStepId === null || typeof session.currentStepId === "string") &&
    Array.isArray(session.completedStepIds) &&
    Array.isArray(session.checkedIngredientIds) &&
    typeof session.timers === "object" &&
    session.timers !== null &&
    typeof session.lastActivityAt === "number" &&
    typeof session.started === "boolean" &&
    typeof session.finished === "boolean"
  );
}
