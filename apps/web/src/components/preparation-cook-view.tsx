"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  changeTimerMinutes,
  formatCountdown,
  isTimerComplete,
  isTimerRunning,
  pauseTimer,
  resetTimer,
  resumeTimer,
  startTimer,
  timerRemainingMs,
} from "@/lib/cooking-timer";
import { mediaDisplayUrl } from "@/lib/media-upload";
import {
  blockedReason,
  classifyPrepSteps,
  formatDependsOnPreview,
  stepLabel,
  suggestReadyStep,
  timerMinutesForStep,
  type PrepStepRef,
} from "@/lib/prep-plan";
import {
  clearPrepSession,
  emptyPrepSession,
  loadPrepSession,
  prepSessionKey,
  sanitizePrepSession,
  savePrepSession,
  shouldOfferPrepResume,
  type PrepSession,
} from "@/lib/prep-session";
import {
  formatRecipeIngredientQuantity,
  formatServings,
} from "@/lib/recipe-labels";
import { cn } from "@/lib/utils";

type Recipe = components["schemas"]["RecipeDetailDto"];
type Step = components["schemas"]["RecipeStepDto"];
type Availability =
  components["schemas"]["RecipeIngredientAvailabilityDto"];

type PreparationCookViewProps = {
  userId: string;
  kitchenId: string;
  recipe: Recipe;
  availabilityByIngredientId: Map<string, Availability>;
  onPreviewImage: (src: string, alt: string) => void;
};

