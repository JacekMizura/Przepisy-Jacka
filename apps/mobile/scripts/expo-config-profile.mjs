import { spawnSync } from 'node:child_process';

const profile = process.argv[2];
if (!profile) {
  console.error('Usage: node scripts/expo-config-profile.mjs <profile>');
  process.exit(1);
}

const result = spawnSync(
  'npx',
  ['expo', 'config', '--type', 'public'],
  {
    stdio: 'inherit',
    env: { ...process.env, EAS_BUILD_PROFILE: profile },
    shell: true,
  },
);

process.exit(result.status ?? 1);
