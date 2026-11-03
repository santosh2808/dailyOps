import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { NotificationsService } from './notifications.service';

// Every logged-in user reads and clears only their own notifications, so
// there's no @RequirePermission here — every query below is scoped to
// req.user.id. The literal routes are declared before ':id/read'.
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  list(@Query() query: QueryNotificationsDto, @Req() req: any) {
    return this.notificationsService.list(req.user.id, query.limit);
  }

  @Get('summary')
  summary(@Req() req: any) {
    return this.notificationsService.summary(req.user.id, req.user.permissions ?? []);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@Req() req: any) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  @Patch(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.notificationsService.markRead(req.user.id, id);
  }
}
