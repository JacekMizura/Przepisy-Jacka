import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PRODUCTION_API_ORIGIN } = require('../eas-cleartext.js');

const root = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(root, '..');
const outDir = path.join(mobileRoot, 'dist-android-preview');
const envLocalPath = path.join(mobileRoot, '.env.local');

/**
 * Expo / Metro inline'uje EXPO_PUBLIC_* z plików .env (+ cache).
 * Samo env procesu bywa niewystarczające — zapisujemy gitignored `.env.local`
 * i czyścimy cache, potem weryfikujemy host API w artefakcie HBC.
 */
const envLocalContents = [
  '# Wygenerowane przez export-android-preview.mjs — nie commituj.',
  `EXPO_PUBLIC_API_URL=${PRODUCTION_API_ORIGIN}`,
  '',
].join('\n');

writeFileSync(envLocalPath, envLocalContents, 'utf8');

const env = {
  ...process.env,
  EAS_BUILD_PROFILE: 'preview',
  EXPO_PUBLIC_API_URL: PRODUCTION_API_ORIGIN,
};

let exportStatus = 1;
try {
  const exportResult = spawnSync(
    'npx',
    [
      'expo',
      'export',
      '--platform',
      'android',
      '--output-dir',
      outDir,
      '--clear',
    ],
    { cwd: mobileRoot, env, stdio: 'inherit', shell: true },
  );
  exportStatus = exportResult.status ?? 1;
} finally {
  if (existsSync(envLocalPath)) {
    unlinkSync(envLocalPath);
  }
}

if (exportStatus !== 0) {
  process.exit(exportStatus);
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

const apiHost = new URL(PRODUCTION_API_ORIGIN).hostname;
const bannedInText = [
  'localhost:3001',
  '127.0.0.1:3001',
  '10.0.2.2:3001',
  'exp://',
];
const textFiles = walk(outDir).filter((file) =>
  /\.(json|js|html|txt)$/i.test(file),
);

for (const file of textFiles) {
  const content = readFileSync(file, 'utf8');
  for (const needle of bannedInText) {
    if (content.includes(needle)) {
      console.error(`FAIL: „${needle}” w ${path.relative(mobileRoot, file)}`);
      process.exit(1);
    }
  }
}

const metadata = JSON.parse(
  readFileSync(path.join(outDir, 'metadata.json'), 'utf8'),
);
if (!metadata.fileMetadata) {
  console.error('FAIL: brak fileMetadata w metadata.json (bundle niekompletny)');
  process.exit(1);
}

const hbcFiles = walk(outDir).filter((file) => /\.hbc$/i.test(file));
if (hbcFiles.length === 0) {
  console.error('FAIL: brak pliku .hbc (Hermes bundle)');
  process.exit(1);
}

for (const hbc of hbcFiles) {
  const bytes = readFileSync(hbc);
  const asText = bytes.toString('utf8');
  if (!asText.includes(apiHost)) {
    console.error(
      `FAIL: host API „${apiHost}” nie występuje w ${path.relative(mobileRoot, hbc)} — EXPO_PUBLIC_API_URL nie został zinline'owany.`,
    );
    process.exit(1);
  }
  for (const needle of ['localhost:3001', '10.0.2.2:3001', 'exp://']) {
    if (asText.includes(needle)) {
      console.error(
        `FAIL: „${needle}” w bundlu ${path.relative(mobileRoot, hbc)}`,
      );
      process.exit(1);
    }
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      profile: 'preview',
      api: PRODUCTION_API_ORIGIN,
      outDir: 'dist-android-preview',
      note: 'Standalone JS export — bez Metro; EAS preview APK dopiero po merge+API.',
    },
    null,
    2,
  ),
);
