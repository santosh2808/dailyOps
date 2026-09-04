import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function code(module: string, action: string): string {
  return `${module}.${action}`.toLowerCase();
}

// Full Permission catalog for Enterprise RBAC — one row per (module, action).
// Every existing business module's controller checks one of these via
// @RequirePermission(module, action); none of it is hardcoded by role name
// anywhere (see PermissionsGuard).
const PERMISSIONS: { module: string; action: string; description: string }[] = [
  { module: 'Lead', action: 'View', description: 'View leads' },
  { module: 'Lead', action: 'Create', description: 'Create leads, including Excel import' },
  { module: 'Lead', action: 'Edit', description: 'Edit leads, change status, convert to customer' },
  { module: 'Lead', action: 'Delete', description: 'Delete (soft-delete) leads' },

  { module: 'Customer', action: 'View', description: 'View customers' },
  { module: 'Customer', action: 'Create', description: 'Create customers' },
  { module: 'Customer', action: 'Edit', description: 'Edit customers' },
  { module: 'Customer', action: 'Delete', description: 'Deactivate customers' },

  { module: 'Product', action: 'View', description: 'View products' },
  { module: 'Product', action: 'Create', description: 'Create products' },
  { module: 'Product', action: 'Edit', description: 'Edit products' },
  { module: 'Product', action: 'Delete', description: 'Deactivate products' },

  { module: 'Quotation', action: 'View', description: 'View quotations' },
  { module: 'Quotation', action: 'Create', description: 'Create quotations' },
  { module: 'Quotation', action: 'Edit', description: 'Edit quotations' },
  { module: 'Quotation', action: 'Approve', description: 'Change quotation status (Send / Accept / Reject / Expire)' },
  { module: 'Quotation', action: 'Delete', description: 'Delete (soft-delete) quotations' },

  { module: 'SalesOrder', action: 'View', description: 'View sales orders' },
  { module: 'SalesOrder', action: 'Create', description: 'Create a sales order from an accepted quotation' },
  { module: 'SalesOrder', action: 'Edit', description: 'Edit sales orders, change status' },
  { module: 'SalesOrder', action: 'Delete', description: 'Delete (soft-delete) sales orders' },

  { module: 'ProformaInvoice', action: 'View', description: 'View proforma invoices' },
  { module: 'ProformaInvoice', action: 'Create', description: 'Generate a proforma invoice from a sales order' },
  { module: 'ProformaInvoice', action: 'Edit', description: 'Change proforma invoice status, record advance payments' },

  { module: 'TaxInvoice', action: 'View', description: 'View tax invoices' },
  { module: 'TaxInvoice', action: 'Create', description: 'Generate the final GST tax invoice for a dispatch-ready sales order' },
  { module: 'TaxInvoice', action: 'Edit', description: 'Change tax invoice status' },

  { module: 'JEO', action: 'View', description: 'View job execution orders and the Production Dashboard' },
  { module: 'JEO', action: 'Create', description: 'Generate a job execution order from a sales order' },
  { module: 'JEO', action: 'Update', description: 'Update JEO status and the Production Checklist' },

  { module: 'Material', action: 'View', description: 'View materials' },
  { module: 'Material', action: 'Create', description: 'Create materials, including Excel import' },
  { module: 'Material', action: 'Edit', description: 'Edit materials' },
  { module: 'Material', action: 'Delete', description: 'Deactivate materials' },

  { module: 'MaterialCategory', action: 'View', description: 'View material categories' },
  { module: 'MaterialCategory', action: 'Create', description: 'Create material categories' },

  { module: 'MaterialUnit', action: 'View', description: 'View material units' },
  { module: 'MaterialUnit', action: 'Create', description: 'Create material units' },

  { module: 'Supplier', action: 'View', description: 'View suppliers' },
  { module: 'Supplier', action: 'Create', description: 'Create suppliers, including Excel import' },
  { module: 'Supplier', action: 'Edit', description: 'Edit suppliers' },
  { module: 'Supplier', action: 'Delete', description: 'Delete (soft-delete) suppliers' },

  { module: 'User', action: 'View', description: 'View users' },
  { module: 'User', action: 'Create', description: 'Create users' },
  { module: 'User', action: 'Edit', description: 'Edit users; assign roles and department' },
  { module: 'User', action: 'Delete', description: 'Deactivate users' },

  { module: 'Role', action: 'View', description: 'View roles' },
  { module: 'Role', action: 'Create', description: 'Create roles' },
  { module: 'Role', action: 'Edit', description: 'Edit roles; assign permissions' },
  { module: 'Role', action: 'Delete', description: 'Delete roles' },

  { module: 'Permission', action: 'View', description: 'View the permission catalog' },

  { module: 'Department', action: 'View', description: 'View departments' },
  { module: 'Department', action: 'Create', description: 'Create departments' },
  { module: 'Department', action: 'Edit', description: 'Edit departments' },
  { module: 'Department', action: 'Delete', description: 'Delete departments' },

  // Additive: Sales Automation (continuation of the DailyOps project).
  { module: 'ApprovalMatrix', action: 'View', description: 'View the Approval Matrix' },
  { module: 'ApprovalMatrix', action: 'Edit', description: 'Configure Approval Matrix brackets' },

  { module: 'EmailTemplate', action: 'View', description: 'View email templates' },
  { module: 'EmailTemplate', action: 'Edit', description: 'Edit email templates' },

  { module: 'AuditLog', action: 'View', description: 'View the system audit log' },

  // Additive: Complaints module.
  { module: 'Complaint', action: 'View', description: 'View customer complaints' },
  { module: 'Complaint', action: 'Create', description: 'Log a new customer complaint against a sales order' },
  { module: 'Complaint', action: 'Edit', description: 'Edit complaint details and change status' },
  { module: 'Complaint', action: 'Delete', description: 'Delete (soft-delete) complaints' },

  // Additive: State-wise JEO numbering series (Administration -> State
  // Series Codes).
  { module: 'StateSeriesCode', action: 'View', description: 'View state-wise JEO numbering series' },
  { module: 'StateSeriesCode', action: 'Create', description: 'Add a state-wise JEO numbering series' },
  { module: 'StateSeriesCode', action: 'Delete', description: 'Remove a state-wise JEO numbering series' },

  // Additive: Web Form Configuration (replaces the old FormWebsite/
  // FormSubmission modules from the standalone "Website Enquiries" design —
  // website form submissions now create ordinary Lead/Complaint records
  // instead of their own operational inbox, so this module is admin config
  // only: websites, forms/form versions, product mappings, subject routing).
  { module: 'FormConfiguration', action: 'View', description: 'View websites, forms, product mappings, and subject routing' },
  { module: 'FormConfiguration', action: 'Create', description: 'Create websites, forms, product mappings, and subject routes' },
  { module: 'FormConfiguration', action: 'Edit', description: 'Edit websites/forms, publish form versions, edit product mappings and routing' },
  { module: 'FormConfiguration', action: 'Delete', description: 'Delete product mappings and subject routes' },
];

