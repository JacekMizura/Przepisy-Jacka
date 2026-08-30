import { BadRequestException } from '@nestjs/common';
import {
  PackageContentUnit,
  ProductPurchaseMode,
  Prisma,
} from '../generated/prisma/client';

import type { ParsedPackageFields } from './product-package-fields';

export type ResolvedNewProductPurchase = {
  purchaseMode: ProductPurchaseMode;
  packageQuantity: Prisma.Decimal | null;
  packageUnit: PackageContentUnit | null;
};

/**
 * Ustalenie sposobu zakupu przy tworzeniu produktu (intake).
 * `unconfigured` w żądaniu jest odrzucane — nowe produkty są packaged albo exact.
 */
export function resolveNewProductPurchase(args: {
  requestedMode?: ProductPurchaseMode | null;
  packageFields: ParsedPackageFields;
}): ResolvedNewProductPurchase {
  const { requestedMode, packageFields } = args;
  const hasPackage =
    packageFields.packageQuantity !== null &&
    packageFields.packageUnit !== null;

  if (requestedMode === ProductPurchaseMode.unconfigured) {
    throw new BadRequestException(
      'Wybierz sposób zakupu: packaged (opakowania) albo exact (na wagę / luzem).',
    );
  }

  if (requestedMode === ProductPurchaseMode.exact) {
    if (hasPackage) {
      throw new BadRequestException(
        'Tryb na wagę / luzem nie pozwala na packageQuantity i packageUnit — wyczyść pola opakowania.',
      );
    }
    return {
      purchaseMode: ProductPurchaseMode.exact,
      packageQuantity: null,
      packageUnit: null,
    };
  }

  if (requestedMode === ProductPurchaseMode.packaged) {
    if (!hasPackage) {
      throw new BadRequestException(
        'Tryb opakowań wymaga packageQuantity i packageUnit.',
      );
    }
    return {
      purchaseMode: ProductPurchaseMode.packaged,
      packageQuantity: packageFields.packageQuantity,
      packageUnit: packageFields.packageUnit,
    };
  }

  // Brak jawnego trybu: packaged gdy podano opakowanie, inaczej exact (luzem).
  if (hasPackage) {
    return {
      purchaseMode: ProductPurchaseMode.packaged,
      packageQuantity: packageFields.packageQuantity,
      packageUnit: packageFields.packageUnit,
    };
  }

  return {
    purchaseMode: ProductPurchaseMode.exact,
    packageQuantity: null,
    packageUnit: null,
  };
}

/** packageCount jest dozwolony wyłącznie dla produktów w trybie opakowań. */
export function assertPackageCountAllowedForProduct(product: {
  purchaseMode: ProductPurchaseMode;
  packageQuantity: Prisma.Decimal | null;
  packageUnit: PackageContentUnit | null;
}): void {
  if (product.purchaseMode === ProductPurchaseMode.exact) {
    throw new BadRequestException(
      'packageCount jest niedozwolony dla produktu kupowanego na wagę / luzem.',
    );
  }
  if (product.packageQuantity === null || product.packageUnit === null) {
    throw new BadRequestException(
      'packageCount wymaga ustawionych packageQuantity i packageUnit na produkcie.',
    );
  }
}
