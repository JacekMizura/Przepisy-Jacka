import { z } from 'zod';

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
});

export type AppEnv = z.infer<typeof envSchema>;

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

export function parseTrustedOrigins(origins: string): string[] {
  const parsed = parseCorsOrigins(origins);
  if (parsed.some((origin) => origin.includes('*'))) {
    throw new Error(
      'AUTH_TRUSTED_ORIGINS nie może zawierać wildcardu. Podaj jawne originy weba.',
    );
  }
  return parsed;
}
