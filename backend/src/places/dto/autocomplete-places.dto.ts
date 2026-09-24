import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AutocompletePlacesDto {
  @IsString()
  @IsNotEmpty()
  input!: string;

  // Google requires <=36 ASCII, URL/filename-safe base64 chars — a v4 UUID
  // (36 chars including hyphens) fits exactly. See PlacesService's session
  // token comment for why this must be generated fresh per search session
  // and reused across every autocomplete keystroke + the one terminating
  // details call.
  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  sessionToken!: string;
}
