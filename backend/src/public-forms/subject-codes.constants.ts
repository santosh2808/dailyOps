import { FormDestinationType } from '@prisma/client';

export interface CanonicalSubjectCode {
  code: string;
  label: string;
  defaultDestination: FormDestinationType;
}

// Additive: Website Enquiries -> Lead/Complaint refactor (plan §4). This is
// a UI convenience default only — used by an admin screen to pre-fill
// destinationType/label when creating a new FormSubjectRoute for a known
// code, and by prisma/seed.ts. It is deliberately NEVER read at submission
// time by public-forms: the actual destination for a given (form, subject,
// product) always comes from the FormSubjectRoute row resolved in the
// database, never re-derived from this constant — a future website is free
// to introduce its own subjectCode that isn't listed here at all (see
// FormConfigurationService, which accepts any non-empty string).
export const CANONICAL_SUBJECT_CODES: CanonicalSubjectCode[] = [
  { code: 'WARRANTY_CLAIM', label: 'Warranty Claim', defaultDestination: 'COMPLAINT' },
  { code: 'SERVICE_REQUEST', label: 'Service Request', defaultDestination: 'COMPLAINT' },
  { code: 'REPAIR_REQUEST', label: 'Repair Request', defaultDestination: 'COMPLAINT' },
  { code: 'TECHNICAL_SUPPORT', label: 'Technical Support', defaultDestination: 'COMPLAINT' },
  { code: 'PRODUCT_ENQUIRY', label: 'Product Enquiry', defaultDestination: 'LEAD' },
  { code: 'REQUEST_QUOTATION', label: 'Request a Quotation', defaultDestination: 'LEAD' },
  { code: 'PROJECT_ENQUIRY', label: 'Project Enquiry', defaultDestination: 'LEAD' },
  { code: 'DEALERSHIP_ENQUIRY', label: 'Dealership Enquiry', defaultDestination: 'LEAD' },
  { code: 'GENERAL_ENQUIRY', label: 'General Enquiry', defaultDestination: 'LEAD' },
];
