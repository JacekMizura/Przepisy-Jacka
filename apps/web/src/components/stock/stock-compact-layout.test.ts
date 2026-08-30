import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(__dirname, name), "utf8");
}

describe("stock modern cards layout contracts", () => {
  it("uses card grid matching reference breakpoints", () => {
    const tab = read("stock-tab.tsx");
    assert.match(tab, /data-testid="stock-cards-grid"/);
    assert.match(tab, /grid-cols-1/);
    assert.match(tab, /md:grid-cols-2/);
    assert.match(tab, /xl:grid-cols-3/);
    assert.match(tab, /gap-6/);
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
    assert.match(card, /Warianty \(/);
  });

  it("product card uses portal menu and consume action", () => {
    const card = read("inventory-card.tsx");
    assert.match(card, /ProductActionsMenu/);
    assert.match(card, />\s*Zużyj\s*</);
    assert.match(card, /data-testid="stock-inventory-card"/);
  });

  it("actions menu uses portal", () => {
    const menu = read("product-actions-menu.tsx");
    assert.match(menu, /createPortal/);
    assert.match(menu, /document\.body/);
    assert.match(menu, /data-testid="product-actions-menu-portal"/);
  });

  it("group thumb field is neutral package icon not first variant photo", () => {
    const card = read("inventory-card.tsx");
    const groupStart = card.indexOf("export function InventoryGroupCard");
    const variantStart = card.indexOf("function VariantRow");
    const groupBlock = card.slice(groupStart, variantStart);
    assert.match(groupBlock, /Package/);
    assert.doesNotMatch(groupBlock, /variants\[0\]/);
    assert.doesNotMatch(groupBlock, /imageUrl/);
  });
});
