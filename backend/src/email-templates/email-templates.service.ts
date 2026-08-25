import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

@Injectable()
export class EmailTemplatesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.emailTemplate.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const template = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException('Email template not found');
    }
    return template;
  }

  // Used by MailerService — returns null (never throws) when a template is
  // missing or inactive, so a not-yet-seeded/disabled template degrades to
  // "email skipped, logged as SIMULATED" rather than breaking the business
  // action that triggered it (see MailerService.send()).
  findByKey(key: string) {
    return this.prisma.emailTemplate.findUnique({ where: { key } });
  }

  async create(dto: CreateEmailTemplateDto) {
    const existing = await this.prisma.emailTemplate.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException(`An email template with key "${dto.key}" already exists`);
    }
    return this.prisma.emailTemplate.create({
      data: {
        key: dto.key,
        name: dto.name,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateEmailTemplateDto, actorName?: string) {
    await this.findOne(id);
    // `key` is intentionally never taken from dto here — see the comment on
    // UpdateEmailTemplateDto.
    return this.prisma.emailTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        isActive: dto.isActive,
        updatedBy: actorName,
      },
    });
  }
}
