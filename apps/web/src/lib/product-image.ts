import type { components } from "@moja-kuchnia/api-client";

import {
  isDisplayableUrl,
  mediaDisplayUrl,
} from "@/lib/media-upload";

type MediaImage = components["schemas"]["MediaImageDto"];

type ProductImageSource = {
  imageUrl?: string | null;
  image?: MediaImage | null;
};

/** Zdjęcie z magazynu mediów ma pierwszeństwo nad starszym `imageUrl`. */
export function productImageUrls(source: ProductImageSource | null | undefined): {
  thumbnail: string | null;
  full: string | null;
} {
  if (!source) {
    return { thumbnail: null, full: null };
  }
  const legacy = isDisplayableUrl(source.imageUrl) ? source.imageUrl! : null;
  return {
    thumbnail: mediaDisplayUrl(source.image, "thumbnail") ?? legacy,
    full: mediaDisplayUrl(source.image) ?? legacy,
  };
}
