import type { ConfigContext, ExpoConfig } from 'expo/config';

// CJS helper — Expo ładuje app.config.ts przez require bez rozszerzeń .ts dla lokalnych importów.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  allowAndroidCleartext,
  assertPublicApiUrlForStandalone,
  requiresDevClient,
  resolveEasProfile,
} = require('./eas-cleartext.js') as {
  allowAndroidCleartext: (profile?: string) => boolean;
  assertPublicApiUrlForStandalone: (
    profile: string | undefined,
    apiUrl: string | undefined,
  ) => void;
  requiresDevClient: (profile?: string) => boolean;
  resolveEasProfile: (
    profile?: string,
  ) => 'development' | 'preview' | 'production';
};

function withoutDevClientPlugin(
  plugins: ExpoConfig['plugins'],
): ExpoConfig['plugins'] {
  return (plugins ?? []).filter((plugin) => {
    if (plugin === 'expo-dev-client') {
      return false;
    }
    if (Array.isArray(plugin) && plugin[0] === 'expo-dev-client') {
      return false;
    }
    return true;
  });
}

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
  const profile = resolveEasProfile();
  const cleartext = allowAndroidCleartext(profile);
  const devClient = requiresDevClient(profile);
  const rawApi = process.env.EXPO_PUBLIC_API_URL;
  const apiUrl =
    typeof rawApi === 'string' && rawApi.trim().length > 0
      ? rawApi.trim()
      : undefined;
  assertPublicApiUrlForStandalone(profile, apiUrl);

  const base = config as ExpoConfig;
  let plugins = base.plugins;
  if (!devClient) {
    plugins = withoutDevClientPlugin(plugins);
  }
  plugins = withCleartextPlugin(plugins, cleartext);

  const androidVersionCode =
    profile === 'preview'
      ? 2
      : typeof base.android?.versionCode === 'number'
        ? base.android.versionCode
        : 1;

  const extra: Record<string, unknown> = {
    ...(typeof base.extra === 'object' && base.extra !== null
      ? base.extra
      : {}),
    easBuildProfile: process.env.EAS_BUILD_PROFILE ?? null,
    androidCleartextTraffic: cleartext,
    requiresDevClient: devClient,
  };
  // Expo getConfig zamienia `null` w extra na `{}` — używamy stringa lub pomijamy klucz.
  if (apiUrl) {
    extra.publicApiUrl = apiUrl;
  }

  return {
    ...base,
    plugins,
    android: {
      ...base.android,
      versionCode: androidVersionCode,
    },
    extra,
  };
};
