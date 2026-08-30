export function normalizeProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Normalizacja do wyszukiwania PL (bez ogonków, zbita spacja). */
export function normalizeSearchText(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
