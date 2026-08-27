import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { StateSeriesCodesService } from './state-series-codes.service';
import { CreateStateSeriesCodeDto } from './dto/create-state-series-code.dto';

@ApiTags('state-series-codes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/state-series-codes')
export class StateSeriesCodesController {
  constructor(private stateSeriesCodesService: StateSeriesCodesService) {}

  @Get()
  @RequirePermission('StateSeriesCode', 'View')
  findAll() {
    return this.stateSeriesCodesService.findAll();
  }

  @Post()
  @RequirePermission('StateSeriesCode', 'Create')
  create(@Body() dto: CreateStateSeriesCodeDto) {
    return this.stateSeriesCodesService.create(dto);
  }

  @Delete(':id')
  @RequirePermission('StateSeriesCode', 'Delete')
  remove(@Param('id') id: string) {
    return this.stateSeriesCodesService.remove(id);
  }
}
