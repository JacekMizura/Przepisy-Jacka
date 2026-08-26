/**
 * Screenshots for media / nutrition / recipe costs.
 * Requires web :3000 and API :3001 with MEDIA_STORAGE_DRIVER=memory.
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
  "media-nutrition-recipe-costs",
);

/** Minimal valid 1×1 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const email = `media.ui.${Date.now()}@example.com`;
  const password = "DemoHaslo123!";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: WEB,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  async function api(method, urlPath, body) {
    const res = await context.request.fetch(urlPath, {
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

  async function uploadAndAttach(purpose, target, attachPath) {
    const begin = await api("POST", `/api/kitchens/${kitchenId}/media/uploads`, {
      purpose,
      declaredMimeType: "image/png",
      declaredByteSize: TINY_PNG.byteLength,
      target,
    });
    const uploadUrl = begin.uploadUrl;
    if (
      String(uploadUrl).includes("memory-upload") ||
      String(uploadUrl).startsWith("/api/")
    ) {
      const pathOnly = String(uploadUrl).replace(/^https?:\/\/[^/]+/, "");
      await api("POST", pathOnly, {
        contentBase64: TINY_PNG.toString("base64"),
      });
    } else {
      const put = await context.request.fetch(uploadUrl, {
        method: "PUT",
        headers: begin.headers ?? { "content-type": "image/png" },
        data: TINY_PNG,
      });
      if (!put.ok()) {
        throw new Error(`PUT upload failed ${put.status()}`);
      }
    }
    await api(
      "POST",
      `/api/kitchens/${kitchenId}/media/${begin.mediaAssetId}/complete`,
      {},
    );
    await api("POST", attachPath, { mediaAssetId: begin.mediaAssetId });
  }

  await api("POST", "/api/auth/sign-up/email", {
    email,
    password,
    name: "Media UI",
  });
  const kitchen = await api("POST", "/api/kitchens", {
    name: "Kuchnia mediów",
  });
  const kitchenId = kitchen.id;

  const milk = await api("POST", `/api/kitchens/${kitchenId}/products`, {
    name: "Mleko",
    defaultUnit: "milliliter",
  });
  await api("POST", `/api/kitchens/${kitchenId}/products/${milk.id}/configure-purchase`, {
    mode: "exact",
  });
  await api("PUT", `/api/kitchens/${kitchenId}/products/${milk.id}/nutrition`, {
    baseQuantity: "100.000",
    baseUnit: "milliliter",
    kcal: "42.000",
    proteinGrams: "3.400",
    carbsGrams: "5.000",
    fatGrams: "1.500",
  });

  const eggs = await api("POST", `/api/kitchens/${kitchenId}/products`, {
    name: "Jajka",
    defaultUnit: "piece",
  });
  await api("POST", `/api/kitchens/${kitchenId}/products/${eggs.id}/configure-purchase`, {
    mode: "exact",
  });
  await api("PUT", `/api/kitchens/${kitchenId}/products/${eggs.id}/nutrition`, {
    baseQuantity: "1.000",
    baseUnit: "piece",
    kcal: "72.000",
    proteinGrams: "6.300",
    carbsGrams: "0.400",
    fatGrams: "4.800",
  });

  // Purchases for cost estimate
  await api("POST", `/api/kitchens/${kitchenId}/shopping-list/items`, {
    productId: milk.id,
    plannedQuantity: "1000.000",
    plannedUnit: "milliliter",
  });
  await api("POST", `/api/kitchens/${kitchenId}/shopping-list/items`, {
    productId: eggs.id,
    plannedQuantity: "10.000",
    plannedUnit: "piece",
  });
  const list = await api(
    "GET",
    `/api/kitchens/${kitchenId}/shopping-list/items`,
  );
  const milkItem = list.find((i) => i.productId === milk.id);
  const eggItem = list.find((i) => i.productId === eggs.id);
  await api(
    "PATCH",
    `/api/kitchens/${kitchenId}/shopping-list/items/${milkItem.id}/status`,
    { status: "bought" },
  );
  await api(
    "PATCH",
    `/api/kitchens/${kitchenId}/shopping-list/items/${eggItem.id}/status`,
    { status: "bought" },
  );
  await api("POST", `/api/kitchens/${kitchenId}/purchases/checkout`, {
    idempotencyKey: crypto.randomUUID(),
    lines: [
      {
        shoppingListItemId: milkItem.id,
        quantity: "1000.000",
        inputUnit: "milliliter",
        location: "fridge",
        priceMinor: 320,
      },
      {
        shoppingListItemId: eggItem.id,
        quantity: "10.000",
        inputUnit: "piece",
        location: "fridge",
        priceMinor: 1200,
      },
    ],
  });

  const recipe = await api("POST", `/api/kitchens/${kitchenId}/recipes`, {
    name: "Omlet z mlekiem",
    servings: 2,
    visibility: "kitchen",
    difficulty: "easy",
    prepTimeMinutes: 10,
    cookTimeMinutes: 5,
    ingredients: [
      {
        name: "Mleko",
        productId: milk.id,
        quantity: "600.000",
        unit: "milliliter",
        sortOrder: 0,
      },
      {
        name: "Jajka",
        productId: eggs.id,
        quantity: "4.000",
        unit: "piece",
        sortOrder: 1,
      },
    ],
    steps: [
      { instruction: "Rozbij jajka i dodaj mleko.", sortOrder: 0 },
      { instruction: "Usmaż na patelni.", sortOrder: 1 },
    ],
  });

  await uploadAndAttach(
    "recipe_cover",
    { recipeId: recipe.id },
    `/api/kitchens/${kitchenId}/recipes/${recipe.id}/cover`,
  );
  const detail = await api(
    "GET",
    `/api/kitchens/${kitchenId}/recipes/${recipe.id}`,
  );
  const stepId = detail.steps[0].id;
  await uploadAndAttach(
    "recipe_step",
    { recipeStepId: stepId },
    `/api/kitchens/${kitchenId}/recipes/${recipe.id}/steps/${stepId}/image`,
  );
  await uploadAndAttach(
    "product",
    { productId: milk.id },
    `/api/kitchens/${kitchenId}/products/${milk.id}/image`,
  );

  // Second recipe for tile grid
  await api("POST", `/api/kitchens/${kitchenId}/recipes`, {
    name: "Kanapka testowa",
    servings: 1,
    visibility: "private",
    difficulty: "easy",
    ingredients: [
      {
        name: "Jajka",
        productId: eggs.id,
        quantity: "1.000",
        unit: "piece",
        sortOrder: 0,
      },
    ],
    steps: [{ instruction: "Ugotuj.", sortOrder: 0 }],
  });

  async function shot(name) {
    await page.screenshot({
      path: path.join(OUT, name),
      fullPage: false,
    });
  }

  // Desktop 1440×900
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/kitchens/${kitchenId}/recipes`);
  await page.getByText("Omlet z mlekiem").waitFor();
  await shot("01-recipes-list-desktop.png");

  await page.goto(`/kitchens/${kitchenId}/recipes/${recipe.id}`);
  await page.getByText("Szacunkowo na podstawie ostatnich zakupów").waitFor({
    timeout: 15000,
  });
  await shot("02-recipe-detail-hero-desktop.png");
  await page.getByText(/kcal|białko|koszt/i).first().waitFor();
  await shot("03-recipe-estimate-desktop.png");
  await page.locator("text=Rozbij jajka").scrollIntoViewIfNeeded();
  await shot("04-recipe-step-image-desktop.png");

  await page.goto(`/kitchens/${kitchenId}/stock`);
  await page.getByRole("heading", { name: "Katalog produktów" }).click();
  await page.getByRole("button", { name: "Szczegóły" }).first().click();
  await page.getByText("Wartości odżywcze").waitFor({ timeout: 10000 });
  await shot("05-product-nutrition-desktop.png");

  // Mobile 390×844
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/kitchens/${kitchenId}/recipes`);
  await page.getByText("Omlet z mlekiem").waitFor();
  await shot("06-recipes-list-mobile.png");

  await page.goto(`/kitchens/${kitchenId}/recipes/${recipe.id}`);
  await page.getByText("Szacunkowo na podstawie ostatnich zakupów").waitFor({
    timeout: 15000,
  });
  await shot("07-recipe-detail-mobile.png");

  await page.goto(`/kitchens/${kitchenId}/stock`);
  await page.getByRole("heading", { name: "Katalog produktów" }).click();
  await page.getByRole("button", { name: "Szczegóły" }).first().click();
  await page.getByText("Wartości odżywcze").waitFor({ timeout: 10000 });
  await shot("08-product-nutrition-mobile.png");

  await browser.close();
  console.log("Screenshots written to", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
