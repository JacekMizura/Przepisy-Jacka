import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("StockGroupThumb", () => {
  const source = readFileSync(
    join(__dirname, "stock-group-thumb.tsx"),
    "utf8",
  );

  it("uses neutral icon and never renders variant image collage", () => {
    assert.match(source, /Package/);
    assert.doesNotMatch(source, /buildGroupThumbCollage/);
    assert.doesNotMatch(source, /imageUrls/);
    assert.doesNotMatch(source, /layout === "grid"/);
    assert.doesNotMatch(source, /<img/);
  });
});
