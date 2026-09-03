export type PrepStepRef = {
  id: string;
  sortOrder: number;
  title: string | null;
  instruction: string;
  activeWorkMinutes: number | null;
  waitMinutes: number | null;
  timerEnabled: boolean;
  durationMinutes: number | null;
  dependsOnStepIds: string[];
};

export type PrepStepStatus = "ready" | "blocked" | "inProgress" | "done";

export type PrepTimerSnapshot = {
  endsAt: number | null;
  pausedRemainingMs: number | null;
  durationMinutes: number;
};

export function findDependencyCycle(
  edges: Array<{ stepId: string; dependsOnStepId: string }>,
): string[] | null {
  const adjacency = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const edge of edges) {
    nodes.add(edge.stepId);
    nodes.add(edge.dependsOnStepId);
    const next = adjacency.get(edge.stepId) ?? [];
    next.push(edge.dependsOnStepId);
    adjacency.set(edge.stepId, next);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(node: string): string[] | null {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      return stack.slice(Math.max(0, start)).concat(node);
    }
    if (visited.has(node)) {
      return null;
    }
    visiting.add(node);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) {
        return cycle;
      }
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  }

  for (const node of nodes) {
    const cycle = visit(node);
    if (cycle) {
      return cycle;
    }
  }
  return null;
}

export function stepLabel(step: PrepStepRef, index: number): string {
  const title = step.title?.trim();
  if (title) {
    return title;
  }
  const firstLine = step.instruction.trim().split("\n")[0]?.trim() ?? "";
  if (firstLine) {
    return firstLine.length > 48 ? `${firstLine.slice(0, 47)}…` : firstLine;
  }
  return `Krok ${index + 1}`;
}

export function formatDependsOnPreview(
  dependsOnIds: string[],
  steps: PrepStepRef[],
): string {
  if (dependsOnIds.length === 0) {
    return "Dostępne od początku";
  }
  const labels = dependsOnIds.map((id) => {
    const index = steps.findIndex((step) => step.id === id);
    return index >= 0 ? `${index + 1}` : "?";
  });
  if (labels.length === 1) {
    return `Po kroku ${labels[0]}`;
  }
  const last = labels[labels.length - 1];
  const rest = labels.slice(0, -1).join(", ");
  return `Po krokach ${rest} i ${last}`;
}

export function blockedReason(
  step: PrepStepRef,
  steps: PrepStepRef[],
  completedIds: Set<string>,
): string {
  const pending = step.dependsOnStepIds
    .filter((id) => !completedIds.has(id))
    .map((id) => {
      const index = steps.findIndex((item) => item.id === id);
      return index >= 0 ? stepLabel(steps[index]!, index) : "inny krok";
    });
  if (pending.length === 0) {
    return "";
  }
  if (pending.length === 1) {
    return `Dostępne po ukończeniu: ${pending[0]}.`;
  }
  const last = pending[pending.length - 1];
  const rest = pending.slice(0, -1).join(", ");
  return `Dostępne po ukończeniu: ${rest} i ${last}.`;
}

export function isDependencySatisfied(
  step: PrepStepRef,
  completedIds: Set<string>,
): boolean {
  return step.dependsOnStepIds.every((id) => completedIds.has(id));
}

export function classifyPrepSteps(
  steps: PrepStepRef[],
  startedIds: Set<string>,
  completedIds: Set<string>,
): Record<PrepStepStatus, PrepStepRef[]> {
  const sorted = steps.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const ready: PrepStepRef[] = [];
  const blocked: PrepStepRef[] = [];
  const inProgress: PrepStepRef[] = [];
  const done: PrepStepRef[] = [];

  for (const step of sorted) {
    if (completedIds.has(step.id)) {
      done.push(step);
      continue;
    }
    if (startedIds.has(step.id)) {
      inProgress.push(step);
      continue;
    }
    if (isDependencySatisfied(step, completedIds)) {
      ready.push(step);
    } else {
      blocked.push(step);
    }
  }

  return { ready, blocked, inProgress, done };
}

export function timerMinutesForStep(step: PrepStepRef): number | null {
  if (!step.timerEnabled) {
    return null;
  }
  return step.waitMinutes ?? step.durationMinutes ?? step.activeWorkMinutes;
}

export function suggestReadyStep(
  ready: PrepStepRef[],
  inProgress: PrepStepRef[],
  timers: Record<string, PrepTimerSnapshot>,
  now: number,
): { step: PrepStepRef | null; hint: string | null } {
  if (ready.length === 0) {
    return { step: null, hint: null };
  }

  const waiting = inProgress
    .map((step) => {
      const timer = timers[step.id];
      if (!timer || timer.endsAt === null) {
        return null;
      }
      const remainingMin = Math.ceil(Math.max(0, timer.endsAt - now) / 60_000);
      if (remainingMin <= 0) {
        return null;
      }
      return { step, remainingMin };
    })
    .filter((item): item is { step: PrepStepRef; remainingMin: number } =>
      Boolean(item),
    )
    .sort((a, b) => b.remainingMin - a.remainingMin);

  const longestWait = waiting[0];
  if (longestWait) {
    const fitting = ready
      .filter(
        (step) =>
          step.activeWorkMinutes !== null &&
          step.activeWorkMinutes <= longestWait.remainingMin,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const pick = fitting[0];
    if (pick && pick.activeWorkMinutes !== null) {
      return {
        step: pick,
        hint: `${stepLabel(longestWait.step, longestWait.step.sortOrder)} potrwa jeszcze ${longestWait.remainingMin} min. W tym czasie możesz ${stepLabel(pick, pick.sortOrder).toLocaleLowerCase("pl")} — około ${pick.activeWorkMinutes} min.`,
      };
    }
  }

  const first = ready[0] ?? null;
  return { step: first, hint: null };
}
