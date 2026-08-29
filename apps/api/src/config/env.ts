import { z } from 'zod';

/** Puste zmienne w `.env` traktujemy jak brak wartości. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  });

function emptyStringAsUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim().length === 0
    ? undefined
    : value;
}

export const DEFAULT_MEDIA_MAX_UPLOAD_BYTES = 10_485_760;

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().min(1),
  PUBLIC_WEB_ORIGIN: z.string().url(),
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  AUTH_TRUSTED_ORIGINS: z.string().min(1),
  ALLOW_DEMO_SEED: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  MEDIA_STORAGE_DRIVER: z.preprocess(
    emptyStringAsUndefined,
    z.enum(['s3', 'memory']).optional(),
  ),
  MEDIA_S3_ENDPOINT: optionalString,
  MEDIA_S3_REGION: optionalString,
  MEDIA_S3_BUCKET: optionalString,
  MEDIA_S3_ACCESS_KEY_ID: optionalString,
  MEDIA_S3_SECRET_ACCESS_KEY: optionalString,
  MEDIA_MAX_UPLOAD_BYTES: z.preprocess(
    emptyStringAsUndefined,
    z.coerce.number().int().min(1).default(DEFAULT_MEDIA_MAX_UPLOAD_BYTES),
  ),
  OPEN_FOOD_FACTS_DRIVER: z.preprocess(
    emptyStringAsUndefined,
    z.enum(['http', 'fixture']).default('http'),
  ),
  OPEN_FOOD_FACTS_BASE_URL: z.preprocess(
    emptyStringAsUndefined,
    z.string().url().default('https://world.openfoodfacts.org'),
  ),
  OPEN_FOOD_FACTS_USER_AGENT: z.preprocess(
    emptyStringAsUndefined,
    z
      .string()
      .min(1)
      .default(
        'MojaKuchnia/0.1 (https://github.com/JacekMizura/Przepisy-Jacka)',
      ),
  ),
  OPEN_FOOD_FACTS_TIMEOUT_MS: z.preprocess(
    emptyStringAsUndefined,
    z.coerce.number().int().min(500).max(30_000).default(8_000),
  ),
  OPEN_FOOD_FACTS_CACHE_TTL_SECONDS: z.preprocess(
    emptyStringAsUndefined,
    z.coerce.number().int().min(60).max(604_800).default(86_400),
  ),
  RECIPE_IMPORT_TIMEOUT_MS: z.preprocess(
    emptyStringAsUndefined,
    z.coerce.number().int().min(1_000).max(30_000).default(10_000),
  ),
  RECIPE_IMPORT_MAX_BYTES: z.preprocess(
    emptyStringAsUndefined,
    z.coerce.number().int().min(16_384).max(5_000_000).default(1_500_000),
  ),
  RECIPE_IMPORT_MAX_REDIRECTS: z.preprocess(
    emptyStringAsUndefined,
    z.coerce.number().int().min(0).max(5).default(3),
  ),
  RECIPE_IMPORT_RATE_LIMIT_PER_HOUR: z.preprocess(
    emptyStringAsUndefined,
    z.coerce.number().int().min(1).max(200).default(20),
  ),
  RECIPE_IMPORT_USER_AGENT: z.preprocess(
    emptyStringAsUndefined,
    z
      .string()
      .min(1)
      .default(
        'MojaKuchnia/0.1 (+https://github.com/JacekMizura/Przepisy-Jacka)',
      ),
  ),
  RECIPE_IMPORT_USE_FIXTURES: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type AppEnv = z.infer<typeof envSchema>;

export type MediaStorageEnv = Pick<
  AppEnv,
  | 'MEDIA_S3_ENDPOINT'
  | 'MEDIA_S3_REGION'
  | 'MEDIA_S3_BUCKET'
  | 'MEDIA_S3_ACCESS_KEY_ID'
  | 'MEDIA_S3_SECRET_ACCESS_KEY'
>;

/**
 * Wymaga pełnej konfiguracji S3-compatible (Cloudflare R2 / inny provider).
 * Endpoint jest obowiązkowy — R2 nie używa domyślnego hosta AWS.
 */
export function isMediaStorageConfigured(env: MediaStorageEnv): boolean {
  return Boolean(
    env.MEDIA_S3_ENDPOINT &&
    env.MEDIA_S3_REGION &&
    env.MEDIA_S3_BUCKET &&
    env.MEDIA_S3_ACCESS_KEY_ID &&
    env.MEDIA_S3_SECRET_ACCESS_KEY,
  );
}

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Niepoprawne zmienne środowiskowe API: ${details}`);
  }

  return parsed.data;
}

export function parseCorsOrigins(origins: string): string[] {
  return origins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Web: wyłącznie jawne http(s) originy (bez `*`).
 * Mobile (Better Auth Expo): dozwolone schematy deep-link, np. `mojakuchnia://`,
 * `mojakuchnia://*` oraz w development `exp://**` / zakresy LAN.
 */
export function parseTrustedOrigins(origins: string): string[] {
  const parsed = parseCorsOrigins(origins);
  for (const origin of parsed) {
    const isHttpOrigin =
      origin.startsWith('http://') || origin.startsWith('https://');
    if (isHttpOrigin && origin.includes('*')) {
      throw new Error(
        'AUTH_TRUSTED_ORIGINS: originy http(s) nie mogą zawierać wildcardu. Podaj jawne originy weba.',
      );
    }
    if (!isHttpOrigin && !/^[a-z][a-z0-9+.-]*:/i.test(origin)) {
      throw new Error(
        `AUTH_TRUSTED_ORIGINS: niepoprawny origin „${origin}”. Oczekiwano http(s) lub schematu deep-link (np. mojakuchnia://).`,
      );
    }
  }
  return parsed;
}
