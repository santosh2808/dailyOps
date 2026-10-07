import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { QuickCreateUserDto } from './dto/quick-create-user.dto';

// User Management screen: list/create/edit/deactivate, plus Role Assignment
// and Department Assignment — both of those fold into the same PATCH
// endpoint (roleIds / departmentId in the body) rather than separate routes,
// same "PATCH with the full list" convention RolesController uses for
// permission assignment.
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @RequirePermission('User', 'View')
  findAll(@Query() query: QueryUserDto) {
    return this.usersService.findAll(query);
  }

  // Lead Assignment enhancement. Both routes are literal (multi-segment or
  // otherwise distinct from the single ':id' segment used by findOne()
  // below), and declared before it, same "no route-order collision" note
  // as LeadsController's Import routes.
  @Get('assignable')
  @RequirePermission('Lead', 'View')
  findAssignable() {
    return this.usersService.findAssignable();
  }

  @Post('quick-create')
  @RequirePermission('User', 'Create')
  quickCreate(@Body() dto: QuickCreateUserDto) {
    return this.usersService.quickCreate(dto);
  }

  @Get(':id')
  @RequirePermission('User', 'View')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @RequirePermission('User', 'Create')
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('User', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
    return this.usersService.update(id, dto, req.user.id, req.user?.name);
  }

  @Delete(':id')
  @RequirePermission('User', 'Delete')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.usersService.remove(id, req.user.id, req.user?.name);
  }

  // QA fix: "Delete User option is missing" — a distinct, permanent action
  // from the soft-delete (Disable) route above. Same permission (User:
  // Delete) since it's the same underlying capability, just a stronger
  // version of it. ':id/permanent' rather than reusing DELETE ':id' so the
  // existing Disable button/behavior is left completely unchanged.
  @Delete(':id/permanent')
  @RequirePermission('User', 'Delete')
  hardDelete(@Param('id') id: string, @Req() req: any) {
    return this.usersService.hardDelete(id, req.user.id);
  }

  // Administrator action ("Reset Passwords") — distinct from the general
  // Edit endpoint above; general update() no longer accepts a password at
  // all (see UpdateUserDto). Always forces the target user to change their
  // password again on next login.
  @Post(':id/reset-password')
  @RequirePermission('User', 'Edit')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.usersService.resetPassword(id, dto.newPassword);
  }
}
