import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

import { normalizeProductName, normalizeSearchText } from '../common/normalize';
import { PrismaService } from '../prisma/prisma.service';

export type UsdaCatalogFileEntry = {
  fdcId: number;
  polishName: string;
  aliases: string[];
  descriptionOriginal: string;
  variantLabel: string;
  dataType: string;
  category: string | null;
  compositionMayVary: boolean;
  basis: string;
  publicationDate: string | null;
  nutrition: {
    kcal: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    fiberGrams: number | null;
    saltGrams: number | null;
    sodiumMg: number | null;
    energyField: string;
    carbsMethod: string | null;
    carbsApproximate: boolean;
  };
  mappingWarnings: string[];
};

export type UsdaCatalogFile = {
  catalogVersion: string;
  importedAt: string;
  entryCount: number;
  entries: UsdaCatalogFileEntry[];
};

function catalogDataDir(): string {
  const candidates = [
    join(__dirname, '..', '..', 'data', 'usda-catalog', 'v1'),
    join(process.cwd(), 'data', 'usda-catalog', 'v1'),
    join(process.cwd(), 'apps', 'api', 'data', 'usda-catalog', 'v1'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'entries.json'))) {
      return dir;
    }
  }
  throw new Error(
    'Nie znaleziono apps/api/data/usda-catalog/v1/entries.json — uruchom build-usda-catalog.mjs.',
  );
}

export function loadUsdaCatalogFile(dir?: string): UsdaCatalogFile {
  const base = dir ?? catalogDataDir();
  const raw = readFileSync(join(base, 'entries.json'), 'utf8');
  const parsed = JSON.parse(raw) as UsdaCatalogFile;
  if (!Array.isArray(parsed.entries) || !parsed.catalogVersion) {
    throw new Error('Nieprawidłowy plik entries.json katalogu USDA.');
  }
  return parsed;
}

function buildSearchText(polishName: string, aliases: string[]): string {
  const parts = [polishName, ...aliases].map(normalizeSearchText);
  return parts.join(' ');
}

function dec(value: number | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) {
    return null;
  }
  return new Prisma.Decimal(value.toFixed(3));
}

@Injectable()
export class UsdaCatalogSyncService {
  private readonly logger = new Logger(UsdaCatalogSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotentna synchronizacja wyłącznie tabeli UsdaFoodCatalogEntry.
   * Nie tworzy produktów kuchni i nie modyfikuje ProductNutrition.
   */
  async syncFromBundledCatalog(dir?: string): Promise<{
    catalogVersion: string;
    upserted: number;
    removed: number;
  }> {
    const file = loadUsdaCatalogFile(dir);
    const importedAt = new Date(`${file.importedAt}T00:00:00.000Z`);
    const keepFdcIds = new Set(file.entries.map((e) => e.fdcId));

    let upserted = 0;
    for (const entry of file.entries) {
      const aliases = entry.aliases ?? [];
      const n = entry.nutrition;
      const data = {
        polishName: entry.polishName,
        polishNameNormalized: normalizeProductName(entry.polishName),
        aliases,
        searchText: buildSearchText(entry.polishName, aliases),
        descriptionOriginal: entry.descriptionOriginal,
        variantLabel: entry.variantLabel,
        dataType: entry.dataType,
        category: entry.category,
        compositionMayVary: entry.compositionMayVary,
        basisLabel: entry.basis,
        sourceDataset:
          entry.dataType === 'Foundation' ||
          entry.dataType === 'Foundation Foods'
            ? 'Foundation Foods'
            : 'SR Legacy',
        sourceRelease: entry.dataType.includes('Foundation')
          ? '2025-12-18'
          : '2018-04',
        sourceUrl: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${entry.fdcId}/nutrients`,
        catalogVersion: file.catalogVersion,
        importedAt,
        publicationDate: entry.publicationDate,
        kcal: dec(n.kcal)!,
        proteinGrams: dec(n.proteinGrams)!,
        carbsGrams: dec(n.carbsGrams)!,
        fatGrams: dec(n.fatGrams)!,
        fiberGrams: dec(n.fiberGrams),
        saltGrams: dec(n.saltGrams),
        sodiumMg: dec(n.sodiumMg),
        energyField: n.energyField,
        carbsMethod: n.carbsMethod,
        carbsApproximate: n.carbsApproximate,
        mappingWarnings: entry.mappingWarnings,
      };

      await this.prisma.usdaFoodCatalogEntry.upsert({
        where: { fdcId: entry.fdcId },
        create: {
          id: randomUUID(),
          fdcId: entry.fdcId,
          ...data,
        },
        update: data,
      });
      upserted += 1;
    }

    const stale = await this.prisma.usdaFoodCatalogEntry.findMany({
      where: {
        OR: [
          { catalogVersion: { not: file.catalogVersion } },
          { fdcId: { notIn: [...keepFdcIds] } },
        ],
      },
      select: { id: true, fdcId: true },
    });

    let removed = 0;
    if (stale.length > 0) {
      const result = await this.prisma.usdaFoodCatalogEntry.deleteMany({
        where: { id: { in: stale.map((s) => s.id) } },
      });
      removed = result.count;
    }

    this.logger.log(
      `USDA catalog sync: version=${file.catalogVersion} upserted=${upserted} removed=${removed}`,
    );

    return {
      catalogVersion: file.catalogVersion,
      upserted,
      removed,
    };
  }
}
