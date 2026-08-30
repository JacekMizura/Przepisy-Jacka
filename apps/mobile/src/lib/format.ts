import type { components } from '@moja-kuchnia/api-client';

export type StockSummary = components['schemas']['StockProductListItemDto'];
export type StockBatch = components['schemas']['StockBatchDetailDto'];
export type ConsumePreview =
  components['schemas']['ConsumeStockPreviewResultDto'];
export type StockConsumption =
  components['schemas']['StockConsumptionResultDto'];
export type ShoppingListItem = components['schemas']['ShoppingListItemDto'];
export type PurchaseSummary = components['schemas']['PurchaseSummaryDto'];
export type PurchaseDetail = components['schemas']['PurchaseDetailDto'];
export type Kitchen = components['schemas']['KitchenSummaryDto'];
export type ProductUnit = 'piece' | 'gram' | 'milliliter';
export type MediaAsset = components['schemas']['MediaAssetDto'];
export type MediaPurpose =
  components['schemas']['BeginMediaUploadDto']['purpose'];

export const UNIT_LABELS: Record<ProductUnit, string> = {
  gram: 'g',
  milliliter: 'ml',
  piece: 'szt.',
};

export function formatQuantity(quantity: string, unit: ProductUnit): string {
  const n = Number(quantity);
  const display = Number.isFinite(n)
    ? n.toLocaleString('pl-PL', { maximumFractionDigits: 3 })
    : quantity;
  return `${display} ${UNIT_LABELS[unit]}`;
}

export function formatMoneyMinor(minor: number | null | undefined): string {
  if (minor == null) {
    return 'brak ceny';
  }
  return `${(minor / 100).toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} zł`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  return new Date(iso).toLocaleDateString('pl-PL');
}

export function newIdempotencyKey(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const LOCATION_LABELS = {
  pantry: 'Spiżarnia',
  fridge: 'Lodówka',
  freezer: 'Zamrażarka',
  other: 'Inne miejsce',
} as const;

export type StockLocation = keyof typeof LOCATION_LABELS;
export type InputUnit = 'piece' | 'gram' | 'kilogram' | 'milliliter' | 'liter';

export function inputUnitsFor(baseUnit: ProductUnit): {
  value: InputUnit;
  label: string;
}[] {
  if (baseUnit === 'piece') {
    return [{ value: 'piece', label: 'sztuki' }];
  }
  if (baseUnit === 'gram') {
    return [
      { value: 'gram', label: 'gramy' },
      { value: 'kilogram', label: 'kilogramy' },
    ];
  }
  return [
    { value: 'milliliter', label: 'mililitry' },
    { value: 'liter', label: 'litry' },
  ];
}

export function convertToBaseQuantity(
  rawValue: string,
  inputUnit: InputUnit,
  baseUnit: ProductUnit,
): { ok: true; quantity: string } | { ok: false; message: string } {
  const normalized = rawValue.trim().replace(',', '.');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(normalized)) {
    return {
      ok: false,
      message: 'Podaj nieujemną liczbę z maksymalnie 3 miejscami po przecinku.',
    };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { ok: false, message: 'Podaj nieujemną liczbę.' };
  }
  const compatible =
    (baseUnit === 'piece' && inputUnit === 'piece') ||
    (baseUnit === 'gram' &&
      (inputUnit === 'gram' || inputUnit === 'kilogram')) ||
    (baseUnit === 'milliliter' &&
      (inputUnit === 'milliliter' || inputUnit === 'liter'));
  if (!compatible) {
    return {
      ok: false,
      message: 'Jednostka nie zgadza się z jednostką bazową produktu.',
    };
  }
  const multiplier =
    inputUnit === 'kilogram' || inputUnit === 'liter' ? 1000 : 1;
  const baseValue = value * multiplier;
  if (baseValue <= 0) {
    return { ok: false, message: 'Ilość musi być większa od zera.' };
  }
  return { ok: true, quantity: baseValue.toFixed(3) };
}

export function minorFromZloty(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  return Math.round(Number(normalized) * 100);
}

export function mediaUrl(
  image:
    | { url?: string | null; thumbnailUrl?: string | null }
    | null
    | undefined,
  variant: 'full' | 'thumbnail' = 'thumbnail',
): string | null {
  if (!image) {
    return null;
  }
  const candidate =
    variant === 'thumbnail' ? (image.thumbnailUrl ?? image.url) : image.url;
  if (!candidate) {
    return null;
  }
  if (
    candidate.startsWith('http://') ||
    candidate.startsWith('https://') ||
    candidate.startsWith('data:image/')
  ) {
    return candidate;
  }
  return null;
}
