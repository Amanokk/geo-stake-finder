import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { useGeolocation } from "@/hooks/useGeolocation";
import { loadStreets } from "@/lib/streetsStore";
import { projectOnPolyline, pointAtChainage, type LatLng } from "@/lib/geo";
import type { Street } from "@/data/defaultStreets";
import { PROJECT_CENTER } from "@/data/defaultStreets";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Estaca GPS — Retiro São Joaquim" },
      {
        name: "description",
        content:
          "App de campo para localizar a estaca correta no projeto viário do bairro Retiro São Joaquim (Itaboraí/RJ) usando o GPS.",
      },
      { property: "og:title", content: "Estaca GPS — Retiro São Joaquim" },
      {
        property: "og:description",
        content:
          "Localize em tempo real a rua e estaca do projeto usando GPS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Match = {
  street: Street;
  chainage: number;
  distance: number;
  estaca: number;
  offset: number; // meters past the estaca
  snapped: LatLng;
};

function findNearestStake(pos: LatLng, streets: Street[], maxDist = 40): Match | null {
  let best: Match | null = null;
  for (const s of streets) {
    if (s.polyline.length < 2) continue;
    const poly = s.reversed ? [...s.polyline].reverse() : s.polyline;
    const r = projectOnPolyline(pos, poly);
    if (!r) continue;
    if (r.distance > maxDist) continue;
    const idxFloat = r.chainage / s.spacing;
    const estacaIdx = Math.round(idxFloat);
    const estacaChain = estacaIdx * s.spacing;
    const offset = r.chainage - estacaChain;
    const snapped = pointAtChainage(poly, r.chainage) ?? pos;
    if (best === null || r.distance < best.distance) {
      best = {
        street: s,
        chainage: r.chainage,
        distance: r.distance,
        estaca: s.startStake + estacaIdx,
        offset,
        snapped,
      };
    }
  }
  return best;
}

