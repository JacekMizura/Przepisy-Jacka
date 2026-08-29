export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!url) {
    throw new Error(
      'Brak EXPO_PUBLIC_API_URL. Ustaw publiczny adres API — patrz apps/mobile/.env.example.',
    );
  }
  return url.replace(/\/$/, '');
}
