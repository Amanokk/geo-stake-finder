import { useEffect, useState } from "react";
import type { LatLng } from "@/lib/geo";

export type GeoState = {
  position: LatLng | null;
  accuracy: number | null;
  heading: number | null;
  error: string | null;
};

export function useGeolocation(enabled = true): GeoState {
  const [state, setState] = useState<GeoState>({
    position: null,
    accuracy: null,
    heading: null,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((s) => ({ ...s, error: "Geolocalização não suportada neste navegador." }));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          error: null,
        });
      },
      (err) => setState((s) => ({ ...s, error: err.message })),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return state;
}
