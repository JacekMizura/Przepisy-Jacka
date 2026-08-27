import sharp from 'sharp';

import { MediaPurpose } from '../generated/prisma/client';
import {
  MAX_DIMENSION_BY_PURPOSE,
  processMediaImage,
  sniffImageKind,
  THUMBNAIL_MAX_DIMENSION,
} from './image-processing';

jest.setTimeout(30_000);

async function createJpegWithExif(
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 120, b: 40 },
    },
  })
    .withExif({ IFD0: { Copyright: 'Moja Kuchnia', Artist: 'Test' } })
    .jpeg()
    .toBuffer();
}

describe('sniffImageKind', () => {
  it('rozpoznaje JPEG, PNG i WebP po nagłówku', async () => {
    const jpeg = await createJpegWithExif(20, 20);
    const png = await sharp(jpeg).png().toBuffer();
    const webp = await sharp(jpeg).webp().toBuffer();

    expect(sniffImageKind(jpeg)).toBe('image/jpeg');
    expect(sniffImageKind(png)).toBe('image/png');
    expect(sniffImageKind(webp)).toBe('image/webp');
  });

  it('odrzuca dane, które nie są obrazem', () => {
    expect(sniffImageKind(Buffer.from('%PDF-1.7 nie obraz'))).toBeNull();
    expect(sniffImageKind(Buffer.alloc(0))).toBeNull();
  });
});

describe('processMediaImage', () => {
  it('konwertuje do WebP, skaluje i tworzy miniaturę', async () => {
    const input = await createJpegWithExif(2000, 1000);
    const processed = await processMediaImage(input, MediaPurpose.product);

    expect(sniffImageKind(processed.main.data)).toBe('image/webp');
    expect(processed.main.width).toBe(
      MAX_DIMENSION_BY_PURPOSE[MediaPurpose.product],
    );
    expect(processed.main.height).toBe(400);
    expect(processed.thumbnail.width).toBe(THUMBNAIL_MAX_DIMENSION);
    expect(processed.main.byteSize).toBe(processed.main.data.byteLength);
  });

  it('nie powiększa małych obrazów', async () => {
    const input = await createJpegWithExif(120, 60);
    const processed = await processMediaImage(input, MediaPurpose.recipe_cover);

    expect(processed.main.width).toBe(120);
    expect(processed.main.height).toBe(60);
  });

  it('usuwa metadane EXIF z wyniku', async () => {
    const input = await createJpegWithExif(300, 300);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const processed = await processMediaImage(input, MediaPurpose.recipe_step);
    const outputMetadata = await sharp(processed.main.data).metadata();

    expect(outputMetadata.exif).toBeUndefined();
  });
});
