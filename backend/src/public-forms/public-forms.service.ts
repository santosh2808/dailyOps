import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FormDefinition, FormSubjectRoute, FormWebsite, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { LeadsService } from '../leads/leads.service';
import { ComplaintsService } from '../complaints/complaints.service';
import { FormSchema, FormSchemaValidatorService } from './form-schema-validator.service';
import { CreatePublicFormSubmissionDto } from './dto/create-public-form-submission.dto';

const REFERENCE_NUMBER_PREFIX = 'ENQ';
const REFERENCE_NUMBER_PAD = 6;
const MAX_REFERENCE_NUMBER_ATTEMPTS = 5;

// Fields promoted to their own WebFormIntake columns — everything else the
// public submitter sends stays in submittedData verbatim. `fullName` (not
// `name`) is the field name stage 1's seed.ts schema actually uses — mapped
// here onto WebFormIntake.name, the column name the schema itself settled
// on.
const PROMOTED_FIELD_ALIASES: Record<string, 'name' | 'email' | 'phone' | 'company' | 'message'> = {
  fullName: 'name',
  email: 'email',
  phone: 'phone',
  company: 'company',
  message: 'message',
};

type FormContext = {
  website: FormWebsite;
  formDefinition: FormDefinition;
  versionId: string;
  schema: FormSchema;
};

