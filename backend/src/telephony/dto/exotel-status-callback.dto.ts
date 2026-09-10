import { IsOptional, IsString } from 'class-validator';

// D.O.T. AI Lead Assistant Phase 2A — Telephony Test Foundation (Step 8).
// Shape of Exotel's own StatusCallback payload (see
// https://developer.exotel.com/api/statuscallback) — only the fields this
// app actually reads are declared; the global ValidationPipe's
// `whitelist: true` (main.ts) silently strips anything else Exotel sends
// rather than rejecting the request, so this stays forward-compatible with
// extra fields the provider adds later. CallSid is the only field
// TelephonyService treats as required (it's how a callback is matched back
// to a TelephonyTestCall row) — everything else is validated defensively in
// the service, never trusted blindly per Step 8/16.
export class ExotelStatusCallbackDto {
  @IsOptional()
  @IsString()
  CallSid?: string;

  @IsOptional()
  @IsString()
  Status?: string;

  @IsOptional()
  @IsString()
  EventType?: string;

  @IsOptional()
  @IsString()
  To?: string;

  @IsOptional()
  @IsString()
  From?: string;

  @IsOptional()
  @IsString()
  StartTime?: string;

  @IsOptional()
  @IsString()
  EndTime?: string;

  @IsOptional()
  @IsString()
  ConversationDuration?: string;

  @IsOptional()
  @IsString()
  RecordingUrl?: string;
}
