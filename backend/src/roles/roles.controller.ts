import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/roles')
export class RolesController {
  constructor(private rolesService: RolesService) {}

  @Get()
  @RequirePermission('Role', 'View')
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @RequirePermission('Role', 'View')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequirePermission('Role', 'Create')
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  // Also how the Role edit screen assigns permissions to a role: it PATCHes
  // this same endpoint with a full `permissionIds` array, which replaces the
  // role's existing RolePermission rows (see RolesService.update()) — no
  // separate "assign permission" endpoint was needed.
  @Patch(':id')
  @RequirePermission('Role', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('Role', 'Delete')
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
