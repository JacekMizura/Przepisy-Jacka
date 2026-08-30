import type {
  ArchivedFilter,
  CatalogSort,
  ExpiryStatusFilter,
  StockSort,
} from "./stock-list-types.ts";

export type StockView = "stock" | "catalog" | "history";

export type LocationFilterValue =
  | ""
  | "pantry"
  | "fridge"
  | "freezer"
  | "other";

export type UnitFilterValue = "" | "gram" | "piece" | "milliliter";

export type StockListUrlState = {
  view: StockView;
  search: string;
  category: string;
  place: LocationFilterValue;
  unit: UnitFilterValue;
  expiryStatus: ExpiryStatusFilter;
  archived: ArchivedFilter;
  sort: string;
  hasStock: boolean;
  page: number;
};

const STOCK_SORTS: readonly StockSort[] = [
  "expiry",
  "newest",
  "name",
  "qty_desc",
  "qty_asc",
];
const CATALOG_SORTS: readonly CatalogSort[] = [
  "name",
  "newest",
  "updated",
  "has_stock",
];
const EXPIRY: readonly ExpiryStatusFilter[] = [
  "any",
  "expired",
  "expiring",
  "ok",
  "none",
];
const ARCHIVED: readonly ArchivedFilter[] = ["active", "archived", "all"];
const PLACES: readonly LocationFilterValue[] = [
  "pantry",
  "fridge",
  "freezer",
  "other",
];
const UNITS: readonly UnitFilterValue[] = ["gram", "piece", "milliliter"];

function isIn<T extends string>(
  value: string | null,
  allowed: readonly T[],
): value is T {
  return value != null && (allowed as readonly string[]).includes(value);
}

function parseStockView(value: string | null | undefined): StockView {
  if (value === "catalog" || value === "history") {
    return value;
  }
  return "stock";
}

export function defaultSortForView(view: StockView): string {
  if (view === "catalog") {
    return "name";
  }
  return "expiry";
}

export function defaultArchivedForView(view: StockView): ArchivedFilter {
  if (view === "catalog") {
    return "active";
  }
  return "all";
}

export function parseStockListUrlState(
  params: URLSearchParams | { get(name: string): string | null },
): StockListUrlState {
  const view = parseStockView(params.get("view"));
  const search = (params.get("q") ?? params.get("search") ?? "").trim();
  const category = (params.get("category") ?? "").trim();

  const placeRaw = params.get("place") ?? params.get("location") ?? "";
  const place: LocationFilterValue = isIn(placeRaw, PLACES) ? placeRaw : "";

  const unitRaw = params.get("unit") ?? "";
  const unit: UnitFilterValue = isIn(unitRaw, UNITS) ? unitRaw : "";

  const expiryRaw = params.get("expiry") ?? params.get("expiryStatus") ?? "any";
  const expiryStatus: ExpiryStatusFilter = isIn(expiryRaw, EXPIRY)
    ? expiryRaw
    : "any";

  const archivedRaw = params.get("archived") ?? defaultArchivedForView(view);
  const archived: ArchivedFilter = isIn(archivedRaw, ARCHIVED)
    ? archivedRaw
    : defaultArchivedForView(view);

  const sortRaw = params.get("sort") ?? defaultSortForView(view);
  const allowedSorts = view === "catalog" ? CATALOG_SORTS : STOCK_SORTS;
  const sort = isIn(sortRaw, allowedSorts)
    ? sortRaw
    : defaultSortForView(view);

  const hasStockRaw = params.get("hasStock");
  const hasStock = hasStockRaw === "true" || hasStockRaw === "1";

  const pageRaw = Number(params.get("page") ?? "1");
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  return {
    view,
    search,
    category,
    place,
    unit,
    expiryStatus,
    archived,
    sort,
    hasStock,
    page,
  };
}

export type StockListUrlPatch = Partial<StockListUrlState>;

/**
 * Serialize list state into URL search params (view + filters).
 * Omits defaults to keep URLs short.
 */
