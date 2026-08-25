import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserDto } from './current-user.dto';

function toCurrentUserDto(user: {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CurrentUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<CurrentUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Nie znaleziono użytkownika.');
    }
    return toCurrentUserDto(user);
  }

  async updateMe(userId: string, name: string): Promise<CurrentUserDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name, updatedAt: new Date() },
    });
    return toCurrentUserDto(user);
  }
}
