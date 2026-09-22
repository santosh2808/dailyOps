// Anti-fraud GPS capture for Site Visit photos (SiteVisitOutcomeDialog) —
// user's own request: "i dont want them to fraud me they visited". Wraps
// the browser's callback-based Geolocation API in a Promise with the two
// settings that matter for this use case:
//   - enableHighAccuracy: true — prefer real GPS over cell/wifi triangulation
//     when the device has it, since a few hundred metres of slack defeats
//     the point.
//   - maximumAge: 0 — never accept a cached fix. Without this the browser
//     can silently hand back a location from hours ago (from a different
//     place), which would make the whole feature pointless.
export interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export class GeolocationUnavailableError extends Error {}
export class GeolocationDeniedError extends Error {}

export function captureCurrentLocation(): Promise<CapturedLocation> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(
        new GeolocationUnavailableError(
          "This browser doesn't support location access. Try a different browser or device.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? undefined,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(
            new GeolocationDeniedError(
              "Location access is required to upload site photos. Please allow location access for this app and try again.",
            ),
          );
        } else if (error.code === error.TIMEOUT) {
          reject(new GeolocationUnavailableError("Couldn't get your location in time. Please try again."));
        } else {
          reject(
            new GeolocationUnavailableError(
              "Couldn't get your location. Check that location services are turned on and try again.",
            ),
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}
