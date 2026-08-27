import { useEffect, useRef, useState } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ADDRESS_SEARCH_MIN_LENGTH,
  lookupPincode,
  searchAddress,
  type AddressSuggestion,
} from "@/lib/address-lookup";

interface AddressAutoFillProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// Two free, keyless auto-fill helpers layered on top of a plain textarea —
// neither one requires a paid API (Google Places etc.):
//
// 1. Search-as-you-type ("Search address") via OpenStreetMap Nominatim —
//    pick a suggestion and it replaces the textarea with a formatted
//    address. Debounced and capped to a handful of results per Nominatim's
//    usage policy; attribution is shown right under the results.
// 2. PIN code lookup via India Post's public Pincode API — type a 6-digit
//    PIN and click Lookup to append the City/District/State line without
//    retyping it. Purely additive to whatever's already in the textarea.
//
// The textarea itself remains the single source of truth / only thing that
// actually gets submitted — both helpers just insert text into it, so
// there's nothing to keep in sync and nothing new to store in the backend.
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
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [pincode, setPincode] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (query.trim().length < ADDRESS_SEARCH_MIN_LENGTH) {
      setSuggestions([]);
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
        const results = await searchAddress(query.trim(), controller.signal);
        setSuggestions(results);
        setShowSuggestions(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setSearchError("Could not search addresses right now.");
        }
      } finally {
        setSearching(false);
      }
      // Debounced well past Nominatim's ~1 req/sec usage cap.
    }, 600);

    return () => clearTimeout(timer);
  }, [query]);

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
      if (!value.includes(line)) {
        onChange(value.trim() ? `${value.trim()}\n${line}` : line);
      }
    } catch {
      setPinError("Could not look up that PIN code. Please try again.");
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
            placeholder="Search address (OpenStreetMap)…"
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          {searching && (
            <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {showSuggestions && suggestions.length > 0 && (
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
