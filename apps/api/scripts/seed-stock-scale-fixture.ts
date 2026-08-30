/**
 * Dev-only fixture: ~1000 catalog products + ~250 with positive stock.
 * NOT part of production seed. Usage:
 *   pnpm --filter @moja-kuchnia/api exec tsx scripts/seed-stock-scale-fixture.ts <kitchenId>
 */
import { PrismaClient, Prisma } from '../src/generated/prisma/client';

const kitchenId = process.argv[2];
if (!kitchenId) {
  console.error('Usage: tsx scripts/seed-stock-scale-fixture.ts <kitchenId>');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const kitchen = await prisma.kitchen.findUnique({ where: { id: kitchenId } });
  if (!kitchen) {
    throw new Error(`Kitchen ${kitchenId} not found`);
  }

  const existing = await prisma.product.count({
    where: { kitchenId, name: { startsWith: 'ScaleFixture ' } },
  });
  if (existing > 0) {
    console.log(`Fixture already present (${existing} products). Aborting.`);
    return;
  }

  const group = await prisma.productGroup.create({
    data: {
      kitchenId,
      name: 'ScaleFixture Pomidory',
      normalizedName: `scalefixture-pomidory-${Date.now()}`,
    },
  });

  const productData = Array.from({ length: 1000 }, (_, i) => {
    const n = i + 1;
    const inGroup = n <= 4;
    return {
      kitchenId,
      name: `ScaleFixture Produkt ${String(n).padStart(4, '0')}`,
      normalizedName: `scalefixture-produkt-${String(n).padStart(4, '0')}`,
      defaultUnit: 'gram' as const,
      purchaseMode: 'exact' as const,
      category: n % 3 === 0 ? 'Nabiał' : 'Warzywa i owoce',
      brand: n % 5 === 0 ? 'Marka X' : null,
      variantLabel: n % 7 === 0 ? 'wariant' : null,
      groupId: inGroup ? group.id : null,
    };
  });

  // createMany in chunks
  for (let i = 0; i < productData.length; i += 100) {
    await prisma.product.createMany({ data: productData.slice(i, i + 100) });
  }

  const withStock = await prisma.product.findMany({
    where: { kitchenId, name: { startsWith: 'ScaleFixture Produkt' } },
    orderBy: { name: 'asc' },
    take: 250,
    select: { id: true },
  });

  const now = Date.now();
  const stockRows = withStock.flatMap((p, idx) => {
    const rows = [
      {
        productId: p.id,
        initialQuantity: new Prisma.Decimal(500),
        quantity: new Prisma.Decimal(500),
        location: 'pantry' as const,
        expiresAt: new Date(now + (idx % 40) * 86400000),
        storeName: 'Fixture Market',
      },
    ];
    if (idx % 10 === 0) {
      rows.push({
        productId: p.id,
        initialQuantity: new Prisma.Decimal(200),
        quantity: new Prisma.Decimal(200),
        location: 'fridge' as const,
        expiresAt: new Date(now - 2 * 86400000),
        storeName: 'Fixture Fridge',
      });
    }
    return rows;
  });

  for (let i = 0; i < stockRows.length; i += 100) {
    await prisma.stockItem.createMany({ data: stockRows.slice(i, i + 100) });
  }

  console.log(
    JSON.stringify(
      {
        kitchenId,
        products: 1000,
        withStock: withStock.length,
        stockItems: stockRows.length,
        groupId: group.id,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
