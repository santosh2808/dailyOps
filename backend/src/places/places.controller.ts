import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlacesService } from './places.service';
import { AutocompletePlacesDto } from './dto/autocomplete-places.dto';
import { GetPlaceDetailsDto } from './dto/get-place-details.dto';

// Server-side proxy for Google Places Autocomplete (New) — keeps
// GOOGLE_PLACES_API_KEY off the browser entirely (see PlacesService for
// why). Used by AddressAutoFill.tsx wherever a Billing/Shipping Address
// field appears (currently Sales Order only). Any logged-in user may call
// this — same convention as DashboardController (JwtAuthGuard only, no
// per-permission gate), since address lookup is a cross-cutting form
// helper, not a resource tied to one module's permission set.
@ApiTags('places')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/places')
export class PlacesController {
  constructor(private placesService: PlacesService) {}

  // Booleans only — never the API key itself (Step 7 "Do not expose...
  // internal credentials" convention, same as TelephonyController#status).
  @Get('config')
  getConfig() {
    return this.placesService.getPublicStatus();
  }

  @Get('autocomplete')
  autocomplete(@Query() query: AutocompletePlacesDto) {
    return this.placesService.autocomplete(query.input, query.sessionToken);
  }

  @Get('details')
  getDetails(@Query() query: GetPlaceDetailsDto) {
    return this.placesService.getPlaceDetails(query.placeId, query.sessionToken);
  }
}
