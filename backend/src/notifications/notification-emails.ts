// Emails that accompany some in-app notifications (see NotificationEmail).
// Each is an EmailTemplate key an admin can edit under Email Templates;
// the subject/body here are the fallback when no template row exists, and
// prisma/seed.ts seeds the same text. Every template also gets
// {{recipientName}} and {{link}}.
export const NOTIFICATION_EMAILS = {
  LEAD_REASSIGNMENT_REQUESTED: {
    subject: 'Reassignment requested for Lead {{leadNumber}}',
    bodyHtml:
      '<p>Hi {{recipientName}},</p>' +
      '<p>{{requestedBy}} has asked to move Lead {{leadNumber}} from {{fromUser}} to {{toUser}}. ' +
      'It stays with {{fromUser}} until the request is approved.</p>' +
      '<p><a href="{{link}}">Review the request in DailyOps</a></p>',
  },
  LEAD_REASSIGNMENT_DECIDED: {
    subject: 'Reassignment of Lead {{leadNumber}} {{decision}}',
    bodyHtml:
      '<p>Hi {{recipientName}},</p>' +
      '<p>{{decidedBy}} {{decision}} your request to move Lead {{leadNumber}} to {{toUser}}.</p>' +
      '<p>{{decisionNote}}</p>' +
      '<p><a href="{{link}}">Open DailyOps</a></p>',
  },
  QUOTATION_APPROVAL_REQUESTED: {
    subject: 'Approval requested for Quotation {{quotationNumber}}',
    bodyHtml:
      '<p>Hi {{recipientName}},</p>' +
      '<p>{{requestedBy}} has asked for approval of Quotation {{quotationNumber}} ({{customerCompany}}).</p>' +
      '<p>Reason: {{reason}}</p>' +
      '<p><a href="{{link}}">Review the request in DailyOps</a></p>',
  },
  QUOTATION_APPROVAL_DECIDED: {
    subject: 'Approval for Quotation {{quotationNumber}} {{decision}}',
    bodyHtml:
      '<p>Hi {{recipientName}},</p>' +
      '<p>{{decidedBy}} {{decision}} your approval request for Quotation {{quotationNumber}}.</p>' +
      '<p>{{decisionNote}}</p>' +
      '<p><a href="{{link}}">Open the quotation</a></p>',
  },
} as const;

export type NotificationEmailKey = keyof typeof NOTIFICATION_EMAILS;

// The NotificationEmail fields that come from the template above.
export function notificationEmailTemplate(key: NotificationEmailKey) {
  const { subject, bodyHtml } = NOTIFICATION_EMAILS[key];
  return { templateKey: key, fallbackSubject: subject, fallbackBodyHtml: bodyHtml };
}
