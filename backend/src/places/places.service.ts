import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
// Deliberately minimal — only what the Billing/Shipping Address textarea
// actually needs (see AddressAutoFill.tsx's REPLACE-not-append convention,
// QA SC-003). No photos, ratings, opening hours, etc., which would also
// mean extra chargeable fields on the Places (New) field-mask billing
// model.
const PLACE_DETAILS_FIELD_MASK = 'id,formattedAddress';

export interface PlaceAutocompleteSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetailsResult {
  formattedAddress: string;
}

// Google Places Autocomplete (New) + Place Details (New) — server-side
// proxy so GOOGLE_PLACES_API_KEY (a billing-enabled key, unlike every other
// integration in this app) never reaches the browser. Same "Future Ready"
// convention as WhatsAppService/MailerService: with the key unset (the
// default — no real credentials are available at build time in this
// environment), getPublicStatus().enabled is false and
// AddressAutoFill.tsx simply doesn't show the Google search box, falling
// back to the existing free OpenStreetMap Nominatim search untouched (see
// frontend/src/lib/address-lookup.ts) — no behavior change for anyone who
// hasn't configured a key.
//
// Session tokens: a v4 UUID generated once per "typing session" on the
// frontend, reused across every autocomplete keystroke request and the one
// terminating place-details call, then discarded. This is what makes
// Google bill the whole session as a handful of Autocomplete Requests plus
// one Place Details Essentials call, instead of every keystroke being
// billed individually — see
// https://developers.google.com/maps/documentation/places/web-service/session-pricing.
// Never reused across sessions (the frontend generates a fresh one after
// each selection/abandonment).
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() || null;

  // Safe to return straight to the frontend — a boolean only, never the key
  // itself (same convention as TelephonyService.getPublicStatus()).
  getPublicStatus() {
    return { enabled: Boolean(this.apiKey) };
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Google Places is not configured on this server.');
    }
    return this.apiKey;
  }

  async autocomplete(input: string, sessionToken: string): Promise<PlaceAutocompleteSuggestion[]> {
    const apiKey = this.requireApiKey();
    if (!input.trim()) return [];

    let res: Response;
    try {
      res = await fetch(AUTOCOMPLETE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        body: JSON.stringify({
          input,
          sessionToken,
          // India-only, matching this app's existing Nominatim search
          // (countrycodes=in in address-lookup.ts) and Pincode lookup.
          includedRegionCodes: ['in'],
          languageCode: 'en',
        }),
      });
    } catch (error) {
      this.logger.error(`Autocomplete request threw: ${(error as Error).message}`);
      throw new BadRequestException('Could not reach Google Places right now.');
    }

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const message = payload?.error?.message || `Google Places autocomplete failed (${res.status})`;
      this.logger.error(`Autocomplete request failed: ${message}`);
      throw new BadRequestException(message);
    }

    const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
    return suggestions
      .filter((s: any) => s?.placePrediction?.placeId)
      .map((s: any) => {
        const prediction = s.placePrediction;
        return {
          placeId: prediction.placeId as string,
          mainText: prediction.structuredFormat?.mainText?.text || prediction.text?.text || '',
          secondaryText: prediction.structuredFormat?.secondaryText?.text || '',
        };
      });
  }

  async getPlaceDetails(placeId: string, sessionToken: string): Promise<PlaceDetailsResult> {
    const apiKey = this.requireApiKey();
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
        },
      });
    } catch (error) {
      this.logger.error(`Place details request threw: ${(error as Error).message}`);
      throw new BadRequestException('Could not reach Google Places right now.');
    }

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const message = payload?.error?.message || `Google Places details lookup failed (${res.status})`;
      this.logger.error(`Place details request failed: ${message}`);
      throw new BadRequestException(message);
    }

    return { formattedAddress: payload?.formattedAddress || '' };
  }
}
