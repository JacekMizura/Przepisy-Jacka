/**
 * Zrzuty: lista z filtrami kategorii, formularz, zarządzanie kategoriami.
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

  console.log("Using existing Postgres (migrate will fail if unavailable)…");

  console.log("migrate…");
  pnpm(["--filter", "@moja-kuchnia/api", "exec", "prisma", "migrate", "deploy"], {
    DATABASE_URL,
    ALLOW_DEMO_SEED: "false",
  });

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

  const email = `categories.shots.${Date.now()}@example.com`;
  const password = "HasloTestowe123!";
  const cookies = new Map();

  const signUp = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: { email, password, name: "Zrzuty Kategorie" },
  });
  applySetCookie(cookies, signUp.headers);
  if (signUp.status >= 400) {
    throw new Error(`sign-up ${signUp.status} ${JSON.stringify(signUp.body)}`);
  }

  const kitchenRes = await api("/api/kitchens", {
    method: "POST",
    cookies,
    body: { name: "Kuchnia kategorii" },
  });
  const kitchenId = kitchenRes.body.id;

  const categoriesRes = await api(
    `/api/kitchens/${kitchenId}/recipe-categories`,
    { cookies },
  );
  const categories = categoriesRes.body;
  const breakfast = categories.find((c) => c.name === "Śniadania");
  const desserts = categories.find((c) => c.name === "Desery");
  const soups = categories.find((c) => c.name === "Zupy");

  await api(`/api/kitchens/${kitchenId}/recipes`, {
    method: "POST",
    cookies,
    body: {
      name: "Omlet śniadaniowy",
      servings: 2,
      difficulty: "easy",
      visibility: "kitchen",
      categoryIds: [breakfast.id, desserts.id],
      ingredients: [
        { name: "Jajka", quantity: "3.000", unit: "piece", sortOrder: 0 },
      ],
      steps: [{ instruction: "Ubij jajka i usmaż.", sortOrder: 0 }],
    },
  });
  await api(`/api/kitchens/${kitchenId}/recipes`, {
    method: "POST",
    cookies,
    body: {
      name: "Zupa pomidorowa",
      servings: 4,
      difficulty: "easy",
      visibility: "kitchen",
      categoryIds: [soups.id],
      ingredients: [
        { name: "Pomidory", quantity: "400.000", unit: "gram", sortOrder: 0 },
      ],
      steps: [{ instruction: "Gotuj i blenduj.", sortOrder: 0 }],
    },
  });
  await api(`/api/kitchens/${kitchenId}/recipes`, {
    method: "POST",
    cookies,
    body: {
      name: "Chleb bez kategorii",
      servings: 1,
      difficulty: "medium",
      visibility: "kitchen",
      ingredients: [
        { name: "Mąka", quantity: "500.000", unit: "gram", sortOrder: 0 },
      ],
      steps: [{ instruction: "Wypiecz.", sortOrder: 0 }],
    },
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

  const listUrl = `${WEB_ORIGIN}/kitchens/${kitchenId}/recipes?categories=${breakfast.id},${soups.id}`;
  const formUrl = `${WEB_ORIGIN}/kitchens/${kitchenId}/recipes/new`;

  for (const [label, size] of [
    ["desktop", { width: 1440, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const page = await context.newPage();
    await page.setViewportSize(size);

    await page.goto(listUrl, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Przepisy" }).waitFor();
    await shot(page, `recipe-categories-list-filters-${label}.png`);

    await page.getByRole("button", { name: "Zarządzaj kategoriami" }).click();
    await page.getByRole("dialog").waitFor();
    await shot(page, `recipe-categories-manage-${label}.png`);
    await page.getByRole("button", { name: "Zamknij" }).click();

    await page.goto(formUrl, { waitUntil: "networkidle" });
    await page.getByText("Kategorie", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "Śniadania" }).click();
    await page.getByRole("button", { name: "Zupy" }).click();
    await shot(page, `recipe-categories-form-${label}.png`);

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
