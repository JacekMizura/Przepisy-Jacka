/**
 * Zrzuty importu z linku: formularz URL, podgląd w edytorze, zapisany przepis ze źródłem.
 * Desktop 1440×900, mobile 390×844.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = resolve(ROOT, "apps/api");
const WEB_DIR = resolve(ROOT, "apps/web");
const OUT = resolve(ROOT, "verification-screenshots");
const WEB_ORIGIN = "http://127.0.0.1:3120";
const API_ORIGIN = "http://127.0.0.1:3121";
const DATABASE_URL =
  "postgresql://moja_kuchnia:moja_kuchnia_dev@127.0.0.1:5432/moja_kuchnia";

mkdirSync(OUT, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function run(cmd, args, opts = {}) {
  return spawn(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    env: { ...process.env, ...opts.env },
    stdio: opts.stdio ?? "pipe",
    shell: opts.shell ?? false,
    windowsHide: true,
  });
}

function pnpm(args, env = {}) {
  const result = spawnSync("pnpm", args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
    shell: true,
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`pnpm ${args.join(" ")} failed`);
  }
}

async function waitHttp(url, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function applySetCookie(jar, headers) {
  const raw = headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

async function api(path, { method = "GET", cookies, body } = {}) {
  const res = await fetch(`${API_ORIGIN}${path}`, {
    method,
    headers: {
      Origin: WEB_ORIGIN,
      ...(cookies ? { Cookie: cookieHeader(cookies) } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

async function shot(page, name) {
  const path = resolve(OUT, name);
  await page.screenshot({ path, fullPage: true });
  console.log("wrote", path);
}

async function main() {
  const children = [];
  const stop = () => {
    for (const child of children) {
      if (!child.pid) continue;
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } else {
        child.kill("SIGTERM");
      }
    }
  };
  process.on("exit", stop);
  process.on("SIGINT", () => {
    stop();
    process.exit(1);
  });

  console.log("migrate…");
  pnpm(["--filter", "@moja-kuchnia/api", "exec", "prisma", "migrate", "deploy"], {
    DATABASE_URL,
    ALLOW_DEMO_SEED: "false",
  });

  console.log("build api+web…");
  pnpm(["--filter", "@moja-kuchnia/api", "build"]);
  pnpm(["--filter", "@moja-kuchnia/web", "build"], { API_ORIGIN });

  console.log("Start API…");
  const apiProc = run("node", ["dist/main.js"], {
    cwd: API_DIR,
    env: {
      NODE_ENV: "development",
      API_HOST: "127.0.0.1",
      API_PORT: "3121",
      DATABASE_URL,
      CORS_ORIGINS: WEB_ORIGIN,
      PUBLIC_WEB_ORIGIN: WEB_ORIGIN,
      BETTER_AUTH_URL: WEB_ORIGIN,
      BETTER_AUTH_SECRET: "local-dev-only-not-for-production-use-32",
      AUTH_TRUSTED_ORIGINS: WEB_ORIGIN,
      ALLOW_DEMO_SEED: "false",
      MEDIA_STORAGE_DRIVER: "memory",
      RECIPE_IMPORT_USE_FIXTURES: "true",
    },
  });
  children.push(apiProc);
  apiProc.stderr.on("data", (c) => process.stderr.write(c));
  await waitHttp(`${API_ORIGIN}/api/health`);

  console.log("Start web…");
  const webProc = run(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "next", "start", "-H", "127.0.0.1", "-p", "3120"],
    {
      cwd: WEB_DIR,
      env: { API_ORIGIN, PORT: "3120" },
      shell: true,
    },
  );
  children.push(webProc);
  await waitHttp(WEB_ORIGIN);

  const email = `import.shots.${Date.now()}@example.com`;
  const password = "HasloTestowe123!";
  const cookies = new Map();

  const signUp = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: { email, password, name: "Zrzuty Import" },
  });
  applySetCookie(cookies, signUp.headers);
  if (signUp.status >= 400) {
    throw new Error(`sign-up ${signUp.status} ${JSON.stringify(signUp.body)}`);
  }

  const kitchenRes = await api("/api/kitchens", {
    method: "POST",
    cookies,
    body: { name: "Kuchnia importu" },
  });
  const kitchenId = kitchenRes.body.id;

  await api(`/api/kitchens/${kitchenId}/products`, {
    method: "POST",
    cookies,
    body: { name: "Jajka", defaultUnit: "piece" },
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(
    [...cookies.entries()].map(([name, value]) => ({
      name,
      value,
      domain: "127.0.0.1",
      path: "/",
    })),
  );

  const listUrl = `${WEB_ORIGIN}/kitchens/${kitchenId}/recipes`;
  const importUrl = `${WEB_ORIGIN}/kitchens/${kitchenId}/recipes/import`;

  for (const [label, size] of [
    ["desktop", { width: 1440, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const page = await context.newPage();
    await page.setViewportSize(size);

    await page.goto(listUrl, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Przepisy" }).waitFor();
    await shot(page, `recipe-import-list-${label}.png`);

    await page.goto(importUrl, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Importuj przepis" }).waitFor();
    await page.getByLabel("Adres HTTPS przepisu").fill(
      "https://recipe-import.test/ania-sos",
    );
    await shot(page, `recipe-import-url-${label}.png`);

    await page.getByRole("button", { name: "Odczytaj przepis" }).click();
    await page.getByRole("button", { name: "Zapisz przepis" }).waitFor({
      timeout: 30_000,
    });
    await shot(page, `recipe-import-preview-html-${label}.png`);
    await shot(page, `recipe-import-preview-${label}.png`);

    await page.goto(importUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Wklej tekst" }).click();
    await page.getByLabel("Tekst przepisu lub opis posta").fill(
      `Omlet zrzutowy

Składniki
2 jajka
sól do smaku

Przygotowanie
Krok 1: Ubij
Ubij jajka.
Porada: Delikatnie.

Krok 2: Smaż
Smaż na patelni.

#obiad notatka
`,
    );
    await page.getByLabel("Adres źródła (opcjonalnie)").fill(
      "https://www.instagram.com/p/example/",
    );
    await shot(page, `recipe-import-text-${label}.png`);
    await page.getByRole("button", { name: "Odczytaj z tekstu" }).click();
    await page.getByRole("button", { name: "Zapisz przepis" }).waitFor({
      timeout: 30_000,
    });
    await shot(page, `recipe-import-preview-text-${label}.png`);

    if (label === "desktop") {
      await page.getByRole("button", { name: "Zapisz przepis" }).click();
      await page.waitForURL(/\/recipes\/[0-9a-f-]+$/i, { timeout: 30_000 });
      await page.getByRole("link", { name: "Źródło przepisu" }).waitFor();
      await shot(page, "recipe-import-saved-desktop.png");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("link", { name: "Źródło przepisu" }).waitFor();
      await shot(page, "recipe-import-saved-mobile.png");
    }

    await page.close();
  }

  await browser.close();
  stop();
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
