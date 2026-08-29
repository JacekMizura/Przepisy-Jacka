import {
  isMediaStorageConfigured,
  parseTrustedOrigins,
  validateEnv,
} from './env';

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

describe('parseTrustedOrigins', () => {
  it('akceptuje jawne http(s) oraz dokładny schemat aplikacji', () => {
    expect(
      parseTrustedOrigins(
        'http://localhost:3000,https://przepisy-jacka-web.vercel.app,mojakuchnia://',
      ),
    ).toEqual([
      'http://localhost:3000',
      'https://przepisy-jacka-web.vercel.app',
      'mojakuchnia://',
    ]);
  });

  it('odrzuca dowolny wildcard', () => {
    expect(() => parseTrustedOrigins('https://*.vercel.app')).toThrow(
      /wildcard/,
    );
    expect(() => parseTrustedOrigins('mojakuchnia://*')).toThrow(/wildcard/);
    expect(() => parseTrustedOrigins('exp://**')).toThrow(/wildcard/);
    expect(() => parseTrustedOrigins('exp://192.168.*.*:*/**')).toThrow(
      /wildcard/,
    );
  });

  it('odrzuca zabronione schematy Expo Go i lokalne', () => {
    expect(() => parseTrustedOrigins('exp://')).toThrow(/zabroniony/);
    expect(() => parseTrustedOrigins('exps://')).toThrow(/zabroniony/);
    expect(() => parseTrustedOrigins('file://')).toThrow(/zabroniony/);
    expect(() => parseTrustedOrigins('javascript://')).toThrow(/zabroniony/);
  });

  it('odrzuca deep-link z hostem lub ścieżką', () => {
    expect(() => parseTrustedOrigins('mojakuchnia://callback')).toThrow(
      /niepoprawny origin/,
    );
    expect(() => parseTrustedOrigins('mojakuchnia://host/path')).toThrow(
      /niepoprawny origin/,
    );
  });

  it('odrzuca http(s) z poświadczeniami', () => {
    expect(() => parseTrustedOrigins('https://user:pass@example.com')).toThrow(
      /poświadczeń/,
    );
  });
});
