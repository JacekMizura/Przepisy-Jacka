export function applyTestEnv(overrides?: Record<string, string>): void {
  process.env.NODE_ENV = 'test';
  process.env.API_HOST = '127.0.0.1';
  process.env.API_PORT = '3011';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://moja_kuchnia:moja_kuchnia_dev@127.0.0.1:5432/moja_kuchnia';
  process.env.CORS_ORIGINS = 'http://127.0.0.1:3010';
  process.env.PUBLIC_WEB_ORIGIN = 'http://127.0.0.1:3010';
  process.env.BETTER_AUTH_URL = 'http://127.0.0.1:3010';
  process.env.BETTER_AUTH_SECRET = 'local-dev-only-not-for-production-use-32';
  process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3010';
  process.env.ALLOW_DEMO_SEED = 'false';
  // Testy nie dotykają prawdziwego S3 — zdjęcia trzymamy w pamięci procesu API.
  process.env.MEDIA_STORAGE_DRIVER = 'memory';
  process.env.MEDIA_S3_ENDPOINT = '';
  process.env.MEDIA_S3_REGION = '';
  process.env.MEDIA_S3_BUCKET = '';
  process.env.MEDIA_S3_ACCESS_KEY_ID = '';
  process.env.MEDIA_S3_SECRET_ACCESS_KEY = '';
  // Testy e2e wskazują na lokalny mock HTTP (patrz nutrition-lookup.e2e-spec.ts).
  process.env.OPEN_FOOD_FACTS_DRIVER = 'http';
  process.env.OPEN_FOOD_FACTS_BASE_URL =
    process.env.OPEN_FOOD_FACTS_BASE_URL ?? 'http://127.0.0.1:9';
  process.env.OPEN_FOOD_FACTS_USER_AGENT =
    'MojaKuchnia-Test/0.1 (ci@localhost)';
  process.env.OPEN_FOOD_FACTS_TIMEOUT_MS = '2000';
  process.env.OPEN_FOOD_FACTS_CACHE_TTL_SECONDS = '3600';

  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      process.env[key] = value;
    }
  }
}
