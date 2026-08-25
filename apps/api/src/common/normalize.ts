export function normalizeProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
