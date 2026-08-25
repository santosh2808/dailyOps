import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { EmailTemplatesService } from './email-templates.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

// "Editable by Administrator" (requirement #7) — EmailTemplate.Edit is only
// granted to the Administrator role in seed.ts's ROLE_PERMISSIONS.
@ApiTags('email-templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/email-templates')
export class EmailTemplatesController {
  constructor(private emailTemplatesService: EmailTemplatesService) {}

  @Get()
  @RequirePermission('EmailTemplate', 'View')
  findAll() {
    return this.emailTemplatesService.findAll();
  }

  @Get(':id')
  @RequirePermission('EmailTemplate', 'View')
  findOne(@Param('id') id: string) {
    return this.emailTemplatesService.findOne(id);
  }

  @Post()
  @RequirePermission('EmailTemplate', 'Edit')
  create(@Body() dto: CreateEmailTemplateDto) {
    return this.emailTemplatesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('EmailTemplate', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto, @Req() req: any) {
    return this.emailTemplatesService.update(id, dto, req.user?.name);
  }
}
