import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { MaterialCategoriesService } from './material-categories.service';
import { CreateMaterialCategoryDto } from './dto/create-material-category.dto';

// Deliberately minimal — list + create only. This is a lookup table that
// exists to populate the Category dropdown on the Material Form and to
// satisfy the "Required Category" foreign key, per scope; no edit/delete UI
// or endpoint was requested for categories themselves.
@ApiTags('material-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/material-categories')
export class MaterialCategoriesController {
  constructor(private materialCategoriesService: MaterialCategoriesService) {}

  @Get()
  @RequirePermission('MaterialCategory', 'View')
  findAll() {
    return this.materialCategoriesService.findAll();
  }

  @Post()
  @RequirePermission('MaterialCategory', 'Create')
  create(@Body() dto: CreateMaterialCategoryDto) {
    return this.materialCategoriesService.create(dto);
  }
}
