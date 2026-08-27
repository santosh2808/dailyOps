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
  { module: 'ProformaInvoice', action: 'Edit', description: 'Change proforma invoice status' },

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
    'product.view',
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
  Production: ['jeo.view', 'jeo.create', 'jeo.update', 'salesorder.view', 'material.view', 'proformainvoice.view'],
  Finance: [
    'quotation.view',
    'salesorder.view',
    'proformainvoice.view',
    'proformainvoice.create',
    'proformainvoice.edit',
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
  ];
  for (const template of emailTemplateSeed) {
    await prisma.emailTemplate.upsert({
      where: { key: template.key },
      update: {},
      create: template,
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
