import { PrismaClient } from '@prisma/client';

// One-time backfill for a bug in LeadsService.create(): every lead created
// through the normal Create Lead form (assignedToUserId is required there)
// was written straight to status ASSIGNED, but no LeadStatusHistory row was
// ever recorded for that NEW -> ASSIGNED transition. getPipelineTimeline()
// (the Lead Progress tracker on Lead Details) only marks a stage "reached"
// if it finds a matching LeadStatusHistory row, so every one of these leads
// shows Assigned as not-yet-reached even after progressing well past it.
//
// The service-level fix (leads.service.ts's create()) stops this from
// happening to *new* leads. This script repairs existing ones: any lead
// that currently has an owner and is no longer sitting at NEW, but has no
// LeadStatusHistory row recording a transition into ASSIGNED, gets one
// inserted, using its own createdAt as the timestamp (i.e. "assigned from
// the moment it was created" — matching what actually happened for the
// entire population this script targets).
//
// Run once: npx ts-node prisma/backfill-assigned-status-history.ts
// Safe to re-run — it only touches leads that still have the gap, so a
// second run is a no-op. Delete this file once you've run it.

const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.lead.findMany({
    where: {
      assignedToUserId: { not: null },
      status: { not: 'NEW' },
    },
    select: { id: true, leadNumber: true, createdAt: true },
  });

  let fixed = 0;
  for (const lead of candidates) {
    const alreadyHasEntry = await prisma.leadStatusHistory.findFirst({
      where: { leadId: lead.id, newStatus: 'ASSIGNED' },
      select: { id: true },
    });
    if (alreadyHasEntry) continue;

    await prisma.$transaction([
      prisma.leadStatusHistory.create({
        data: {
          leadId: lead.id,
          oldStatus: 'NEW',
          newStatus: 'ASSIGNED',
          remarks: 'Assigned at creation (backfilled)',
          createdAt: lead.createdAt,
        },
      }),
      prisma.leadHistory.create({
        data: {
          leadId: lead.id,
          action: 'STATUS_CHANGED',
          description: 'Status changed from NEW to ASSIGNED',
          createdAt: lead.createdAt,
        },
      }),
    ]);
    fixed++;
    console.log(`Backfilled ${lead.leadNumber}`);
  }

  console.log(`Done. ${fixed} lead(s) backfilled out of ${candidates.length} candidate(s) checked.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
