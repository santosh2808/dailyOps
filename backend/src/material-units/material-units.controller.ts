import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { MaterialUnitsService } from './material-units.service';
import { CreateMaterialUnitDto } from './dto/create-material-unit.dto';

// Deliberately minimal — list + create only, mirroring MaterialCategories.
// Populates the Unit dropdown on the Material Form and satisfies the
// "Required Unit" foreign key.
@ApiTags('material-units')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/material-units')
export class MaterialUnitsController {
  constructor(private materialUnitsService: MaterialUnitsService) {}

  @Get()
  @RequirePermission('MaterialUnit', 'View')
  findAll() {
    return this.materialUnitsService.findAll();
  }

  @Post()
  @RequirePermission('MaterialUnit', 'Create')
  create(@Body() dto: CreateMaterialUnitDto) {
    return this.materialUnitsService.create(dto);
  }
}
