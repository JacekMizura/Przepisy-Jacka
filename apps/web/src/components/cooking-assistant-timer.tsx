"use client";

import { Pause, Play, RotateCcw } from "lucide-react";

import type { CookingTimerState } from "@/lib/cooking-session";
import {
  formatCountdown,
  isTimerComplete,
  isTimerRunning,
  timerRemainingMs,
} from "@/lib/cooking-timer";
import { cn } from "@/lib/utils";

type TimerCardProps = {
  durationMinutes: number;
  timer: CookingTimerState | undefined;
  now: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
};

export function CookingAssistantTimer({
  durationMinutes,
  timer,
  now,
  onStart,
  onPause,
  onResume,
  onReset,
}: TimerCardProps) {
  const remaining = timer
    ? timerRemainingMs(timer, now)
    : durationMinutes * 60_000;
  const running = timer ? isTimerRunning(timer, now) : false;
  const complete = timer ? isTimerComplete(timer, now) : false;
  const started = Boolean(
    timer && (timer.endsAt !== null || timer.pausedRemainingMs !== null),
  );

  return (
    <div
      className={cn(
        "mb-4 rounded-xl border p-4",
        complete
          ? "border-emerald-200 bg-emerald-50"
          : "border-stone-200 bg-stone-50",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wider text-stone-400 uppercase">
            Timer kroku
          </p>
          <p className="font-mono text-2xl font-semibold text-stone-900">
            {complete ? "Koniec" : formatCountdown(remaining)}
          </p>
        </div>
        <div className="flex gap-1">
          {!started || complete ? (
            <button
              type="button"
              className="flex h-11 min-w-11 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-sm font-medium text-white"
              onClick={onStart}
            >
              <Play size={14} aria-hidden />
              Uruchom timer
            </button>
          ) : (
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-stone-700"
              aria-label={running ? "Wstrzymaj timer" : "Wznów timer"}
              onClick={running ? onPause : onResume}
            >
              {running ? (
                <Pause size={16} aria-hidden />
              ) : (
                <Play size={16} aria-hidden />
              )}
            </button>
          )}
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-stone-700"
            aria-label="Resetuj timer"
            onClick={onReset}
          >
            <RotateCcw size={16} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
