import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

import { type AppEnv, parseTrustedOrigins } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

export type AuthEnv = Pick<
  AppEnv,
  'NODE_ENV' | 'BETTER_AUTH_URL' | 'BETTER_AUTH_SECRET' | 'AUTH_TRUSTED_ORIGINS'
>;

export function createAuth(prisma: PrismaClient, env: AuthEnv) {
  const trustedOrigins = parseTrustedOrigins(env.AUTH_TRUSTED_ORIGINS);
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
