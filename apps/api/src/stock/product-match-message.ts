import type { ProductDto } from './dto/product.dto';

const CATALOG_EXISTS_MESSAGE =
  'Ten produkt jest już w katalogu. Możesz odłożyć nową kupioną ilość do zapasów.';

const ARCHIVED_RESTORE_MESSAGE =
  'Znaleziono zarchiwizowany produkt o tym samym EAN lub nazwie. Przywróć go zamiast tworzyć nowy.';

export function buildProductMatchMessage(input: {
  exactEan: ProductDto | null;
  exactName: ProductDto | null;
  archivedMatch: ProductDto | null;
}): string | null {
  if (input.exactEan || input.exactName) {
    return CATALOG_EXISTS_MESSAGE;
  }
  if (input.archivedMatch) {
    return ARCHIVED_RESTORE_MESSAGE;
  }
  return null;
}
