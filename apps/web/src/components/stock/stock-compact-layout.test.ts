import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(__dirname, name), "utf8");
}

describe("stock compact layout contracts", () => {
  it("stock list container avoids heavy card chrome", () => {
    const tab = read("stock-tab.tsx");
    assert.match(tab, /data-testid="stock-compact-list"/);
    assert.doesNotMatch(
      tab,
      /data-testid="stock-compact-list"[\s\S]{0,200}rounded-2xl[\s\S]{0,80}shadow-sm/,
    );
    assert.match(tab, /Produkt/);
    assert.match(tab, /Stan/);
    assert.match(tab, /Partie/);
    assert.match(tab, /Najbliższy termin/);
    assert.match(tab, /Miejsce/);
    assert.match(tab, /Akcje/);
  });

  it("group row has no Zużyj action", () => {
    const tab = read("stock-tab.tsx");
    const groupBlockStart = tab.indexOf("function StockGroupTableBlock");
    const groupBlockEnd = tab.indexOf("function StockGroupMobileBlock");
    assert.ok(groupBlockStart > 0 && groupBlockEnd > groupBlockStart);
    const groupBlock = tab.slice(groupBlockStart, groupBlockEnd);
    assert.doesNotMatch(groupBlock, />\s*Zużyj\s*</);
    assert.match(groupBlock, /data-testid="stock-group-row"/);
  });

  it("batch delete lives only in portal menu as destructive item", () => {
    const row = read("stock-product-row.tsx");
    assert.match(row, /label:\s*"Usuń partię"/);
    assert.match(row, /destructive:\s*true/);
    assert.doesNotMatch(row, />\s*Usuń partię\s*</);
    assert.match(row, /ProductActionsMenu/);
  });

  it("actions menu uses portal", () => {
    const menu = read("product-actions-menu.tsx");
    assert.match(menu, /createPortal/);
    assert.match(menu, /document\.body/);
    assert.match(menu, /data-testid="product-actions-menu-portal"/);
  });
});
