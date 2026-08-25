import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { KitchenRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function requireKitchenMember(
  prisma: PrismaService,
  kitchenId: string,
  userId: string,
) {
  const membership = await prisma.kitchenMember.findUnique({
    where: { kitchenId_userId: { kitchenId, userId } },
  });
  if (!membership) {
    throw new NotFoundException('Nie znaleziono kuchni.');
  }
  return membership;
}

export async function requireKitchenOwner(
  prisma: PrismaService,
  kitchenId: string,
  userId: string,
) {
  const membership = await requireKitchenMember(prisma, kitchenId, userId);
  if (membership.role !== KitchenRole.owner) {
    throw new ForbiddenException(
      'Tę operację może wykonać wyłącznie właściciel kuchni.',
    );
  }
  return membership;
}
