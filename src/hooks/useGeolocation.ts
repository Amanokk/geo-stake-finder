import { useEffect, useRef, useState } from "react";
import { haversine, type LatLng } from "@/lib/geo";

export type GeoState = {
  position: LatLng | null;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  error: string | null;
};

// Filtro simples para melhorar a precisão prática do GPS:
// - descarta leituras muito piores que a última boa;
// - descarta saltos fisicamente impossíveis (> 40 m/s);
// - suaviza com média exponencial ponderada pela precisão (Kalman 1D simplificado).
const MAX_ACCURACY = 100; // m — acima disso a leitura é lixo
const MAX_SPEED = 40; // m/s

export function useGeolocation(enabled = true): GeoState {
  const [state, setState] = useState<GeoState>({
    position: null,
    accuracy: null,
    heading: null,
    speed: null,
    error: null,
  });

  const lastRef = useRef<{ pos: LatLng; acc: number; t: number } | null>(null);
  const lastEmitRef = useRef<{ pos: LatLng; t: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((s) => ({ ...s, error: "Geolocalização não suportada neste navegador." }));
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const raw: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const acc = Math.max(pos.coords.accuracy ?? 30, 1);
        const t = pos.timestamp || Date.now();

        if (acc > MAX_ACCURACY && lastRef.current) return;

        const prev = lastRef.current;
        let next = raw;
        let nextAcc = acc;

        if (prev) {
          const dt = Math.max((t - prev.t) / 1000, 0.001);
          const dist = haversine(prev.pos, raw);
          // salto impossível com leitura ruim → ignora
          if (dist / dt > MAX_SPEED && acc > prev.acc) return;

          // variância cresce com o tempo parado/andando
          const predVar = prev.acc * prev.acc + dt * 4; // 2 m/s de incerteza de movimento
          const k = predVar / (predVar + acc * acc);
          next = {
            lat: prev.pos.lat + k * (raw.lat - prev.pos.lat),
            lng: prev.pos.lng + k * (raw.lng - prev.pos.lng),
          };
          nextAcc = Math.sqrt((1 - k) * predVar);
        }

        lastRef.current = { pos: next, acc: nextAcc, t };

        // Limita re-renders: no máximo ~1 atualização por segundo,
        // ou antes disso se o deslocamento for relevante (> 2 m).
        const emitted = lastEmitRef.current;
        const moved = emitted ? haversine(emitted.pos, next) : Infinity;
        if (emitted && t - emitted.t < 1000 && moved < 2) return;
        lastEmitRef.current = { pos: next, t };

        setState({
          position: next,
          accuracy: Math.round(Math.min(nextAcc, acc) * 10) / 10,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          error: null,
        });
      },
      (err) => setState((s) => ({ ...s, error: err.message })),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return state;
}
