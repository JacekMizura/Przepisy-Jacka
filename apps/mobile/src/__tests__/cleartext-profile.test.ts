import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
  EAS_NODE_VERSION,
  PRODUCTION_API_ORIGIN,
  allowAndroidCleartext,
  requiresDevClient,
  resolveEasProfile,
} from '../../eas-cleartext.js';

const mobileRoot = path.resolve(__dirname, '../..');

type ExpoConfigJson = {
  extra?: {
    androidCleartextTraffic?: boolean;
    requiresDevClient?: boolean;
    publicApiUrl?: string | null;
  };
  plugins?: unknown[];
  android?: { versionCode?: number };
};

function readExpoConfig(
  profile: string,
  env: Record<string, string> = {},
): ExpoConfigJson {
  const result = spawnSync(
    'npx',
    ['expo', 'config', '--type', 'prebuild', '--json'],
    {
      cwd: mobileRoot,
      env: {
        ...process.env,
        EAS_BUILD_PROFILE: profile,
        ...env,
      },
      encoding: 'utf8',
      shell: true,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `expo config failed for ${profile}: ${result.stderr || result.stdout}`,
    );
  }
  const stdout = (result.stdout ?? '').trim();
  const jsonStart = stdout.indexOf('{');
  if (jsonStart < 0) {
    throw new Error(`no JSON in expo config output for ${profile}`);
  }
  return JSON.parse(stdout.slice(jsonStart)) as ExpoConfigJson;
}

function pluginCleartext(plugins: unknown[] | undefined): boolean | undefined {
  for (const plugin of plugins ?? []) {
    if (!Array.isArray(plugin) || plugin[0] !== 'expo-build-properties') {
      continue;
    }
    const options = plugin[1] as
      | { android?: { usesCleartextTraffic?: boolean } }
      | undefined;
    return options?.android?.usesCleartextTraffic;
  }
  return undefined;
}

function hasDevClientPlugin(plugins: unknown[] | undefined): boolean {
  return (plugins ?? []).some((plugin) => {
    if (plugin === 'expo-dev-client') {
      return true;
    }
    return Array.isArray(plugin) && plugin[0] === 'expo-dev-client';
  });
}

function readEasJson(): {
  build: Record<
    string,
    {
      developmentClient?: boolean;
      node?: string;
      env?: Record<string, string>;
      android?: { versionCode?: number; buildType?: string };
    }
  >;
} {
  return JSON.parse(
    readFileSync(path.join(mobileRoot, 'eas.json'), 'utf8'),
  ) as ReturnType<typeof readEasJson>;
}

describe('EAS / Expo profiles', () => {
  it('resolves profile helpers', () => {
    expect(resolveEasProfile('development')).toBe('development');
    expect(allowAndroidCleartext('development')).toBe(true);
    expect(requiresDevClient('development')).toBe(true);
    expect(allowAndroidCleartext('preview')).toBe(false);
    expect(requiresDevClient('preview')).toBe(false);
    expect(allowAndroidCleartext('production')).toBe(false);
    expect(requiresDevClient('production')).toBe(false);
  });

  it('pins Node 24.13.0 on all eas.json build profiles', () => {
    const eas = readEasJson();
    for (const name of ['development', 'preview', 'production'] as const) {
      expect(eas.build[name]?.node).toBe(EAS_NODE_VERSION);
      expect(eas.build[name]?.node?.startsWith('24.')).toBe(true);
    }
    expect(eas.build.development?.developmentClient).toBe(true);
    expect(eas.build.preview?.developmentClient).toBeUndefined();
    expect(eas.build.preview?.android?.buildType).toBe('apk');
    expect(eas.build.preview?.android?.versionCode).toBe(2);
    expect(eas.build.preview?.env?.EXPO_PUBLIC_API_URL).toBe(
      PRODUCTION_API_ORIGIN,
    );
    expect(eas.build.production?.env?.EXPO_PUBLIC_API_URL).toBe(
      PRODUCTION_API_ORIGIN,
    );
  });

  it(
    'expo config: development allows cleartext + dev-client',
    () => {
      const development = readExpoConfig('development');
      expect(development.extra?.androidCleartextTraffic).toBe(true);
      expect(pluginCleartext(development.plugins)).toBe(true);
      expect(development.extra?.requiresDevClient).toBe(true);
      expect(hasDevClientPlugin(development.plugins)).toBe(true);
    },
    60_000,
  );

  it(
    'expo config: preview is HTTPS standalone without cleartext/dev-client',
    () => {
      const preview = readExpoConfig('preview', {
        EXPO_PUBLIC_API_URL: PRODUCTION_API_ORIGIN,
      });
      expect(preview.extra?.androidCleartextTraffic).toBe(false);
      expect(pluginCleartext(preview.plugins)).toBe(false);
      expect(preview.extra?.requiresDevClient).toBe(false);
      expect(hasDevClientPlugin(preview.plugins)).toBe(false);
      expect(preview.extra?.publicApiUrl).toBe(PRODUCTION_API_ORIGIN);
      expect(preview.android?.versionCode).toBe(2);
      expect(preview.extra?.publicApiUrl).not.toMatch(/localhost|127\.0\.0\.1/);
    },
    60_000,
  );

  it(
    'expo config: production disables cleartext and rejects localhost API',
    () => {
      const production = readExpoConfig('production', {
        EXPO_PUBLIC_API_URL: PRODUCTION_API_ORIGIN,
      });
      expect(production.extra?.androidCleartextTraffic).toBe(false);
      expect(pluginCleartext(production.plugins)).toBe(false);
      expect(production.extra?.requiresDevClient).toBe(false);
      expect(hasDevClientPlugin(production.plugins)).toBe(false);

      const bad = spawnSync(
        'npx',
        ['expo', 'config', '--type', 'prebuild', '--json'],
        {
          cwd: mobileRoot,
          env: {
            ...process.env,
            EAS_BUILD_PROFILE: 'preview',
            EXPO_PUBLIC_API_URL: 'http://localhost:3001',
          },
          encoding: 'utf8',
          shell: true,
        },
      );
      expect(bad.status).not.toBe(0);
      const combined = `${bad.stderr ?? ''}${bad.stdout ?? ''}`;
      expect(
        combined.length === 0 || /HTTPS|lokalny|EXPO_PUBLIC_API_URL|Error/i.test(combined),
      ).toBe(true);
    },
    60_000,
  );
});
