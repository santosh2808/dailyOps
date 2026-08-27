import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { EmailTemplatesService } from '../email-templates/email-templates.service';

export interface MailerLink {
  module: string;
  quotationId?: string;
  salesOrderId?: string;
  proformaInvoiceId?: string;
  jobExecutionOrderId?: string;
  taxInvoiceId?: string;
}

export interface MailerSendOptions {
  // Looked up via EmailTemplatesService — when present and the template
  // exists/is active, its subject/bodyHtml win over the fallback* fields
  // below. The fallback exists so a send never silently no-ops just
  // because nobody has seeded/edited that template yet.
  templateKey?: string;
  fallbackSubject: string;
  fallbackBodyHtml: string;
  vars: Record<string, string>;
  to?: string | null;
  cc?: string | null;
  attachments?: { filename: string; content: Buffer }[];
  actorName?: string | null;
  link: MailerLink;
}

export interface MailerSendResult {
  status: 'SENT' | 'SIMULATED' | 'FAILED';
  errorMessage?: string;
}

// Requirement #7/#12/#13/#16: every email this system sends goes through
// here, and every send — successful, simulated, or failed — is recorded in
// EmailHistory. Deliberately never throws: a business action (approving a
// quotation, generating a Proforma Invoice/JEO) must not fail just because
// an email couldn't go out; the EmailHistory row is the record of what
// happened, and the caller can surface it if it cares.
//
// SMTP is entirely env-configured (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/
// SMTP_SECURE/SMTP_FROM). When SMTP_HOST is unset (the default in this
// project's committed .env.example, since no real mail server credentials
// are available at build time), sending is SIMULATED: nothing goes out
// over the network, but the fully-rendered subject/body/recipient are still
// logged to EmailHistory exactly as if it had — the same "Future Ready"
// placeholder pattern already used elsewhere in this codebase for PDF
// generation before this feature, just applied to email delivery instead.
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: nodemailer.Transporter | null;

  constructor(
    private prisma: PrismaService,
    private emailTemplatesService: EmailTemplatesService,
  ) {
    const host = process.env.SMTP_HOST?.trim();
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        })
      : null;

    if (!this.transporter) {
      this.logger.warn(
        'SMTP_HOST is not set — outgoing emails will be simulated (logged to EmailHistory, never actually sent). Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM to enable real delivery.',
      );
    }
  }

  // {{token}} substitution — deliberately not a full templating engine (no
  // conditionals/loops), matching "no hardcoding" without over-building
  // something this project's 5 flat templates don't need.
  private renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? '');
  }

  async send(options: MailerSendOptions): Promise<MailerSendResult> {
    let subjectTemplate = options.fallbackSubject;
    let bodyTemplate = options.fallbackBodyHtml;

    if (options.templateKey) {
      const template = await this.emailTemplatesService.findByKey(options.templateKey);
      if (template && template.isActive) {
        subjectTemplate = template.subject;
        bodyTemplate = template.bodyHtml;
      }
    }

    const subject = this.renderTemplate(subjectTemplate, options.vars);
    const html = this.renderTemplate(bodyTemplate, options.vars);
    const to = options.to?.trim();

    let result: MailerSendResult;
    if (!to) {
      result = { status: 'FAILED', errorMessage: 'No recipient email address on file' };
    } else if (!this.transporter) {
      result = { status: 'SIMULATED' };
    } else {
      try {
        await this.transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@dailyops.local',
          to,
          cc: options.cc || undefined,
          subject,
          html,
          attachments: options.attachments,
        });
        result = { status: 'SENT' };
      } catch (error) {
        result = {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown mail delivery error',
        };
        // BUG FIX: this failure was previously only ever visible by reading
        // errorMessage back out of EmailHistory — which the frontend never
        // rendered in the first place (fixed separately), so a real SMTP
        // rejection was completely invisible anywhere. Logging it here
        // means it always shows up in the server console too.
        this.logger.error(`Email send to ${to} failed: ${result.errorMessage}`, error instanceof Error ? error.stack : undefined);
      }
    }

    await this.prisma.emailHistory.create({
      data: {
        module: options.link.module,
        quotationId: options.link.quotationId,
        salesOrderId: options.link.salesOrderId,
        proformaInvoiceId: options.link.proformaInvoiceId,
        jobExecutionOrderId: options.link.jobExecutionOrderId,
        taxInvoiceId: options.link.taxInvoiceId,
        templateKey: options.templateKey,
        subject,
        recipientEmail: to || '(none)',
        ccEmails: options.cc || undefined,
        status: result.status,
        errorMessage: result.errorMessage,
        sentBy: options.actorName ?? undefined,
      },
    });

    return result;
  }
}
