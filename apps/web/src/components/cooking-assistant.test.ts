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

describe("cooking assistant", () => {
  it("detail page mounts floating assistant for recipes with steps", () => {
    const page = read("src/app/kitchens/[id]/recipes/[recipeId]/page.tsx");
    assert.match(page, /CookingAssistant/);
    assert.match(page, /recipe\.steps\.length > 0/);
  });

  it("assistant panel has progress, navigation and needed-now section", () => {
    const assistant = read("src/components/cooking-assistant.tsx");
    assert.match(assistant, /Uruchom asystenta gotowania/);
    assert.match(assistant, /Asystent gotowania/);
    assert.match(assistant, /Potrzebne teraz/);
    assert.match(assistant, /Następny krok/);
    assert.match(assistant, /Zakończ gotowanie/);
    assert.match(assistant, /Nie wygaszaj ekranu/);
    assert.match(assistant, /wakeLock/);
    assert.match(assistant, /Masz rozpoczęte gotowanie/);
    assert.doesNotMatch(assistant, /Babka ziemniaczana/);
    assert.doesNotMatch(assistant, /animate-ping/);
  });

  it("edit form can assign ingredients to steps", () => {
    const form = read("src/components/recipe-form.tsx");
    assert.match(form, /Przypisz składniki/);
    assert.match(form, /ingredientIds/);
    assert.match(form, /RecipeStepIngredientPicker/);
  });

  it("session helpers persist timers and resume state", () => {
    const session = read("src/lib/cooking-session.ts");
    const timer = read("src/lib/cooking-timer.ts");
    assert.match(session, /cooking-session:v1/);
    assert.match(timer, /endsAt/);
    assert.match(timer, /pausedRemainingMs/);
  });
});
