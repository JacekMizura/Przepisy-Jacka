import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

import { createAuth } from '../src/auth/create-auth';
import { validateEnv } from '../src/config/env';
import { PrismaClient, ProductUnit, StorageLocation } from '../src/generated/prisma/client';

loadDotenv({ path: resolve(__dirname, '../.env') });

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed jest zablokowany w środowisku production.');
  }
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'Seed wymaga ALLOW_DEMO_SEED=true oraz NODE_ENV innego niż production.',
    );
  }

  const env = validateEnv(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  const auth = createAuth(prisma, env);

  try {
    const ownerEmail = 'demo.wlasciciel@example.com';
    const memberEmail = 'demo.czlonek@example.com';
    const password = 'DemoHaslo123';

    const ownerResult = await auth.api.signUpEmail({
      body: {
        email: ownerEmail,
        password,
        name: 'Demo Właściciel',
      },
    });
    const memberResult = await auth.api.signUpEmail({
      body: {
        email: memberEmail,
        password,
        name: 'Demo Członek',
      },
    });

    const kitchen = await prisma.$transaction(async (tx) => {
      const created = await tx.kitchen.create({
        data: {
          name: 'Demo Kuchnia',
          createdByUserId: ownerResult.user.id,
        },
      });
      await tx.kitchenMember.create({
        data: {
          kitchenId: created.id,
          userId: ownerResult.user.id,
          role: 'owner',
        },
      });
      await tx.kitchenMember.create({
        data: {
          kitchenId: created.id,
          userId: memberResult.user.id,
          role: 'member',
        },
      });
      return created;
    });

    const milk = await prisma.product.create({
      data: {
        kitchenId: kitchen.id,
        name: 'Mleko',
        normalizedName: 'mleko',
        defaultUnit: ProductUnit.milliliter,
      },
    });
    const couscous = await prisma.product.create({
      data: {
        kitchenId: kitchen.id,
        name: 'Kuskus',
        normalizedName: 'kuskus',
        defaultUnit: ProductUnit.gram,
      },
    });
    const eggs = await prisma.product.create({
      data: {
        kitchenId: kitchen.id,
        name: 'Jajka',
        normalizedName: 'jajka',
        defaultUnit: ProductUnit.piece,
      },
    });

    await prisma.stockItem.createMany({
      data: [
        {
          productId: milk.id,
          initialQuantity: '1000.000',
          quantity: '750.000',
          location: StorageLocation.fridge,
          purchasePriceMinor: 499,
          currency: 'PLN',
        },
        {
          productId: couscous.id,
          initialQuantity: '500.000',
          quantity: '500.000',
          location: StorageLocation.pantry,
          purchasePriceMinor: 890,
          currency: 'PLN',
        },
        {
          productId: eggs.id,
          initialQuantity: '10.000',
          quantity: '8.000',
          location: StorageLocation.fridge,
          purchasePriceMinor: 1200,
          currency: 'PLN',
        },
      ],
    });

    console.log(
      `Utworzono demo: kuchnia ${kitchen.id}, użytkownicy ${ownerEmail} / ${memberEmail} (hasło ${password}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
