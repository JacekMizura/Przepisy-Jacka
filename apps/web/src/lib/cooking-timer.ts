import type { CookingTimerState } from "./cooking-session";

export function timerRemainingMs(
  timer: CookingTimerState,
  now: number,
): number {
  if (timer.endsAt !== null) {
    return Math.max(0, timer.endsAt - now);
  }
  if (timer.pausedRemainingMs !== null) {
    return Math.max(0, timer.pausedRemainingMs);
  }
  return Math.max(0, timer.durationMinutes * 60_000);
}

export function isTimerRunning(timer: CookingTimerState, now: number): boolean {
  return timer.endsAt !== null && timer.endsAt > now;
}

export function isTimerComplete(timer: CookingTimerState, now: number): boolean {
  if (timer.endsAt !== null) {
    return timer.endsAt <= now;
  }
  return timer.pausedRemainingMs === 0;
}

export function startTimer(
  durationMinutes: number,
  now: number,
): CookingTimerState {
  return {
    durationMinutes,
    pausedRemainingMs: null,
    endsAt: now + durationMinutes * 60_000,
  };
}

export function pauseTimer(
  timer: CookingTimerState,
  now: number,
): CookingTimerState {
  return {
    ...timer,
    endsAt: null,
    pausedRemainingMs: timerRemainingMs(timer, now),
  };
}

export function resumeTimer(
  timer: CookingTimerState,
  now: number,
): CookingTimerState {
  const remaining = timerRemainingMs(timer, now);
  if (remaining <= 0) {
    return { ...timer, endsAt: now, pausedRemainingMs: 0 };
  }
  return {
    ...timer,
    pausedRemainingMs: null,
    endsAt: now + remaining,
  };
}

export function resetTimer(durationMinutes: number): CookingTimerState {
  return {
    durationMinutes,
    endsAt: null,
    pausedRemainingMs: null,
  };
}

export function changeTimerMinutes(
  timer: CookingTimerState,
  durationMinutes: number,
  now: number,
): CookingTimerState {
  const minutes = Math.max(1, durationMinutes);
  if (timer.endsAt !== null && timer.endsAt > now) {
    return {
      durationMinutes: minutes,
      pausedRemainingMs: null,
      endsAt: now + minutes * 60_000,
    };
  }
  if (timer.pausedRemainingMs !== null) {
    return {
      durationMinutes: minutes,
      endsAt: null,
      pausedRemainingMs: minutes * 60_000,
    };
  }
  return resetTimer(minutes);
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function otherRunningTimerCount(
  timers: Record<string, CookingTimerState>,
  currentStepId: string,
  now: number,
): number {
  return Object.entries(timers).filter(
    ([stepId, timer]) => stepId !== currentStepId && isTimerRunning(timer, now),
  ).length;
}
