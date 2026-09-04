import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LeadHistoryAction, LeadPriority, LeadSource, LeadStatus, Prisma } from '@prisma/client';
import { isEmail } from 'class-validator';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { QueryLeadDto } from './dto/query-lead.dto';
import { LeadProductInputDto } from './dto/lead-product-input.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import { INDIA_STATES } from '../common/india-states';

const LEAD_NUMBER_PREFIX = 'LD-';
const LEAD_NUMBER_PAD = 6;
const MAX_LEAD_NUMBER_ATTEMPTS = 5;

// Additive: Website Enquiries -> Lead/Complaint refactor. Lead <-> Complaint
// conversion shares this module's own CMP- numbering convention rather than
// importing ComplaintsService (which would create a circular module
// dependency — ComplaintsService.convertToLead() needs to create a Lead the
// same way, so each side stays self-contained and duplicates only this
// small numbering constant/helper, not any business logic).
const CONVERSION_COMPLAINT_NUMBER_PREFIX = 'CMP-';
const CONVERSION_COMPLAINT_NUMBER_PAD = 6;
const MAX_CONVERSION_NUMBER_ATTEMPTS = 5;

// Lead Import: maps the human-readable template headers (case-insensitive)
// to the row shape used internally. Any column in the uploaded file that
// isn't one of these (and isn't one of the phone headers below) is
// silently ignored, so extra columns don't break anything.
//
// Phone is deliberately NOT in this map — a file can have more than one
// phone-ish column (Work Direct Phone, Home Phone, Mobile Phone, etc. all
// at once), so it needs its own priority-based resolution instead of a
// flat 1:1 mapping. See LEAD_IMPORT_PHONE_HEADER_PRIORITY below.
const LEAD_IMPORT_COLUMN_MAP: Record<string, string> = {
  'company name': 'companyName',
  'contact person': 'contactPerson',
  'contact name': 'contactPerson',
  email: 'email',
  'email address': 'email',
  city: 'city',
  state: 'state',
  industry: 'industry',
  'lead source': 'source',
  status: 'status',
  remarks: 'remarks',
};

// Every header that can supply a phone number, in priority order. When a
// row has more than one of these columns filled in, the FIRST one in this
// list with a non-empty value wins: a plain Phone/Phone Number/Contact
// Number column (if present) is treated as unambiguous and takes top
// priority; failing that, Mobile Phone > Work Direct Phone > Home Phone,
// per how this business actually prioritizes reaching a lead.
const LEAD_IMPORT_PHONE_HEADER_PRIORITY: string[] = [
  'phone',
  'phone number',
  'contact number',
  'mobile phone',
  'mobile',
  'mobile number',
  'work direct phone',
  'home phone',
];

// Exact column order or the downloadable template, and the order the
// export-style import expects (though headers are matched by name, not
// position, so re-ordered columns still work).
const LEAD_IMPORT_TEMPLATE_HEADERS = [
  'Company Name',
  'Contact Person',
  'Email',
  'Phone',
  'City',
  'State',
  'Industry',
  'Lead Source',
  'Status',
  'Remarks',
];

const LEAD_SOURCE_VALUES: string[] = Object.values(LeadSource);
const LEAD_STATUS_VALUES: string[] = Object.values(LeadStatus);

function normalizeEnumInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

interface LeadImportRowInput {
  companyName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  industry?: string;
  source?: string;
  status?: string;
  remarks?: string;
  // Multi-sheet import (see parseImportFile): the workbook tab this row
  // came from, always set for display/traceability. When the tab's own
  // name matches a recognized state, `state` above is overwritten with it
  // (tab wins over any "State" column value on the row) — see
  // resolveSheetState().
  sheet?: string;
}

// Exported: this shape is threaded through the public return types of
// previewLeadImport()/importLeads(), so it must be nameable in the
// generated .d.ts output (the same reason Material Import's row-result type
// had to be exported).
export interface LeadImportRowResult {
  row: number;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  city?: string;
  state?: string;
  industry?: string;
  source: LeadSource;
  status: LeadStatus;
  remarks?: string;
  sheet?: string;
  result: 'valid' | 'invalid' | 'duplicate' | 'created';
  errors?: string[];
  duplicateReason?: string;
  leadNumber?: string;
}

// Whitelisted so `sortBy` from the query string can never be used to sort by
// an arbitrary/unindexed or sensitive column.
const SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'companyName',
  'estimatedValue',
  'nextFollowUp',
  'expectedCloseDate',
  'leadNumber',
  'priority',
  'status',
] as const;

// `select` (not the full row) on assignedToUser everywhere it's included —
// never expose the password hash or any other User column beyond what the
// Lead Assignment picker/display actually needs.
const ASSIGNED_TO_USER_SELECT = { id: true, name: true, email: true } satisfies Prisma.UserSelect;

