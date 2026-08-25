export function readApiError(
  error: unknown,
  fallback = "Nie udało się wykonać operacji.",
): string {
  if (!error) {
    return fallback;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    if ("message" in error) {
      const message = error.message;
      if (typeof message === "string" && message.length > 0) {
        return message;
      }
      if (Array.isArray(message) && message.length > 0) {
        const parts = message.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        );
        if (parts.length > 0) {
          return parts.join(" ");
        }
      }
    }
    if (
      "error" in error &&
      typeof error.error === "string" &&
      error.error.length > 0 &&
      error.error !== "Bad Request"
    ) {
      return error.error;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export const LOCATION_LABELS = {
  pantry: "Spiżarnia",
  fridge: "Lodówka",
  freezer: "Zamrażarka",
  other: "Inne miejsce",
} as const;

export const UNIT_LABELS = {
  piece: "sztuki",
  gram: "gramy",
  milliliter: "mililitry",
} as const;
