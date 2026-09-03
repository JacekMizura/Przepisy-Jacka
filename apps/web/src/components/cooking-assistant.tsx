"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  ALargeSmall,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChefHat,
  CookingPot,
  Lightbulb,
  ShoppingBasket,
  Timer,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { CookingAssistantTimer } from "@/components/cooking-assistant-timer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  clearCookingSession,
  cookingSessionKey,
  emptyCookingSession,
  loadCookingSession,
  loadCookingTextSize,
  resumeStepNumber,
  sanitizeCookingSession,
  saveCookingSession,
  saveCookingTextSize,
  shouldOfferResume,
  type CookingSession,
  type CookingTextSize,
  type CookingTimerState,
} from "@/lib/cooking-session";
import {
  isTimerComplete,
  otherRunningTimerCount,
  pauseTimer,
  resetTimer,
  resumeTimer,
  startTimer,
} from "@/lib/cooking-timer";
import { mediaDisplayUrl } from "@/lib/media-upload";
import {
  formatRecipeIngredientQuantity,
  formatServings,
} from "@/lib/recipe-labels";
import { cn } from "@/lib/utils";

type Step = components["schemas"]["RecipeStepDto"];
type Ingredient = components["schemas"]["RecipeIngredientDto"];
type Availability =
  components["schemas"]["RecipeIngredientAvailabilityDto"];

type CookingAssistantProps = {
  userId: string;
  kitchenId: string;
  recipeId: string;
  recipeUpdatedAt: string;
  recipeName: string;
  steps: Step[];
  ingredients: Ingredient[];
  servings: number;
  onServingsDelta: (delta: number) => void;
  completedStepIds: Set<string>;
  onCompletedStepIdsChange: (next: Set<string>) => void;
  checkedIngredientIds: Set<string>;
  onCheckedIngredientIdsChange: (next: Set<string>) => void;
  availabilityByIngredientId: Map<string, Availability>;
  onPreviewImage: (src: string, alt: string) => void;
};

const TEXT_CYCLE: CookingTextSize[] = ["standard", "large", "xlarge"];
const TEXT_CLASS: Record<CookingTextSize, string> = {
  standard: "text-[15px] leading-relaxed",
  large: "text-lg leading-relaxed",
  xlarge: "text-xl leading-loose",
};