export function serializeStockListUrlState(
  state: StockListUrlState,
): URLSearchParams {
  const params = new URLSearchParams();

  if (state.view !== "stock") {
    params.set("view", state.view);
  }
  if (state.search) {
    params.set("q", state.search);
  }
  if (state.category) {
    params.set("category", state.category);
  }
  if (state.place) {
    params.set("place", state.place);
  }
  if (state.unit) {
    params.set("unit", state.unit);
  }
  if (state.expiryStatus !== "any") {
    params.set("expiry", state.expiryStatus);
  }
  const defaultArchived = defaultArchivedForView(state.view);
  if (state.archived !== defaultArchived) {
    params.set("archived", state.archived);
  }
  if (state.sort !== defaultSortForView(state.view)) {
    params.set("sort", state.sort);
  }
  if (state.view === "catalog" && state.hasStock) {
    params.set("hasStock", "1");
  }
  if (state.page > 1) {
    params.set("page", String(state.page));
  }

  return params;
}

export function buildStockListHref(
  kitchenId: string,
  state: StockListUrlState,
): string {
  const params = serializeStockListUrlState(state);
  const qs = params.toString();
  return qs
    ? `/kitchens/${kitchenId}/stock?${qs}`
    : `/kitchens/${kitchenId}/stock`;
}

export function applyStockListPatch(
  current: StockListUrlState,
  patch: StockListUrlPatch,
): StockListUrlState {
  const next: StockListUrlState = { ...current, ...patch };
  if (patch.view != null && patch.view !== current.view) {
    next.sort = patch.sort ?? defaultSortForView(patch.view);
    next.archived = patch.archived ?? defaultArchivedForView(patch.view);
    next.expiryStatus = "any";
    next.hasStock = false;
    next.page = 1;
  }
  const filterChanged =
    patch.search !== undefined ||
    patch.category !== undefined ||
    patch.place !== undefined ||
    patch.unit !== undefined ||
    patch.expiryStatus !== undefined ||
    patch.archived !== undefined ||
    patch.sort !== undefined ||
    patch.hasStock !== undefined;
  if (filterChanged && patch.page === undefined) {
    next.page = 1;
  }
  return next;
}

export type ActiveFilterChip = {
  id: string;
  label: string;
  clear: StockListUrlPatch;
};

export function activeFilterChips(
  state: StockListUrlState,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (state.search) {
    chips.push({
      id: "search",
      label: `Szukaj: ${state.search}`,
      clear: { search: "" },
    });
  }
  if (state.category) {
    chips.push({
      id: "category",
      label: `Kategoria: ${state.category}`,
      clear: { category: "" },
    });
  }
  if (state.place) {
    const labels: Record<Exclude<LocationFilterValue, "">, string> = {
      pantry: "Spiżarnia",
      fridge: "Lodówka",
      freezer: "Zamrażarka",
      other: "Inne",
    };
    chips.push({
      id: "place",
      label: `Miejsce: ${labels[state.place]}`,
      clear: { place: "" },
    });
  }
  if (state.unit) {
    const labels: Record<Exclude<UnitFilterValue, "">, string> = {
      gram: "g",
      piece: "szt",
      milliliter: "ml",
    };
    chips.push({
      id: "unit",
      label: `Jednostka: ${labels[state.unit]}`,
      clear: { unit: "" },
    });
  }
  if (state.expiryStatus !== "any") {
    const labels: Record<Exclude<ExpiryStatusFilter, "any">, string> = {
      expired: "Przeterminowane",
      expiring: "Kończące się",
      ok: "Ważne",
      none: "Bez terminu",
    };
    chips.push({
      id: "expiry",
      label: `Termin: ${labels[state.expiryStatus]}`,
      clear: { expiryStatus: "any" },
    });
  }
  if (state.archived !== defaultArchivedForView(state.view)) {
    const labels: Record<ArchivedFilter, string> = {
      active: "Aktywne",
      archived: "Archiwum",
      all: "Wszystkie",
    };
    chips.push({
      id: "archived",
      label: `Status: ${labels[state.archived]}`,
      clear: { archived: defaultArchivedForView(state.view) },
    });
  }
  if (state.view === "catalog" && state.hasStock) {
    chips.push({
      id: "hasStock",
      label: "Tylko ze stanem",
      clear: { hasStock: false },
    });
  }
  return chips;
}

export function clearAllFiltersPatch(
  state: StockListUrlState,
): StockListUrlPatch {
  return {
    search: "",
    category: "",
    place: "",
    unit: "",
    expiryStatus: "any",
    archived: defaultArchivedForView(state.view),
    hasStock: false,
    page: 1,
  };
}
