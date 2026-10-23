import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

// Sticky filters: remembers the last-used filter values for a given list
// page across in-app navigation (e.g. open a record, then click "Leads" in
// the Sidebar to come back) using sessionStorage, so filters reset when the
// browser/tab closes rather than lingering indefinitely across days. The
// "Clear filters" button already present on every *FiltersBar component
// resets the in-memory filter state as it always has — this hook then
// persists that cleared state automatically via the effect below, no
// separate clear-storage call needed anywhere.
//
// `initialFromUrl` takes precedence over anything already in sessionStorage
// on first mount — this preserves the existing "Dashboard card links to
// /leads?status=QUALIFIED" behavior: an explicit incoming URL filter always
// wins over a remembered one. Pass `null` when the URL carries no relevant
// filter params, so a stored/remembered value (or the default) is used
// instead.
//
// A browser refresh (F5 / reload button) resets filters to their defaults:
// filters are only remembered across in-app navigation, not across a reload.
// Each key's remembered value is discarded the first time it is read after a
// reload; later visits in the same page load remember filters as normal.
const isReload = (() => {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === "reload";
  } catch {
    return false;
  }
})();
const keysHandledThisLoad = new Set<string>();

function shouldIgnoreStored(storageKey: string): boolean {
  if (keysHandledThisLoad.has(storageKey)) return false;
  keysHandledThisLoad.add(storageKey);
  if (!isReload) return false;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
  return true;
}

export function useSessionFilters<T>(
  storageKey: string,
  initialFromUrl: T | null,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const ignoreStored = shouldIgnoreStored(storageKey);
    if (initialFromUrl !== null) return initialFromUrl;
    if (ignoreStored) return defaultValue;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) return JSON.parse(stored) as T;
    } catch {
      // Corrupt or unavailable storage (e.g. private browsing quota) —
      // fall through to the default, same as if nothing were stored.
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Storage unavailable — fail silently, in-memory filtering still
      // works for the rest of this page visit, it just won't be
      // remembered on the next navigation.
    }
  }, [storageKey, value]);

  return [value, setValue];
}
