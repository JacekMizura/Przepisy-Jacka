/**
 * Screenshots: Open Food Facts nutrition lookup on product create/edit.
 * Requires web :3000 and API :3001. Uses fixture mock via env if set;
 * otherwise seeds a product and opens the create form with a valid EAN.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = process.env.PUBLIC_WEB_ORIGIN || "http://localhost:3000";
const OUT = path.join(
  __dirname,
  "..",
  "verification-screenshots",
  "product-nutrition-lookup",
);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const email = `off.ui.${Date.now()}@example.com`;
  const password = "DemoHaslo123!";

  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({
    baseURL: WEB,
    viewport: { width: 1440, height: 900 },
  });
  const page = await desktop.newPage();

  async function api(method, urlPath, body) {
    const res = await desktop.request.fetch(urlPath, {
      method,
      headers: { "content-type": "application/json", origin: WEB },
      data: body,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok()) {
      throw new Error(`${method} ${urlPath} → ${res.status()}: ${text}`);
    }
    return data;
  }

  await api("POST", "/api/auth/sign-up/email", {
    email,
    password,
    name: "OFF UI",
  });
  const kitchen = await api("POST", "/api/kitchens", {
    name: "Kuchnia OFF UI",
  });
  const kitchenId = kitchen.id;

  await api("POST", `/api/kitchens/${kitchenId}/products`, {
    name: "Nutella katalog",
    defaultUnit: "gram",
    ean: "3017624010701",
  });

  await page.goto(`/login`);
  await page.getByLabel(/e-mail|email/i).fill(email);
  await page.getByLabel(/hasło|password/i).fill(password);
  await page.getByRole("button", { name: /zaloguj/i }).click();
  await page.waitForURL(/\/kitchens/);

  await page.goto(`/kitchens/${kitchenId}/stock`);
  await page.getByRole("button", { name: /nowy produkt|dodaj produkt/i }).first().click();
  await page.getByLabel(/EAN/i).fill("3017624010701");
  await page.getByRole("button", { name: /Pobierz wartości po EAN/i }).click();
  await page.getByText(/Open Food Facts|Znaleziono|Nie znaleziono|Brak/i).first().waitFor({
    timeout: 15_000,
  });
  await page.screenshot({
    path: path.join(OUT, "01-create-lookup-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: /katalog/i }).first().click().catch(() => undefined);
  // Expand catalog product details
  const catalogToggle = page.getByRole("button", { name: /katalog produktów/i });
  if (await catalogToggle.count()) {
    await catalogToggle.click();
  }
  const details = page.getByRole("button", { name: /szczegóły|rozwiń/i }).first();
  if (await details.count()) {
    await details.click();
  }
  const editNutrition = page.getByRole("button", { name: /Dodaj dane|Edytuj/i }).first();
  if (await editNutrition.count()) {
    await editNutrition.click();
    await page.getByRole("button", { name: /Pobierz wartości po EAN/i }).waitFor({
      timeout: 10_000,
    });
  }
  await page.screenshot({
    path: path.join(OUT, "02-edit-nutrition-desktop.png"),
    fullPage: true,
  });

  const mobile = await browser.newContext({
    baseURL: WEB,
    viewport: { width: 390, height: 844 },
    storageState: await desktop.storageState(),
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`/kitchens/${kitchenId}/stock`);
  await mobilePage.getByRole("button", { name: /nowy produkt|dodaj produkt/i }).first().click();
  await mobilePage.getByLabel(/EAN/i).fill("3017624010701");
  await mobilePage.getByRole("button", { name: /Pobierz wartości po EAN/i }).click();
  await mobilePage.waitForTimeout(1500);
  await mobilePage.screenshot({
    path: path.join(OUT, "03-create-lookup-mobile.png"),
    fullPage: true,
  });

  await browser.close();
  console.log(`Saved screenshots to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
