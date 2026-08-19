import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { QueryLeadDto } from './dto/query-lead.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/leads')
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  @Get()
  @RequirePermission('Lead', 'View')
  findAll(@Query() query: QueryLeadDto) {
    return this.leadsService.findAll(query);
  }

  // Lead Import. All three are multi-segment or otherwise structurally
  // distinct from the single ':id' segment used by findOne() below, so
  // (unlike Production Dashboard/Materials Export) there's no route-order
  // collision risk here — grouped together purely for readability.
  @Get('import/template')
  @RequirePermission('Lead', 'View')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="lead-import-template.xlsx"')
  downloadImportTemplate(@Res() res: Response) {
    const buffer = this.leadsService.getLeadImportTemplate();
    res.send(buffer);
  }

  @Post('import/preview')
  @RequirePermission('Lead', 'View')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  previewImport(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Attach it under the "file" field.');
    }
    return this.leadsService.previewLeadImport(file.buffer);
  }

  @Post('import')
  @RequirePermission('Lead', 'Create')
  importLeads(@Body() dto: ImportLeadsDto) {
    return this.leadsService.importLeads(dto);
  }

  @Get(':id')
  @RequirePermission('Lead', 'View')
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Post()
  @RequirePermission('Lead', 'Create')
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('Lead', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leadsService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('Lead', 'Edit')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateLeadStatusDto) {
    return this.leadsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @RequirePermission('Lead', 'Delete')
  remove(@Param('id') id: string) {
    return this.leadsService.remove(id);
  }

  @Post(':id/convert')
  @RequirePermission('Lead', 'Edit')
  convert(@Param('id') id: string) {
    return this.leadsService.convertToCustomer(id);
  }
}