const DEPARTMENTS = ['Sales', 'Production', 'Finance', 'Purchase', 'Stores', 'HR', 'Quality'];

function permissionsForModule(module: string): string[] {
  return PERMISSIONS.filter((p) => p.module === module).map((p) => code(p.module, p.action));
}

// Administrator gets every permission row via RolePermission at seed time —
// there is no special-cased "admin" bypass anywhere in guard/service code
// (see PermissionsGuard / RequirePermission), exactly per the Enterprise
// RBAC spec.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  Administrator: PERMISSIONS.map((p) => code(p.module, p.action)),
  'Sales Manager': [
    ...permissionsForModule('Lead'),
    ...permissionsForModule('Customer'),
    ...permissionsForModule('Quotation'),
    ...permissionsForModule('SalesOrder'),
    ...permissionsForModule('Complaint'),
    'proformainvoice.view',
    'proformainvoice.edit',
    'taxinvoice.view',
    'taxinvoice.create',
    'product.view',
    // Additive: Web Form Configuration — website form submissions now
    // create ordinary Leads/Complaints directly (visible via the Lead/
    // Complaint permissions above); this only gates the admin config screen
    // (websites, forms, product mappings, subject routing).
    ...permissionsForModule('FormConfiguration'),
  ],
  'Sales Executive': [
    'lead.view',
    'lead.create',
    'lead.edit',
    'customer.view',
    'customer.create',
    'customer.edit',
    'quotation.view',
    'quotation.create',
    'quotation.edit',
    'salesorder.view',
    'salesorder.create',
    'complaint.view',
    'complaint.create',
    'complaint.edit',
    'product.view',
  ],
  Production: [
    'jeo.view',
    'jeo.create',
    'jeo.update',
    'salesorder.view',
    'material.view',
    'proformainvoice.view',
    'taxinvoice.view',
    'stateseriescode.view',
  ],
  Finance: [
    'quotation.view',
    'salesorder.view',
    'proformainvoice.view',
    'proformainvoice.create',
    'proformainvoice.edit',
    ...permissionsForModule('TaxInvoice'),
    'customer.view',
  ],
  Stores: [
    ...permissionsForModule('Material'),
    ...permissionsForModule('MaterialCategory'),
    ...permissionsForModule('MaterialUnit'),
    ...permissionsForModule('Supplier'),
  ],
};

