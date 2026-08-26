/**
 * Capture UX screenshots at real Playwright viewports.
 * desktop: 1440×900, mobile: 390×844
 *
 * Prerequisites: API on :3001, web on :3000
 * Usage: node scripts/capture-ux-screenshots.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "verification-screenshots");
const API = process.env.API_ORIGIN ?? "http://localhost:3001";
const WEB = process.env.PUBLIC_WEB_ORIGIN ?? "http://localhost:3000";

function cookieJar() {
  const jar = new Map();
  return {
    store(res) {
      const raw = res.headers.getSetCookie?.() ?? [];
      for (const line of raw) {
        const [pair] = line.split(";");
        const i = pair.indexOf("=");
        if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
      }
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    entries() {
      return [...jar.entries()].map(([name, value]) => ({
        name,
        value,
        domain: "localhost",
        path: "/",
      }));
    },
  };
}

async function api(pathName, { method = "GET", body, cookies } = {}) {
  const res = await fetch(`${API}${pathName}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: WEB,
      cookie: cookies.header(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  cookies.store(res);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${pathName} → ${res.status} ${text}`);
  }
  return json;
}

async function seedDemo() {
  const cookies = cookieJar();
  const email = `demo.ux.${Date.now()}@example.com`;
  const password = "DemoHaslo123!";

  await api("/api/auth/sign-up/email", {
    method: "POST",
    cookies,
    body: { email, password, name: "Demo UX" },
  });

  const kitchen = await api("/api/kitchens", {
    method: "POST",
    cookies,
    body: { name: "Kuchnia Demo UX" },
  });

  const milk = await api(`/api/kitchens/${kitchen.id}/products`, {
    method: "POST",
    cookies,
    body: { name: "Mleko", defaultUnit: "milliliter", category: "Nabiał" },
  });

  await api(`/api/kitchens/${kitchen.id}/products/${milk.id}/purchase-options`, {
    method: "POST",
    cookies,
    body: {
      name: "Karton 1 l",
      contentQuantity: "1000.000",
      contentUnit: "milliliter",
      isDefault: true,
    },
  });

  await api(`/api/kitchens/${kitchen.id}/products/${milk.id}/purchase-options`, {
    method: "POST",
    cookies,
    body: {
      name: "Butelka 500 ml",
      contentQuantity: "500.000",
      contentUnit: "milliliter",
      isDefault: false,
    },
  });

  await api(`/api/kitchens/${kitchen.id}/stock-items`, {
    method: "POST",
    cookies,
    body: {
      productId: milk.id,
      quantity: "500.000",
      location: "fridge",
      purchasePriceMinor: 350,
    },
  });

  const eggs = await api(`/api/kitchens/${kitchen.id}/products`, {
    method: "POST",
    cookies,
    body: { name: "Jajka", defaultUnit: "piece" },
  });

  await api(`/api/kitchens/${kitchen.id}/products/${eggs.id}/purchase-options`, {
    method: "POST",
    cookies,
    body: {
      name: "Opakowanie 10 szt.",
      contentQuantity: "10.000",
      contentUnit: "piece",
      isDefault: true,
    },
  });

  const recipe = await api(`/api/kitchens/${kitchen.id}/recipes`, {
    method: "POST",
    cookies,
    body: {
      name: "Omlet na mleku",
      description: "Puszysty omlet śniadaniowy z odrobiną mleka.",
      servings: 2,
      prepTimeMinutes: 5,
      cookTimeMinutes: 10,
      difficulty: "easy",
      tags: ["śniadanie", "szybkie"],
      visibility: "kitchen",
      ingredients: [
        {
          name: "Jajka",
          quantity: "4.000",
          unit: "piece",
          productId: eggs.id,
          sortOrder: 0,
        },
        {
          name: "Mleko",
          quantity: "600.000",
          unit: "milliliter",
          productId: milk.id,
          sortOrder: 1,
        },
      ],
      steps: [
        {
          title: "Przygotowanie",
          instruction: "Roztrzep jajka z mlekiem i szczyptą soli.",
          durationMinutes: 3,
          sortOrder: 0,
        },
        {
          title: "Smażenie",
          instruction: "Smaż na średnim ogniu, aż spód się zetnie.",
          durationMinutes: 7,
          sortOrder: 1,
        },
      ],
    },
  });

  await api(
    `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
    {
      method: "POST",
      cookies,
      body: {
        idempotencyKey: `demo-gap-${Date.now()}`,
        servings: 2,
      },
    },
  );

  const items = await api(`/api/kitchens/${kitchen.id}/shopping-list/items`, {
    cookies,
  });
  const first = Array.isArray(items) ? items[0] : null;
  if (first?.id) {
    await api(
      `/api/kitchens/${kitchen.id}/shopping-list/items/${first.id}/status`,
      {
        method: "PATCH",
        cookies,
        body: { status: "bought" },
      },
    );
  }

  return {
    email,
    password,
    cookies,
    recipeUrl: `${WEB}/kitchens/${kitchen.id}/recipes/${recipe.id}`,
    shoppingUrl: `${WEB}/kitchens/${kitchen.id}/shopping-list`,
  };
}

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      shell: true,
      stdio: "inherit",
      ...opts,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}

async function ensurePlaywright() {
  const require = createRequire(import.meta.url);
  return require("playwright");
}

async function readPngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`${filePath} is not PNG`);
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const demo = await seedDemo();
  const { chromium } = await ensurePlaywright();

  const browser = await chromium.launch({ headless: true });
  const shots = [
    {
      name: "recipe-detail-desktop.png",
      url: demo.recipeUrl,
      viewport: { width: 1440, height: 900 },
    },
    {
      name: "recipe-detail-mobile.png",
      url: demo.recipeUrl,
      viewport: { width: 390, height: 844 },
    },
    {
      name: "shopping-list-desktop.png",
      url: demo.shoppingUrl,
      viewport: { width: 1440, height: 900 },
    },
    {
      name: "shopping-list-mobile.png",
      url: demo.shoppingUrl,
      viewport: { width: 390, height: 844 },
    },
  ];

  const results = [];

  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: 1,
    });
    await context.addCookies(demo.cookies.entries());
    const page = await context.newPage();
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = `
        nextjs-portal,
        [data-next-badge-root],
        [data-nextjs-toast],
        #__next-build-watcher {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `;
      document.documentElement.appendChild(style);
    });
    await page.goto(shot.url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    // Extra hide in case portal mounts after load
    await page.addStyleTag({
      content: `
        nextjs-portal,
        [data-next-badge-root],
        [data-nextjs-toast] {
          display: none !important;
        }
      `,
    });
    const filePath = path.join(outDir, shot.name);
    await page.screenshot({
      path: filePath,
      fullPage: false,
      type: "png",
    });
    const size = await readPngSize(filePath);
    if (
      size.width !== shot.viewport.width ||
      size.height !== shot.viewport.height
    ) {
      throw new Error(
        `${shot.name}: expected ${shot.viewport.width}×${shot.viewport.height}, got ${size.width}×${size.height}`,
      );
    }
    results.push({ file: filePath, ...size });
    await context.close();
  }

  await browser.close();
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
