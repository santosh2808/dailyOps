import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

// "Can this trigger email reminder or message reminder to user so tht they
// wont forget to follwo up" — the user's own request, after Schedule
// Follow-up became a real date picker (see ScheduleFollowUpDialog.tsx).
// Design confirmed via AskUserQuestion: Email + WhatsApp, sent once on the
// morning of the due date (not a running nag), built as a daily cron job
// since this app has no per-lead scheduler infra to hook a one-off timer
// into.
//
// Dedup: Lead.followUpReminderSentAt is set the moment a reminder actually
// goes out for the lead's *current* nextFollowUp value, so this job never
// re-sends for the same date on a later run. LeadsService.update() resets
// it back to null whenever nextFollowUp itself changes (see
// nextFollowUpDateChanged in update()), so rescheduling a follow-up
// correctly re-arms the reminder for its new date.
//
// Mirrors LeadsService.notifyLeadAssigned()'s exact pattern: best-effort,
// independent email/WhatsApp sends, neither blocks the other, and a failure
// on one lead must never stop the rest of the batch from being processed —
// this is a background job with nobody watching a toast for the result.
@Injectable()
export class LeadFollowUpReminderService {
  private readonly logger = new Logger(LeadFollowUpReminderService.name);

  constructor(
    private prisma: PrismaService,
    private mailerService: MailerService,
    private whatsAppService: WhatsAppService,
  ) {}

  // Runs once a day at 08:00 server time — "morning of the due date" per
  // the confirmed design. Server-time cron, same as every other time-based
  // convention already in this codebase (no per-user timezone handling
  // exists anywhere else in DailyOps either).
  @Cron('0 8 * * *')
  async sendDueReminders(): Promise<void> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const leads = await this.prisma.lead.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['WON', 'LOST'] as LeadStatus[] },
        nextFollowUp: { gte: startOfToday, lt: startOfTomorrow },
        followUpReminderSentAt: null,
        assignedToUserId: { not: null },
      },
      select: {
        id: true,
        leadNumber: true,
        title: true,
        companyName: true,
        contactPerson: true,
        phone: true,
        reminderNote: true,
        nextFollowUp: true,
        assignedToUser: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    if (leads.length === 0) return;

    this.logger.log(`Sending follow-up reminders for ${leads.length} lead(s) due today`);

    for (const lead of leads) {
      // assignedToUserId: { not: null } in the where-clause guarantees this,
      // but the relation type itself is still nullable (User.onDelete:
      // SetNull) — narrow it before use rather than asserting.
      if (!lead.assignedToUser) continue;
      const user = lead.assignedToUser;

      try {
        if (user.email) {
          await this.mailerService.send({
            templateKey: 'LEAD_FOLLOWUP_REMINDER',
            fallbackSubject: `Reminder: follow up on Lead ${lead.leadNumber} today`,
            fallbackBodyHtml:
              '<p>Hi {{assigneeName}},</p>' +
              '<p>Today is the scheduled follow-up date for Lead {{leadNumber}} — {{title}} ({{companyName}}).</p>' +
              '<p>Contact: {{contactPerson}} — {{phone}}</p>' +
              '<p>{{reminderNote}}</p>',
            vars: {
              assigneeName: user.name,
              leadNumber: lead.leadNumber,
              title: lead.title,
              companyName: lead.companyName,
              contactPerson: lead.contactPerson,
              phone: lead.phone,
              reminderNote: lead.reminderNote ?? '',
            },
            to: user.email,
            link: { module: 'Lead', leadId: lead.id },
          });
        }

        if (user.phone) {
          const templateName =
            process.env.INTERAKT_LEAD_FOLLOWUP_REMINDER_TEMPLATE_NAME?.trim() ||
            'lead_followup_reminder';
          await this.whatsAppService.sendTemplateMessage({
            phone: user.phone,
            templateName,
            bodyValues: [user.name, lead.leadNumber, lead.companyName, lead.contactPerson, lead.phone],
          });
        }

        // Marked once sends have been *attempted*, not just on success —
        // matching the never-block, never-retry-forever philosophy of
        // notifyLeadAssigned(). A permanently broken mailbox/phone number
        // shouldn't cause this job to nag every single day; EmailHistory /
        // server logs are the record of what happened.
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { followUpReminderSentAt: new Date() },
        });
      } catch (error) {
        this.logger.error(
          `Failed to send follow-up reminder for Lead ${lead.leadNumber}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }
}
