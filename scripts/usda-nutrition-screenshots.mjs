/**
 * Zrzuty: wyszukiwanie USDA, wybór wariantu/podgląd, zapisany produkt.
 * Desktop 1440×900, mobile 390×844.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = resolve(ROOT, "apps/api");
const WEB_DIR = resolve(ROOT, "apps/web");
const OUT = resolve(ROOT, "verification-screenshots", "usda-nutrition");
const WEB_ORIGIN = "http://127.0.0.1:3130";
const API_ORIGIN = "http://127.0.0.1:3131";
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
  const merged = { ...process.env, ...env };
  // Next.js build wymaga braku NODE_ENV=development.
  if (!Object.prototype.hasOwnProperty.call(env, "NODE_ENV")) {
    delete merged.NODE_ENV;
  }
  const result = spawnSync("pnpm", args, {
    cwd: ROOT,
    env: merged,
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
      origin: WEB_ORIGIN,
      "content-type": "application/json",
      ...(cookies && cookies.size > 0
        ? { cookie: cookieHeader(cookies) }
        : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (cookies) applySetCookie(cookies, res.headers);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, body: json, text, headers: res.headers };
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

  console.log("sync USDA catalog…");
  pnpm(["--filter", "@moja-kuchnia/api", "usda:sync-catalog"]);

  console.log("build api+web…");
  pnpm(["--filter", "@moja-kuchnia/api", "build"]);
  pnpm(["--filter", "@moja-kuchnia/web", "build"], { API_ORIGIN });

  console.log("Start API…");
  const apiProc = run("node", ["dist/main.js"], {
    cwd: API_DIR,
    env: {
      NODE_ENV: "development",
      API_HOST: "127.0.0.1",
      API_PORT: "3131",
      DATABASE_URL,
      CORS_ORIGINS: WEB_ORIGIN,
      PUBLIC_WEB_ORIGIN: WEB_ORIGIN,
      BETTER_AUTH_URL: WEB_ORIGIN,
      BETTER_AUTH_SECRET: "local-dev-only-not-for-production-use-32",
      AUTH_TRUSTED_ORIGINS: WEB_ORIGIN,
      ALLOW_DEMO_SEED: "false",
      MEDIA_STORAGE_DRIVER: "memory",
      OPEN_FOOD_FACTS_DRIVER: "http",
      OPEN_FOOD_FACTS_BASE_URL: "http://127.0.0.1:9",
    },
  });
  children.push(apiProc);
  apiProc.stderr.on("data", (c) => process.stderr.write(c));
  await waitHttp(`${API_ORIGIN}/api/health`);

  console.log("Start web…");
  const webProc = run(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "next", "start", "--hostname", "127.0.0.1", "--port", "3130"],
    {
      cwd: WEB_DIR,
      env: { API_ORIGIN, PORT: "3130" },
      shell: true,
    },
  );
  children.push(webProc);
  webProc.stdout?.on("data", (c) => process.stdout.write(c));
  webProc.stderr?.on("data", (c) => process.stderr.write(c));
  await waitHttp(WEB_ORIGIN);

  const stamp = Date.now();
  const cookies = new Map();
  const signUp = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: {
      email: `usda.shot.${stamp}@example.com`,
      password: "DemoHaslo123!",
      name: "USDA Shot",
    },
  });
  applySetCookie(cookies, signUp.headers);
  if (signUp.status >= 400) {
    throw new Error(`sign-up ${signUp.status} ${signUp.text}`);
  }

  const kitchenRes = await api("/api/kitchens", {
    method: "POST",
    cookies,
    body: { name: "Kuchnia USDA Shot" },
  });
  const kitchenId = kitchenRes.body.id;
  await api(`/api/kitchens/${kitchenId}/products`, {
    method: "POST",
    cookies,
    body: { name: `Pomidor shot ${stamp}`, defaultUnit: "gram" },
  });

  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    await context.addCookies(
      [...cookies.entries()].map(([name, value]) => ({
        name,
        value,
        url: WEB_ORIGIN,
      })),
    );
    const page = await context.newPage();
    await page.goto(`${WEB_ORIGIN}/kitchens/${kitchenId}/stock`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1000);

    // Katalog produktów jest zwinięty domyślnie; wartości odżywcze w „Szczegółach”.
    await page.getByRole("button", { name: /Katalog produktów/i }).click();
    await page.getByRole("button", { name: /^Szczegóły$/i }).first().click();
    const nutritionToggle = page
      .getByRole("button", { name: /Dodaj dane|Edytuj/i })
      .first();
    await nutritionToggle.waitFor({ timeout: 20_000 });
    await nutritionToggle.click();
    await page.getByPlaceholder(/pomidor|jabłko|łosoś/i).fill("pomidor");
    await page.getByRole("button", { name: "Szukaj" }).click();
    await page.waitForSelector("text=kcal/100 g", { timeout: 15_000 });
    await page.screenshot({
      path: resolve(OUT, `usda-nutrition-search-${vp.name}.png`),
      fullPage: true,
    });

    await page.locator("ul button").filter({ hasText: /pomidor/i }).first().click();
    await page.waitForSelector("text=Wartości referencyjne", {
      timeout: 15_000,
    });
    await page.screenshot({
      path: resolve(OUT, `usda-nutrition-preview-${vp.name}.png`),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Użyj danych" }).click();
    const replace = page.getByRole("button", { name: /Zastąp wartości/i });
    if (await replace.isVisible().catch(() => false)) {
      await replace.click();
    }
    await page.getByRole("button", { name: /Zapisz wartości/i }).click();
    await page.waitForSelector("text=USDA FoodData Central", {
      timeout: 15_000,
    });
    await page.screenshot({
      path: resolve(OUT, `usda-nutrition-saved-${vp.name}.png`),
      fullPage: true,
    });

    await context.close();
  }

  await browser.close();
  console.log("Screenshots written to", OUT);
  stop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
