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
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { QueryMaterialDto } from './dto/query-material.dto';

@ApiTags('materials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/materials')
export class MaterialsController {
  constructor(private materialsService: MaterialsService) {}

  @Get()
  @RequirePermission('Material', 'View')
  findAll(@Query() query: QueryMaterialDto) {
    return this.materialsService.findAll(query);
  }

  // Registered ahead of the ':id' route below so 'export' is never
  // swallowed as a material id.
  @Get('export')
  @RequirePermission('Material', 'View')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="materials-export.xlsx"')
  async export(@Res() res: Response) {
    const buffer = await this.materialsService.exportToExcel();
    res.send(buffer);
  }

  @Post('import')
  @RequirePermission('Material', 'Create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  importFromExcel(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Attach it under the "file" field.');
    }
    return this.materialsService.importFromExcel(file.buffer);
  }

  @Get(':id')
  @RequirePermission('Material', 'View')
  findOne(@Param('id') id: string) {
    return this.materialsService.findOne(id);
  }

  @Post()
  @RequirePermission('Material', 'Create')
  create(@Body() dto: CreateMaterialDto) {
    return this.materialsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('Material', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
    return this.materialsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('Material', 'Delete')
  deactivate(@Param('id') id: string) {
    return this.materialsService.deactivate(id);
  }
}
