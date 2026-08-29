import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

import { type AppEnv, parseTrustedOrigins } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

export type AuthEnv = Pick<
  AppEnv,
  'NODE_ENV' | 'BETTER_AUTH_URL' | 'BETTER_AUTH_SECRET' | 'AUTH_TRUSTED_ORIGINS'
>;

export function createAuth(prisma: PrismaClient, env: AuthEnv) {
  const configuredOrigins = parseTrustedOrigins(env.AUTH_TRUSTED_ORIGINS);
  const mobileDeepLinks = ['mojakuchnia://', 'mojakuchnia://*'] as const;
  const developmentExpoOrigins =
    env.NODE_ENV === 'development'
      ? (['exp://', 'exp://**', 'exp://192.168.*.*:*/**'] as const)
      : [];
  const trustedOrigins = Array.from(
    new Set([
      ...configuredOrigins,
      ...mobileDeepLinks,
      ...developmentExpoOrigins,
    ]),
  );
  const useSecureCookies = env.NODE_ENV === 'production';

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins,
    plugins: [expo()],
    advanced: {
      useSecureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: useSecureCookies,
      },
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
