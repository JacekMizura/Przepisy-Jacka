import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("ProductActionsMenu portal", () => {
  const source = readFileSync(
    join(__dirname, "product-actions-menu.tsx"),
    "utf8",
  );

  it("renders menu via createPortal to document.body", () => {
    assert.match(source, /createPortal/);
    assert.match(source, /document\.body/);
    assert.match(source, /data-testid="product-actions-menu-portal"/);
  });

  it("stops click propagation so row expand is not toggled", () => {
    assert.match(source, /event\.stopPropagation\(\)/);
    assert.match(source, /onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  });

  it("uses fixed positioning with viewport-aware placement", () => {
    assert.match(source, /position:\s*"fixed"/);
    assert.match(source, /computeMenuPosition/);
    assert.match(source, /Escape/);
  });
});