// Exactly one hardcoded user: the built-in System Administrator bootstrap
// account. Every other user (Sales Manager, Sales Executive, Production,
// Finance, Stores, or anyone else) is created dynamically from the
// Administration -> Users screen by an Administrator — never seeded. The
// six ROLE_PERMISSIONS entries above are the Role *catalog* (so those roles
// exist and are assignable the moment the app starts); they are not users.
const DEFAULT_USERS: {
  name: string;
  username: string;
  email: string;
  password: string;
  role: string;
  roleName: string;
  department: string | null;
  mustChangePassword: boolean;
}[] = [
  {
    name: 'System Administrator',
    username: 'admin',
    email: 'admin@smartrotamac.com',
    password: 'Admin@123',
    role: 'admin',
    roleName: 'Administrator',
    department: null,
    // Forced on first login — see AuthService.changePassword() /
    // ProtectedRoute.tsx, which redirects to /change-password for as long
    // as this stays true.
    mustChangePassword: true,
  },
];

async function main() {
  // 1. Departments
  const departmentByName = new Map<string, string>();
  for (const name of DEPARTMENTS) {
    const dept = await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    departmentByName.set(name, dept.id);
  }

  // 2. Permissions
  // Delete stale permission rows from the old FormWebsite/FormSubmission
  // modules (replaced by FormConfiguration above) so a re-run of this seed
  // doesn't leave orphaned, no-longer-granted rows in the Permission catalog.
  // RolePermission.permissionId is `onDelete: Cascade`, so this can never
  // throw a FK error even if a role still references one of these rows.
  await prisma.permission.deleteMany({ where: { module: { in: ['FormWebsite', 'FormSubmission'] } } });

  const permissionIdByCode = new Map<string, string>();
  for (const p of PERMISSIONS) {
    const permCode = code(p.module, p.action);
    const permission = await prisma.permission.upsert({
      where: { code: permCode },
      update: { description: p.description },
      create: { module: p.module, action: p.action, code: permCode, description: p.description },
    });
    permissionIdByCode.set(permCode, permission.id);
  }

  // 3. Roles + RolePermission assignments
  const roleIdByName = new Map<string, string>();
  for (const roleName of Object.keys(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
    roleIdByName.set(roleName, role.id);

    const permissionIds = ROLE_PERMISSIONS[roleName]
      .map((permCode) => permissionIdByCode.get(permCode))
      .filter((id): id is string => Boolean(id));

    // Replace this role's permission set so re-running the seed always
    // converges on ROLE_PERMISSIONS above, instead of only ever adding.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
  }

  // 4. Default user(s) + UserRole + Department assignment. Upserts by
  // username (the stable, never-changing identifier) rather than email, so
  // re-running this seed after editing DEFAULT_USERS' email still updates
  // the same row instead of creating a second admin account. Note: if this
  // runs against a database that already has an older seeded admin (e.g.
  // admin@dailyops.com from a previous version of this project), that old
  // row is left in place untouched — this seed never deletes users. Remove
  // it by hand (or via the Users screen) if you're migrating forward.
  for (const u of DEFAULT_USERS) {
    const hashed = await bcrypt.hash(u.password, 10);
    const departmentId = u.department ? departmentByName.get(u.department) : undefined;

    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {
        name: u.name,
        email: u.email,
        departmentId: departmentId ?? null,
      },
      create: {
        name: u.name,
        username: u.username,
        email: u.email,
        password: hashed,
        role: u.role,
        departmentId: departmentId ?? null,
        mustChangePassword: u.mustChangePassword,
      },
    });

    const roleId = roleIdByName.get(u.roleName);
    if (roleId) {
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.create({ data: { userId: user.id, roleId } });
    }
  }

  // 5. Approval Matrix (requirement #9) — the exact Quotation example from
  // scope: 0-5% Sales Executive, 5-10% Sales Manager, >10% Administrator.
  // Upserted by (module, minPercent) so re-running the seed converges
  // instead of duplicating rows.
  const approvalMatrixSeed: { module: string; minPercent: number; maxPercent: number; roleName: string }[] = [
    { module: 'Quotation', minPercent: 0, maxPercent: 5, roleName: 'Sales Executive' },
    { module: 'Quotation', minPercent: 5, maxPercent: 10, roleName: 'Sales Manager' },
    { module: 'Quotation', minPercent: 10, maxPercent: Number.MAX_SAFE_INTEGER, roleName: 'Administrator' },
  ];
  for (const entry of approvalMatrixSeed) {
    const roleId = roleIdByName.get(entry.roleName);
    if (!roleId) continue;
    const existing = await prisma.approvalMatrix.findFirst({
      where: { module: entry.module, minPercent: entry.minPercent },
    });
    if (existing) {
      await prisma.approvalMatrix.update({
        where: { id: existing.id },
        data: { maxPercent: entry.maxPercent, requiredRoleId: roleId, isActive: true },
      });
    } else {
      await prisma.approvalMatrix.create({
        data: {
          module: entry.module,
          minPercent: entry.minPercent,
          maxPercent: entry.maxPercent,
          requiredRoleId: roleId,
        },
      });
    }
  }

  // 6. Email Templates (requirement #7) — the 5 required templates,
  // upserted by `key` so re-running the seed never duplicates them, and an
  // Administrator's later edits (subject/bodyHtml) are never overwritten
  // on subsequent seed runs — only missing keys are created.
  const emailTemplateSeed: { key: string; name: string; subject: string; bodyHtml: string }[] = [
    {
      key: 'QUOTATION',
      name: 'Quotation Email',
      subject: 'Quotation {{quotationNumber}} - Smart Rotamac',
      bodyHtml:
        '<p>Dear {{customerName}},</p>' +
        '<p>Thank you for your interest in Smart Rotamac.</p>' +
        '<p>Please find your quotation {{quotationNumber}}.</p>' +
        '<p>You can review the quotation using the link below.</p>' +
        '<p><a href="{{quotationLink}}">View Quotation</a></p>' +
        '<p>After reviewing the quotation, you can accept or reject it online.</p>' +
        '<p>Regards,<br/>{{salespersonName}}<br/>Smart Rotamac</p>',
    },
    // Customer Quotation Acceptance workflow — internal notification to the
    // salesperson (requirement #8), sent via the same Mailer/EmailHistory
    // path as every other email in this system rather than a separate
    // in-app notification system (none exists yet — see MailerService's
    // own "smallest appropriate mechanism" comment).
    {
      key: 'QUOTATION_ACCEPTED_INTERNAL',
      name: 'Quotation Accepted — Internal Notification',
      subject: 'Quotation {{quotationNumber}} has been accepted',
      bodyHtml:
        '<p>Quotation {{quotationNumber}} has been accepted by {{customerCompany}}.</p>' +
        '<p>Accepted by: {{acceptedByName}}</p>',
    },
    {
      key: 'QUOTATION_REJECTED_INTERNAL',
      name: 'Quotation Rejected — Internal Notification',
      subject: 'Quotation {{quotationNumber}} has been rejected',
      bodyHtml:
        '<p>Quotation {{quotationNumber}} has been rejected by {{customerCompany}}.</p>' +
        '<p>Reason: {{rejectionReason}}</p>',
    },
    {
      key: 'ORDER_CONFIRMATION',
      name: 'Order Confirmation Email',
      subject: 'Order Confirmation - {{salesOrderNumber}}',
      bodyHtml:
        '<p>Dear {{customerName}},</p><p>Your Sales Order {{salesOrderNumber}} (from Quotation {{quotationNumber}}) has been confirmed. Grand total: {{grandTotal}}.</p><p>Regards,<br/>Smart Rotamac Sales Team</p>',
    },
    {
      key: 'PROFORMA_INVOICE',
      name: 'Proforma Invoice Email',
      subject: 'Proforma Invoice {{invoiceNumber}}',
      bodyHtml:
        '<p>Dear {{customerName}},</p><p>Please find attached Proforma Invoice {{invoiceNumber}} for Sales Order {{salesOrderNumber}}. Grand total: {{grandTotal}}.</p><p>Regards,<br/>Smart Rotamac Finance Team</p>',
    },
    {
      key: 'JEO_NOTIFICATION',
      name: 'JEO Notification Email',
      subject: 'New Job Execution Order {{jeoNumber}}',
      bodyHtml:
        '<p>A new Job Execution Order {{jeoNumber}} has been generated for Sales Order {{salesOrderNumber}} (Customer: {{customerName}}). Priority: {{priority}}.</p>',
    },
    {
      key: 'DISPATCH',
      name: 'Dispatch Notification Email',
      subject: 'Your order {{salesOrderNumber}} has been dispatched',
      bodyHtml: '<p>Dear {{customerName}},</p><p>Sales Order {{salesOrderNumber}} has been dispatched.</p>',
    },
    {
      key: 'TAX_INVOICE',
      name: 'Tax Invoice Email',
      subject: 'Tax Invoice {{invoiceNumber}} - Smart Rotamach',
      bodyHtml:
        '<p>Dear {{customerName}},</p><p>Please find attached the Tax Invoice {{invoiceNumber}} for Sales Order {{salesOrderNumber}}. Grand total: {{grandTotal}}.</p><p>Regards,<br/>Smart Rotamach Finance Team</p>',
    },
    // Additive: Website Enquiries -> Lead/Complaint refactor. A public form
    // submission now creates an ordinary Lead or Complaint (routed by
    // FormSubjectRoute) rather than its own operational inbox record — sent
    // automatically by the public-forms service on every submission
    // (customer ack only when an email was given; internal notification
    // always, if a recipient resolves), referencing the WebFormIntake's
    // reference number, never an /enquiries/... link.
    {
      key: 'WEB_LEAD_RECEIVED',
      name: 'Web Lead Received — Customer Acknowledgement',
      subject: 'We received your enquiry — {{referenceNumber}}',
      bodyHtml:
        '<div style="font-family:Arial;padding:20px">' +
        '<h2>Thank you for contacting Smart Rotamac</h2>' +
        '<p>Dear <b>{{customerName}}</b>,</p>' +
        '<p>Your enquiry has been received successfully.</p>' +
        '<div style="background:#F3F4F6;padding:15px;border-radius:8px">' +
        '<h3>Reference Number</h3>' +
        '<h1 style="color:#2563EB">{{referenceNumber}}</h1>' +
        '</div>' +
        '<p>Our sales team will review your request and contact you shortly.</p>' +
        '<hr>' +
        '<p style="color:#6B7280">Smart Rotamac Sales Team</p>' +
        '</div>',
    },
    {
      key: 'WEB_COMPLAINT_RECEIVED',
      name: 'Web Complaint Received — Customer Acknowledgement',
      subject: 'We received your request — {{referenceNumber}}',
      bodyHtml:
        '<div style="font-family:Arial;padding:20px">' +
        '<h2>Thank you for contacting Smart Rotamac Support</h2>' +
        '<p>Dear <b>{{customerName}}</b>,</p>' +
        '<p>Your warranty/service request has been received successfully.</p>' +
        '<div style="background:#F3F4F6;padding:15px;border-radius:8px">' +
        '<h3>Reference Number</h3>' +
        '<h1 style="color:#2563EB">{{referenceNumber}}</h1>' +
        '</div>' +
        '<p>Our support team will review your request and contact you shortly.</p>' +
        '<hr>' +
        '<p style="color:#6B7280">Smart Rotamac Support Team</p>' +
        '</div>',
    },
    // Internal notification for every web-originated Lead/Complaint, sent
    // to the resolved department/assignee when FormSubjectRoute set one
    // (never fabricated — an unrouted/unassigned submission simply omits
    // {{assigneeName}}/{{departmentName}} rather than guessing a recipient).
    {
      key: 'WEB_SUBMISSION_INTERNAL',
      name: 'Web Submission Received — Internal Notification',
      subject: 'New {{destinationType}} {{referenceNumber}} — {{websiteName}}',
      bodyHtml:
        '<p>A new {{destinationType}} ({{referenceNumber}}) was received on {{websiteName}} via {{formName}}, subject: {{subjectLabel}}.</p>' +
        '<p>From: {{customerName}}</p>' +
        '<p>Department: {{departmentName}}<br/>Assigned to: {{assigneeName}}</p>' +
        '<p>{{message}}</p>',
    },
    // Sent directly to the person a FormSubjectRoute (or a manual Lead
    // reassignment) actually assigns a record to — distinct from
    // WEB_SUBMISSION_INTERNAL above, which always goes to the generic
    // department/support address regardless of whether an individual is
    // also assigned. Only ever sent when an assignee's own email is on
    // file; never fabricated.
    {
      key: 'WEB_SUBMISSION_ASSIGNED',
      name: 'Web Submission — Assigned To You',
      subject: '{{destinationType}} {{referenceNumber}} assigned to you — {{websiteName}}',
      bodyHtml:
        '<p>Hi {{assigneeName}},</p>' +
        '<p>A new {{destinationType}} ({{referenceNumber}}) from {{websiteName}} has been assigned to you.</p>' +
        '<p>Subject: {{subjectLabel}}<br/>From: {{customerName}}</p>' +
        '<p>{{message}}</p>',
    },
    {
      key: 'LEAD_ASSIGNED',
      name: 'Lead Assigned To You',
      subject: 'Lead {{leadNumber}} assigned to you',
      bodyHtml:
        '<p>Hi {{assigneeName}},</p>' +
        '<p>Lead {{leadNumber}} — {{title}} ({{companyName}}) has been assigned to you.</p>',
    },
  ];
  for (const template of emailTemplateSeed) {
    await prisma.emailTemplate.upsert({
      where: { key: template.key },
      update: {},
      create: template,
    });
  }

  // 7. State-wise JEO numbering series — the statewise codes given by the
  // customer. Upserted by `state` with `update: {}` (create-only, same
  // convention as the Email Templates seed above) so re-running this seed
  // never resets an already-advancing `nextNumber` counter back down to
  // `seriesStart` once JEOs have actually been generated for a state.
  const stateSeriesSeed: { state: string; seriesStart: number }[] = [
    { state: 'Telangana', seriesStart: 4000 },
    { state: 'Andhra Pradesh', seriesStart: 5000 },
    { state: 'Tamil Nadu', seriesStart: 6000 },
    { state: 'Karnataka', seriesStart: 7000 },
    { state: 'Kerala', seriesStart: 8000 },
    { state: 'Maharashtra', seriesStart: 9000 },
  ];
  for (const s of stateSeriesSeed) {
    await prisma.stateSeriesCode.upsert({
      where: { state: s.state },
      update: {},
      create: { state: s.state, seriesStart: s.seriesStart, nextNumber: s.seriesStart },
    });
  }

  // 8. Web Form Configuration — Website Enquiries -> Lead/Complaint
  // refactor. SPYRO is the only real website (the other three "websites"
  // shown in the prior standalone-inbox design's Admin-Dashboard were 100%
  // hardcoded frontend mock data with no backing rows anywhere — not
  // ported). Redesigned down to **one** FormDefinition (this module's
  // "one active form per website" default) whose schema covers both the
  // former Contact Form's product-enquiry fields and the former Customer
  // Support form's warranty/service fields, gated by a single `subject`
  // selector rather than two separate forms — routing to Lead vs Complaint
  // is now FormSubjectRoute's job, not "which form did they use". Upserted
  // by natural unique keys so re-running this seed never duplicates rows or
  // resets a published version's schema.
  const spyro = await prisma.formWebsite.upsert({
    where: { code: 'SPYRO' },
    update: {},
    create: { code: 'SPYRO', name: 'SPYRO', status: 'ACTIVE', supportEmail: 'info@spyro.com' },
  });

  // Canonical subject codes this form's `subject` selector offers — the
  // same list FormSubjectRoute is seeded against below, and the single
  // source of truth the (not-yet-built) public-forms module will validate
  // against in a later stage.
  const SUBJECT_OPTIONS: { value: string; label: string; destination: 'LEAD' | 'COMPLAINT' }[] = [
    { value: 'PRODUCT_ENQUIRY', label: 'Product Enquiry', destination: 'LEAD' },
    { value: 'REQUEST_QUOTATION', label: 'Request a Quotation', destination: 'LEAD' },
    { value: 'PROJECT_ENQUIRY', label: 'Project Enquiry', destination: 'LEAD' },
    { value: 'DEALERSHIP_ENQUIRY', label: 'Dealership Enquiry', destination: 'LEAD' },
    { value: 'GENERAL_ENQUIRY', label: 'General Enquiry', destination: 'LEAD' },
    { value: 'WARRANTY_CLAIM', label: 'Warranty Claim', destination: 'COMPLAINT' },
    { value: 'SERVICE_REQUEST', label: 'Service Request', destination: 'COMPLAINT' },
    { value: 'REPAIR_REQUEST', label: 'Repair Request', destination: 'COMPLAINT' },
    { value: 'TECHNICAL_SUPPORT', label: 'Technical Support', destination: 'COMPLAINT' },
  ];

  const contactForm = await prisma.formDefinition.upsert({
    where: { publicFormKey: 'fm_c92kl8' },
    update: {},
    create: {
      formWebsiteId: spyro.id,
      code: 'CONTACT_FORM',
      name: 'Contact Form',
      publicFormKey: 'fm_c92kl8',
      enabled: true,
    },
  });
  await prisma.formVersion.upsert({
    where: { formDefinitionId_version: { formDefinitionId: contactForm.id, version: 1 } },
    update: {},
    create: {
      formDefinitionId: contactForm.id,
      version: 1,
      publishedAt: new Date(),
      schema: {
        fields: {
          // Common fields, always shown.
          fullName: { type: 'string', required: true, label: 'Full Name' },
          email: { type: 'string', required: true, label: 'Email' },
          phone: { type: 'string', required: true, label: 'Phone' },
          company: { type: 'string', required: false, label: 'Company' },
          // `options` is additive to this schema shape (not every field
          // needs it — only enum-style selectors like this one) — the
          // schema validator is extended to understand it in a later stage.
          subject: {
            type: 'string',
            required: true,
            label: 'Subject',
            options: SUBJECT_OPTIONS.map((s) => ({ value: s.value, label: s.label })),
          },
          message: { type: 'string', required: true, label: 'Message' },
          // Conditional — shown only for WARRANTY_CLAIM/SERVICE_REQUEST/
          // REPAIR_REQUEST/TECHNICAL_SUPPORT (validated by the public-forms
          // module once built; the DB schema itself doesn't enforce
          // conditionality).
          invoiceNumber: { type: 'string', required: false, label: 'Invoice Number' },
          productCode: { type: 'string', required: false, label: 'Product Model' },
          serialNumber: { type: 'string', required: false, label: 'Fan Serial Number' },
          // Conditional — shown only for PRODUCT_ENQUIRY/REQUEST_QUOTATION/
          // PROJECT_ENQUIRY.
          quantity: { type: 'number', required: false, label: 'Quantity' },
          siteDetails: { type: 'string', required: false, label: 'Site Details' },
        },
      },
    },
  });

  // Subject routing — one row per canonical subject code, all on the single
  // FormDefinition above. `departmentId`/`assignedUserId` are left null
  // ("do not arbitrarily assign the first user" — an unassigned queue is
  // the correct default) unless a matching Department already exists in
  // this seed's DEPARTMENTS list: 'Sales' does (LEAD-destined subjects get
  // it), but no 'Service'/'Support' department is seeded yet, so
  // COMPLAINT-destined subjects stay unassigned until one is added.
  const salesDepartmentId = departmentByName.get('Sales');
  await prisma.formSubjectRoute.deleteMany({ where: { formDefinitionId: contactForm.id } });
  await prisma.formSubjectRoute.createMany({
    data: SUBJECT_OPTIONS.map((s, index) => ({
      formDefinitionId: contactForm.id,
      subjectCode: s.value,
      subjectLabel: s.label,
      destinationType: s.destination,
      departmentId: s.destination === 'LEAD' ? (salesDepartmentId ?? null) : null,
      priority: index,
    })),
  });

  // Product mappings — the 5 Spyro fan models this website's form lets a
  // visitor pick from. Products are matched/created by `sku` (same
  // SPYRO-<size> convention as prisma/seed-hvls-products.ts) so this never
  // creates a duplicate Product if that script has already run; a minimal
  // Product row is created here if it hasn't (category 'HVLS Fans', same
  // convention as seed-hvls-products.ts), leaving `technicalSpec` for that
  // dedicated script to fill in.
  const SPYRO_MODELS = ['Spyro 24', 'Spyro 20', 'Spyro 18', 'Spyro 16', 'Spyro 12'];
  for (const modelName of SPYRO_MODELS) {
    const sizeFt = modelName.replace('Spyro ', '');
    const sku = `SPYRO-${sizeFt}`;
    // Product.sku has no unique constraint (see seed-hvls-products.ts, which
    // already seeds these same 5 SKUs with full technical specs) — matched
    // by findFirst, same pattern that script uses, so this never creates a
    // duplicate Product if that script has already run.
    const existingProduct = await prisma.product.findFirst({ where: { sku } });
    const product =
      existingProduct ??
      (await prisma.product.create({ data: { name: modelName, category: 'HVLS Fans', sku, isActive: true } }));
    await prisma.formWebsiteProduct.upsert({
      where: { formWebsiteId_productId: { formWebsiteId: spyro.id, productId: product.id } },
      update: {},
      create: {
        formWebsiteId: spyro.id,
        productId: product.id,
        publicCode: sku,
        label: modelName,
        enabled: true,
        displayOrder: SPYRO_MODELS.indexOf(modelName),
      },
    });
  }

  console.log('Seed complete. Default user (username / email / password / role):');
  for (const u of DEFAULT_USERS) {
    console.log(`  ${u.username} / ${u.email} / ${u.password} / ${u.roleName}`);
  }
  console.log('All other users must be created from Administration -> Users.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
