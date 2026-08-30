import type { components } from "@moja-kuchnia/api-client";

type Product = components["schemas"]["ProductDto"];
type CatalogProduct = components["schemas"]["CatalogProductDto"];
type CreateShoppingListItem =
  components["schemas"]["CreateShoppingListItemDto"];

type ProductLike = Pick<Product, "id" | "purchaseMode"> & {
  purchaseOptions?: Product["purchaseOptions"];
};

/** Body POST pozycji listy — packaged wymaga opcji i liczby opakowań. */
export function buildAddToShoppingListBody(
  product: ProductLike,
  options?: {
    mergeQuantity?: boolean;
    purchaseOptionId?: string;
    packageCount?: number;
  },
): CreateShoppingListItem {
  const body: CreateShoppingListItem = { productId: product.id };
  if (options?.mergeQuantity) {
    body.mergeQuantity = true;
  }

  if (product.purchaseMode === "packaged") {
    const option =
      (options?.purchaseOptionId
        ? product.purchaseOptions?.find(
            (entry) =>
              entry.id === options.purchaseOptionId && entry.isActive,
          )
        : undefined) ??
      product.purchaseOptions?.find(
        (entry) => entry.isActive && entry.isDefault,
      ) ??
      product.purchaseOptions?.find((entry) => entry.isActive);
    if (!option) {
      throw new Error(
        "Ten produkt jest w opakowaniach, ale nie ma aktywnej opcji zakupu. Ustaw opakowanie w edycji produktu.",
      );
    }
    const packages = options?.packageCount ?? 1;
    if (!Number.isFinite(packages) || packages < 1) {
      throw new Error("Podaj liczbę opakowań (co najmniej 1).");
    }
    body.purchaseOptionId = option.id;
    body.packageCount = Math.round(packages);
  }

  return body;
}

export function asProductLikeFromCatalog(
  product: CatalogProduct,
): ProductLike {
  return {
    id: product.id,
    purchaseMode: product.purchaseMode,
    purchaseOptions: product.purchaseOptions,
  };
}
