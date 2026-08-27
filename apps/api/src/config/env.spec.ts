import { isMediaStorageConfigured, validateEnv } from './env';

describe('media storage env', () => {
  const base = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    CORS_ORIGINS: 'http://localhost:3000',
    PUBLIC_WEB_ORIGIN: 'http://localhost:3000',
    BETTER_AUTH_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: 'local-dev-only-not-for-production-use-32',
    AUTH_TRUSTED_ORIGINS: 'http://localhost:3000',
  } as const;

  it('requires endpoint for R2 / S3-compatible configuration', () => {
    expect(
      isMediaStorageConfigured({
        MEDIA_S3_ENDPOINT: undefined,
        MEDIA_S3_REGION: 'auto',
        MEDIA_S3_BUCKET: 'przepisy-jacka-media',
        MEDIA_S3_ACCESS_KEY_ID: 'key',
        MEDIA_S3_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toBe(false);

    expect(
      isMediaStorageConfigured({
        MEDIA_S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
        MEDIA_S3_REGION: 'auto',
        MEDIA_S3_BUCKET: 'przepisy-jacka-media',
        MEDIA_S3_ACCESS_KEY_ID: 'key',
        MEDIA_S3_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toBe(true);
  });

  it('treats empty MEDIA strings as unset', () => {
    const env = validateEnv({
      ...base,
      MEDIA_S3_ENDPOINT: '',
      MEDIA_S3_REGION: 'auto',
      MEDIA_S3_BUCKET: 'przepisy-jacka-media',
      MEDIA_S3_ACCESS_KEY_ID: 'key',
      MEDIA_S3_SECRET_ACCESS_KEY: 'secret',
    });
    expect(isMediaStorageConfigured(env)).toBe(false);
  });
});
