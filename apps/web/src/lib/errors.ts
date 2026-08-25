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
    if (
      "message" in error &&
      typeof error.message === "string" &&
      error.message.length > 0
    ) {
      return error.message;
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
