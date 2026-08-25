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

  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      process.env[key] = value;
    }
  }
}