function uniquePush(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

export function PreparationCookView({
  userId,
  kitchenId,
  recipe,
  availabilityByIngredientId,
  onPreviewImage,
}: PreparationCookViewProps) {
  const recipeHref = `/kitchens/${kitchenId}/recipes/${recipe.id}`;
  const storageKey = prepSessionKey(userId, kitchenId, recipe.id);
  const steps = useMemo(
    () => recipe.steps.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [recipe.steps],
  );
  const refs = steps as PrepStepRef[];
  const stepIds = useMemo(() => steps.map((step) => step.id), [steps]);
  const ingredientIds = useMemo(
    () => recipe.ingredients.map((item) => item.id),
    [recipe.ingredients],
  );

  const [session, setSession] = useState<PrepSession>(() =>
    emptyPrepSession(recipe.servings),
  );
  const [resumeOpen, setResumeOpen] = useState(false);
  const [forceStartId, setForceStartId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [wakeWanted, setWakeWanted] = useState(false);
  const [wakeActive, setWakeActive] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const originalTitleRef = useRef<string | null>(null);

  const persist = useCallback(
    (next: PrepSession) => {
      savePrepSession(storageKey, {
        ...next,
        recipeUpdatedAt: recipe.updatedAt,
      });
    },
    [recipe.updatedAt, storageKey],
  );

  const patchSession = useCallback(
    (updater: (current: PrepSession) => PrepSession) => {
      setSession((current) => {
        const next = updater(current);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = loadPrepSession(storageKey);
      if (!stored) {
        setSession(emptyPrepSession(recipe.servings));
        return;
      }
      const clean = sanitizePrepSession(
        stored,
        stepIds,
        ingredientIds,
        recipe.updatedAt,
        recipe.servings,
      );
      setSession(clean);
      if (shouldOfferPrepResume(clean)) {
        setResumeOpen(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ingredientIds, recipe.servings, recipe.updatedAt, stepIds, storageKey]);

  useEffect(() => {
    const running = Object.values(session.timers).some(
      (timer) => timer.endsAt !== null && timer.endsAt > Date.now(),
    );
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [session.timers]);

  useEffect(() => {
    const done = Object.values(session.timers).some((timer) =>
      isTimerComplete(timer, now),
    );
    if (!done) return;
    if (document.visibilityState === "hidden") {
      originalTitleRef.current ??= document.title;
      document.title = `Timer zakończony — ${recipe.name}`;
    }
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification(`Timer zakończony — ${recipe.name}`);
      } catch {
        // ignore
      }
    }
  }, [now, recipe.name, session.timers]);

  async function acquireWakeLock(): Promise<boolean> {
    if (!("wakeLock" in navigator)) {
      setWakeActive(false);
      return false;
    }
    try {
      wakeRef.current = await navigator.wakeLock.request("screen");
      setWakeActive(true);
      return true;
    } catch {
      setWakeActive(false);
      return false;
    }
  }

  async function releaseWakeLock(clearWanted: boolean): Promise<void> {
    try {
      await wakeRef.current?.release();
    } catch {
      // ignore
    }
    wakeRef.current = null;
    setWakeActive(false);
    if (clearWanted) setWakeWanted(false);
  }

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") {
        if (originalTitleRef.current !== null) {
          document.title = originalTitleRef.current;
          originalTitleRef.current = null;
        }
        if (wakeWanted) void acquireWakeLock();
        return;
      }
      void releaseWakeLock(false);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void releaseWakeLock(false);
    };
  }, [wakeWanted]);

  const startedSet = useMemo(
    () => new Set(session.startedStepIds),
    [session.startedStepIds],
  );
  const completedSet = useMemo(
    () => new Set(session.completedStepIds),
    [session.completedStepIds],
  );
  const pausedSet = useMemo(
    () => new Set(session.pausedStepIds),
    [session.pausedStepIds],
  );
  const classified = useMemo(
    () => classifyPrepSteps(refs, startedSet, completedSet),
    [completedSet, refs, startedSet],
  );
  const suggestion = useMemo(
    () =>
      suggestReadyStep(
        classified.ready,
        classified.inProgress,
        session.timers,
        now,
      ),
    [classified.inProgress, classified.ready, now, session.timers],
  );

  const progressPct =
    steps.length === 0
      ? 0
      : Math.round((session.completedStepIds.length / steps.length) * 100);
  const elapsedMs =
    session.startedAt > 0 ? Math.max(0, now - session.startedAt) : 0;
  const activeTimers = Object.entries(session.timers).filter(([, timer]) =>
    isTimerRunning(timer, now),
  );

  function ensureStarted(current: PrepSession, startedAt: number): PrepSession {
    return current.startedAt > 0
      ? current
      : { ...current, startedAt };
  }

  function startStep(stepId: string, force: boolean) {
    const step = refs.find((item) => item.id === stepId);
    if (!step || completedSet.has(stepId)) return;
    if (!force && !startedSet.has(stepId)) {
      const blocked = step.dependsOnStepIds.some((id) => !completedSet.has(id));
      if (blocked) {
        setForceStartId(stepId);
        return;
      }
    }
    patchSession((current) => {
      const next = ensureStarted(current, Date.now());
      const minutes = timerMinutesForStep(step);
      const timers = { ...next.timers };
      if (minutes && !timers[stepId]) timers[stepId] = resetTimer(minutes);
      return {
        ...next,
        startedStepIds: uniquePush(next.startedStepIds, stepId),
        pausedStepIds: next.pausedStepIds.filter((id) => id !== stepId),
        completedStepIds: next.completedStepIds.filter((id) => id !== stepId),
        timers,
        finished: false,
      };
    });
  }

  function completeStep(stepId: string) {
    patchSession((current) => {
      const completed = uniquePush(current.completedStepIds, stepId);
      return {
        ...ensureStarted(current, Date.now()),
        startedStepIds: current.startedStepIds.filter((id) => id !== stepId),
        pausedStepIds: current.pausedStepIds.filter((id) => id !== stepId),
        completedStepIds: completed,
        finished: completed.length === stepIds.length,
      };
    });
  }

  function undoComplete(stepId: string) {
    patchSession((current) => {
      const completed = new Set(
        current.completedStepIds.filter((id) => id !== stepId),
      );
      const blockedNow = new Set(
        refs
          .filter((step) =>
            step.dependsOnStepIds.some((id) => !completed.has(id)),
          )
          .map((step) => step.id),
      );
      return {
        ...current,
        completedStepIds: [...completed],
        startedStepIds: current.startedStepIds.filter(
          (id) => id === stepId || !blockedNow.has(id),
        ),
        finished: false,
      };
    });
  }

  function restart() {
    const fresh = emptyPrepSession(recipe.servings);
    clearPrepSession(storageKey);
    setSession(fresh);
    setResumeOpen(false);
  }

  if (!recipe.preparationPlanEnabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg font-semibold text-stone-900">
          Ten przepis nie ma jeszcze planu przygotowania
        </p>
        <p className="mt-2 text-sm text-stone-500">
          Tradycyjny widok i Asystent gotowania nadal działają.
        </p>
        <Link
          href={recipeHref}
          className="mt-6 inline-flex h-11 items-center rounded-xl border border-stone-200 px-4 text-sm"
        >
          Wróć do przepisu
        </Link>
      </div>
    );
  }

  if (session.finished && session.completedStepIds.length === steps.length) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-6 text-center">
        <CheckCircle2 size={56} className="text-emerald-500" aria-hidden />
        <p className="mt-4 text-2xl font-semibold text-stone-900">Gotowe!</p>
        <p className="mt-2 font-medium text-stone-800">{recipe.name}</p>
        <p className="mt-2 text-sm text-stone-500">
          Czas sesji {formatCountdown(elapsedMs)}. Ukończono{" "}
          {session.completedStepIds.length} czynności.
        </p>
        <div className="mt-6 flex w-full flex-col gap-2">
          <Link
            href={recipeHref}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-6 text-sm font-medium text-white"
          >
            Wróć do przepisu
          </Link>
          <Button variant="outline" onClick={restart}>
            Zacznij ponownie
          </Button>
        </div>
      </div>
    );
  }

  const forceStep = refs.find((step) => step.id === forceStartId);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-stone-50">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <Link
            href={recipeHref}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-200"
            aria-label="Wróć do tradycyjnego przepisu"
          >
            <ArrowLeft size={18} aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold tracking-wider text-stone-400 uppercase">
              Tryb przygotowania
            </p>
            <h1 className="truncate text-lg font-semibold">{recipe.name}</h1>
          </div>
          <span className="text-sm text-stone-500">
            {formatServings(session.servings)}
          </span>
          <span className="text-sm tabular-nums text-stone-500">
            {session.startedAt > 0 ? formatCountdown(elapsedMs) : "00:00"}
          </span>
          <Link
            href={recipeHref}
            className="inline-flex h-11 items-center rounded-xl border border-stone-200 px-3 text-sm font-medium"
          >
            Zakończ przygotowanie
          </Link>
        </div>
        <div
          className="mx-auto mt-3 h-1.5 max-w-5xl overflow-hidden rounded-full bg-stone-100"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Postęp: ${session.completedStepIds.length} z ${steps.length}`}
        >
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {activeTimers.length > 0 ? (
          <ul className="mx-auto mt-3 flex max-w-5xl flex-wrap gap-2">
            {activeTimers.map(([stepId, timer]) => {
              const index = steps.findIndex((item) => item.id === stepId);
              const step = refs[index];
              return (
                <li
                  key={stepId}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900"
                >
                  <Timer size={12} aria-hidden />
                  {step ? stepLabel(step, index) : "Timer"}{" "}
                  {formatCountdown(timerRemainingMs(timer, now))}
                </li>
              );
            })}
          </ul>
        ) : null}
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-5 pb-24 md:px-6">
        {suggestion.hint ? (
          <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {suggestion.hint}
          </p>
        ) : null}

        <section>
          <h2 className="mb-3 text-sm font-bold tracking-wider text-stone-400 uppercase">
            W trakcie
          </h2>
          {classified.inProgress.length === 0 ? (
            <p className="text-sm text-stone-500">Brak rozpoczętych czynności.</p>
          ) : (
            <div className="grid gap-4">
              {classified.inProgress.map((step) => {
                const full = steps.find((item) => item.id === step.id)!;
                const index = steps.findIndex((item) => item.id === step.id);
                return (
                  <InProgressCard
                    key={step.id}
                    step={full}
                    index={index}
                    refs={refs}
                    recipe={recipe}
                    availabilityByIngredientId={availabilityByIngredientId}
                    checkedIds={new Set(session.checkedIngredientIds)}
                    paused={pausedSet.has(step.id)}
                    timer={session.timers[step.id]}
                    now={now}
                    onPreviewImage={onPreviewImage}
                    onToggleIngredient={(id) =>
                      patchSession((current) => {
                        const next = new Set(current.checkedIngredientIds);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return {
                          ...current,
                          checkedIngredientIds: [...next],
                        };
                      })
                    }
                    onComplete={() => completeStep(step.id)}
                    onPause={() =>
                      patchSession((current) => ({
                        ...current,
                        pausedStepIds: uniquePush(
                          current.pausedStepIds,
                          step.id,
                        ),
                      }))
                    }
                    onResume={() =>
                      patchSession((current) => ({
                        ...current,
                        pausedStepIds: current.pausedStepIds.filter(
                          (id) => id !== step.id,
                        ),
                      }))
                    }
                    onCancel={() =>
                      patchSession((current) => ({
                        ...current,
                        startedStepIds: current.startedStepIds.filter(
                          (id) => id !== step.id,
                        ),
                        pausedStepIds: current.pausedStepIds.filter(
                          (id) => id !== step.id,
                        ),
                      }))
                    }
                    onTimer={(next) =>
                      patchSession((current) => ({
                        ...current,
                        timers: { ...current.timers, [step.id]: next },
                      }))
                    }
                  />
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold tracking-wider text-stone-400 uppercase">
            Możesz zrobić teraz
          </h2>
          {classified.ready.length === 0 ? (
            <p className="text-sm text-stone-500">Brak odblokowanych czynności.</p>
          ) : (
            <div className="grid gap-3">
              {classified.ready.map((step) => {
                const index = steps.findIndex((item) => item.id === step.id);
                const suggested = suggestion.step?.id === step.id;
                return (
                  <article
                    key={step.id}
                    className={cn(
                      "rounded-2xl border bg-white p-4 shadow-sm",
                      suggested
                        ? "border-emerald-300 ring-2 ring-emerald-100"
                        : "border-stone-200",
                    )}
                  >
                    {suggested ? (
                      <p className="text-[10px] font-bold tracking-wider text-emerald-600 uppercase">
                        Sugerowany
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold">
                          {stepLabel(step, index)}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-sm text-stone-500">
                          {step.instruction}
                        </p>
                        <p className="mt-2 text-xs text-stone-400">
                          {[
                            step.activeWorkMinutes
                              ? `Praca ${step.activeWorkMinutes} min`
                              : null,
                            step.waitMinutes
                              ? `Oczekiwanie ${step.waitMinutes} min`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <Button
                        className="h-11"
                        onClick={() => startStep(step.id, false)}
                      >
                        Rozpocznij
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold tracking-wider text-stone-400 uppercase">
            Oczekujące
          </h2>
          {classified.blocked.length === 0 ? (
            <p className="text-sm text-stone-500">Nic nie czeka na inne kroki.</p>
          ) : (
            <ul className="space-y-3">
              {classified.blocked.map((step) => {
                const index = steps.findIndex((item) => item.id === step.id);
                return (
                  <li
                    key={step.id}
                    className="rounded-2xl border border-stone-200 bg-white p-4"
                  >
                    <h3 className="font-semibold">{stepLabel(step, index)}</h3>
                    <p className="mt-1 text-sm text-stone-500">
                      {blockedReason(step, refs, completedSet)}
                    </p>
                    <Button
                      variant="outline"
                      className="mt-3 h-11"
                      onClick={() => startStep(step.id, false)}
                    >
                      Rozpocznij mimo to
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <button
            type="button"
            className="flex min-h-11 items-center text-sm font-bold tracking-wider text-stone-400 uppercase"
            onClick={() => setDoneOpen((value) => !value)}
            aria-expanded={doneOpen}
          >
            Gotowe ({classified.done.length})
          </button>
          {doneOpen ? (
            <ul className="mt-3 space-y-2">
              {classified.done.map((step) => {
                const index = steps.findIndex((item) => item.id === step.id);
                return (
                  <li
                    key={step.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-stone-100 bg-white px-4 py-3"
                  >
                    <span className="text-sm">{stepLabel(step, index)}</span>
                    <Button
                      variant="ghost"
                      className="h-11"
                      onClick={() => undoComplete(step.id)}
                    >
                      Cofnij ukończenie
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <button
          type="button"
          className={cn(
            "min-h-11 self-start rounded-lg px-3 text-sm font-medium",
            wakeActive ? "text-emerald-700" : "text-stone-600",
          )}
          onClick={async () => {
            if (wakeWanted) {
              await releaseWakeLock(true);
              return;
            }
            setWakeWanted(await acquireWakeLock());
          }}
        >
          {wakeActive ? "Ekran włączony" : "Nie wygaszaj ekranu"}
        </button>
      </div>

      {resumeOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="prep-resume-title"
            className="w-full rounded-2xl bg-white p-6 shadow-lg sm:mx-auto sm:max-w-md"
          >
            <h2 id="prep-resume-title" className="text-lg font-semibold">
              Kontynuować przygotowanie?
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              Masz rozpoczętą sesję trybu przygotowania.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button onClick={() => setResumeOpen(false)}>Kontynuuj</Button>
              <Button variant="outline" onClick={restart}>
                Zacznij od początku
              </Button>
              <Link
                href={recipeHref}
                className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm text-stone-600 hover:bg-stone-100"
              >
                Wróć do przepisu
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {forceStartId && forceStep ? (
        <ConfirmDialog
          title="Rozpocząć mimo niespełnionych zależności?"
          description={blockedReason(forceStep, refs, completedSet)}
          confirmLabel="Rozpocznij mimo to"
          confirmVariant="amber"
          onConfirm={() => {
            const id = forceStartId;
            setForceStartId(null);
            startStep(id, true);
          }}
          onCancel={() => setForceStartId(null)}
        />
      ) : null}
    </div>
  );
}

function InProgressCard({
  step,
  index,
  refs,
  recipe,
  availabilityByIngredientId,
  checkedIds,
  paused,
  timer,
  now,
  onPreviewImage,
  onToggleIngredient,
  onComplete,
  onPause,
  onResume,
  onCancel,
  onTimer,
}: {
  step: Step;
  index: number;
  refs: PrepStepRef[];
  recipe: Recipe;
  availabilityByIngredientId: Map<string, Availability>;
  checkedIds: Set<string>;
  paused: boolean;
  timer: ReturnType<typeof resetTimer> | undefined;
  now: number;
  onPreviewImage: (src: string, alt: string) => void;
  onToggleIngredient: (id: string) => void;
  onComplete: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onTimer: (timer: ReturnType<typeof resetTimer>) => void;
}) {
  const imageUrl = mediaDisplayUrl(step.image);
  const assigned = recipe.ingredients.filter((ingredient) =>
    step.ingredientIds.includes(ingredient.id),
  );
  const minutes = timerMinutesForStep(step);
  const remaining = timer ? timerRemainingMs(timer, now) : 0;
  const running = timer ? isTimerRunning(timer, now) : false;
  const complete = timer ? isTimerComplete(timer, now) : false;
  const [editMinutes, setEditMinutes] = useState(
    String(timer?.durationMinutes ?? minutes ?? ""),
  );

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{stepLabel(step, index)}</h3>
          <p className="mt-1 text-xs text-stone-400">
            {formatDependsOnPreview(step.dependsOnStepIds, refs)}
          </p>
        </div>
        {paused ? (
          <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-bold text-stone-500 uppercase">
            Wstrzymane
          </span>
        ) : null}
      </div>
      {imageUrl ? (
        <button
          type="button"
          className="mt-3 block w-full overflow-hidden rounded-xl"
          onClick={() => onPreviewImage(imageUrl, stepLabel(step, index))}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="aspect-[16/10] w-full object-cover"
          />
        </button>
      ) : null}
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-stone-600">
        {step.instruction}
      </p>
      {step.tip?.trim() ? (
        <p className="mt-3 flex gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">
          <Lightbulb size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span className="whitespace-pre-wrap">{step.tip}</span>
        </p>
      ) : null}
      {assigned.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {assigned.map((ingredient) => {
            const availability = availabilityByIngredientId.get(ingredient.id);
            const quantity =
              availability?.scaledQuantity ?? ingredient.quantity;
            const unit = availability?.unit ?? ingredient.unit;
            const checked = checkedIds.has(ingredient.id);
            return (
              <li key={ingredient.id} className="flex items-center gap-2">
                <button
                  type="button"
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full border",
                    checked
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-stone-200",
                  )}
                  aria-label={`Zaznacz ${ingredient.name}`}
                  onClick={() => onToggleIngredient(ingredient.id)}
                >
                  <Check size={14} aria-hidden />
                </button>
                <span className={cn("text-sm", checked && "opacity-50")}>
                  {formatRecipeIngredientQuantity(quantity, unit)}{" "}
                  {ingredient.name}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-stone-400">
          Brak składników przypisanych do tego kroku
        </p>
      )}
      {minutes ? (
        <div className="mt-4 rounded-xl border border-stone-100 bg-stone-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-xl font-semibold">
              {complete
                ? "Koniec"
                : formatCountdown(remaining || minutes * 60_000)}
            </p>
            <div className="flex gap-1">
              {!timer ||
              complete ||
              (timer.endsAt === null && timer.pausedRemainingMs === null) ? (
                <button
                  type="button"
                  className="flex h-11 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-sm text-white"
                  onClick={async () => {
                    if (
                      typeof Notification !== "undefined" &&
                      Notification.permission === "default"
                    ) {
                      try {
                        await Notification.requestPermission();
                      } catch {
                        // ignore
                      }
                    }
                    onTimer(
                      startTimer(timer?.durationMinutes ?? minutes, Date.now()),
                    );
                  }}
                >
                  <Play size={14} aria-hidden />
                  Uruchom timer
                </button>
              ) : (
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-white"
                  aria-label={running ? "Wstrzymaj timer" : "Wznów timer"}
                  onClick={() =>
                    onTimer(
                      running
                        ? pauseTimer(timer, Date.now())
                        : resumeTimer(timer, Date.now()),
                    )
                  }
                >
                  {running ? <Pause size={16} /> : <Play size={16} />}
                </button>
              )}
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white"
                aria-label="Resetuj timer"
                onClick={() =>
                  onTimer(resetTimer(timer?.durationMinutes ?? minutes))
                }
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-stone-500">
            Czas (min)
            <input
              type="number"
              min={1}
              className="h-11 w-20 rounded-lg border border-stone-200 px-2 text-sm"
              value={editMinutes}
              onChange={(event) => setEditMinutes(event.target.value)}
              onBlur={() => {
                const parsed = Number(editMinutes);
                if (Number.isInteger(parsed) && parsed >= 1) {
                  onTimer(
                    changeTimerMinutes(
                      timer ?? resetTimer(parsed),
                      parsed,
                      Date.now(),
                    ),
                  );
                }
              }}
            />
          </label>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="h-11" onClick={onComplete}>
          Zakończ
        </Button>
        {paused ? (
          <Button variant="outline" className="h-11" onClick={onResume}>
            Wznów
          </Button>
        ) : (
          <Button variant="outline" className="h-11" onClick={onPause}>
            Wstrzymaj
          </Button>
        )}
        <Button variant="ghost" className="h-11" onClick={onCancel}>
          Anuluj rozpoczęcie
        </Button>
      </div>
    </article>
  );
}
