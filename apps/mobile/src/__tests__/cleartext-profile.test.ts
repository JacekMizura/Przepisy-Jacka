import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { allowAndroidCleartext } from '../../eas-cleartext.js';

const mobileRoot = path.resolve(__dirname, '../..');

function readExpoConfig(profile: string): {
  extra?: { androidCleartextTraffic?: boolean };
  plugins?: unknown[];
} {
  const result = spawnSync(
    'npx',
    ['expo', 'config', '--type', 'prebuild', '--json'],
    {
      cwd: mobileRoot,
      env: { ...process.env, EAS_BUILD_PROFILE: profile },
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
  return JSON.parse(stdout.slice(jsonStart)) as {
    extra?: { androidCleartextTraffic?: boolean };
    plugins?: unknown[];
  };
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

describe('android cleartext by EAS profile', () => {
  it('allows cleartext only for development helper', () => {
    expect(allowAndroidCleartext('development')).toBe(true);
    expect(allowAndroidCleartext('preview')).toBe(false);
    expect(allowAndroidCleartext('production')).toBe(false);
    expect(allowAndroidCleartext(undefined)).toBe(false);
  });

  it(
    'expo config enables cleartext only for development',
    () => {
      const development = readExpoConfig('development');
      const production = readExpoConfig('production');
      const preview = readExpoConfig('preview');

      expect(development.extra?.androidCleartextTraffic).toBe(true);
      expect(pluginCleartext(development.plugins)).toBe(true);

      expect(production.extra?.androidCleartextTraffic).toBe(false);
      expect(pluginCleartext(production.plugins)).toBe(false);

      expect(preview.extra?.androidCleartextTraffic).toBe(false);
      expect(pluginCleartext(preview.plugins)).toBe(false);
    },
    60_000,
  );
});
