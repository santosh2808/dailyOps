import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { FormConfigurationService } from './form-configuration.service';
import { CreateFormWebsiteDto } from './dto/create-form-website.dto';
import { UpdateFormWebsiteDto } from './dto/update-form-website.dto';
import { QueryFormWebsiteDto } from './dto/query-form-website.dto';
import { CreateFormDefinitionDto } from './dto/create-form-definition.dto';
import { UpdateFormDefinitionDto } from './dto/update-form-definition.dto';
import { CreateFormVersionDto } from './dto/create-form-version.dto';
import { CreateFormWebsiteProductDto } from './dto/create-form-website-product.dto';
import { UpdateFormWebsiteProductDto } from './dto/update-form-website-product.dto';
import { CreateFormSubjectRouteDto } from './dto/create-form-subject-route.dto';
import { UpdateFormSubjectRouteDto } from './dto/update-form-subject-route.dto';

// Admin config side of Website Form Configuration — websites, their forms/
// form versions, product mappings, and subject routing. Low write volume,
// admin-only (see the public-forms module for the high-traffic anonymous
// intake side). Replaces the old form-websites module 1:1 for the
// website/form/version endpoints (unchanged logic, FormWebsite.* permission
// checks swapped for FormConfiguration.*), and adds the product-mapping and
// subject-route CRUD endpoints that previously only existed via direct
// seeding.
@ApiTags('form-configuration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/form-configuration')
export class FormConfigurationController {
  constructor(private formConfigurationService: FormConfigurationService) {}

  @Get('websites')
  @RequirePermission('FormConfiguration', 'View')
  findAll(@Query() query: QueryFormWebsiteDto) {
    return this.formConfigurationService.findAll(query);
  }

  @Get('websites/:id')
  @RequirePermission('FormConfiguration', 'View')
  findOne(@Param('id') id: string) {
    return this.formConfigurationService.findOne(id);
  }

  @Post('websites')
  @RequirePermission('FormConfiguration', 'Create')
  create(@Body() dto: CreateFormWebsiteDto, @Req() req: any) {
    return this.formConfigurationService.create(dto, req.user?.name);
  }

  @Patch('websites/:id')
  @RequirePermission('FormConfiguration', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateFormWebsiteDto, @Req() req: any) {
    return this.formConfigurationService.update(id, dto, req.user?.name);
  }

  @Post('websites/:id/forms')
  @RequirePermission('FormConfiguration', 'Edit')
  createForm(@Param('id') id: string, @Body() dto: CreateFormDefinitionDto, @Req() req: any) {
    return this.formConfigurationService.createForm(id, dto, req.user?.name);
  }

  @Patch('websites/:id/forms/:formId')
  @RequirePermission('FormConfiguration', 'Edit')
  updateForm(@Param('id') id: string, @Param('formId') formId: string, @Body() dto: UpdateFormDefinitionDto, @Req() req: any) {
    return this.formConfigurationService.updateForm(id, formId, dto, req.user?.name);
  }

  @Post('websites/:id/forms/:formId/versions')
  @RequirePermission('FormConfiguration', 'Edit')
  createFormVersion(
    @Param('id') id: string,
    @Param('formId') formId: string,
    @Body() dto: CreateFormVersionDto,
    @Req() req: any,
  ) {
    return this.formConfigurationService.createFormVersion(id, formId, dto, req.user?.name);
  }

  @Post('websites/:id/forms/:formId/versions/:versionId/publish')
  @RequirePermission('FormConfiguration', 'Edit')
  publishFormVersion(
    @Param('id') id: string,
    @Param('formId') formId: string,
    @Param('versionId') versionId: string,
    @Req() req: any,
  ) {
    return this.formConfigurationService.publishFormVersion(id, formId, versionId, req.user?.name);
  }

  // -------------------------------------------------------------------
  // Products (FormWebsiteProduct)
  // -------------------------------------------------------------------

  @Get('websites/:id/products')
  @RequirePermission('FormConfiguration', 'View')
  listProducts(@Param('id') id: string) {
    return this.formConfigurationService.listProducts(id);
  }

  @Post('websites/:id/products')
  @RequirePermission('FormConfiguration', 'Create')
  createProduct(@Param('id') id: string, @Body() dto: CreateFormWebsiteProductDto, @Req() req: any) {
    return this.formConfigurationService.createProduct(id, dto, req.user?.name);
  }

  @Patch('websites/:id/products/:productMappingId')
  @RequirePermission('FormConfiguration', 'Edit')
  updateProduct(
    @Param('id') id: string,
    @Param('productMappingId') productMappingId: string,
    @Body() dto: UpdateFormWebsiteProductDto,
    @Req() req: any,
  ) {
    return this.formConfigurationService.updateProduct(id, productMappingId, dto, req.user?.name);
  }

  @Delete('websites/:id/products/:productMappingId')
  @RequirePermission('FormConfiguration', 'Delete')
  removeProduct(@Param('id') id: string, @Param('productMappingId') productMappingId: string, @Req() req: any) {
    return this.formConfigurationService.removeProduct(id, productMappingId, req.user?.name);
  }

  // -------------------------------------------------------------------
  // Subject Routes (FormSubjectRoute)
  // -------------------------------------------------------------------

  @Get('forms/:formDefinitionId/routes')
  @RequirePermission('FormConfiguration', 'View')
  listRoutes(@Param('formDefinitionId') formDefinitionId: string) {
    return this.formConfigurationService.listRoutes(formDefinitionId);
  }

  @Post('forms/:formDefinitionId/routes')
  @RequirePermission('FormConfiguration', 'Create')
  createRoute(@Param('formDefinitionId') formDefinitionId: string, @Body() dto: CreateFormSubjectRouteDto, @Req() req: any) {
    return this.formConfigurationService.createRoute(formDefinitionId, dto, req.user?.name);
  }

  @Patch('forms/:formDefinitionId/routes/:routeId')
  @RequirePermission('FormConfiguration', 'Edit')
  updateRoute(
    @Param('formDefinitionId') formDefinitionId: string,
    @Param('routeId') routeId: string,
    @Body() dto: UpdateFormSubjectRouteDto,
    @Req() req: any,
  ) {
    return this.formConfigurationService.updateRoute(formDefinitionId, routeId, dto, req.user?.name);
  }

  @Delete('forms/:formDefinitionId/routes/:routeId')
  @RequirePermission('FormConfiguration', 'Delete')
  removeRoute(@Param('formDefinitionId') formDefinitionId: string, @Param('routeId') routeId: string, @Req() req: any) {
    return this.formConfigurationService.removeRoute(formDefinitionId, routeId, req.user?.name);
  }
}
