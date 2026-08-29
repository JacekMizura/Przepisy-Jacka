import type { ConfigContext, ExpoConfig } from 'expo/config';

// CJS helper — Expo ładuje app.config.ts przez require bez rozszerzeń .ts dla lokalnych importów.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { allowAndroidCleartext } = require('./eas-cleartext.js') as {
  allowAndroidCleartext: (profile?: string) => boolean;
};

function withCleartextPlugin(
  plugins: ExpoConfig['plugins'],
  cleartext: boolean,
): ExpoConfig['plugins'] {
  const rest = (plugins ?? []).filter((plugin) => {
    if (typeof plugin === 'string') {
      return plugin !== 'expo-build-properties';
    }
    if (Array.isArray(plugin)) {
      return plugin[0] !== 'expo-build-properties';
    }
    return true;
  });
  return [
    ...rest,
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: cleartext,
        },
      },
    ],
  ];
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const cleartext = allowAndroidCleartext();
  const base = config as ExpoConfig;

  return {
    ...base,
    plugins: withCleartextPlugin(base.plugins, cleartext),
    extra: {
      ...(typeof base.extra === 'object' && base.extra !== null
        ? base.extra
        : {}),
      easBuildProfile: process.env.EAS_BUILD_PROFILE ?? null,
      androidCleartextTraffic: cleartext,
    },
  };
};
