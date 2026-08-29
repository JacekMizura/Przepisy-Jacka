/**
 * Konfiguracja profili EAS / Expo (plain CJS — app.config + testy).
 *
 * Cleartext HTTP tylko dla `development` (lokalne API po LAN).
 * Preview/production: HTTPS, bez Metro/dev-client.
 */

const PRODUCTION_API_ORIGIN =
  'https://przepisy-jacka-production-ae86.up.railway.app';

/** Node pin w eas.json — major 24 jak CI (`node-version: "24"`) i engines `>=24`. */
const EAS_NODE_VERSION = '24.13.0';

function resolveEasProfile(
  profile = process.env.EAS_BUILD_PROFILE ?? process.env.APP_ENV,
) {
  if (profile === 'development' || profile === 'preview' || profile === 'production') {
    return profile;
  }
  return 'production';
}

function allowAndroidCleartext(profile) {
  return resolveEasProfile(profile) === 'development';
}

function requiresDevClient(profile) {
  return resolveEasProfile(profile) === 'development';
}

function assertPublicApiUrlForStandalone(profile, apiUrl) {
  const resolved = resolveEasProfile(profile);
  if (resolved === 'development') {
    return;
  }
  if (typeof apiUrl !== 'string' || apiUrl.trim().length === 0) {
    throw new Error(
      `EXPO_PUBLIC_API_URL jest wymagany dla profilu EAS „${resolved}”.`,
    );
  }
  let url;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error(
      `EXPO_PUBLIC_API_URL jest niepoprawnym URL („${apiUrl}”) dla profilu „${resolved}”.`,
    );
  }
  if (url.protocol !== 'https:') {
    throw new Error(
      `Profil „${resolved}” wymaga HTTPS w EXPO_PUBLIC_API_URL (otrzymano „${apiUrl}”).`,
    );
  }
  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '10.0.2.2' ||
    url.hostname.endsWith('.local')
  ) {
    throw new Error(
      `Profil „${resolved}” nie może wskazywać na lokalny host („${apiUrl}”).`,
    );
  }
}

module.exports = {
  PRODUCTION_API_ORIGIN,
  EAS_NODE_VERSION,
  resolveEasProfile,
  allowAndroidCleartext,
  requiresDevClient,
  assertPublicApiUrlForStandalone,
};
