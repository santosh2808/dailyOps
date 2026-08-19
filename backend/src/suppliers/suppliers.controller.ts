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
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuerySupplierDto } from './dto/query-supplier.dto';
import { ImportSuppliersDto } from './dto/import-suppliers.dto';

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/suppliers')
export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}

  @Get()
  @RequirePermission('Supplier', 'View')
  findAll(@Query() query: QuerySupplierDto) {
    return this.suppliersService.findAll(query);
  }

  // Supplier Import/Export. All multi-segment and registered ahead of the
  // single ':id' segment used by findOne() below, so none of them are ever
  // swallowed as a supplier id — same convention as Lead Import and
  // Materials Export.
  @Get('export')
  @RequirePermission('Supplier', 'View')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="suppliers-export.xlsx"')
  async export(@Res() res: Response) {
    const buffer = await this.suppliersService.exportToExcel();
    res.send(buffer);
  }

  @Get('import/template')
  @RequirePermission('Supplier', 'View')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="supplier-import-template.xlsx"')
  downloadImportTemplate(@Res() res: Response) {
    const buffer = this.suppliersService.getSupplierImportTemplate();
    res.send(buffer);
  }

  @Post('import/preview')
  @RequirePermission('Supplier', 'View')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  previewImport(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Attach it under the "file" field.');
    }
    return this.suppliersService.previewSupplierImport(file.buffer);
  }

  @Post('import')
  @RequirePermission('Supplier', 'Create')
  importSuppliers(@Body() dto: ImportSuppliersDto) {
    return this.suppliersService.importSuppliers(dto);
  }

  @Get(':id')
  @RequirePermission('Supplier', 'View')
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Post()
  @RequirePermission('Supplier', 'Create')
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('Supplier', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('Supplier', 'Delete')
  remove(@Param('id') id: string) {
    return this.suppliersService.remove(id);
  }
}
