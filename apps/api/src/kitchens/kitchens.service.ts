import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { hashInviteToken, createInviteToken } from '../common/invite-token';
import { normalizeEmail } from '../common/normalize';
import { type AppEnv } from '../config/env';
import { KitchenRole, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  InviteCreatedDto,
  KitchenDetailsDto,
  KitchenInviteDto,
  KitchenSummaryDto,
} from './dto/kitchen.dto';
import { requireKitchenMember, requireKitchenOwner } from './kitchen-access';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class KitchensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async listForUser(userId: string): Promise<KitchenSummaryDto[]> {
    const memberships = await this.prisma.kitchenMember.findMany({
      where: { userId },
      include: { kitchen: true },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map((membership) => ({
      id: membership.kitchen.id,
      name: membership.kitchen.name,
      role: membership.role,
    }));
  }

  async create(userId: string, name: string): Promise<KitchenDetailsDto> {
    const kitchen = await this.prisma.$transaction(async (tx) => {
      const created = await tx.kitchen.create({
        data: {
          name: name.trim(),
          createdByUserId: userId,
        },
      });
      await tx.kitchenMember.create({
        data: {
          kitchenId: created.id,
          userId,
          role: KitchenRole.owner,
        },
      });
      return tx.kitchen.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          members: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
        },
      });
    });
    return this.toDetails(kitchen);
  }

  async getDetails(
    userId: string,
    kitchenId: string,
  ): Promise<KitchenDetailsDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const kitchen = await this.prisma.kitchen.findUniqueOrThrow({
      where: { id: kitchenId },
      include: {
        members: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
      },
    });
    return this.toDetails(kitchen);
  }

  async remove(userId: string, kitchenId: string): Promise<void> {
    await requireKitchenOwner(this.prisma, kitchenId, userId);
    await this.prisma.kitchen.delete({ where: { id: kitchenId } });
  }

  async listInvites(
    userId: string,
    kitchenId: string,
  ): Promise<KitchenInviteDto[]> {
    await requireKitchenOwner(this.prisma, kitchenId, userId);
    const invites = await this.prisma.kitchenInvite.findMany({
      where: { kitchenId },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: 'member',
      expiresAt: invite.expiresAt.toISOString(),
      acceptedAt: invite.acceptedAt?.toISOString() ?? null,
      revokedAt: invite.revokedAt?.toISOString() ?? null,
    }));
  }

  async createInvite(
    userId: string,
    kitchenId: string,
    email: string,
  ): Promise<InviteCreatedDto> {
    await requireKitchenOwner(this.prisma, kitchenId, userId);
    const normalized = normalizeEmail(email);
    const existingMember = await this.prisma.kitchenMember.findFirst({
      where: { kitchenId, user: { email: normalized } },
    });
    if (existingMember) {
      throw new ConflictException('Ta osoba należy już do kuchni.');
    }

    const rawToken = createInviteToken();
    const invite = await this.prisma.kitchenInvite.create({
      data: {
        kitchenId,
        email: normalized,
        role: KitchenRole.member,
        tokenHash: hashInviteToken(rawToken),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        createdByUserId: userId,
      },
    });
    const webOrigin = this.config.get('PUBLIC_WEB_ORIGIN', { infer: true });
    return {
      id: invite.id,
      email: invite.email,
      expiresAt: invite.expiresAt.toISOString(),
      inviteUrl: `${webOrigin.replace(/\/$/, '')}/invites/${rawToken}`,
    };
  }

  async revokeInvite(
    userId: string,
    kitchenId: string,
    inviteId: string,
  ): Promise<KitchenInviteDto> {
    await requireKitchenOwner(this.prisma, kitchenId, userId);
    const invite = await this.prisma.kitchenInvite.findFirst({
      where: { id: inviteId, kitchenId },
    });
    if (!invite) {
      throw new BadRequestException('Nie znaleziono zaproszenia.');
    }
    if (invite.acceptedAt) {
      throw new ConflictException(
        'Przyjętego zaproszenia nie można unieważnić.',
      );
    }
    const updated = await this.prisma.kitchenInvite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });
    return {
      id: updated.id,
      email: updated.email,
      role: 'member',
      expiresAt: updated.expiresAt.toISOString(),
      acceptedAt: updated.acceptedAt?.toISOString() ?? null,
      revokedAt: updated.revokedAt?.toISOString() ?? null,
    };
  }

  async acceptInvite(
    userId: string,
    rawToken: string,
  ): Promise<KitchenDetailsDto> {
    const tokenHash = hashInviteToken(rawToken);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const kitchen = await this.prisma.$transaction(async (tx) => {
      const invite = await tx.kitchenInvite.findUnique({
        where: { tokenHash },
      });
      if (!invite) {
        throw new BadRequestException('Nieprawidłowe zaproszenie.');
      }
      if (invite.revokedAt) {
        throw new ConflictException('Zaproszenie zostało unieważnione.');
      }
      if (invite.acceptedAt) {
        throw new ConflictException('Zaproszenie zostało już wykorzystane.');
      }
      if (invite.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Zaproszenie wygasło.');
      }
      if (invite.email !== normalizeEmail(user.email)) {
        throw new ForbiddenEmailException();
      }

      const claimed = await tx.kitchenInvite.updateMany({
        where: {
          id: invite.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Zaproszenie zostało już wykorzystane.');
      }

      try {
        await tx.kitchenMember.create({
          data: {
            kitchenId: invite.kitchenId,
            userId,
            role: KitchenRole.member,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('Należysz już do tej kuchni.');
        }
        throw error;
      }

      return tx.kitchen.findUniqueOrThrow({
        where: { id: invite.kitchenId },
        include: {
          members: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
        },
      });
    });

    return this.toDetails(kitchen);
  }

  private toDetails(kitchen: {
    id: string;
    name: string;
    createdAt: Date;
    members: Array<{
      userId: string;
      role: KitchenRole;
      joinedAt: Date;
      user: { email: string; name: string };
    }>;
  }): KitchenDetailsDto {
    return {
      id: kitchen.id,
      name: kitchen.name,
      createdAt: kitchen.createdAt.toISOString(),
      members: kitchen.members.map((member) => ({
        userId: member.userId,
        email: member.user.email,
        name: member.user.name,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
      })),
    };
  }
}

class ForbiddenEmailException extends BadRequestException {
  constructor() {
    super('To zaproszenie jest przypisane do innego adresu e-mail.');
  }
}
