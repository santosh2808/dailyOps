import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// One-time data-population script for the real named sales team members
// (requested directly by the business, not synthetic seed data) — creates
// or updates these Sales Manager / Sales Executive Users so they show up
// by name in the Lead "Assign To" picker (AssignedToPicker.tsx /
// LeadFiltersBar.tsx), which is scoped to exactly those two roles (see
// UsersService.ASSIGNABLE_ROLE_NAMES). The picker was never hardcoded to
// role labels — it lists whichever active Users hold one of those roles, so
// the fix here is data, not code: these five people didn't exist as Users
// yet. Matched by `username` (derived from the email) — safe to re-run; it
// updates the existing row instead of duplicating it.
//
// Requires the Role catalog to already exist — run `npm run seed` first if
// this is a brand new database.
//
// Run with: npx ts-node prisma/seed-sales-resources.ts
// (or: npm run seed:sales-resources)

interface SalesResourceSeed {
  name: string;
  email: string;
  roleName: 'Sales Manager' | 'Sales Executive';
}

// Emails are placeholders on the same domain used elsewhere in this project
// (admin@smartrotamac.com) since none were provided — edit these (or the
// person's name/email later via Administration -> Users) if the real
// company email differs.
const RESOURCES: SalesResourceSeed[] = [
  { name: 'Rajesh', email: 'rajesh@smartrotamac.com', roleName: 'Sales Manager' },
  { name: 'Rudra', email: 'rudra@smartrotamac.com', roleName: 'Sales Manager' },
  { name: 'Prathik', email: 'prathik@smartrotamac.com', roleName: 'Sales Manager' },
  { name: 'Vinita', email: 'vinita@smartrotamac.com', roleName: 'Sales Manager' },
  { name: 'Anirudh', email: 'anirudh@smartrotamac.com', roleName: 'Sales Executive' },
];

async function main() {
  const salesDept = await prisma.department.findUnique({ where: { name: 'Sales' } });

  const summary: { name: string; username: string; email: string; password: string; role: string }[] = [];

  for (const r of RESOURCES) {
    const role = await prisma.role.findUnique({ where: { name: r.roleName } });
    if (!role) {
      console.warn(`Skipping ${r.name}: role "${r.roleName}" not found — run "npm run seed" first.`);
      continue;
    }

    const email = r.email.trim().toLowerCase();
    const username = email.split('@')[0];
    const existing = await prisma.user.findUnique({ where: { username } });

    // Never a real chosen password — same temporary-password + forced
    // mustChangePassword convention as UsersService.quickCreate(). Printed
    // once below in case this person ever needs to log in themselves.
    const temporaryPassword = crypto.randomBytes(9).toString('base64url');
    const hashed = await bcrypt.hash(temporaryPassword, 10);

    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { name: r.name, email, departmentId: salesDept?.id ?? null },
        })
      : await prisma.user.create({
          data: {
            name: r.name,
            username,
            email,
            password: hashed,
            departmentId: salesDept?.id ?? null,
            mustChangePassword: true,
          },
        });

    // Replace this user's role set with exactly the one role requested,
    // same "delete then create" convention as UsersService.update().
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

    summary.push({
      name: r.name,
      username,
      email,
      password: existing ? '(unchanged)' : temporaryPassword,
      role: r.roleName,
    });
    console.log(`${existing ? 'Updated' : 'Created'} ${r.name} (${r.roleName})`);
  }

  console.log('\nSales resources (name / username / email / temp password / role):');
  for (const s of summary) {
    console.log(`  ${s.name} / ${s.username} / ${s.email} / ${s.password} / ${s.role}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