// Public, unauthenticated counterpart to FormConfigurationController —
// reached directly by anonymous visitors on an external marketing website's
// form. Replaces the old form-submissions module's public half: a
// submission no longer creates its own operational inbox record, it creates
// an ordinary Lead or Complaint, routed by FormSubjectRoute (never derived
// from CANONICAL_SUBJECT_CODES at request time — see that file's comment).
@Injectable()
export class PublicFormsService {
  private readonly logger = new Logger(PublicFormsService.name);

  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
    private formSchemaValidatorService: FormSchemaValidatorService,
    private leadsService: LeadsService,
    private complaintsService: ComplaintsService,
  ) {}

  // ---------------------------------------------------------------------
  // GET /api/v1/public/forms/:publicFormKey
  // ---------------------------------------------------------------------

  async getPublicForm(publicFormKey: string) {
    const { website, formDefinition, schema } = await this.resolveFormContext(publicFormKey);

    const [routes, products] = await Promise.all([
      this.prisma.formSubjectRoute.findMany({
        where: { formDefinitionId: formDefinition.id, enabled: true },
        orderBy: [{ subjectCode: 'asc' }, { priority: 'desc' }],
      }),
      this.prisma.formWebsiteProduct.findMany({
        where: { formWebsiteId: website.id, enabled: true },
        orderBy: { displayOrder: 'asc' },
      }),
    ]);

    // `subject` is deliberately excluded from commonFields — its allowed
    // values come from subjectOptions (FormSubjectRoute, below) rather than
    // whatever options were baked into schema.fields.subject at
    // publish-time, so routing configuration changes (enable/disable a
    // subject, reprioritize) are reflected here without a new FormVersion.
    //
    // This schema shape (see stage 1's seed.ts) has no subject-keyed
    // conditional-field grouping — every optional field (invoiceNumber,
    // productCode, quantity, ...) lives flat in schema.fields regardless of
    // which subject it's actually only relevant to. conditionalFields is
    // therefore always empty here; a consuming frontend decides which
    // optional commonFields to show based on the selected subjectCode
    // itself, the same way stage 1's schema comments describe it.
    const commonFields = Object.fromEntries(
      Object.entries(schema.fields ?? {})
        .filter(([name]) => name !== 'subject')
        .map(([name, def]) => [name, { type: def.type, required: !!def.required, label: def.label }]),
    );

    return {
      publicFormKey,
      websiteName: website.name,
      commonFields,
      subjectOptions: routes.map((route) => ({ code: route.subjectCode, label: route.subjectLabel })),
      products: products.map((p) => ({ code: p.publicCode, label: p.label, fieldConfig: p.fieldConfig ?? undefined })),
      conditionalFields: {},
    };
  }

  // ---------------------------------------------------------------------
  // POST /api/v1/public/forms/:publicFormKey/submissions
  // ---------------------------------------------------------------------

  async submit(publicFormKey: string, dto: CreatePublicFormSubmissionDto) {
    const { website, formDefinition, versionId, schema } = await this.resolveFormContext(publicFormKey);

    // `subject` and `productCode`-the-selector are structural (promoted to
    // their own top-level DTO fields: subjectCode / productCode) rather than
    // members of the free-form `fields` bag, even though schema.fields also
    // declares a `subject` entry (for the admin UI to know it's an
    // enum-style selector) — excluded here so the required-field check
    // doesn't demand a duplicate `fields.subject`.
    const schemaForFieldsValidation: FormSchema = {
      fields: Object.fromEntries(Object.entries(schema.fields ?? {}).filter(([name]) => name !== 'subject')),
    };
    const errors = this.formSchemaValidatorService.validate(schemaForFieldsValidation, dto.fields);
    if (errors.length > 0) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Validation failed', errors });
    }

    // Idempotency: a retried submission with the same key on the same form
    // returns the original reference number instead of creating a
    // duplicate — never re-validated, never re-routed.
    if (dto.idempotencyKey) {
      const existing = await this.prisma.webFormIntake.findUnique({
        where: { formDefinitionId_idempotencyKey: { formDefinitionId: formDefinition.id, idempotencyKey: dto.idempotencyKey } },
      });
      if (existing) {
        return { referenceNumber: existing.referenceNumber, replay: true };
      }
    }

    let resolvedProductId: string | undefined;
    if (dto.productCode) {
      const mapping = await this.prisma.formWebsiteProduct.findFirst({
        where: { formWebsiteId: website.id, publicCode: dto.productCode, enabled: true },
      });
      if (!mapping) {
        throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Unknown or disabled product code' });
      }
      resolvedProductId = mapping.productId;
    }

    const route = await this.resolveRoute(formDefinition.id, dto.subjectCode, resolvedProductId);
    if (!route) {
      throw new BadRequestException({ code: 'SUBJECT_NOT_ROUTABLE', message: 'This subject is not configured for routing on this form' });
    }

    const submittedData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto.fields)) {
      if (!PROMOTED_FIELD_ALIASES[key]) {
        submittedData[key] = value;
      }
    }
    const name = this.stringOrUndefined(dto.fields.fullName) ?? 'Website Visitor';
    const email = this.stringOrUndefined(dto.fields.email);
    const phone = this.stringOrUndefined(dto.fields.phone);
    const company = this.stringOrUndefined(dto.fields.company);
    const message = this.stringOrUndefined(dto.fields.message) ?? '';
    const invoiceNumber = this.stringOrUndefined(dto.fields.invoiceNumber);
    const quantity = typeof dto.fields.quantity === 'number' ? dto.fields.quantity : undefined;

    for (let attempt = 1; attempt <= MAX_REFERENCE_NUMBER_ATTEMPTS; attempt++) {
      const referenceNumber = await this.generateReferenceNumber();
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const intake = await tx.webFormIntake.create({
            data: {
              referenceNumber,
              formWebsiteId: website.id,
              formDefinitionId: formDefinition.id,
              formVersionId: versionId,
              subjectCode: dto.subjectCode,
              subjectLabel: route.subjectLabel,
              name,
              email,
              phone,
              company,
              message,
              submittedData: submittedData as Prisma.InputJsonValue,
              classification: route.destinationType,
              idempotencyKey: dto.idempotencyKey,
              status: 'RECEIVED',
            },
          });

          let leadId: string | undefined;
          let complaintId: string | undefined;

          if (route.destinationType === 'LEAD') {
            const lead = await this.leadsService.createFromWebFormIntake(
              {
                formWebsiteId: website.id,
                webFormIntakeId: intake.id,
                subjectCode: dto.subjectCode,
                subjectLabel: route.subjectLabel,
                name,
                email,
                phone,
                company,
                message,
                assignedToUserId: route.assignedUserId,
                productId: resolvedProductId,
                quantity,
              },
              tx,
            );
            leadId = lead.id;
          } else {
            const complaint = await this.complaintsService.createFromWebFormIntake(
              {
                formWebsiteId: website.id,
                webFormIntakeId: intake.id,
                subjectCode: dto.subjectCode,
                subjectLabel: route.subjectLabel,
                name,
                email,
                phone,
                message,
                invoiceNumber,
                assignedToUserId: route.assignedUserId,
                departmentId: route.departmentId,
                submittedData: submittedData as Prisma.InputJsonValue,
              },
              tx,
            );
            complaintId = complaint.id;
          }

          await tx.webFormIntake.update({
            where: { id: intake.id },
            data: { status: 'PROCESSED', leadId, complaintId },
          });

          return { referenceNumber, leadId, complaintId };
        });

        // Never blocks the public response — the public caller only ever
        // gets back { referenceNumber }, regardless of whether either email
        // actually goes out (MailerService itself never throws; this catch
        // only guards against a truly unexpected failure).
        this.sendSubmissionNotifications({
          referenceNumber: result.referenceNumber,
          name,
          email,
          message,
          website,
          formDefinition,
          route,
          leadId: result.leadId,
          complaintId: result.complaintId,
        }).catch((error) => this.logger.error(`Notification emails failed for submission ${result.referenceNumber}`, error));

        return { referenceNumber: result.referenceNumber, replay: false };
      } catch (error) {
        if (this.isNumberConflict(error) && attempt < MAX_REFERENCE_NUMBER_ATTEMPTS) {
          continue; // Another request took a generated number first — retry with fresh ones.
        }
        throw error;
      }
    }

    // Unreachable, but keeps TypeScript satisfied about the return type.
    throw new Error('Failed to generate a unique reference number');
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async resolveFormContext(publicFormKey: string): Promise<FormContext> {
    const formDefinition = await this.prisma.formDefinition.findUnique({
      where: { publicFormKey },
      include: {
        formWebsite: true,
        versions: { where: { publishedAt: { not: null } }, orderBy: { version: 'desc' }, take: 1 },
      },
    });

    if (!formDefinition) {
      throw new NotFoundException({ code: 'FORM_NOT_FOUND', message: 'Form not found' });
    }
    if (!formDefinition.enabled) {
      throw new BadRequestException({ code: 'FORM_DISABLED', message: 'This form is currently disabled' });
    }
    if (formDefinition.formWebsite.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'WEBSITE_INACTIVE', message: 'This website is currently inactive' });
    }
    const version = formDefinition.versions[0];
    if (!version) {
      throw new NotFoundException({ code: 'FORM_NOT_PUBLISHED', message: 'This form has no published version yet' });
    }

    const { formWebsite, versions: _versions, ...formDefinitionOnly } = formDefinition;
    return {
      website: formWebsite,
      formDefinition: formDefinitionOnly,
      versionId: version.id,
      schema: version.schema as unknown as FormSchema,
    };
  }

  // Resolution rule (schema.prisma's own comment on FormSubjectRoute):
  // highest-priority enabled match wins, with a product-specific rule always
  // outranking a product-agnostic one for the same subjectCode.
  private async resolveRoute(
    formDefinitionId: string,
    subjectCode: string,
    productId: string | undefined,
  ): Promise<FormSubjectRoute | null> {
    const candidates = await this.prisma.formSubjectRoute.findMany({
      where: {
        formDefinitionId,
        subjectCode,
        enabled: true,
        OR: productId ? [{ productId }, { productId: null }] : [{ productId: null }],
      },
    });
    if (candidates.length === 0) {
      return null;
    }
    candidates.sort((a, b) => {
      const aSpecific = a.productId ? 1 : 0;
      const bSpecific = b.productId ? 1 : 0;
      if (aSpecific !== bSpecific) return bSpecific - aSpecific;
      return b.priority - a.priority;
    });
    return candidates[0];
  }

  private async sendSubmissionNotifications(input: {
    referenceNumber: string;
    name: string;
    email?: string;
    message: string;
    website: FormWebsite;
    formDefinition: FormDefinition;
    route: FormSubjectRoute;
    leadId?: string;
    complaintId?: string;
  }): Promise<void> {
    const isLead = input.route.destinationType === 'LEAD';
    const vars = {
      referenceNumber: input.referenceNumber,
      customerName: input.name,
      message: input.message,
      websiteName: input.website.name,
      formName: input.formDefinition.name,
      destinationType: input.route.destinationType,
      subjectLabel: input.route.subjectLabel,
      departmentName: '',
      assigneeName: '',
    };

    let assigneeEmail: string | null = null;
    if (input.route.departmentId || input.route.assignedUserId) {
      const [department, assignee] = await Promise.all([
        input.route.departmentId
          ? this.prisma.department.findUnique({ where: { id: input.route.departmentId } })
          : null,
        input.route.assignedUserId
          ? this.prisma.user.findUnique({ where: { id: input.route.assignedUserId } })
          : null,
      ]);
      vars.departmentName = department?.name ?? '';
      vars.assigneeName = assignee?.name ?? '';
      assigneeEmail = assignee?.email ?? null;
    }

    if (input.email) {
      await this.mailerService.send({
        templateKey: isLead ? 'WEB_LEAD_RECEIVED' : 'WEB_COMPLAINT_RECEIVED',
        fallbackSubject: `We received your ${isLead ? 'enquiry' : 'request'} — ${input.referenceNumber}`,
        fallbackBodyHtml:
          '<p>Dear {{customerName}},</p>' +
          '<p>Thank you for contacting {{websiteName}}. We have received your submission (reference {{referenceNumber}}) and will get back to you shortly.</p>',
        vars,
        to: input.email,
        link: { module: isLead ? 'Lead' : 'Complaint', leadId: input.leadId, complaintId: input.complaintId },
      });
    }

    const internalRecipient =
      input.formDefinition.supportEmail || input.website.supportEmail || process.env.ENQUIRY_NOTIFICATION_EMAIL;
    if (internalRecipient) {
      await this.mailerService.send({
        templateKey: 'WEB_SUBMISSION_INTERNAL',
        fallbackSubject: `New ${vars.destinationType} ${input.referenceNumber} — ${input.website.name}`,
        fallbackBodyHtml:
          '<p>A new {{destinationType}} ({{referenceNumber}}) was received on {{websiteName}} via {{formName}}, subject: {{subjectLabel}}.</p>' +
          '<p>From: {{customerName}}</p><p>{{message}}</p>',
        vars,
        to: internalRecipient,
        link: { module: isLead ? 'Lead' : 'Complaint', leadId: input.leadId, complaintId: input.complaintId },
      });
    }

    // Distinct from the internal notification above: this goes straight to
    // the individual FormSubjectRoute.assignedUserId resolves to, if any (an
    // unassigned/queue-only route just skips this — never guesses a
    // recipient). A record with no assigned user still gets the internal
    // notification above, so nothing is silently unnotified either way.
    if (input.route.assignedUserId && assigneeEmail) {
      await this.mailerService.send({
        templateKey: 'WEB_SUBMISSION_ASSIGNED',
        fallbackSubject: `${vars.destinationType} ${input.referenceNumber} assigned to you — ${input.website.name}`,
        fallbackBodyHtml:
          '<p>Hi {{assigneeName}},</p>' +
          '<p>A new {{destinationType}} ({{referenceNumber}}) from {{websiteName}} has been assigned to you.</p>' +
          '<p>Subject: {{subjectLabel}}<br/>From: {{customerName}}</p><p>{{message}}</p>',
        vars,
        to: assigneeEmail,
        link: { module: isLead ? 'Lead' : 'Complaint', leadId: input.leadId, complaintId: input.complaintId },
      });
    }
  }

  private async generateReferenceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `${REFERENCE_NUMBER_PREFIX}-${year}-`;
    const last = await this.prisma.webFormIntake.findFirst({
      where: { referenceNumber: { startsWith: prefix } },
      orderBy: { createdAt: 'desc' },
      select: { referenceNumber: true },
    });
    const lastSeq = last ? parseInt(last.referenceNumber.replace(prefix, ''), 10) || 0 : 0;
    return `${prefix}${String(lastSeq + 1).padStart(REFERENCE_NUMBER_PAD, '0')}`;
  }

  // Broad by design: this transaction can hit a unique conflict on
  // WebFormIntake.referenceNumber OR on Lead.leadNumber/Complaint.complaintNumber
  // (each generated by its own independent counter) — any of them is a sign
  // a concurrent request raced this one, so the whole attempt (with freshly
  // regenerated numbers) is retried rather than trying to special-case which
  // counter collided.
  private isNumberConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      ['referenceNumber', 'leadNumber', 'complaintNumber'].some((field) =>
        (error.meta?.target as string[]).includes(field),
      )
    );
  }

  private stringOrUndefined(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }
}
