export const DEFAULT_RECIPE_CATEGORIES = [
  'Śniadania',
  'Dania główne',
  'Zupy',
  'Sałatki',
  'Desery',
  'Wypieki',
  'Sosy',
  'Przetwory',
] as const;

export function normalizeRecipeCategoryName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