function Index() {
  const mapsReady = useGoogleMaps();
  const geo = useGeolocation(true);
  const [streets, setStreets] = useState<Street[]>(() => loadStreets());
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const streetLinesRef = useRef<google.maps.Polyline[]>([]);
  const highlightRef = useRef<google.maps.Polyline | null>(null);
  const stakeMarkerRef = useRef<google.maps.Marker | null>(null);

  // Reload streets when window regains focus (returning from calibration).
  useEffect(() => {
    const reload = () => setStreets(loadStreets());
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);

  const match = useMemo(
    () => (geo.position ? findNearestStake(geo.position, streets, 60) : null),
    [geo.position, streets],
  );

  // Initialize the map once.
  useEffect(() => {
    if (!mapsReady || !mapDivRef.current || mapRef.current) return;
    mapRef.current = new google.maps.Map(mapDivRef.current, {
      center: PROJECT_CENTER,
      zoom: 17,
      mapTypeId: "hybrid",
      disableDefaultUI: true,
      zoomControl: true,
      tilt: 0,
    });
  }, [mapsReady]);

  // Draw all street axes.
  useEffect(() => {
    if (!mapRef.current) return;
    streetLinesRef.current.forEach((l) => l.setMap(null));
    streetLinesRef.current = [];
    for (const s of streets) {
      if (s.polyline.length < 2) continue;
      const line = new google.maps.Polyline({
        path: s.polyline,
        strokeColor: "#38bdf8",
        strokeOpacity: 0.85,
        strokeWeight: 3,
        map: mapRef.current,
      });
      streetLinesRef.current.push(line);
    }
  }, [streets, mapsReady]);

  // Update user marker + accuracy circle.
  useEffect(() => {
    if (!mapRef.current || !geo.position) return;
    if (!userMarkerRef.current) {
      userMarkerRef.current = new google.maps.Marker({
        position: geo.position,
        map: mapRef.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#22d3ee",
          fillOpacity: 1,
          strokeColor: "#0f172a",
          strokeWeight: 2,
        },
        zIndex: 1000,
      });
      mapRef.current.panTo(geo.position);
    } else {
      userMarkerRef.current.setPosition(geo.position);
    }
    if (geo.accuracy) {
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = new google.maps.Circle({
          center: geo.position,
          radius: geo.accuracy,
          map: mapRef.current,
          fillColor: "#22d3ee",
          fillOpacity: 0.12,
          strokeColor: "#22d3ee",
          strokeOpacity: 0.4,
          strokeWeight: 1,
        });
      } else {
        accuracyCircleRef.current.setCenter(geo.position);
        accuracyCircleRef.current.setRadius(geo.accuracy);
      }
    }
  }, [geo.position, geo.accuracy]);

  // Highlight matched street + stake marker.
  useEffect(() => {
    if (!mapRef.current) return;
    if (highlightRef.current) {
      highlightRef.current.setMap(null);
      highlightRef.current = null;
    }
    if (stakeMarkerRef.current) {
      stakeMarkerRef.current.setMap(null);
      stakeMarkerRef.current = null;
    }
    if (!match) return;
    const path = match.street.reversed
      ? [...match.street.polyline].reverse()
      : match.street.polyline;
    highlightRef.current = new google.maps.Polyline({
      path,
      strokeColor: "#facc15",
      strokeOpacity: 1,
      strokeWeight: 5,
      map: mapRef.current,
    });
    stakeMarkerRef.current = new google.maps.Marker({
      position: match.snapped,
      map: mapRef.current,
      label: {
        text: `E${match.estaca}`,
        color: "#0f172a",
        fontWeight: "800",
        fontSize: "12px",
      },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 14,
        fillColor: "#facc15",
        fillOpacity: 1,
        strokeColor: "#0f172a",
        strokeWeight: 2,
      },
      zIndex: 900,
    });
  }, [match]);

  const anyConfigured = streets.some((s) => s.polyline.length >= 2);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-50">
      {/* Big readout */}
      <header className="px-4 pt-5 pb-4">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
          Retiro São Joaquim · Itaboraí/RJ
        </div>
        {match ? (
          <>
            <h1 className="mt-2 text-3xl font-black leading-tight text-white">
              {match.street.name}
            </h1>
            <div className="mt-3 flex items-end gap-3">
              <div className="text-6xl font-black tabular-nums text-yellow-300 leading-none">
                E{match.estaca}
              </div>
              <div className="pb-1 text-sm text-slate-300 tabular-nums">
                {match.offset >= 0 ? "+" : ""}
                {match.offset.toFixed(1)} m
                <div className="text-xs text-slate-500">
                  {match.distance.toFixed(1)} m do eixo
                </div>
              </div>
            </div>
          </>
        ) : geo.error ? (
          <>
            <h1 className="mt-2 text-2xl font-bold text-red-400">Sem GPS</h1>
            <p className="text-sm text-slate-400">{geo.error}</p>
          </>
        ) : !geo.position ? (
          <>
            <h1 className="mt-2 text-2xl font-bold text-slate-300">Obtendo GPS…</h1>
            <p className="text-sm text-slate-500">
              Permita o acesso à localização para começar.
            </p>
          </>
        ) : !anyConfigured ? (
          <>
            <h1 className="mt-2 text-2xl font-bold text-amber-300">
              Nenhuma rua calibrada
            </h1>
            <p className="text-sm text-slate-400">
              Abra <b>Calibrar</b> e trace o eixo das ruas no mapa.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-2xl font-bold text-slate-300">
              Fora do projeto
            </h1>
            <p className="text-sm text-slate-500">
              Nenhuma rua calibrada dentro de 60 m da sua posição.
            </p>
          </>
        )}
      </header>

      {/* Map */}
      <div className="relative flex-1 min-h-[380px]">
        <div ref={mapDivRef} className="absolute inset-0" />
        {!mapsReady && (
          <div className="absolute inset-0 grid place-items-center bg-slate-900 text-slate-400 text-sm">
            Carregando mapa…
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between p-3">
          <div className="pointer-events-auto rounded-full bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 backdrop-blur">
            GPS ±{geo.accuracy ? geo.accuracy.toFixed(0) : "--"} m
          </div>
          <Link
            to="/calibrar"
            className="pointer-events-auto rounded-full bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg"
          >
            Calibrar
          </Link>
        </div>
      </div>
    </div>
  );
}
