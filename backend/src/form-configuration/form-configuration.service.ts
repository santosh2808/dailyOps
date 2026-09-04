import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
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

const FORM_INCLUDE = {
  forms: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      versions: { orderBy: { version: 'desc' as const } },
      routes: { orderBy: { priority: 'desc' as const } },
    },
  },
  products: {
    orderBy: { displayOrder: 'asc' as const },
    include: { product: { select: { id: true, name: true, sku: true } } },
  },
} satisfies Prisma.FormWebsiteInclude;

// Admin CRUD for Website Form Configuration — websites, their forms/form
// versions (immutable-once-published, server-generated publicFormKey),
// per-website product mappings, and per-form subject routing. Replaces the
// old FormWebsitesService 1:1 for the website/form/version part (unchanged
// logic, just FormWebsite.* permission checks swapped for
// FormConfiguration.* — see FormConfigurationController), and adds CRUD for
// FormWebsiteProduct/FormSubjectRoute, which didn't have endpoints before
// (only seeded directly).
@Injectable()
export class FormConfigurationService {
  private readonly logger = new Logger(FormConfigurationService.name);

  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
  ) {}

  // -------------------------------------------------------------------
  // Websites
  // -------------------------------------------------------------------

  async findAll(query: QueryFormWebsiteDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.FormWebsiteWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.formWebsite.findMany({
        where,
        include: FORM_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.formWebsite.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async findOne(id: string) {
    const website = await this.prisma.formWebsite.findUnique({ where: { id }, include: FORM_INCLUDE });
    if (!website) {
      throw new NotFoundException('Website not found');
    }
    return website;
  }

  async findFormOrThrow(websiteId: string, formId: string) {
    const form = await this.prisma.formDefinition.findFirst({
      where: { id: formId, formWebsiteId: websiteId },
      include: {
        versions: { orderBy: { version: 'desc' } },
        routes: { orderBy: { priority: 'desc' } },
      },
    });
    if (!form) {
      throw new NotFoundException('Form not found');
    }
    return form;
  }

  async create(dto: CreateFormWebsiteDto, actorName?: string) {
    const created = await this.prisma.formWebsite.create({
      data: {
        code: dto.code,
        name: dto.name,
        supportEmail: dto.supportEmail,
        allowedOrigins: dto.allowedOrigins ?? [],
        configuration: (dto.configuration ?? {}) as Prisma.InputJsonValue,
      },
      include: FORM_INCLUDE,
    });

    await this.auditLogService
      .record({
        module: 'FormConfiguration',
        recordId: created.id,
        action: 'WebsiteCreated',
        actorName,
        newValue: { code: created.code, name: created.name },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return created;
  }

  async update(id: string, dto: UpdateFormWebsiteDto, actorName?: string) {
    const existing = await this.findOne(id);
    const updated = await this.prisma.formWebsite.update({
      where: { id },
      data: {
        name: dto.name,
        status: dto.status,
        supportEmail: dto.supportEmail,
        allowedOrigins: dto.allowedOrigins,
        configuration: dto.configuration as Prisma.InputJsonValue | undefined,
      },
      include: FORM_INCLUDE,
    });

    await this.auditLogService
      .record({
        module: 'FormConfiguration',
        recordId: id,
        action: 'WebsiteUpdated',
        actorName,
        oldValue: { status: existing.status },
        newValue: { status: updated.status },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return updated;
  }

  // -------------------------------------------------------------------
  // Forms / Versions
  // -------------------------------------------------------------------

  async createForm(websiteId: string, dto: CreateFormDefinitionDto, actorName?: string) {
    await this.findOne(websiteId);

    try {
      const created = await this.prisma.formDefinition.create({
        data: {
          formWebsiteId: websiteId,
          code: dto.code,
          name: dto.name,
          enabled: dto.enabled ?? true,
          supportEmail: dto.supportEmail,
          configuration: (dto.configuration ?? {}) as Prisma.InputJsonValue,
          publicFormKey: this.generatePublicFormKey(),
        },
        include: { versions: true, routes: true },
      });

      await this.auditLogService
        .record({
          module: 'FormConfiguration',
          recordId: websiteId,
          action: 'FormCreated',
          actorName,
          newValue: { formId: created.id, code: created.code },
        })
        .catch((error) => this.logger.error('AuditLog record failed', error));

      return created;
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException('A form with this code already exists for this website');
      }
      throw error;
    }
  }

  async updateForm(websiteId: string, formId: string, dto: UpdateFormDefinitionDto, actorName?: string) {
    await this.findFormOrThrow(websiteId, formId);
    const updated = await this.prisma.formDefinition.update({
      where: { id: formId },
      data: {
        name: dto.name,
        enabled: dto.enabled,
        supportEmail: dto.supportEmail,
        configuration: dto.configuration as Prisma.InputJsonValue | undefined,
      },
      include: { versions: { orderBy: { version: 'desc' } }, routes: { orderBy: { priority: 'desc' } } },
    });

    await this.auditLogService
      .record({
        module: 'FormConfiguration',
        recordId: websiteId,
        action: 'FormUpdated',
        actorName,
        newValue: { formId, enabled: updated.enabled },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return updated;
  }

  // Immutable-once-published: a FormVersion's schema is never edited after
  // creation — the only way to change a live form's schema is to create a
  // new version (see FormSubjectRoute/public-forms, which always resolve
  // against the latest *published* version, never an unpublished draft).
  async createFormVersion(websiteId: string, formId: string, dto: CreateFormVersionDto, actorName?: string) {
    const form = await this.findFormOrThrow(websiteId, formId);
    this.assertValidSchemaDefinition(dto.schema);

    const nextVersion = (form.versions[0]?.version ?? 0) + 1;
    const publish = dto.publish ?? true;

    const created = await this.prisma.formVersion.create({
      data: {
        formDefinitionId: formId,
        version: nextVersion,
        schema: dto.schema as Prisma.InputJsonValue,
        publishedAt: publish ? new Date() : null,
      },
    });

    await this.auditLogService
      .record({
        module: 'FormConfiguration',
        recordId: websiteId,
        action: publish ? 'FormVersionPublished' : 'FormVersionDrafted',
        actorName,
        newValue: { formId, version: created.version },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return created;
  }

  async publishFormVersion(websiteId: string, formId: string, versionId: string, actorName?: string) {
    await this.findFormOrThrow(websiteId, formId);
    const version = await this.prisma.formVersion.findFirst({ where: { id: versionId, formDefinitionId: formId } });
    if (!version) {
      throw new NotFoundException('Form version not found');
    }

    const updated = await this.prisma.formVersion.update({
      where: { id: versionId },
      data: { publishedAt: version.publishedAt ?? new Date() },
    });

    await this.auditLogService
      .record({
        module: 'FormConfiguration',
        recordId: websiteId,
        action: 'FormVersionPublished',
        actorName,
        newValue: { formId, version: updated.version },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return updated;
  }

  // -------------------------------------------------------------------
  // Products (FormWebsiteProduct)
  // -------------------------------------------------------------------

  async listProducts(websiteId: string) {
    await this.findOne(websiteId);
    return this.prisma.formWebsiteProduct.findMany({
      where: { formWebsiteId: websiteId },
      orderBy: { displayOrder: 'asc' },
      include: { product: { select: { id: true, name: true, sku: true } } },
    });
  }

  async createProduct(websiteId: string, dto: CreateFormWebsiteProductDto, actorName?: string) {
    await this.findOne(websiteId);
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    try {
      const created = await this.prisma.formWebsiteProduct.create({
        data: {
          formWebsiteId: websiteId,
          productId: dto.productId,
          publicCode: dto.publicCode,
          label: dto.label,
          enabled: dto.enabled ?? true,
          displayOrder: dto.displayOrder ?? 0,
          fieldConfig: dto.fieldConfig as Prisma.InputJsonValue | undefined,
        },
        include: { product: { select: { id: true, name: true, sku: true } } },
      });

      await this.auditLogService
        .record({
          module: 'FormConfiguration',
          recordId: websiteId,
          action: 'ProductMappingCreated',
          actorName,
          newValue: { productMappingId: created.id, publicCode: created.publicCode },
        })
        .catch((error) => this.logger.error('AuditLog record failed', error));

      return created;
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException('This product (or public code) is already mapped on this website');
      }
      throw error;
    }
  }

  async updateProduct(
    websiteId: string,
    productMappingId: string,
    dto: UpdateFormWebsiteProductDto,
    actorName?: string,
  ) {
    const existing = await this.findProductMappingOrThrow(websiteId, productMappingId);

    try {
      const updated = await this.prisma.formWebsiteProduct.update({
        where: { id: productMappingId },
        data: {
          publicCode: dto.publicCode,
          label: dto.label,
          enabled: dto.enabled,
          displayOrder: dto.displayOrder,
          fieldConfig: dto.fieldConfig as Prisma.InputJsonValue | undefined,
        },
        include: { product: { select: { id: true, name: true, sku: true } } },
      });

      await this.auditLogService
        .record({
          module: 'FormConfiguration',
          recordId: websiteId,
          action: 'ProductMappingUpdated',
          actorName,
          oldValue: { enabled: existing.enabled },
          newValue: { productMappingId, enabled: updated.enabled },
        })
        .catch((error) => this.logger.error('AuditLog record failed', error));

      return updated;
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException('This public code is already used on this website');
      }
      throw error;
    }
  }

  async removeProduct(websiteId: string, productMappingId: string, actorName?: string) {
    await this.findProductMappingOrThrow(websiteId, productMappingId);
    await this.prisma.formWebsiteProduct.delete({ where: { id: productMappingId } });

    await this.auditLogService
      .record({ module: 'FormConfiguration', recordId: websiteId, action: 'ProductMappingDeleted', actorName, remarks: productMappingId })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return { success: true };
  }

  private async findProductMappingOrThrow(websiteId: string, productMappingId: string) {
    const mapping = await this.prisma.formWebsiteProduct.findFirst({
      where: { id: productMappingId, formWebsiteId: websiteId },
    });
    if (!mapping) {
      throw new NotFoundException('Product mapping not found');
    }
    return mapping;
  }

  // -------------------------------------------------------------------
  // Subject Routes (FormSubjectRoute)
  // -------------------------------------------------------------------

  async listRoutes(formDefinitionId: string) {
    await this.findFormDefinitionOrThrow(formDefinitionId);
    return this.prisma.formSubjectRoute.findMany({
      where: { formDefinitionId },
      orderBy: [{ subjectCode: 'asc' }, { priority: 'desc' }],
    });
  }

  async createRoute(formDefinitionId: string, dto: CreateFormSubjectRouteDto, actorName?: string) {
    await this.findFormDefinitionOrThrow(formDefinitionId);

    if (dto.productId) {
      const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
    }

    // subjectCode is validated as any non-empty string (already enforced by
    // the DTO's @IsNotEmpty) — deliberately NOT restricted to
    // CANONICAL_SUBJECT_CODES so a future website can introduce its own
    // code without a code change here.
    const created = await this.prisma.formSubjectRoute.create({
      data: {
        formDefinitionId,
        subjectCode: dto.subjectCode,
        subjectLabel: dto.subjectLabel,
        destinationType: dto.destinationType,
        productId: dto.productId,
        departmentId: dto.departmentId,
        assignedUserId: dto.assignedUserId,
        priority: dto.priority ?? 0,
        enabled: dto.enabled ?? true,
      },
    });

    await this.auditLogService
      .record({
        module: 'FormConfiguration',
        recordId: formDefinitionId,
        action: 'SubjectRouteCreated',
        actorName,
        newValue: { routeId: created.id, subjectCode: created.subjectCode, destinationType: created.destinationType },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return created;
  }

  async updateRoute(formDefinitionId: string, routeId: string, dto: UpdateFormSubjectRouteDto, actorName?: string) {
    const existing = await this.findRouteOrThrow(formDefinitionId, routeId);

    if (dto.productId) {
      const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
    }

    const updated = await this.prisma.formSubjectRoute.update({
      where: { id: routeId },
      data: {
        subjectLabel: dto.subjectLabel,
        destinationType: dto.destinationType,
        ...(dto.productId !== undefined ? { productId: dto.productId } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
        ...(dto.assignedUserId !== undefined ? { assignedUserId: dto.assignedUserId } : {}),
        priority: dto.priority,
        enabled: dto.enabled,
      },
    });

    await this.auditLogService
      .record({
        module: 'FormConfiguration',
        recordId: formDefinitionId,
        action: 'SubjectRouteUpdated',
        actorName,
        oldValue: { enabled: existing.enabled, destinationType: existing.destinationType },
        newValue: { routeId, enabled: updated.enabled, destinationType: updated.destinationType },
      })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return updated;
  }

  async removeRoute(formDefinitionId: string, routeId: string, actorName?: string) {
    await this.findRouteOrThrow(formDefinitionId, routeId);
    await this.prisma.formSubjectRoute.delete({ where: { id: routeId } });

    await this.auditLogService
      .record({ module: 'FormConfiguration', recordId: formDefinitionId, action: 'SubjectRouteDeleted', actorName, remarks: routeId })
      .catch((error) => this.logger.error('AuditLog record failed', error));

    return { success: true };
  }

  private async findFormDefinitionOrThrow(formDefinitionId: string) {
    const form = await this.prisma.formDefinition.findUnique({ where: { id: formDefinitionId } });
    if (!form) {
      throw new NotFoundException('Form not found');
    }
    return form;
  }

  private async findRouteOrThrow(formDefinitionId: string, routeId: string) {
    const route = await this.prisma.formSubjectRoute.findFirst({
      where: { id: routeId, formDefinitionId },
    });
    if (!route) {
      throw new NotFoundException('Subject route not found');
    }
    return route;
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  // Random, non-guessable key looked up directly by anonymous public
  // submitters — deliberately not derived from the form's code/name.
  private generatePublicFormKey(): string {
    return `fm_${randomBytes(6).toString('hex')}`;
  }

  private assertValidSchemaDefinition(schema: Record<string, unknown>): void {
    const fields = (schema as { fields?: unknown }).fields;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      throw new BadRequestException('schema.fields must be an object mapping field names to { type, required }');
    }
    for (const [name, def] of Object.entries(fields as Record<string, unknown>)) {
      const fieldDef = def as { type?: unknown; required?: unknown; options?: unknown };
      if (!['string', 'number', 'boolean'].includes(fieldDef.type as string)) {
        throw new BadRequestException(`schema.fields.${name}.type must be one of string, number, boolean`);
      }
      if (fieldDef.required !== undefined && typeof fieldDef.required !== 'boolean') {
        throw new BadRequestException(`schema.fields.${name}.required must be a boolean`);
      }
      if (fieldDef.options !== undefined) {
        if (!Array.isArray(fieldDef.options)) {
          throw new BadRequestException(`schema.fields.${name}.options must be an array of { value, label }`);
        }
        for (const option of fieldDef.options) {
          if (
            !option ||
            typeof option !== 'object' ||
            typeof (option as { value?: unknown }).value !== 'string' ||
            typeof (option as { label?: unknown }).label !== 'string'
          ) {
            throw new BadRequestException(`schema.fields.${name}.options entries must be { value: string, label: string }`);
          }
        }
      }
    }
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
