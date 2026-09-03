import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("recipe detail redesign contracts", () => {
  it("hero has overlay gradient without fixed attachment", () => {
    const hero = read("src/components/recipe-detail-hero.tsx");
    assert.match(hero, /data-testid="recipe-detail-hero"/);
    assert.match(hero, /bg-gradient-to-b/);
    assert.doesNotMatch(hero, /background-attachment:\s*fixed|bg-fixed/);
    assert.match(hero, /Udostępnij przepis/);
    assert.match(hero, /Wróć do listy przepisów/);
  });

  it("meta bar has Kup braki and servings controls", () => {
    const meta = read("src/components/recipe-detail-meta.tsx");
    assert.match(meta, /Kup braki/);
    assert.match(meta, /data-testid="recipe-buy-gaps"/);
    assert.match(meta, /Zmniejsz liczbę porcji/);
    assert.match(meta, /sticky top-0/);
  });

  it("ingredients card has checkboxes and right-aligned quantity", () => {
    const panel = read("src/components/recipe-ingredients-panel.tsx");
    assert.match(panel, /Zaznaczaj składniki podczas przygotowania/);
    assert.doesNotMatch(panel, /brudnych rękach/);
    assert.match(panel, /ingredient-qty-/);
    assert.match(panel, /Kopiuj/);
  });

  it("steps use cards with Gotowe and omit video section", () => {
    const steps = read("src/components/recipe-steps-editorial.tsx");
    const page = read(
      "src/app/kitchens/[id]/recipes/[recipeId]/page.tsx",
    );
    assert.match(steps, /Gotowe/);
    assert.match(steps, /wykonane/);
    assert.doesNotMatch(page, /Obejrzyj jak to zrobić/);
    assert.doesNotMatch(page, /Przepis w pigułce/);
  });

  it("page wires buy gaps and local cook state persistence", () => {
    const page = read(
      "src/app/kitchens/[id]/recipes/[recipeId]/page.tsx",
    );
    assert.match(page, /loadCookIdSet/);
    assert.match(page, /saveCookIdSet/);
    assert.match(page, /handleBuyGaps/);
    assert.match(page, /shareOrCopyRecipeUrl/);
    assert.match(page, /cookHref/);
    assert.match(page, /CookingAssistant/);
  });
});
