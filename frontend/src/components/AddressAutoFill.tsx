import { useEffect, useRef, useState } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import {
  ADDRESS_SEARCH_MIN_LENGTH,
  lookupPincode,
  searchAddress,
  type AddressSuggestion,
} from "@/lib/address-lookup";
import {
  autocompletePlaces,
  getPlaceDetails,
  getPlacesConfigCached,
  type PlaceAutocompleteSuggestion,
} from "@/api/places";

interface AddressAutoFillProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// A `sessionToken` UUID makes Google bill an entire search-to-selection
// session as a handful of requests instead of per keystroke (see
// backend/src/places/places.service.ts). `crypto.randomUUID()` is
// available in every modern browser over HTTPS (and localhost in dev).
function newSessionToken() {
  return crypto.randomUUID();
}

// Two auto-fill helpers layered on top of a plain textarea:
//
// 1. Search-as-you-type ("Search address"). Uses Google Places Autocomplete
//    (New) when the backend has GOOGLE_PLACES_API_KEY configured (see
//    api/places.ts — checked once on mount via getPlacesConfigCached()),
//    for noticeably better Indian address coverage/precision than the free
//    alternative. Falls back to OpenStreetMap Nominatim — free and keyless,
//    but rougher coverage — when no key is configured, so this component
//    behaves exactly as before on any deployment that hasn't set one up.
// 2. PIN code lookup via India Post's public Pincode API — type a 6-digit
//    PIN and click Lookup to fill the City/District/State line without
//    retyping it. Independent of which search provider is active above.
//
// Both search-as-you-type and PIN lookup REPLACE the textarea's contents
// rather than appending to it. A Billing/Shipping Address represents
// exactly one physical location, so picking a second search result (or
// looking up a second PIN code) means "actually I meant this address", not
// "also deliver here" — appending would silently stack multiple
// locations/PIN codes into one field, producing an invalid combined
// address (see QA SC-003).
//
// The textarea itself remains the single source of truth / only thing that
// actually gets submitted — every helper just sets its value, so there's
// nothing to keep in sync and nothing new to store in the backend (Google
// Place Details responses are never persisted — only the resulting address
// text, same as Nominatim results today).
export default function AddressAutoFill({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: AddressAutoFillProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);

  // Starts false (Nominatim) until the one-time /places/config check
  // resolves — avoids a flash of "Google" search UI that then has to fall
  // back if the key turns out to be unconfigured.
  const [placesEnabled, setPlacesEnabled] = useState(false);
  const sessionTokenRef = useRef(newSessionToken());

  const [pincode, setPincode] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPlacesConfigCached()
      .then((config) => {
        if (!cancelled) setPlacesEnabled(config.enabled);
      })
      .catch(() => {
        // Config check failed (network blip, backend not yet upgraded,
        // etc.) — stay on the free Nominatim fallback rather than surface
        // an error for a feature the user hasn't even tried to use yet.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < ADDRESS_SEARCH_MIN_LENGTH) {
      setSuggestions([]);
      setPlaceSuggestions([]);
      setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      setSearchError("");
      try {
        if (placesEnabled) {
          const results = await autocompletePlaces(query.trim(), sessionTokenRef.current, controller.signal);
          setPlaceSuggestions(results);
        } else {
          const results = await searchAddress(query.trim(), controller.signal);
          setSuggestions(results);
        }
        setShowSuggestions(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setSearchError(getErrorMessage(err, "Could not search addresses right now."));
        }
      } finally {
        setSearching(false);
      }
      // Debounced well past Nominatim's ~1 req/sec usage cap; also keeps
      // Google Places request volume sane while typing.
    }, 600);

    return () => clearTimeout(timer);
  }, [query, placesEnabled]);

  function selectSuggestion(suggestion: AddressSuggestion) {
    const lines = [
      suggestion.line1,
      [suggestion.city, suggestion.state].filter(Boolean).join(", "),
      suggestion.pincode ? `PIN: ${suggestion.pincode}` : "",
    ].filter(Boolean);
    onChange(lines.join("\n"));
    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
  }

  async function selectPlaceSuggestion(suggestion: PlaceAutocompleteSuggestion) {
    setShowSuggestions(false);
    setResolvingPlace(true);
    setSearchError("");
    try {
      const details = await getPlaceDetails(suggestion.placeId, sessionTokenRef.current);
      onChange(details.formattedAddress);
      setQuery("");
      setPlaceSuggestions([]);
    } catch (err) {
      setSearchError(getErrorMessage(err, "Could not load that address. Please try again."));
    } finally {
      setResolvingPlace(false);
      // This session (start-of-typing -> Place Details) has concluded per
      // Google's billing model — a fresh token is required for the next
      // one, reused token or not.
      sessionTokenRef.current = newSessionToken();
    }
  }

  async function handlePincodeLookup() {
    const trimmed = pincode.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setPinError("Enter a valid 6-digit PIN code.");
      return;
    }
    setPinError("");
    setPinLoading(true);
    try {
      const result = await lookupPincode(trimmed);
      if (!result) {
        setPinError("No matching PIN code found.");
        return;
      }
      const line = `${[result.city, result.district].filter(Boolean).join(", ")}, ${result.state} - ${result.pincode}`;
      // Replace, not append: a Billing/Shipping Address is exactly one
      // location, so a fresh PIN lookup means "use this address", not
      // "also include this one" (see QA SC-003).
      onChange(line);
    } catch (err) {
      setPinError(getErrorMessage(err, "Could not look up that PIN code. Please try again."));
    } finally {
      setPinLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>

      <div className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={placesEnabled ? "Search address…" : "Search address (OpenStreetMap)…"}
            value={query}
            disabled={disabled || resolvingPlace}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() =>
              (suggestions.length > 0 || placeSuggestions.length > 0) && setShowSuggestions(true)
            }
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          {(searching || resolvingPlace) && (
            <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {placesEnabled
          ? showSuggestions &&
            placeSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-md">
                {placeSuggestions.map((s) => (
                  <button
                    type="button"
                    key={s.placeId}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => selectPlaceSuggestion(s)}
                  >
                    <span className="block">{s.mainText}</span>
                    {s.secondaryText && (
                      <span className="block text-xs text-muted-foreground">{s.secondaryText}</span>
                    )}
                  </button>
                ))}
                {/* Google Maps attribution — required whenever Places data is
                    shown without an accompanying Google Map. Text form (vs.
                    logo) per
                    https://developers.google.com/maps/documentation/places/web-service/policies,
                    styled per that page's spec; translate="no" per the same
                    page's "don't localize Google Maps" requirement. */}
                <p
                  translate="no"
                  className="border-t px-3 py-1.5 text-right text-xs font-normal text-[#5e5e5e]"
                >
                  Google Maps
                </p>
              </div>
            )
          : showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-md">
                {suggestions.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => selectSuggestion(s)}
                  >
                    {s.displayName}
                  </button>
                ))}
                <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                  Search powered by OpenStreetMap contributors
                </p>
              </div>
            )}
      </div>
      {searchError && <p className="text-xs text-destructive">{searchError}</p>}

      <div className="flex items-center gap-2">
        <div className="relative w-32">
          <MapPin className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="PIN code"
            inputMode="numeric"
            maxLength={6}
            disabled={disabled}
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || pinLoading || pincode.length !== 6}
          onClick={handlePincodeLookup}
        >
          {pinLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lookup"}
        </Button>
        <p className="text-xs text-muted-foreground">Fills City / District / State from the PIN code</p>
      </div>
      {pinError && <p className="text-xs text-destructive">{pinError}</p>}

      <Textarea
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
