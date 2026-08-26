/**
 * Local screenshot seed — creates kitchen, milk with carton option, stock, recipe, shopping gaps.
 * Run: node scripts/seed-screenshot-demo.mjs
 */
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
  };
}

async function api(path, { method = "GET", body, cookies } = {}) {
  const res = await fetch(`${API}${path}`, {
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
    throw new Error(`${method} ${path} → ${res.status} ${text}`);
  }
  return json;
}

async function main() {
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

  console.log(
    JSON.stringify(
      {
        email,
        password,
        kitchenId: kitchen.id,
        recipeId: recipe.id,
        recipeUrl: `${WEB}/kitchens/${kitchen.id}/recipes/${recipe.id}`,
        shoppingUrl: `${WEB}/kitchens/${kitchen.id}/shopping-list`,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
