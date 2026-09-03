/** Persistencja lokalnych checkboxów gotowania (składniki / kroki). */

export function recipeCookStateKey(
  recipeId: string,
  kind: "ingredients" | "steps",
): string {
  return `recipe-cook:${recipeId}:${kind}`;
}

export function loadCookIdSet(
  recipeId: string,
  kind: "ingredients" | "steps",
): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = sessionStorage.getItem(recipeCookStateKey(recipeId, kind));
    if (!raw) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(
      parsed.filter((entry): entry is string => typeof entry === "string"),
    );
  } catch {
    return new Set();
  }
}

export function saveCookIdSet(
  recipeId: string,
  kind: "ingredients" | "steps",
  ids: Set<string>,
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(
      recipeCookStateKey(recipeId, kind),
      JSON.stringify([...ids]),
    );
  } catch {
    // quota / private mode — ignoruj
  }
}

export function toggleIdInSet(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

/** Skalowanie porcji tylko w UI (delta względem bieżącej wartości lokalnej). */
export function nextServings(
  current: number | null,
  baseServings: number,
  delta: number,
): number {
  const base = Math.max(1, baseServings || 1);
  return Math.max(1, (current ?? base) + delta);
}

export async function shareOrCopyRecipeUrl(url: string, title: string): Promise<"shared" | "copied"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}
