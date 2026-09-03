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

describe("preparation mode vs cooking assistant", () => {
  it("keeps the linear assistant on the recipe detail page", () => {
    const page = read("src/app/kitchens/[id]/recipes/[recipeId]/page.tsx");
    const assistant = read("src/components/cooking-assistant.tsx");
    assert.match(page, /CookingAssistant/);
    assert.match(assistant, /Uruchom asystenta gotowania/);
    assert.match(assistant, /Następny krok/);
    assert.doesNotMatch(assistant, /Tryb przygotowania/);
    assert.doesNotMatch(assistant, /Uruchom tryb przygotowania/);
  });

  it("adds a separate cook route and CTA", () => {
    const meta = read("src/components/recipe-detail-meta.tsx");
    const cook = read(
      "src/app/kitchens/[id]/recipes/[recipeId]/cook/page.tsx",
    );
    const view = read("src/components/preparation-cook-view.tsx");
    const page = read("src/app/kitchens/[id]/recipes/[recipeId]/page.tsx");
    assert.match(meta, /Uruchom tryb przygotowania/);
    assert.match(page, /cookHref/);
    assert.match(cook, /PreparationCookView/);
    assert.match(view, /Możesz zrobić teraz/);
    assert.match(view, /Oczekujące/);
    assert.match(view, /Rozpocznij mimo to/);
    assert.match(view, /prepSessionKey/);
  });

  it("edit form has an optional preparation plan section", () => {
    const form = read("src/components/recipe-form.tsx");
    assert.match(form, /Plan przygotowania/);
    assert.match(form, /Włącz nowoczesny tryb przygotowania/);
    assert.match(form, /Ten krok można rozpocząć po ukończeniu/);
    assert.match(form, /dependsOnKeys/);
  });

  it("stores prep progress separately from the linear assistant", () => {
    const prep = read("src/lib/prep-session.ts");
    const linear = read("src/lib/cooking-session.ts");
    assert.match(prep, /moja-kuchnia:prep-session:v1/);
    assert.match(linear, /moja-kuchnia:cooking-session:v1/);
    assert.equal(prep.includes("prep-session:v1"), true);
    assert.equal(linear.includes("prep-session:v1"), false);
  });
});
