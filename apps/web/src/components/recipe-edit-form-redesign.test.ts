import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("recipe edit form redesign", () => {
  it("edit page has sticky header with save and dirty leave dialog", () => {
    const page = read(
      "app/kitchens/[id]/recipes/[recipeId]/edit/page.tsx",
    );
    assert.match(page, /sticky/);
    assert.match(page, /Zapisz zmiany/);
    assert.match(page, /Uzupe/);
    assert.match(page, /Masz niezapisane zmiany/);
    assert.match(page, /onDirtyChange/);
    assert.match(page, /form="recipe-edit-form"/);
    assert.match(page, /hideSubmit/);
    assert.match(page, /stepFiles/);
    assert.match(page, /uploadKitchenMedia/);
  });

  it("recipe form has sections, tags, source fields and dirty tracking", () => {
    const form = read("components/recipe-form.tsx");
    assert.match(form, /Podstawowe informacje/);
    assert.match(form, /Sk/);
    assert.match(form, /Kroki przygotowania/);
    assert.match(form, /sourceUrl/);
    assert.match(form, /sourceAuthor/);
    assert.match(form, /commitTagDraft/);
    assert.match(form, /beforeunload/);
    assert.match(form, /hideSubmit/);
    assert.match(form, /formId/);
    assert.match(form, /isHttpUrl/);
    assert.match(form, /Dodaj wskaz/);
    assert.match(form, /Dodaj kolejny sk/);
    assert.match(form, /Dodaj kolejny krok/);
    assert.match(form, /Przenieś składnik wyżej/);
    assert.match(form, /Przenieś krok wyżej/);
    assert.match(form, /reorderByIndex/);
    assert.match(form, /RecipeIngredientProductLink/);
    assert.match(form, /requestRemoveIngredient/);
    assert.match(form, /focusFirstError/);
    assert.match(form, /ConfirmDialog/);
    assert.match(form, /Przypisz sk/);
    assert.match(form, /RecipeStepIngredientPicker/);
  });

  it("product link searches name brand ean and distinguishes states", () => {
    const link = read("components/recipe-ingredient-product-link.tsx");
    assert.match(link, /variantLabel/);
    assert.match(link, /ean/);
    assert.match(link, /isArchived/);
    assert.match(link, /niedostępny|usunięty/);
    assert.match(link, /Odłącz/);
    assert.match(link, /z-50/);
  });

  it("cover dropzone uses full-width cover size with confirm remove", () => {
    const media = read("components/media-image-field.tsx");
    const cover = read("components/recipe-media-fields.tsx");
    assert.match(media, /cover:/);
    assert.match(media, /ABORT_REMOVE/);
    assert.match(cover, /size="cover"/);
    assert.match(cover, /Usunąć okładkę/);
    assert.match(cover, /size="wide"/);
  });

  it("does not hardcode HTML sample data", () => {
    const form = read("components/recipe-form.tsx");
    const page = read(
      "app/kitchens/[id]/recipes/[recipeId]/edit/page.tsx",
    );
    assert.doesNotMatch(form, /Babka ziemniaczana/);
    assert.doesNotMatch(page, /Babka ziemniaczana/);
    assert.doesNotMatch(form, /unsplash/i);
  });
});