const LEAD_DETAIL_INCLUDE = {
  products: { include: { product: true } },
  assignedToUser: { select: ASSIGNED_TO_USER_SELECT },
  // Lead Management Phase 1 (requirement #12) — lets the frontend show
  // "View Quotation"/"Send Quotation" instead of "Generate Quotation" once
  // one already exists for this lead, and avoid ever creating duplicates.
  quotations: {
    select: { id: true, quotationNumber: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  },
  // Additive (Website Enquiries -> Lead/Complaint refactor, frontend Stage
  // 3): lets Lead Details render a "Website Submission" card without a
  // second round-trip — website name/code for display, and the originating
  // intake's reference number/subject label/submitted payload/timestamp.
  sourceWebsite: { select: { id: true, code: true, name: true } },
  webFormIntake: {
    select: { id: true, referenceNumber: true, subjectLabel: true, submittedData: true, createdAt: true },
  },
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
  ) {}

  // Notifies a user directly when a Lead is assigned to them — manual
  // creation/reassignment by staff (see create()/update() below); the
  // web-form-routing equivalent is PublicFormsService's own
  // WEB_SUBMISSION_ASSIGNED send, since that path never goes through here.
  // Never throws (MailerService itself doesn't); silently no-ops if the
  // user has no email on file rather than guessing a recipient.
  private async notifyLeadAssigned(
    userId: string,
    lead: { id: string; leadNumber: string; title: string; companyName: string },
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    if (!user?.email) return;
    await this.mailerService.send({
      templateKey: 'LEAD_ASSIGNED',
      fallbackSubject: `Lead ${lead.leadNumber} assigned to you`,
      fallbackBodyHtml:
        '<p>Hi {{assigneeName}},</p><p>Lead {{leadNumber}} — {{title}} ({{companyName}}) has been assigned to you.</p>',
      vars: {
        assigneeName: user.name,
        leadNumber: lead.leadNumber,
        title: lead.title,
        companyName: lead.companyName,
      },
      to: user.email,
      link: { module: 'Lead', leadId: lead.id },
    });
  }

  async findAll(query: QueryLeadDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { leadNumber: { contains: search, mode: 'insensitive' } },
              { companyName: { contains: search, mode: 'insensitive' } },
              { contactPerson: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { title: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortBy = SORTABLE_FIELDS.includes(query.sortBy as (typeof SORTABLE_FIELDS)[number])
      ? (query.sortBy as (typeof SORTABLE_FIELDS)[number])
      : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { products: true } },
          assignedToUser: { select: ASSIGNED_TO_USER_SELECT },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string) {
    // Matches the Customer/Product convention: a direct lookup by id still
    // returns the record even if it has been soft-deleted; only the list
    // endpoint hides it by default.
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: LEAD_DETAIL_INCLUDE,
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return lead;
  }

  async create(dto: CreateLeadDto, actorName?: string) {
    const { products, expectedCloseDate, nextFollowUp, ...leadData } = dto;

    for (let attempt = 1; attempt <= MAX_LEAD_NUMBER_ATTEMPTS; attempt++) {
      const leadNumber = await this.generateLeadNumber();
      try {
        const lead = await this.prisma.$transaction(async (tx) => {
          const created = await tx.lead.create({
            data: {
              ...leadData,
              leadNumber,
              expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
              nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : undefined,
              products: this.buildProductsCreateInput(products),
            },
            include: LEAD_DETAIL_INCLUDE,
          });
          await this.logHistory(tx, created.id, 'CREATED', `Lead ${created.leadNumber} created`, actorName);
          return created;
        });
        if (lead.assignedToUserId) {
          await this.notifyLeadAssigned(lead.assignedToUserId, lead);
        }
        return lead;
      } catch (error) {
        if (this.isLeadNumberConflict(error) && attempt < MAX_LEAD_NUMBER_ATTEMPTS) {
          continue; // Another request took this number first — retry with a fresh one.
        }
        throw error;
      }
    }

    // Unreachable, but keeps TypeScript satisfied about the return type.
    throw new Error('Failed to generate a unique lead number');
  }

  async update(id: string, dto: UpdateLeadDto, actorName?: string) {
    const existing = await this.findOne(id);
    const { products, expectedCloseDate, nextFollowUp, assignedToUserId, ...leadData } = dto;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (products) {
        await tx.leadProduct.deleteMany({ where: { leadId: id } });
      }

      const updated = await tx.lead.update({
        where: { id },
        data: {
          ...leadData,
          ...(assignedToUserId !== undefined ? { assignedToUserId } : {}),
          ...(expectedCloseDate !== undefined
            ? { expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null }
            : {}),
          ...(nextFollowUp !== undefined
            ? { nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : null }
            : {}),
          products: this.buildProductsCreateInput(products),
        },
        include: LEAD_DETAIL_INCLUDE,
      });

      // Assignment change gets its own structured LeadAssignmentHistory row
      // plus a dedicated ASSIGNED timeline entry — kept separate from the
      // generic "Edited" entry below so the Assign action is always
      // individually traceable, per requirement #7. LeadAssignmentHistory
      // stores display names (not raw ids), so the new user's name is
      // resolved here rather than trusting anything from the request body.
      if (assignedToUserId !== undefined && assignedToUserId !== existing.assignedToUserId) {
        const newUserName = assignedToUserId
          ? (await tx.user.findUnique({ where: { id: assignedToUserId }, select: { name: true } }))
              ?.name ?? null
          : null;
        const previousUserName = existing.assignedToUser?.name ?? null;

        await tx.leadAssignmentHistory.create({
          data: {
            leadId: id,
            previousUser: previousUserName,
            newUser: newUserName,
            changedBy: actorName,
          },
        });
        await this.logHistory(
          tx,
          id,
          'ASSIGNED',
          `Reassigned from ${previousUserName || 'Unassigned'} to ${newUserName || 'Unassigned'}`,
          actorName,
        );
      }

      // Follow-up scheduling gets its own dedicated Timeline entry
      // (requirement #3's "Follow-up Added") rather than being folded into
      // the generic "Edited" bucket below — deliberately fires on every
      // change to nextFollowUp/reminderNote/priority together, since in
      // practice a salesperson updates them as one "schedule a follow-up"
      // action, not three separate edits.
      const newNextFollowUp =
        nextFollowUp !== undefined ? (nextFollowUp ? new Date(nextFollowUp) : null) : undefined;
      const followUpFieldsChanged = this.diffLeadFields(existing, {
        nextFollowUp: newNextFollowUp,
        priority: leadData.priority,
        reminderNote: leadData.reminderNote,
      });
      if (followUpFieldsChanged.length > 0) {
        const description = newNextFollowUp
          ? `Follow-up scheduled for ${newNextFollowUp.toLocaleDateString()}${
              leadData.reminderNote ? ` — ${leadData.reminderNote}` : ''
            }`
          : 'Follow-up details updated';
        await this.logHistory(tx, id, 'FOLLOWUP_ADDED', description, actorName);
      }

      // Any other field that actually changed value (compared against the
      // pre-update snapshot, not just "was this key sent") gets folded into
      // one generic "Edited" timeline entry, so re-saving a form with
      // unchanged values doesn't spam the timeline. Follow-up fields are
      // excluded here since they were already logged as their own
      // dedicated entry above.
      const { priority: _priority, reminderNote: _reminderNote, ...leadDataForEditDiff } = leadData;
      const changedFields = this.diffLeadFields(existing, {
        ...leadDataForEditDiff,
        expectedCloseDate:
          expectedCloseDate !== undefined
            ? expectedCloseDate
              ? new Date(expectedCloseDate)
              : null
            : undefined,
      });
      const editedParts = [...changedFields, ...(products ? ['products'] : [])];
      if (editedParts.length > 0) {
        await this.logHistory(tx, id, 'EDITED', `Updated: ${editedParts.join(', ')}`, actorName);
      }

      return updated;
    });

    if (
      assignedToUserId !== undefined &&
      assignedToUserId &&
      assignedToUserId !== existing.assignedToUserId
    ) {
      await this.notifyLeadAssigned(assignedToUserId, updated);
    }

    return updated;
  }

  async updateStatus(id: string, dto: UpdateLeadStatusDto, actorName?: string) {
    const existing = await this.findOne(id);

    // Catch this at the status-change step, not just later at Generate
    // Quotation (see getLeadForQuotationGeneration() below, which enforces
    // the same rule) — Qualified is supposed to mean "ready to quote", so a
    // lead with no products linked shouldn't be allowed into that stage at
    // all.
    if (dto.status === 'QUALIFIED' && (!existing.products || existing.products.length === 0)) {
      throw new BadRequestException(
        'Add at least one product to this lead before marking it Qualified.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // This endpoint only ever updates the status field. Setting status to
      // WON does not create a Customer — that only happens when the user
      // explicitly calls convertToCustomer() via POST /:id/convert below.
      const updated = await tx.lead.update({
        where: { id },
        data: { status: dto.status },
        include: LEAD_DETAIL_INCLUDE,
      });

      if (dto.status !== existing.status) {
        await tx.leadStatusHistory.create({
          data: {
            leadId: id,
            oldStatus: existing.status,
            newStatus: dto.status,
            remarks: dto.remarks,
            changedBy: actorName,
          },
        });
        await this.logHistory(
          tx,
          id,
          'STATUS_CHANGED',
          `Status changed from ${existing.status} to ${dto.status}`,
          actorName,
        );
      }

      return updated;
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async convertToCustomer(id: string, actorName?: string) {
    const lead = await this.findOne(id);

    if (lead.status !== 'WON') {
      throw new BadRequestException('Only leads with status WON can be converted to a customer');
    }
    if (lead.isConverted) {
      throw new ConflictException('This lead has already been converted to a customer');
    }

    // Direct prisma.customer.create() (not CustomersService) — CustomersModule
    // doesn't export its service, and this avoids modifying that module.
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          companyName: lead.companyName,
          contactPerson: lead.contactPerson,
          phone: lead.phone,
          email: lead.email ?? undefined,
          // BUG FIX: state was never carried over here, so every converted
          // customer landed with state = null despite the lead itself
          // requiring one — silently dropping data off the Dashboard's India
          // Sales Map for the majority of customers (they all originate from
          // a converted lead). Lead.state is required as of the same change
          // that added this line, so this is always populated going forward;
          // `?? undefined` only matters for leads created before that.
          state: lead.state ?? undefined,
        },
      });

      const updatedLead = await tx.lead.update({
        where: { id },
        data: {
          isConverted: true,
          convertedAt: new Date(),
          customerId: customer.id,
        },
        include: LEAD_DETAIL_INCLUDE,
      });

      // BUG FIX: any Quotation generated from this lead (Lead Management
      // Phase 1's "Generate Quotation" — Quotation.leadId set, customerId
      // still null) was permanently stuck once the lead reached WON: the
      // ACCEPTED transition is refused for any quotation with no
      // customerId (see QuotationsService.updateStatus()), and nothing
      // ever backfilled customerId once the lead was converted, so the
      // workflow had no way to continue past this point. Backfilling it
      // here — the moment a real Customer starts existing for this lead —
      // is exactly the case the schema comment on Quotation.leadId already
      // anticipated ("When Phase 2's Customer Acceptance eventually
      // converts the lead, that step is expected to backfill customerId
      // onto any of its quotations"). This only ever touches quotations
      // that still have no customerId, so it never reassigns one that's
      // already linked elsewhere, and it does not change the quotation's
      // status — Sales Order / Proforma Invoice / JEO generation remain
      // explicit actions the user takes from Customer Details.
      await tx.quotation.updateMany({
        where: { leadId: id, customerId: null },
        data: { customerId: customer.id },
      });

      await this.logHistory(
        tx,
        id,
        'CUSTOMER_CONVERTED',
        `Converted to Customer "${customer.companyName}"`,
        actorName,
      );

      return { lead: updatedLead, customer };
    });
  }

  // Additive: Website Enquiries -> Lead/Complaint refactor. Called only from
  // PublicFormsService, inside its own `$transaction` alongside the
  // WebFormIntake row it just created — takes that transaction's client so
  // the intake row, the lead, and the LeadHistory entry all commit or fail
  // together. Not exposed via its own controller route: there is no public
  // DTO wrapping this — a web-originated Lead is only ever created as a side
  // effect of a public form submission.
  //
  // Field-mapping decisions (documented per the plan's request):
  //  - companyName: falls back to the contact person's name when the form
  //    didn't collect a company (e.g. an individual homeowner) — Lead.companyName
  //    is a required non-null column, and fabricating a placeholder like
  //    "N/A" would be worse than just using the one real name we do have.
  //  - contactPerson/email/phone/description: taken verbatim from the
  //    submitted contact fields (phone falls back to '' only if the form's
  //    schema didn't actually require it — every seeded form does).
  //  - title: the resolved FormSubjectRoute's subjectLabel (there is no
  //    other natural "opportunity title" for a web enquiry).
  //  - assignedToUserId: the route's own assignedUserId, or null — never
  //    defaulted to any other user.
  //  - priority: always MEDIUM — FormSubjectRoute carries no priority
  //    column in this schema.
  async createFromWebFormIntake(
    input: {
      formWebsiteId: string;
      webFormIntakeId: string;
      subjectCode: string;
      subjectLabel: string;
      name: string;
      email?: string | null;
      phone?: string | null;
      company?: string | null;
      message?: string | null;
      assignedToUserId?: string | null;
      productId?: string | null;
      quantity?: number | null;
    },
    tx: Prisma.TransactionClient,
  ) {
    const leadNumber = await this.generateLeadNumber();
    const companyName = input.company?.trim() || input.name.trim();

    const lead = await tx.lead.create({
      data: {
        leadNumber,
        companyName,
        contactPerson: input.name,
        email: input.email || undefined,
        phone: input.phone || '',
        title: input.subjectLabel,
        description: input.message || undefined,
        remarks: input.message || undefined,
        source: LeadSource.WEBSITE,
        priority: LeadPriority.MEDIUM,
        sourceWebsiteId: input.formWebsiteId,
        sourceSubjectCode: input.subjectCode,
        webFormIntakeId: input.webFormIntakeId,
        assignedToUserId: input.assignedToUserId ?? undefined,
        products:
          input.productId
            ? {
                create: [
                  {
                    productId: input.productId,
                    quantity:
                      typeof input.quantity === 'number' && input.quantity > 0
                        ? Math.floor(input.quantity)
                        : 1,
                  },
                ],
              }
            : undefined,
      },
      include: LEAD_DETAIL_INCLUDE,
    });

    await this.logHistory(
      tx,
      lead.id,
      'CREATED',
      `Lead ${lead.leadNumber} created from website submission (${input.subjectLabel})`,
    );

    return lead;
  }

  // Additive: Lead <-> Complaint conversion (Website Enquiries -> Lead/Complaint
  // refactor). Requires the caller to hold BOTH Lead.Edit and Complaint.Create
  // (see LeadsController — @RequireAllPermissions). Idempotent guard mirrors
  // convertToCustomer()'s isConverted check via convertedToComplaintId.
  async convertToComplaint(
    id: string,
    actorName?: string,
    dto?: { reason?: string },
  ) {
    const lead = await this.findOne(id);
    if (lead.convertedToComplaintId) {
      throw new ConflictException('This lead has already been converted to a complaint');
    }

    for (let attempt = 1; attempt <= MAX_CONVERSION_NUMBER_ATTEMPTS; attempt++) {
      const complaintNumber = await this.generateConversionComplaintNumber();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const complaint = await tx.complaint.create({
            data: {
              complaintNumber,
              source: 'CONVERTED_FROM_LEAD',
              salesOrderId: null,
              subject: lead.title,
              description: lead.description ?? undefined,
              sourceWebsiteId: lead.sourceWebsiteId,
              sourceSubjectCode: lead.sourceSubjectCode,
              webFormIntakeId: lead.webFormIntakeId,
              reporterName: lead.contactPerson,
              reporterEmail: lead.email,
              reporterPhone: lead.phone,
              assignedToUserId: lead.assignedToUserId,
              createdBy: actorName,
            },
          });

          await tx.lead.update({
            where: { id },
            data: { deletedAt: new Date(), convertedToComplaintId: complaint.id },
          });

          await tx.leadComplaintConversion.create({
            data: {
              direction: 'LEAD_TO_COMPLAINT',
              sourceLeadId: id,
              targetComplaintId: complaint.id,
              convertedBy: actorName,
              reason: dto?.reason,
            },
          });

          // LeadHistoryAction has no dedicated "converted to complaint"
          // value (only CUSTOMER_CONVERTED exists for the Lead->Customer
          // path) — EDITED is the closest existing enum value, with the
          // description carrying the real meaning.
          await this.logHistory(
            tx,
            id,
            'EDITED',
            `Converted to Complaint ${complaint.complaintNumber}`,
            actorName,
          );
          await tx.complaintHistory.create({
            data: {
              complaintId: complaint.id,
              action: 'CONVERTED_FROM_LEAD',
              description: `Converted from Lead ${lead.leadNumber}`,
              performedBy: actorName,
            },
          });

          return { id: complaint.id, complaintNumber: complaint.complaintNumber };
        });
      } catch (error) {
        if (this.isConversionComplaintNumberConflict(error) && attempt < MAX_CONVERSION_NUMBER_ATTEMPTS) {
          continue; // Another request took this number first — retry with a fresh one.
        }
        throw error;
      }
    }

    throw new Error('Failed to generate a unique complaint number');
  }

  private async generateConversionComplaintNumber(): Promise<string> {
    const last = await this.prisma.complaint.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { complaintNumber: true },
    });
    const lastSeq = last
      ? parseInt(last.complaintNumber.replace(CONVERSION_COMPLAINT_NUMBER_PREFIX, ''), 10) || 0
      : 0;
    return `${CONVERSION_COMPLAINT_NUMBER_PREFIX}${String(lastSeq + 1).padStart(CONVERSION_COMPLAINT_NUMBER_PAD, '0')}`;
  }

  private isConversionComplaintNumberConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      (error.meta?.target as string[]).includes('complaintNumber')
    );
  }

  // Lead Management Phase 1 (requirement #8) — gates the "Generate
  // Quotation" button/endpoint. Called by QuotationsService.create() before
  // it does anything else, so a rejected generation never creates a
  // half-formed Quotation. Returns the lead (with its products already
  // included via findOne()) so the caller doesn't need a second query.
  async getLeadForQuotationGeneration(leadId: string) {
    const lead = await this.findOne(leadId);
    if (lead.status !== 'QUALIFIED') {
      throw new BadRequestException(
        'Generate Quotation is only available once this lead is Qualified.',
      );
    }
    if (!lead.products || lead.products.length === 0) {
      throw new BadRequestException(
        'This lead has no products linked yet. Add products to the lead before generating a quotation.',
      );
    }
    return lead;
  }

  // Called by QuotationsService.create() immediately after a Quotation is
  // successfully generated from this lead. Deliberately not run inside the
  // Quotation's own transaction — if this write fails, the Quotation still
  // exists; only the Timeline entry would be missing, which is preferable
  // to rolling back an otherwise-successful Generate Quotation.
  async recordQuotationGenerated(leadId: string, quotationNumber: string, actorName?: string) {
    await this.prisma.leadHistory.create({
      data: {
        leadId,
        action: 'QUOTATION_CREATED',
        description: `Quotation ${quotationNumber} generated`,
        performedBy: actorName,
      },
    });
  }

  // Called by QuotationsService.sendQuotation() when the quotation being
  // sent is lead-originated (requirement #10: sending a quotation advances
  // the Lead to QUOTATION_SENT). Guarded so it never fires on a lead that's
  // already WON/LOST, or already QUOTATION_SENT (e.g. a re-send of the
  // same quotation) — mirrors the same "don't regress a further-along
  // lead" caution used throughout this module.
  async recordQuotationSent(leadId: string, quotationNumber: string, actorName?: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || (['WON', 'LOST', 'QUOTATION_SENT'] as string[]).includes(lead.status)) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: leadId }, data: { status: 'QUOTATION_SENT' } });
      await tx.leadStatusHistory.create({
        data: {
          leadId,
          oldStatus: lead.status,
          newStatus: 'QUOTATION_SENT',
          remarks: `Automatically advanced — Quotation ${quotationNumber} was sent`,
          changedBy: actorName,
        },
      });
      await tx.leadHistory.create({
        data: {
          leadId,
          action: 'QUOTATION_SENT',
          description: `Quotation ${quotationNumber} sent`,
          performedBy: actorName,
        },
      });
    });
  }

  // Called by QuotationsService.acceptViaPublicLink() when the accepted
  // quotation is lead-originated. Mirrors recordQuotationSent()'s "don't
  // regress a further-along lead" guard — but WON is the one status this
  // never skips advancing to, since it's the terminal outcome the whole
  // Customer Quotation Acceptance workflow (section 9) exists to record.
  // Idempotent: a lead already WON or LOST is left untouched, so a second
  // call (which acceptViaPublicLink() itself already prevents via its own
  // duplicate-acceptance check) would be a safe no-op regardless.
  async recordQuotationAccepted(leadId: string, quotationNumber: string, actorName?: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || (['WON', 'LOST'] as string[]).includes(lead.status)) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: leadId }, data: { status: 'WON' } });
      await tx.leadStatusHistory.create({
        data: {
          leadId,
          oldStatus: lead.status,
          newStatus: 'WON',
          remarks: `Automatically advanced — customer accepted Quotation ${quotationNumber} via the public quotation link`,
          changedBy: actorName,
        },
      });
      await tx.leadHistory.create({
        data: {
          leadId,
          action: 'QUOTATION_ACCEPTED',
          description: `Quotation ${quotationNumber} accepted by customer`,
          performedBy: actorName,
        },
      });
    });
  }

  // Called by QuotationsService.rejectViaPublicLink() when the rejected
  // quotation is lead-originated. Mirrors recordQuotationAccepted()'s
  // structure — LOST is the terminal outcome this records. Idempotent: a
  // lead already WON or LOST is left untouched (a lead that already won on
  // a different/earlier quotation should never be dragged back to LOST by
  // an unrelated rejection), so a second call is a safe no-op regardless.
  async recordQuotationRejected(
    leadId: string,
    quotationNumber: string,
    reason: string,
    actorName?: string,
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || (['WON', 'LOST'] as string[]).includes(lead.status)) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: leadId }, data: { status: 'LOST' } });
      await tx.leadStatusHistory.create({
        data: {
          leadId,
          oldStatus: lead.status,
          newStatus: 'LOST',
          remarks: `Automatically advanced — customer rejected Quotation ${quotationNumber} via the public quotation link (${reason})`,
          changedBy: actorName,
        },
      });
      await tx.leadHistory.create({
        data: {
          leadId,
          action: 'QUOTATION_REJECTED',
          description: `Quotation ${quotationNumber} rejected by customer — ${reason}`,
          performedBy: actorName,
        },
      });
    });
  }

  // Merges the persisted LeadHistory log with synthesized entries for
  // everything downstream of a converted Lead's Customer — Quotation
  // Created/Sent, Sales Order Created, Proforma Invoice Generated, JEO
  // Generated — newest first. None of these are ever stored on LeadHistory
  // — Quotation/SalesOrder/ProformaInvoice/JobExecutionOrder have no FK
  // back to Lead (see the schema.prisma comment on Quotation) — so they're
  // derived here at read time via a join on Lead.customerId, which is only
  // ever set once the lead has been converted. This keeps every one of
  // those modules completely untouched while still satisfying the Sales
  // Automation Lead History requirement's full action list.
  async getHistory(id: string) {
    const lead = await this.findOne(id);

    const historyRows = await this.prisma.leadHistory.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
    });

    const entries = historyRows.map((row) => ({
      id: row.id,
      action: row.action as LeadHistoryAction,
      description: row.description,
      performedBy: row.performedBy,
      createdAt: row.createdAt,
    }));

    if (lead.customerId) {
      const quotations = await this.prisma.quotation.findMany({
        where: { customerId: lead.customerId, deletedAt: null },
        select: {
          id: true,
          quotationNumber: true,
          createdAt: true,
          sentAt: true,
          sentToEmail: true,
          salesOrder: {
            select: {
              id: true,
              salesOrderNumber: true,
              createdAt: true,
              proformaInvoices: { select: { invoiceNumber: true, createdAt: true } },
              jobExecutionOrders: { select: { jeoNumber: true, createdAt: true } },
            },
          },
        },
      });
      for (const quotation of quotations) {
        entries.push({
          id: `quotation-${quotation.id}`,
          action: 'QUOTATION_CREATED' as LeadHistoryAction,
          description: `Quotation ${quotation.quotationNumber} created`,
          performedBy: null,
          createdAt: quotation.createdAt,
        });
        if (quotation.sentAt) {
          entries.push({
            id: `quotation-sent-${quotation.id}`,
            action: 'QUOTATION_SENT' as LeadHistoryAction,
            description: `Quotation ${quotation.quotationNumber} sent to ${quotation.sentToEmail || 'customer'}`,
            performedBy: null,
            createdAt: quotation.sentAt,
          });
        }
        if (quotation.salesOrder) {
          entries.push({
            id: `sales-order-${quotation.salesOrder.id}`,
            action: 'SALES_ORDER_CREATED' as LeadHistoryAction,
            description: `Sales Order ${quotation.salesOrder.salesOrderNumber} created`,
            performedBy: null,
            createdAt: quotation.salesOrder.createdAt,
          });
          for (const pi of quotation.salesOrder.proformaInvoices) {
            entries.push({
              id: `pi-${pi.invoiceNumber}`,
              action: 'PROFORMA_INVOICE_GENERATED' as LeadHistoryAction,
              description: `Proforma Invoice ${pi.invoiceNumber} generated`,
              performedBy: null,
              createdAt: pi.createdAt,
            });
          }
          for (const jeo of quotation.salesOrder.jobExecutionOrders) {
            entries.push({
              id: `jeo-${jeo.jeoNumber}`,
              action: 'JEO_GENERATED' as LeadHistoryAction,
              description: `Job Execution Order ${jeo.jeoNumber} generated`,
              performedBy: null,
              createdAt: jeo.createdAt,
            });
          }
        }
      }
    }

    return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getNotes(id: string) {
    await this.findOne(id);
    return this.prisma.leadNote.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addNote(id: string, dto: CreateLeadNoteDto, actorName?: string) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.leadNote.create({
        data: { leadId: id, note: dto.note, createdBy: actorName },
      });
      // Lead Management Phase 1 (requirement #3/#4) — "Note Added" is now
      // its own Timeline entry, not just visible in the separate Notes tab.
      await this.logHistory(
        tx,
        id,
        'NOTE_ADDED',
        dto.note.length > 120 ? `${dto.note.slice(0, 120)}…` : dto.note,
        actorName,
      );
      return note;
    });
  }

  // Dedicated Assignment History / Status History reads (requirement —
  // "Show Assignment History. Show Status History." as their own tabs,
  // distinct from the merged Timeline above). The underlying
  // LeadAssignmentHistory/LeadStatusHistory tables already existed and were
  // already written to by update()/updateStatus() — this just exposes them
  // for the first time.
  async getAssignmentHistory(id: string) {
    await this.findOne(id);
    return this.prisma.leadAssignmentHistory.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStatusHistory(id: string) {
    await this.findOne(id);
    return this.prisma.leadStatusHistory.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Email History tab (requirement #16) — every email ever sent about
  // Quotations/Sales Orders/Proforma Invoices/JEOs tied to this lead's
  // Customer, via the same Lead.customerId join used by getHistory() above.
  async getEmailHistory(id: string) {
    const lead = await this.findOne(id);
    if (!lead.customerId) {
      return [];
    }
    return this.prisma.emailHistory.findMany({
      where: {
        OR: [
          { quotation: { customerId: lead.customerId } },
          { salesOrder: { customerId: lead.customerId } },
          { proformaInvoice: { customerId: lead.customerId } },
          { jobExecutionOrder: { customerId: lead.customerId } },
        ],
      },
      orderBy: { sentAt: 'desc' },
    });
  }

  // Appends one append-only LeadHistory row. Every write path above calls
  // this from inside its own $transaction so the history entry can never be
  // left behind by a failed/partial update.
  private async logHistory(
    tx: Prisma.TransactionClient,
    leadId: string,
    action: LeadHistoryAction,
    description: string,
    performedBy?: string,
  ) {
    await tx.leadHistory.create({
      data: { leadId, action, description, performedBy },
    });
  }

  // Generic "did this field's value actually change" diff used by update()
  // to decide whether an EDITED timeline entry is warranted. Only keys
  // present (and not undefined) in `incoming` are compared — a PATCH that
  // never sent a field can't have "changed" it.
  private diffLeadFields(
    existing: Record<string, unknown>,
    incoming: Record<string, unknown>,
  ): string[] {
    const changed: string[] = [];
    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined) continue;
      const before = existing[key] instanceof Date ? existing[key].toISOString() : existing[key];
      const after = value instanceof Date ? value.toISOString() : value;
      if (before !== after) {
        changed.push(key);
      }
    }
    return changed;
  }

  getLeadImportTemplate(): Buffer {
    const worksheet = XLSX.utils.aoa_to_sheet([LEAD_IMPORT_TEMPLATE_HEADERS]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async previewLeadImport(fileBuffer: Buffer) {
    const rawRows = this.parseImportFile(fileBuffer);
    const rows: LeadImportRowResult[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      rows.push(await this.classifyImportRow(rawRows[i], i + 2, { insert: false }));
    }
    return this.summarizeImportRows(rows);
  }

  async importLeads(dto: ImportLeadsDto) {
    const rows: LeadImportRowResult[] = [];
    for (let i = 0; i < dto.rows.length; i++) {
      const input = dto.rows[i];
      rows.push(
        await this.classifyImportRow(
          {
            companyName: input.companyName,
            contactPerson: input.contactPerson,
            email: input.email,
            phone: input.phone,
            city: input.city,
            state: input.state,
            industry: input.industry,
            source: input.source,
            status: input.status,
            remarks: input.remarks,
            sheet: input.sheet,
          },
          input.row ?? i + 2,
          { insert: true },
        ),
      );
    }
    return this.summarizeImportRows(rows);
  }

  // Case-insensitive, whitespace-trimmed match of a workbook tab's own name
  // against INDIA_STATES (the same list Customer.state/Lead.state are
  // validated against elsewhere) — e.g. a tab literally named "telangana"
  // or " Telangana " still resolves. A tab whose name doesn't match any
  // recognized state (the default "Leads"/"Sheet1", a region name, a typo,
  // ...) returns undefined and that sheet's rows keep whatever their own
  // State column says, exactly like a single-sheet import always has.
  private resolveSheetState(sheetName: string): string | undefined {
    const normalized = sheetName.trim().toLowerCase();
    return INDIA_STATES.find((s) => s.toLowerCase() === normalized);
  }

  // Multi-sheet import: sales teams keep one tab per state in the same
  // workbook, so every sheet is read (not just the first), and a sheet
  // whose tab name matches a recognized state stamps that state onto every
  // row on it — overriding any "State" column value the row might also
  // have, since the tab is the more deliberate, physically-organized
  // signal here. Row numbers (used for traceability in the Preview/Summary
  // tables) stay globally sequential across the whole file, continuing
  // across sheet boundaries, which is also what keeps them collision-free
  // as a React list key on the frontend — see previewLeadImport()/
  // importLeads(), which still just do `rawRows[i]` / `i + 2` over the
  // flattened array this returns.
  private parseImportFile(buffer: Buffer): LeadImportRowInput[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    if (workbook.SheetNames.length === 0) {
      throw new BadRequestException('The uploaded file has no worksheets');
    }

    const allRows: LeadImportRowInput[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const sheetState = this.resolveSheetState(sheetName);

      for (const raw of rawRows) {
        const mapped: LeadImportRowInput = { sheet: sheetName };
        const phoneCandidates: Record<string, string> = {};

        for (const [key, value] of Object.entries(raw)) {
          const normalizedKey = key.trim().toLowerCase();
          const stringValue = String(value ?? '').trim();

          if (LEAD_IMPORT_PHONE_HEADER_PRIORITY.includes(normalizedKey)) {
            phoneCandidates[normalizedKey] = stringValue;
            continue;
          }

          const mappedKey = LEAD_IMPORT_COLUMN_MAP[normalizedKey];
          if (mappedKey) {
            (mapped as Record<string, string>)[mappedKey] = stringValue;
          }
        }

        // First non-empty value, scanned in priority order — see the comment
        // on LEAD_IMPORT_PHONE_HEADER_PRIORITY above.
        for (const header of LEAD_IMPORT_PHONE_HEADER_PRIORITY) {
          if (phoneCandidates[header]) {
            mapped.phone = phoneCandidates[header];
            break;
          }
        }

        // Tab name wins over any State column value on this row — see this
        // method's own comment above.
        if (sheetState) {
          mapped.state = sheetState;
        }

        allRows.push(mapped);
      }
    }

    if (allRows.length === 0) {
      throw new BadRequestException('The uploaded file has no data rows');
    }

    return allRows;
  }

  // Shared by both the Preview step (insert: false, read-only) and the
  // commit step (insert: true) so validation and duplicate-detection are
  // never allowed to drift between the two — the commit endpoint always
  // re-runs this from scratch on whatever rows it's given rather than
  // trusting the client's earlier Preview classification.
  private async classifyImportRow(
    raw: LeadImportRowInput,
    rowNumber: number,
    options: { insert: boolean },
  ): Promise<LeadImportRowResult> {
    const companyName = raw.companyName?.trim() ?? '';
    const contactPerson = raw.contactPerson?.trim() ?? '';
    const email = raw.email?.trim() ?? '';
    const phoneRaw = raw.phone?.trim() ?? '';
    // Some CSV/XLSX exports prefix numeric-looking cells with a leading
    // apostrophe (a text-format marker) so leading zeros/plus signs aren't
    // reinterpreted as a number — strip that before normalizing, otherwise
    // it gets swept up with the rest of the punctuation below and the
    // country-code "+" that follows it is lost along with it.
    let phoneForNormalization = phoneRaw;
    if (phoneForNormalization.startsWith("'")) {
      phoneForNormalization = phoneForNormalization.slice(1).trim();
    }
    const phoneHasCountryCode = phoneForNormalization.startsWith('+');
    const phoneDigitsOnly = phoneForNormalization.replace(/\D/g, '');
    const phoneNormalized = phoneHasCountryCode ? `+${phoneDigitsOnly}` : phoneDigitsOnly;
    if (phoneRaw) {
      this.logger.debug(
        `Import row ${rowNumber} phone normalization: original="${phoneRaw}" normalized="${phoneNormalized}"`,
      );
    }
    const city = raw.city?.trim() || undefined;
    const state = raw.state?.trim() || undefined;
    const industry = raw.industry?.trim() || undefined;
    const remarks = raw.remarks?.trim() || undefined;

    // No field is mandatory — Company Name, Contact Person, Email, and
    // Phone can all be blank; a blank cell is accepted and that field is
    // simply left blank on the created lead (not an error), and every row
    // is imported regardless of which columns it has values in. Format is
    // still checked when a value IS provided, so garbage data doesn't
    // silently get imported just because presence is no longer required.
    const errors: string[] = [];
    if (email && !isEmail(email)) {
      errors.push('Email must be a valid email address');
    }
    if (phoneRaw && !/^\+?\d{10,15}$/.test(phoneNormalized)) {
      errors.push('Phone must be 10-15 digits');
      this.logger.debug(
        `Import row ${rowNumber} phone rejected: original="${phoneRaw}" normalized="${phoneNormalized}" reason="Phone must be 10-15 digits"`,
      );
    }

    // Blank cell -> sensible default (OTHER/NEW, matching the manual Create
    // Lead form's defaults); a non-blank but unrecognized value is flagged
    // as invalid rather than silently defaulted, so bad data gets fixed
    // instead of quietly mis-imported.
    let source: LeadSource = LeadSource.OTHER;
    const sourceRaw = raw.source?.trim() ?? '';
    if (sourceRaw) {
      const normalized = normalizeEnumInput(sourceRaw);
      if (LEAD_SOURCE_VALUES.includes(normalized)) {
        source = normalized as LeadSource;
      } else {
        errors.push(`Unrecognized Lead Source: "${sourceRaw}"`);
      }
    }

    let status: LeadStatus = LeadStatus.NEW;
    const statusRaw = raw.status?.trim() ?? '';
    if (statusRaw) {
      const normalized = normalizeEnumInput(statusRaw);
      if (LEAD_STATUS_VALUES.includes(normalized)) {
        status = normalized as LeadStatus;
      } else {
        errors.push(`Unrecognized Status: "${statusRaw}"`);
      }
    }

    const base = {
      row: rowNumber,
      companyName,
      contactPerson,
      email,
      phone: phoneNormalized || phoneRaw,
      city,
      state,
      industry,
      source,
      status,
      remarks,
      sheet: raw.sheet,
    };

    if (errors.length > 0) {
      return { ...base, result: 'invalid', errors };
    }

    // Duplicate detection is unchanged (Company Name + Email), so it only
    // applies when a row actually has an email — with Email now optional,
    // a blank-email row simply has nothing to match against and can never
    // be flagged as a duplicate by this rule.
    //
    // Runs sequentially (this method is always awaited in a plain for-loop
    // by its two callers, never Promise.all'd), so on the commit path a
    // lead inserted earlier in this same batch is already visible to this
    // findFirst — within-file duplicates and duplicates-against-existing-
    // data are both caught by one code path.
    if (email) {
      const existing = await this.prisma.lead.findFirst({
        where: {
          deletedAt: null,
          companyName: { equals: companyName, mode: 'insensitive' },
          email: { equals: email, mode: 'insensitive' },
        },
      });
      if (existing) {
        return {
          ...base,
          result: 'duplicate',
          duplicateReason: `Matches existing lead ${existing.leadNumber}`,
        };
      }
    }

    if (!options.insert) {
      return { ...base, result: 'valid' };
    }

    const created = await this.createImportedLead(base);
    return { ...base, result: 'created', leadNumber: created.leadNumber };
  }

  private async createImportedLead(row: {
    companyName: string;
    contactPerson: string;
    email: string;
    phone: string;
    city?: string;
    state?: string;
    industry?: string;
    source: LeadSource;
    status: LeadStatus;
    remarks?: string;
  }) {
    if (row.phone) {
      this.logger.debug(`Saving lead phone to database: final="${row.phone}"`);
    }
    for (let attempt = 1; attempt <= MAX_LEAD_NUMBER_ATTEMPTS; attempt++) {
      const leadNumber = await this.generateLeadNumber();
      try {
        return await this.prisma.lead.create({
          data: {
            leadNumber,
            companyName: row.companyName,
            contactPerson: row.contactPerson,
            email: row.email,
            phone: row.phone,
            city: row.city,
            state: row.state,
            industry: row.industry,
            remarks: row.remarks,
            source: row.source,
            status: row.status,
            // Imported leads have no natural "opportunity title" — the
            // import template has no Title column, unlike the manual Create
            // Lead form where it's required and user-authored. Defaulted
            // from Company Name so the required `title` column is always
            // populated with something meaningful, and is editable
            // afterwards from the Lead Details/Edit page like any other
            // lead.
            title: `Imported Lead - ${row.companyName}`,
          },
        });
      } catch (error) {
        if (this.isLeadNumberConflict(error) && attempt < MAX_LEAD_NUMBER_ATTEMPTS) {
          continue; // Another request took this number first — retry with a fresh one.
        }
        throw error;
      }
    }
    throw new Error('Failed to generate a unique lead number');
  }

  private summarizeImportRows(rows: LeadImportRowResult[]) {
    return {
      totalRows: rows.length,
      validCount: rows.filter((r) => r.result === 'valid').length,
      createdCount: rows.filter((r) => r.result === 'created').length,
      invalidCount: rows.filter((r) => r.result === 'invalid').length,
      duplicateCount: rows.filter((r) => r.result === 'duplicate').length,
      rows,
    };
  }

  private buildProductsCreateInput(products?: LeadProductInputDto[]) {
    if (!products || products.length === 0) {
      return undefined;
    }
    return {
      create: products.map((p) => ({
        productId: p.productId,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        remarks: p.remarks,
      })),
    };
  }

  private async generateLeadNumber(): Promise<string> {
    const last = await this.prisma.lead.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { leadNumber: true },
    });
    const lastSeq = last ? parseInt(last.leadNumber.replace(LEAD_NUMBER_PREFIX, ''), 10) || 0 : 0;
    return `${LEAD_NUMBER_PREFIX}${String(lastSeq + 1).padStart(LEAD_NUMBER_PAD, '0')}`;
  }

  private isLeadNumberConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      (error.meta?.target as string[]).includes('leadNumber')
    );
  }
}
