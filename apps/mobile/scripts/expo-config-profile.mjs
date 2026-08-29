import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PRODUCTION_API_ORIGIN } = require('../eas-cleartext.js');

const profile = process.argv[2];
if (!profile) {
  console.error('Usage: node scripts/expo-config-profile.mjs <profile>');
  process.exit(1);
}

const mobileRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const eas = JSON.parse(
  readFileSync(path.join(mobileRoot, 'eas.json'), 'utf8'),
);
const profileEnv = eas.build?.[profile]?.env ?? {};

const env = {
  ...process.env,
  EAS_BUILD_PROFILE: profile,
};

// Development bierze API z lokalnego .env — nie dziedzicz produkcyjnego URL z powłoki.
if (profile === 'development') {
  delete env.EXPO_PUBLIC_API_URL;
} else {
  Object.assign(env, profileEnv);
  if (!env.EXPO_PUBLIC_API_URL) {
    env.EXPO_PUBLIC_API_URL = PRODUCTION_API_ORIGIN;
  }
}

const result = spawnSync('npx', ['expo', 'config', '--type', 'public'], {
  cwd: mobileRoot,
  stdio: 'inherit',
  env,
  shell: true,
});

process.exit(result.status ?? 1);
