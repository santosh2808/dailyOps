import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GetPlaceDetailsDto {
  @IsString()
  @IsNotEmpty()
  placeId!: string;

  // Must be the SAME token used for the autocomplete() calls in this
  // search session — this is what terminates the session and makes Google
  // bill it as a session rather than per-request. See PlacesService.
  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  sessionToken!: string;
}
