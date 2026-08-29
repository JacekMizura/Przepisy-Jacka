export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!url) {
    throw new Error(
      'Brak EXPO_PUBLIC_API_URL. Ustaw publiczny adres API (np. http://10.0.2.2:3001 na emulatorze Androida).',
    );
  }
  return url.replace(/\/$/, '');
}