export function CookingAssistant(props: CookingAssistantProps) {
  const {
    userId,
    kitchenId,
    recipeId,
    recipeUpdatedAt,
    recipeName,
    steps,
    ingredients,
    servings,
    onServingsDelta,
    completedStepIds,
    onCompletedStepIdsChange,
    checkedIngredientIds,
    onCheckedIngredientIdsChange,
    availabilityByIngredientId,
    onPreviewImage,
  } = props;

  const sortedSteps = useMemo(
    () => steps.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [steps],
  );
  const stepIds = useMemo(() => sortedSteps.map((s) => s.id), [sortedSteps]);
  const ingredientIdList = useMemo(
    () => ingredients.map((i) => i.id),
    [ingredients],
  );
  const storageKey = cookingSessionKey(userId, kitchenId, recipeId);
  const titleId = useId();
  const fabRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navRef = useRef({
    closePanel: () => {},
    goNext: () => {},
    goPrev: () => {},
  });
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const originalTitleRef = useRef<string | null>(null);

  const [open, setOpen] = useState(false);
  const [resumePrompt, setResumePrompt] = useState(false);
  const [servingsDelta, setServingsDelta] = useState<number | null>(null);
  const [finishedView, setFinishedView] = useState(false);
  const [textSize, setTextSize] = useState<CookingTextSize>("standard");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timers, setTimers] = useState<Record<string, CookingTimerState>>({});
  const [now, setNow] = useState(() => Date.now());
  const [wakeLockWanted, setWakeLockWanted] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [started, setStarted] = useState(false);

  const currentStep = sortedSteps[currentIndex] ?? null;
  const total = sortedSteps.length;
  const progressPct = total === 0 ? 0 : ((currentIndex + 1) / total) * 100;

  const persist = useCallback(
    (patch: Partial<CookingSession> = {}) => {
      const base = sanitizeCookingSession(
        loadCookingSession(storageKey) ?? emptyCookingSession(),
        stepIds,
        ingredientIdList,
        recipeUpdatedAt,
      );
      saveCookingSession(storageKey, {
        ...base,
        ...patch,
        recipeUpdatedAt,
        currentStepId:
          patch.currentStepId ?? currentStep?.id ?? base.currentStepId,
        completedStepIds: patch.completedStepIds ?? [...completedStepIds],
        checkedIngredientIds:
          patch.checkedIngredientIds ?? [...checkedIngredientIds],
        timers: patch.timers ?? timers,
        started: patch.started ?? true,
        finished: patch.finished ?? finishedView,
      });
    },
    [
      checkedIngredientIds,
      completedStepIds,
      currentStep?.id,
      finishedView,
      ingredientIdList,
      recipeUpdatedAt,
      stepIds,
      storageKey,
      timers,
    ],
  );

  useEffect(() => {
    const running = Object.values(timers).some(
      (timer) => timer.endsAt !== null && timer.endsAt > Date.now(),
    );
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [timers]);

  useEffect(() => {
    if (!open || !started) return;
    persist({ currentStepId: currentStep?.id ?? null });
  }, [
    checkedIngredientIds,
    completedStepIds,
    currentIndex,
    currentStep?.id,
    open,
    persist,
    started,
    timers,
  ]);

  useEffect(() => {
    const stored = loadCookingSession(storageKey);
    if (!stored) return;
    const clean = sanitizeCookingSession(
      stored,
      stepIds,
      ingredientIdList,
      recipeUpdatedAt,
    );
    if (!shouldOfferResume(clean)) return;
    const frame = window.requestAnimationFrame(() => {
      setResumePrompt(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ingredientIdList, recipeUpdatedAt, stepIds, storageKey]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTextSize(loadCookingTextSize());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    const prev = document.body.style.overflow;
    if (mobile) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = panelRef.current;
    if (!root) return;
    function onTab(event: KeyboardEvent) {
      if (event.key !== "Tab" || !root) return;
      const nodes = [
        ...root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((node) => node.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    root.addEventListener("keydown", onTab);
    return () => root.removeEventListener("keydown", onTab);
  }, [open, currentIndex, finishedView]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [currentIndex, finishedView]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        navRef.current.closePanel();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        navRef.current.goNext();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navRef.current.goPrev();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    const done = Object.values(timers).some((timer) =>
      isTimerComplete(timer, now),
    );
    if (!done) return;
    if (document.visibilityState === "hidden" || !open) {
      if (originalTitleRef.current === null) {
        originalTitleRef.current = document.title;
      }
      document.title = `Timer zakończony — ${recipeName}`;
    }
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification(`Timer zakończony — ${recipeName}`);
      } catch {
        // ignore
      }
    }
  }, [now, open, recipeName, timers]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") {
        if (originalTitleRef.current !== null) {
          document.title = originalTitleRef.current;
          originalTitleRef.current = null;
        }
        if (wakeLockWanted) void acquireWakeLock();
        return;
      }
      void releaseWakeLock(false);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void releaseWakeLock(false);
    };
  }, [wakeLockWanted]);

  async function acquireWakeLock(): Promise<boolean> {
    if (!("wakeLock" in navigator)) {
      setWakeLockActive(false);
      return false;
    }
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setWakeLockActive(true);
      return true;
    } catch {
      setWakeLockActive(false);
      return false;
    }
  }

  async function releaseWakeLock(clearWanted: boolean): Promise<void> {
    try {
      await wakeLockRef.current?.release();
    } catch {
      // ignore
    }
    wakeLockRef.current = null;
    setWakeLockActive(false);
    if (clearWanted) setWakeLockWanted(false);
  }

  function applySession(session: CookingSession, fresh: boolean) {
    const clean = sanitizeCookingSession(session, stepIds, ingredientIdList, recipeUpdatedAt);
    if (fresh) {
      onCompletedStepIdsChange(new Set());
      onCheckedIngredientIdsChange(new Set());
      setTimers({});
      setCurrentIndex(0);
      setFinishedView(false);
      setStarted(true);
      persist({
        started: true,
        finished: false,
        recipeUpdatedAt,
        currentStepId: stepIds[0] ?? null,
        completedStepIds: [],
        checkedIngredientIds: [],
        timers: {},
      });
      return;
    }
    setCurrentIndex(
      clean.currentStepId
        ? Math.max(0, stepIds.indexOf(clean.currentStepId))
        : 0,
    );
    setTimers(clean.timers);
    setFinishedView(clean.finished);
    setStarted(true);
    onCompletedStepIdsChange(new Set(clean.completedStepIds));
    onCheckedIngredientIdsChange(new Set(clean.checkedIngredientIds));
  }

  function openPanel() {
    const stored = loadCookingSession(storageKey);
    const clean = stored
      ? sanitizeCookingSession(stored, stepIds, ingredientIdList, recipeUpdatedAt)
      : null;
    if (clean && shouldOfferResume(clean)) {
      setResumePrompt(true);
      return;
    }
    applySession(clean ?? emptyCookingSession(), !(clean?.started));
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
    void releaseWakeLock(true);
    if (originalTitleRef.current !== null) {
      document.title = originalTitleRef.current;
      originalTitleRef.current = null;
    }
    window.setTimeout(() => fabRef.current?.focus(), 0);
  }

  function goPrev() {
    if (currentIndex <= 0 || !currentStep) return;
    const next = new Set(completedStepIds);
    next.delete(currentStep.id);
    onCompletedStepIdsChange(next);
    setFinishedView(false);
    setCurrentIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    if (!currentStep) return;
    const nextDone = new Set(completedStepIds);
    nextDone.add(currentStep.id);
    onCompletedStepIdsChange(nextDone);
    if (currentIndex >= total - 1) {
      setFinishedView(true);
      persist({ finished: true, completedStepIds: [...nextDone] });
      return;
    }
    setCurrentIndex((i) => i + 1);
  }

  navRef.current = { closePanel, goNext, goPrev };

  async function handleStartTimer() {
    if (!currentStep?.durationMinutes) return;
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
    setTimers((current) => ({
      ...current,
      [currentStep.id]: startTimer(currentStep.durationMinutes ?? 1, Date.now()),
    }));
  }

  const assigned = useMemo(() => {
    const ids = new Set(currentStep?.ingredientIds ?? []);
    return ingredients
      .filter((ingredient) => ids.has(ingredient.id))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [currentStep?.ingredientIds, ingredients]);

  const otherTimers = currentStep
    ? otherRunningTimerCount(timers, currentStep.id, now)
    : 0;

  if (sortedSteps.length === 0) return null;

  const completedCount = completedStepIds.size;
  const completedLabel =
    completedCount === 1
      ? "krok"
      : completedCount >= 2 && completedCount <= 4
        ? "kroki"
        : "kroków";

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className={cn(
          "fixed z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_10px_40px_-10px_rgba(34,197,94,0.6)] transition-all hover:scale-105 hover:bg-emerald-700 motion-reduce:transition-none motion-reduce:hover:scale-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none",
          "right-6 bottom-[max(1.5rem,env(safe-area-inset-bottom))] lg:right-10 lg:bottom-10",
          open && "pointer-events-none scale-0 opacity-0",
        )}
        aria-label="Uruchom asystenta gotowania"
        onClick={openPanel}
      >
        <CookingPot size={24} aria-hidden />
      </button>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-[60] bg-black/40 lg:pointer-events-none lg:bg-transparent"
          aria-label="Zamknij asystenta gotowania"
          onClick={closePanel}
        />
      ) : null}

      <div
        ref={panelRef}
        role="dialog"
        aria-modal={open ? true : undefined}
        aria-hidden={!open}
        inert={!open || undefined}
        aria-labelledby={titleId}
        className={cn(
          "fixed z-[70] flex flex-col overflow-hidden border border-stone-200 bg-white transition-transform duration-300 motion-reduce:transition-none",
          "inset-x-0 bottom-0 top-3 max-h-[100dvh] rounded-t-3xl lg:inset-auto lg:right-6 lg:bottom-6 lg:h-[min(650px,calc(100dvh-3rem))] lg:w-[420px] lg:rounded-2xl",
          "shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.1)] lg:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)]",
          open
            ? "translate-y-0 lg:translate-x-0"
            : "invisible translate-y-full lg:visible lg:translate-y-0 lg:translate-x-[120%] motion-reduce:lg:invisible motion-reduce:lg:translate-x-0",
          !open && "pointer-events-none",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-100 bg-stone-50/80 px-4 py-3 backdrop-blur-sm">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <ChefHat size={16} aria-hidden />
            </div>
            <div className="min-w-0">
              <h2
                ref={headingRef}
                id={titleId}
                tabIndex={-1}
                className="font-semibold leading-tight text-stone-900 outline-none"
              >
                Asystent gotowania
              </h2>
              <p
                aria-live="polite"
                className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold tracking-wider text-stone-400 uppercase"
              >
                Krok
                <span className="rounded border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-600 normal-case">
                  {finishedView
                    ? `${total} z ${total}`
                    : `${currentIndex + 1} z ${total}`}
                </span>
                {otherTimers > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800 normal-case">
                    <Timer size={10} aria-hidden />
                    {otherTimers}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-200 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
              aria-label="Zmień rozmiar tekstu"
              onClick={() => {
                const idx = TEXT_CYCLE.indexOf(textSize);
                const next =
                  TEXT_CYCLE[(idx + 1) % TEXT_CYCLE.length] ?? "standard";
                setTextSize(next);
                saveCookingTextSize(next);
              }}
            >
              <ALargeSmall size={18} aria-hidden />
            </button>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-200 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
              aria-label="Zamknij asystenta gotowania"
              onClick={closePanel}
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>

        <div
          className="h-1.5 w-full shrink-0 bg-stone-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
          aria-label={`Postęp: krok ${currentIndex + 1} z ${total}`}
        >
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div
          ref={contentRef}
          className="relative min-h-0 flex-1 overflow-y-auto bg-white p-5 sm:p-6"
        >
          {finishedView ? (
            <div className="flex h-full flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 size={56} className="text-emerald-500" aria-hidden />
              <p className="mt-4 text-2xl font-semibold text-stone-900">Gotowe!</p>
              <p className="mt-2 text-sm text-stone-500">
                Ukończono {completedCount} {completedLabel}.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <Button
                  type="button"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={closePanel}
                >
                  Zamknij
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    applySession(emptyCookingSession(), true);
                    setOpen(true);
                  }}
                >
                  Zacznij od początku
                </Button>
              </div>
            </div>
          ) : currentStep ? (
            <>
              <h3 className="mb-3 text-xl leading-tight font-semibold text-stone-900">
                {currentStep.title?.trim() || `Krok ${currentIndex + 1}`}
              </h3>
              {mediaDisplayUrl(currentStep.image) ? (
                <button
                  type="button"
                  className="mb-4 block w-full overflow-hidden rounded-xl border border-stone-200"
                  onClick={() => {
                    const src = mediaDisplayUrl(currentStep.image);
                    if (src) {
                      onPreviewImage(
                        src,
                        currentStep.title?.trim() || `Krok ${currentIndex + 1}`,
                      );
                    }
                  }}
                  aria-label="Powiększ zdjęcie kroku"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaDisplayUrl(currentStep.image) ?? ""}
                    alt=""
                    className="aspect-[16/10] w-full object-cover"
                  />
                </button>
              ) : null}
              <p
                className={cn(
                  "mb-4 whitespace-pre-wrap text-stone-600",
                  TEXT_CLASS[textSize],
                )}
              >
                {currentStep.instruction}
              </p>
              {currentStep.tip?.trim() ? (
                <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
                  <Lightbulb size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span className="whitespace-pre-wrap">{currentStep.tip}</span>
                </p>
              ) : null}
              {currentStep.durationMinutes ? (
                <CookingAssistantTimer
                  durationMinutes={currentStep.durationMinutes}
                  timer={timers[currentStep.id]}
                  now={now}
                  onStart={() => void handleStartTimer()}
                  onPause={() =>
                    setTimers((current) => {
                      const existing = current[currentStep.id];
                      if (!existing) return current;
                      return {
                        ...current,
                        [currentStep.id]: pauseTimer(existing, Date.now()),
                      };
                    })
                  }
                  onResume={() =>
                    setTimers((current) => {
                      const existing = current[currentStep.id];
                      if (!existing) return current;
                      return {
                        ...current,
                        [currentStep.id]: resumeTimer(existing, Date.now()),
                      };
                    })
                  }
                  onReset={() =>
                    setTimers((current) => ({
                      ...current,
                      [currentStep.id]: resetTimer(
                        currentStep.durationMinutes ?? 1,
                      ),
                    }))
                  }
                />
              ) : null}
              <div className="mt-6 border-t border-stone-100 pt-6">
                <h4 className="mb-3 flex items-center gap-2 text-xs font-bold tracking-wider text-stone-400 uppercase">
                  <ShoppingBasket size={14} aria-hidden />
                  Potrzebne teraz
                </h4>
                {assigned.length === 0 ? (
                  <p className="text-sm text-stone-500">
                    Brak składników przypisanych do tego kroku
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {assigned.map((ingredient) => {
                      const availability = availabilityByIngredientId.get(
                        ingredient.id,
                      );
                      const quantity =
                        availability?.scaledQuantity ?? ingredient.quantity;
                      const unit = availability?.unit ?? ingredient.unit;
                      const checked = checkedIngredientIds.has(ingredient.id);
                      const descriptive =
                        unit === "to_taste" || unit === "pinch" || !quantity;
                      return (
                        <li
                          key={ingredient.id}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 shadow-sm",
                            checked && "opacity-60 grayscale-[0.5]",
                          )}
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-sm font-bold text-emerald-600">
                            {descriptive
                              ? "±"
                              : formatRecipeIngredientQuantity(
                                  quantity,
                                  unit,
                                ).replace(/\s.+$/, "")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-stone-800">
                              {ingredient.name}
                            </span>
                            <span className="block text-[11px] text-stone-500">
                              {ingredient.note?.trim() ||
                                formatRecipeIngredientQuantity(quantity, unit)}
                            </span>
                          </div>
                          <button
                            type="button"
                            className={cn(
                              "flex h-11 w-11 items-center justify-center rounded-full border",
                              checked
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-stone-200 bg-white text-stone-300 hover:border-emerald-400 hover:text-emerald-500",
                            )}
                            aria-label={
                              checked
                                ? `Odznacz ${ingredient.name}`
                                : `Zaznacz ${ingredient.name}`
                            }
                            onClick={() => {
                              const next = new Set(checkedIngredientIds);
                              if (next.has(ingredient.id)) next.delete(ingredient.id);
                              else next.add(ingredient.id);
                              onCheckedIngredientIdsChange(next);
                            }}
                          >
                            <Check size={14} aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                <div className="flex items-center gap-2">
                  <span>{formatServings(servings)}</span>
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-200 font-bold hover:bg-stone-100 disabled:opacity-40"
                    aria-label="Zmniejsz liczbę porcji"
                    disabled={servings <= 1}
                    onClick={() => setServingsDelta(-1)}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-200 font-bold hover:bg-stone-100"
                    aria-label="Zwiększ liczbę porcji"
                    onClick={() => setServingsDelta(1)}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className={cn(
                    "min-h-11 rounded-lg px-3 font-medium hover:bg-stone-100",
                    wakeLockActive && "text-emerald-700",
                  )}
                  onClick={async () => {
                    if (wakeLockWanted) {
                      await releaseWakeLock(true);
                      return;
                    }
                    const ok = await acquireWakeLock();
                    setWakeLockWanted(ok);
                  }}
                >
                  {wakeLockActive ? "Ekran włączony" : "Nie wygaszaj ekranu"}
                </button>
              </div>
            </>
          ) : null}
        </div>

        {!finishedView ? (
          <div className="relative z-10 flex shrink-0 gap-3 border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.05)]">
            <button
              type="button"
              className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-600 hover:bg-stone-200 disabled:opacity-40"
              aria-label="Poprzedni krok"
              disabled={currentIndex === 0}
              onClick={goPrev}
            >
              <ArrowLeft size={18} aria-hidden />
            </button>
            <button
              type="button"
              className="flex h-12 min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-medium text-white hover:bg-emerald-700"
              onClick={goNext}
            >
              {currentIndex >= total - 1 ? "Zakończ gotowanie" : "Następny krok"}
            </button>
          </div>
        ) : null}
      </div>

      {resumePrompt ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => setResumePrompt(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="resume-cooking-title"
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="resume-cooking-title" className="text-lg font-semibold">
              Kontynuować gotowanie?
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              Masz rozpoczęte gotowanie — kontynuować od kroku{" "}
              {resumeStepNumber(
                sanitizeCookingSession(
                  loadCookingSession(storageKey) ?? emptyCookingSession(),
                  stepIds,
                  ingredientIdList,
                  recipeUpdatedAt,
                ),
                stepIds,
              )}
              ?
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  clearCookingSession(storageKey);
                  applySession(emptyCookingSession(), true);
                  setResumePrompt(false);
                  setOpen(true);
                }}
              >
                Zacznij od początku
              </Button>
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  applySession(
                    loadCookingSession(storageKey) ?? emptyCookingSession(),
                    false,
                  );
                  setResumePrompt(false);
                  setOpen(true);
                }}
              >
                Kontynuuj
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {servingsDelta !== null ? (
        <ConfirmDialog
          title="Zmienić liczbę porcji?"
          description="Zmiana porcji zaktualizuje ilości składników na liście i w asystencie."
          confirmLabel="Zmień porcje"
          confirmVariant="amber"
          onConfirm={() => {
            onServingsDelta(servingsDelta);
            setServingsDelta(null);
          }}
          onCancel={() => setServingsDelta(null)}
        />
      ) : null}
    </>
  );
}
