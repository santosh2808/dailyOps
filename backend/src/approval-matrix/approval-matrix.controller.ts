import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ApprovalMatrixService } from './approval-matrix.service';
import { CreateApprovalMatrixDto } from './dto/create-approval-matrix.dto';
import { UpdateApprovalMatrixDto } from './dto/update-approval-matrix.dto';

@ApiTags('approval-matrix')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/approval-matrix')
export class ApprovalMatrixController {
  constructor(private approvalMatrixService: ApprovalMatrixService) {}

  @Get()
  @RequirePermission('ApprovalMatrix', 'View')
  findAll(@Query('module') module?: string) {
    return this.approvalMatrixService.findAll(module);
  }

  @Get(':id')
  @RequirePermission('ApprovalMatrix', 'View')
  findOne(@Param('id') id: string) {
    return this.approvalMatrixService.findOne(id);
  }

  @Post()
  @RequirePermission('ApprovalMatrix', 'Edit')
  create(@Body() dto: CreateApprovalMatrixDto) {
    return this.approvalMatrixService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('ApprovalMatrix', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateApprovalMatrixDto) {
    return this.approvalMatrixService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('ApprovalMatrix', 'Edit')
  remove(@Param('id') id: string) {
    return this.approvalMatrixService.remove(id);
  }
}
