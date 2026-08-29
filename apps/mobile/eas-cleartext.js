/**
 * Cleartext HTTP tylko dla profilu EAS `development` (lokalne API po LAN).
 * Preview/production i brak profilu → bez cleartext (HTTPS).
 * Plain CJS — ładowane przez app.config.ts (Expo) i testy Jest.
 */
function allowAndroidCleartext(
  profile = process.env.EAS_BUILD_PROFILE ?? process.env.APP_ENV,
) {
  return profile === 'development';
}

module.exports = { allowAndroidCleartext };
