import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import { CreateInviteDto } from './dto/create-invite.dto';
import { CreateKitchenDto } from './dto/create-kitchen.dto';
import {
  InviteCreatedDto,
  KitchenDetailsDto,
  KitchenInviteDto,
  KitchenSummaryDto,
} from './dto/kitchen.dto';
import { KitchensService } from './kitchens.service';

@ApiTags('kitchens')
@Controller()
export class KitchensController {
  constructor(private readonly kitchensService: KitchensService) {}

  @Get('kitchens')
  @ApiOperation({ summary: 'Lista kuchni użytkownika' })
  @ApiOkResponse({ type: [KitchenSummaryDto] })
  list(@Session() session: UserSession): Promise<KitchenSummaryDto[]> {
    return this.kitchensService.listForUser(session.user.id);
  }

  @Post('kitchens')
  @ApiOperation({ summary: 'Utworzenie kuchni' })
  @ApiOkResponse({ type: KitchenDetailsDto })
  create(
    @Session() session: UserSession,
    @Body() body: CreateKitchenDto,
  ): Promise<KitchenDetailsDto> {
    return this.kitchensService.create(session.user.id, body.name);
  }

  @Get('kitchens/:kitchenId')
  @ApiOperation({ summary: 'Szczegóły kuchni i członkowie' })
  @ApiOkResponse({ type: KitchenDetailsDto })
  getOne(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
  ): Promise<KitchenDetailsDto> {
    return this.kitchensService.getDetails(session.user.id, kitchenId);
  }

  @Delete('kitchens/:kitchenId')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Usunięcie kuchni przez właściciela (kaskadowo członkowie, zaproszenia, produkty i partie)',
  })
  @ApiNoContentResponse()
  async remove(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
  ): Promise<void> {
    await this.kitchensService.remove(session.user.id, kitchenId);
  }

  @Get('kitchens/:kitchenId/invites')
  @ApiOperation({ summary: 'Lista zaproszeń kuchni (owner)' })
  @ApiOkResponse({ type: [KitchenInviteDto] })
  listInvites(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
  ): Promise<KitchenInviteDto[]> {
    return this.kitchensService.listInvites(session.user.id, kitchenId);
  }

  @Post('kitchens/:kitchenId/invites')
  @ApiOperation({ summary: 'Utworzenie zaproszenia z linkiem do skopiowania' })
  @ApiOkResponse({ type: InviteCreatedDto })
  createInvite(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Body() body: CreateInviteDto,
  ): Promise<InviteCreatedDto> {
    return this.kitchensService.createInvite(
      session.user.id,
      kitchenId,
      body.email,
    );
  }

  @Post('kitchens/:kitchenId/invites/:inviteId/revoke')
  @ApiOperation({ summary: 'Unieważnienie zaproszenia' })
  @ApiOkResponse({ type: KitchenInviteDto })
  revoke(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ): Promise<KitchenInviteDto> {
    return this.kitchensService.revokeInvite(
      session.user.id,
      kitchenId,
      inviteId,
    );
  }

  @Post('invites/:token/accept')
  @ApiOperation({
    summary: 'Przyjęcie zaproszenia przez zalogowanego użytkownika',
  })
  @ApiOkResponse({ type: KitchenDetailsDto })
  accept(
    @Session() session: UserSession,
    @Param('token') token: string,
  ): Promise<KitchenDetailsDto> {
    return this.kitchensService.acceptInvite(session.user.id, token);
  }
}
