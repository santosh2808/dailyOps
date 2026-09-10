import { IsOptional, IsUUID, Matches } from 'class-validator';

// D.O.T. AI Lead Assistant Phase 2A — Telephony Test Foundation (Step 6).
// Loose shape validation only here — accepts "+91XXXXXXXXXX" (the example
// in the spec) as well as the app's normal bare-10-digit convention.
// TelephonyService does the real normalization/validation via the same
// toInteraktPhoneParts() helper WhatsAppService already uses, so both
// features agree on what counts as a valid Indian mobile number.
export class TestCallDto {
  @Matches(/^[+]?[\d\s-]{10,15}$/, { message: 'Enter a valid phone number.' })
  phone: string;

  // Step 15: optional association only. Supplying this never changes the
  // Lead's status/aiStatus/aiQualification — see TelephonyService and
  // TelephonyController comments.
  @IsOptional()
  @IsUUID()
  leadId?: string;
}
