import api from "@/lib/api";

export interface PlacesConfig {
  enabled: boolean;
}

export interface PlaceAutocompleteSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetailsResult {
  formattedAddress: string;
}

// Whether GOOGLE_PLACES_API_KEY is configured on the backend — see
// backend/src/places/places.service.ts. AddressAutoFill.tsx checks this
// once (cached — see getPlacesConfigCached below) before showing the
// Google search box at all; when false it falls back to the existing free
// OpenStreetMap Nominatim search untouched.
export async function getPlacesConfig() {
  const res = await api.get<PlacesConfig>("/api/v1/places/config");
  return res.data;
}

let cachedConfig: Promise<PlacesConfig> | null = null;

// A Sales Order form renders two AddressAutoFill instances (Billing +
// Shipping) at once — cache the one /config call per page load rather than
// firing it twice. Not invalidated across page loads; if the key is added
// or removed, a full page reload picks it up (acceptable — this isn't a
// value that changes while someone has the form open).
export function getPlacesConfigCached() {
  if (!cachedConfig) {
    cachedConfig = getPlacesConfig().catch((err) => {
      // Don't poison the cache with a rejected promise — a transient
      // network blip shouldn't permanently hide the Google search box for
      // the rest of the session.
      cachedConfig = null;
      throw err;
    });
  }
  return cachedConfig;
}

export async function autocompletePlaces(input: string, sessionToken: string, signal?: AbortSignal) {
  const res = await api.get<PlaceAutocompleteSuggestion[]>("/api/v1/places/autocomplete", {
    params: { input, sessionToken },
    signal,
  });
  return res.data;
}

export async function getPlaceDetails(placeId: string, sessionToken: string) {
  const res = await api.get<PlaceDetailsResult>("/api/v1/places/details", {
    params: { placeId, sessionToken },
  });
  return res.data;
}
