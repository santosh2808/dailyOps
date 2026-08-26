import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ComplaintsService } from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';
import { QueryComplaintDto } from './dto/query-complaint.dto';

@ApiTags('complaints')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/complaints')
export class ComplaintsController {
  constructor(private complaintsService: ComplaintsService) {}

  @Get()
  @RequirePermission('Complaint', 'View')
  findAll(@Query() query: QueryComplaintDto) {
    return this.complaintsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('Complaint', 'View')
  findOne(@Param('id') id: string) {
    return this.complaintsService.findOne(id);
  }

  @Post()
  @RequirePermission('Complaint', 'Create')
  create(@Body() dto: CreateComplaintDto, @Req() req: any) {
    return this.complaintsService.create(dto, req.user?.name);
  }

  @Patch(':id')
  @RequirePermission('Complaint', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateComplaintDto) {
    return this.complaintsService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('Complaint', 'Edit')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateComplaintStatusDto, @Req() req: any) {
    return this.complaintsService.updateStatus(id, dto, req.user?.name);
  }

  @Delete(':id')
  @RequirePermission('Complaint', 'Delete')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.complaintsService.remove(id, req.user?.name);
  }
}
