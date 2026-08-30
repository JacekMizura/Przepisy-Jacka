import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(__dirname, name), "utf8");
}

describe("stock polish layout contracts", () => {
  it("uses compact card grid", () => {
    const tab = read("stock-tab.tsx");
    assert.match(tab, /data-testid="stock-cards-grid"/);
    assert.match(tab, /grid-cols-1/);
    assert.match(tab, /md:grid-cols-2/);
    assert.match(tab, /2xl:grid-cols-3/);
    assert.match(tab, /gap-4/);
    assert.doesNotMatch(tab, /data-testid="stock-compact-list"/);
  });

  it("group card has no whole-group Zużyj action", () => {
    const card = read("inventory-card.tsx");
    const groupStart = card.indexOf("export function InventoryGroupCard");
    assert.ok(groupStart > 0);
    const groupBlock = card.slice(groupStart);
    assert.doesNotMatch(
      groupBlock.slice(0, groupBlock.indexOf("function VariantRow")),
      />\s*Zużyj\s*</,
    );
    assert.match(card, /data-testid="stock-group-card"/);
    assert.match(card, /Warianty/);
  });

  it("product card uses square cover image and category badge", () => {
    const card = read("inventory-card.tsx");
    assert.match(card, /ProductActionsMenu/);
    assert.match(card, /ProductCategoryBadge/);
    assert.match(card, /object-cover/);
    assert.match(card, /h-28 w-28|sm:h-32 sm:w-32/);
    assert.match(card, />\s*Zużyj\s*</);
    assert.match(card, /Dodaj partię/);
    assert.match(card, /data-testid="stock-inventory-card"/);
  });

  it("actions menu uses portal", () => {
    const menu = read("product-actions-menu.tsx");
    assert.match(menu, /createPortal/);
    assert.match(menu, /document\.body/);
    assert.match(menu, /data-testid="product-actions-menu-portal"/);
  });

  it("catalog uses table list with expandable groups", () => {
    const panel = readFileSync(
      join(__dirname, "../product-entry/product-catalog-panel.tsx"),
      "utf8",
    );
    const catalog = read("catalog-card.tsx");
    assert.match(panel, /data-testid="catalog-cards-grid"/);
    assert.match(panel, /Produkt & Marka/);
    assert.match(catalog, /setExpanded/);
    assert.match(catalog, /ProductCategoryBadge/);
    assert.match(catalog, /object-cover/);
  });
});
