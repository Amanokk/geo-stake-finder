import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { useGeolocation } from "@/hooks/useGeolocation";
import { projectOnPolyline, pointAtChainage, polylineLength, type LatLng } from "@/lib/geo";
import { stakeAtChainage, stakesAlong } from "@/lib/stakes";
import { STREETS, type Street } from "@/data/streets";
import {
  getGoogleMaps,
  type GoogleCircleInstance,
  type GoogleMapInstance,
  type GoogleMarkerInstance,
  type GooglePolylineInstance,
} from "@/lib/googleMapsTypes";

const PROJECT_CENTER: LatLng = { lat: -22.7524, lng: -42.8935 };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Estaca GPS — Retiro São Joaquim" },
      {
        name: "description",
        content:
          "App de campo que mostra no mapa, pelo GPS, a rua e a estaca correta do projeto viário do bairro Retiro São Joaquim (Itaboraí/RJ).",
      },
      { property: "og:title", content: "Estaca GPS — Retiro São Joaquim" },
      {
        property: "og:description",
        content: "Localize em tempo real a rua e a estaca do projeto usando GPS.",
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
  offset: number;
  snapped: LatLng;
};

function findNearestStake(pos: LatLng, maxDist = 60): Match | null {
  let best: Match | null = null;
  for (const s of STREETS) {
    const r = projectOnPolyline(pos, s.path);
    if (!r || r.distance > maxDist) continue;
    const total = r.totalLength;
    const { number, offset } = stakeAtChainage(s, r.chainage, total);
    const snapped = pointAtChainage(s.path, r.chainage) ?? pos;
    if (best === null || r.distance < best.distance) {
      best = { street: s, chainage: r.chainage, distance: r.distance, estaca: number, offset, snapped };
    }
  }
  return best;
}

function Index() {
  const mapsReady = useGoogleMaps();
  const geo = useGeolocation(true);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const userMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const accuracyCircleRef = useRef<GoogleCircleInstance | null>(null);
  const streetLinesRef = useRef<GooglePolylineInstance[]>([]);
  const highlightRef = useRef<GooglePolylineInstance | null>(null);
  const stakeMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const allStakesRef = useRef<GoogleMarkerInstance[]>([]);

  const match = useMemo(() => (geo.position ? findNearestStake(geo.position) : null), [geo.position]);

  useEffect(() => {
    const maps = getGoogleMaps();
    if (!mapsReady || !maps || !mapDivRef.current || mapRef.current) return;
    mapRef.current = new maps.Map(mapDivRef.current, {
      center: PROJECT_CENTER,
      zoom: 16,
      mapTypeId: "hybrid",
      disableDefaultUI: true,
      zoomControl: true,
      tilt: 0,
    });
  }, [mapsReady]);

  // Eixos + estacas da planta.
  useEffect(() => {
    const maps = getGoogleMaps();
    const map = mapRef.current;
    if (!maps || !map) return;
    streetLinesRef.current.forEach((l) => l.setMap(null));
    allStakesRef.current.forEach((m) => m.setMap(null));
    streetLinesRef.current = [];
    allStakesRef.current = [];
    for (const s of STREETS) {
      streetLinesRef.current.push(
        new maps.Polyline({
          path: s.path,
          strokeColor: "#38bdf8",
          strokeOpacity: 0.85,
          strokeWeight: 3,
          map,
        }),
      );
      const total = polylineLength(s.path);
      for (const { number, chainageM } of stakesAlong(s, total)) {
        const pos = pointAtChainage(s.path, chainageM);
        if (!pos) continue;
        allStakesRef.current.push(
          new maps.Marker({
            position: pos,
            map,
            label: { text: `E-${number}`, color: "#0f172a", fontWeight: "700", fontSize: "11px" },
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#f8fafc",
              fillOpacity: 0.95,
              strokeColor: "#0f172a",
              strokeWeight: 1.5,
            },
            zIndex: 500,
            clickable: false,
          }),
        );
      }
    }
  }, [mapsReady]);

  useEffect(() => {
    const maps = getGoogleMaps();
    const map = mapRef.current;
    if (!maps || !map || !geo.position) return;
    if (!userMarkerRef.current) {
      userMarkerRef.current = new maps.Marker({
        position: geo.position,
        map,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#22d3ee",
          fillOpacity: 1,
          strokeColor: "#0f172a",
          strokeWeight: 2,
        },
        zIndex: 1000,
      });
      map.panTo(geo.position);
    } else {
      userMarkerRef.current.setPosition(geo.position);
    }
    if (geo.accuracy) {
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = new maps.Circle({
          center: geo.position,
          radius: geo.accuracy,
          map,
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

  useEffect(() => {
    const maps = getGoogleMaps();
    const map = mapRef.current;
    if (!maps || !map) return;
    highlightRef.current?.setMap(null);
    highlightRef.current = null;
    stakeMarkerRef.current?.setMap(null);
    stakeMarkerRef.current = null;
    if (!match) return;
    highlightRef.current = new maps.Polyline({
      path: match.street.path,
      strokeColor: "#facc15",
      strokeOpacity: 1,
      strokeWeight: 5,
      map,
    });
    stakeMarkerRef.current = new maps.Marker({
      position: match.snapped,
      map,
      label: { text: `E-${match.estaca}`, color: "#0f172a", fontWeight: "800", fontSize: "12px" },
      icon: {
        path: maps.SymbolPath.CIRCLE,
        scale: 14,
        fillColor: "#facc15",
        fillOpacity: 1,
        strokeColor: "#0f172a",
        strokeWeight: 2,
      },
      zIndex: 900,
    });
  }, [match]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-50">
      <header className="px-4 pt-5 pb-4">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
          Retiro São Joaquim · Itaboraí/RJ
        </div>
        {match ? (
          <>
            <h1 className="mt-2 text-3xl font-black leading-tight text-white">{match.street.name}</h1>
            <div className="mt-3 flex items-end gap-3">
              <div className="text-6xl font-black tabular-nums text-yellow-300 leading-none">
                E-{match.estaca}
              </div>
              <div className="pb-1 text-sm text-slate-300 tabular-nums">
                {match.offset >= 0 ? "+" : ""}
                {match.offset.toFixed(1)} m
                <div className="text-xs text-slate-500">{match.distance.toFixed(1)} m do eixo</div>
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
            <p className="text-sm text-slate-500">Permita o acesso à localização para começar.</p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-2xl font-bold text-slate-300">Fora do projeto</h1>
            <p className="text-sm text-slate-500">
              Nenhuma rua do bairro a menos de 60 m da sua posição.
            </p>
          </>
        )}
      </header>

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
          <div className="pointer-events-auto rounded-full bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 backdrop-blur">
            {STREETS.length} ruas · estacas a cada 20 m
          </div>
        </div>
      </div>
    </div>
  );
}
