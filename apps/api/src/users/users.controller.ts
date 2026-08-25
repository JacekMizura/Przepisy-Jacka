import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import { CurrentUserDto } from './current-user.dto';
import { UpdateMeDto } from './update-me.dto';
import { UsersService } from './users.service';

@ApiTags('me')
@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Bieżący zalogowany użytkownik' })
  @ApiOkResponse({ type: CurrentUserDto })
  getMe(@Session() session: UserSession): Promise<CurrentUserDto> {
    return this.usersService.getMe(session.user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Aktualizacja profilu bieżącego użytkownika' })
  @ApiOkResponse({ type: CurrentUserDto })
  updateMe(
    @Session() session: UserSession,
    @Body() body: UpdateMeDto,
  ): Promise<CurrentUserDto> {
    return this.usersService.updateMe(session.user.id, body.name);
  }
}
