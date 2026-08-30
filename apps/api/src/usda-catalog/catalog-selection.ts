/**
 * Metadane doboru katalogu USDA.
 * Pełna lista FDC + aliasy: `catalog-selection.json` (źródło prawdy dla build v2).
 */
export type CatalogSelection = {
  fdcId: number;
  preferDataType?: 'Foundation' | 'SR Legacy';
  polishName: string;
  aliases: string[];
  variantLabel: string;
  compositionMayVary?: boolean;
};

export const USDA_CATALOG_VERSION = '2026-08-usda-v2';
export const USDA_FOUNDATION_RELEASE = '2025-12-18';
export const USDA_SR_LEGACY_RELEASE = '2018-04';
