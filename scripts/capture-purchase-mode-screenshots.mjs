/**
 * Local verification screenshots for purchase configuration flow.
 * Requires web on :3000 and API on :3001.
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
  "purchase-configuration-flow",
);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const email = `purchase.mode.${Date.now()}@example.com`;
  const password = "DemoHaslo123!";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    baseURL: WEB,
  });
  const page = await context.newPage();

  async function api(method, urlPath, body) {
    const res = await context.request.fetch(urlPath, {
      method,
      headers: {
        "content-type": "application/json",
        origin: WEB,
      },
      data: body,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok()) {
      throw new Error(`${method} ${urlPath} → ${res.status()}: ${text}`);
    }
    return data;
  }

  await api("POST", "/api/auth/sign-up/email", {
    email,
    password,
    name: "Screenshot User",
  });

  const kitchen = await api("POST", "/api/kitchens", {
    name: "Kuchnia screenshotów",
  });
  const kitchenId = kitchen.id;

  const milk = await api("POST", `/api/kitchens/${kitchenId}/products`, {
    name: "Mleko",
    defaultUnit: "milliliter",
  });
  const milkId = milk.id;

  await api("POST", `/api/kitchens/${kitchenId}/stock-items`, {
    productId: milkId,
    quantity: "500.000",
    location: "fridge",
    purchasePriceMinor: 0,
  });

  const recipe = await api("POST", `/api/kitchens/${kitchenId}/recipes`, {
    name: "Omlet weryfikacyjny",
    servings: 2,
    visibility: "kitchen",
    difficulty: "easy",
    ingredients: [
      {
        name: "Mleko",
        productId: milkId,
        quantity: "600.000",
        unit: "milliliter",
        sortOrder: 0,
      },
    ],
    steps: [{ instruction: "Wymieszaj.", sortOrder: 0 }],
  });
  const recipeId = recipe.id;

  await api("POST", `/api/kitchens/${kitchenId}/products/${milkId}/configure-purchase`, {
    mode: "exact",
  });

  const listItem = await api(
    "POST",
    `/api/kitchens/${kitchenId}/shopping-list/items`,
    {
      productId: milkId,
      plannedQuantity: "100.000",
      plannedUnit: "milliliter",
      requiredQuantity: "100.000",
      requiredUnit: "milliliter",
      sourceRecipeId: recipeId,
      sourceRecipeName: "Omlet weryfikacyjny",
    },
  );

  await api("PATCH", `/api/kitchens/${kitchenId}/products/${milkId}`, {
    purchaseMode: "unconfigured",
  });

  await page.goto(`/kitchens/${kitchenId}/recipes/${recipeId}`);
  await page.getByRole("button", { name: /Dodaj braki do listy/i }).click({
    timeout: 20000,
  });
  await page.getByText("Jak kupujesz ten produkt?").waitFor();
  await page.screenshot({
    path: path.join(OUT, "01-gaps-how-do-you-buy.png"),
    fullPage: false,
  });

  await page.getByRole("button", { name: "W opakowaniach" }).click();
  await page.getByPlaceholder("np. Karton 1 l").fill("Karton 1 l");
  await page.getByPlaceholder("1000").fill("1000");
  await page.screenshot({
    path: path.join(OUT, "02-configure-carton-1l.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: /Zapisz opakowanie/i }).click();
  await page
    .getByText(/1\s*×\s*Karton 1 l/i)
    .first()
    .waitFor({ timeout: 20000 });

  const options = await api(
    "GET",
    `/api/kitchens/${kitchenId}/products/${milkId}/purchase-options`,
  );
  const optionId =
    options.find((o) => o.isDefault)?.id ?? options[0]?.id;

  await api(
    "PATCH",
    `/api/kitchens/${kitchenId}/shopping-list/items/${listItem.id}`,
    {
      purchaseOptionId: optionId,
      packageCount: 1,
    },
  );

  await page.goto(`/kitchens/${kitchenId}/shopping-list`);
  await page.getByText(/1\s*×\s*Karton 1 l/i).waitFor({ timeout: 20000 });
  await page.screenshot({
    path: path.join(OUT, "03-list-after-conversion.png"),
    fullPage: false,
  });

  await browser.close();
  console.log("Screenshots written to", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
