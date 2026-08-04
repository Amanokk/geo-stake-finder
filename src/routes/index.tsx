import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { Splash } from "@/components/Splash";
import { CameraCapture } from "@/components/CameraCapture";
import { useGeolocation } from "@/hooks/useGeolocation";
import { projectOnPolyline, pointAtChainage, haversine, type LatLng } from "@/lib/geo";
import { stakeAtChainage } from "@/lib/stakes";
import { getGeometries } from "@/lib/stakePoints";
import { stakesInRect, getStreetBoxes } from "@/lib/stakeIndex";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { STREETS, type Street } from "@/data/streets";
import {
  getGoogleMaps,
  type GoogleCircleInstance,
  type GoogleMapInstance,
  type GoogleMarkerInstance,
  type GooglePolylineInstance,
} from "@/lib/googleMapsTypes";

const PROJECT_CENTER: LatLng = { lat: -22.7524, lng: -42.8935 };
const LABEL_MIN_ZOOM = 18; // rótulos só bem de perto
const STAKE_MIN_ZOOM = 16; // abaixo disso, nenhum marcador de estaca
const MAX_VISIBLE_STAKES = 90; // teto duro para não travar em celular

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
        content: "App de campo que mostra no mapa, pelo GPS, a rua e a estaca correta do projeto viário do bairro Retiro São Joaquim (Itaboraí/RJ).",
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

const DEG = 1 / 111320; // ~1 m em graus

function findNearestStake(pos: LatLng, maxDist = 60): Match | null {
  const geoms = getGeometries();
  const pad = maxDist * DEG * 1.5;
  let best: Match | null = null;
  for (const box of getStreetBoxes()) {
    // Descarta ruas fora da caixa envolvente antes de projetar ponto a ponto.
    if (
      pos.lat < box.south - pad ||
      pos.lat > box.north + pad ||
      pos.lng < box.west - pad ||
      pos.lng > box.east + pad
    )
      continue;
    const { street, length } = geoms[box.index];
    const r = projectOnPolyline(pos, street.path);
    if (!r || r.distance > maxDist) continue;
    if (best !== null && r.distance >= best.distance) continue;
    const { number, offset } = stakeAtChainage(street, r.chainage, length);
    const snapped = pointAtChainage(street.path, r.chainage) ?? pos;
    best = { street, chainage: r.chainage, distance: r.distance, estaca: number, offset, snapped };
  }
  return best;
}

// Arredonda a posição para ~0.5 m: evita recalcular tudo a cada micro-jitter do GPS.
function quantize(p: LatLng): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

function Index() {
  const mapsReady = useGoogleMaps();
  const geo = useGeolocation(true);
  const online = useOnlineStatus();
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const userMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const accuracyCircleRef = useRef<GoogleCircleInstance | null>(null);
  const streetLinesRef = useRef<GooglePolylineInstance[]>([]);
  const highlightRef = useRef<GooglePolylineInstance | null>(null);
  const stakeMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const poolRef = useRef<GoogleMarkerInstance[]>([]);
  const followRef = useRef(true);
  const lastCenterRef = useRef<LatLng | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);


  const posKey = geo.position ? quantize(geo.position) : null;
  const match = useMemo(
    () => (geo.position ? findNearestStake(geo.position) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posKey],
  );

  // Mapa
  useEffect(() => {
    const maps = getGoogleMaps();
    if (!mapsReady || !maps || !mapDivRef.current || mapRef.current) return;
    const map = new maps.Map(mapDivRef.current, {
      center: PROJECT_CENTER,
      zoom: 17,
      mapTypeId: "hybrid",
      disableDefaultUI: true,
      zoomControl: true,
      tilt: 0,
      clickableIcons: false,
      gestureHandling: "greedy",
    });
    mapRef.current = map;
    map.addListener("dragstart", () => {
      followRef.current = false;
    });
  }, [mapsReady]);

  // Eixos das ruas (desenhados uma única vez).
  useEffect(() => {
    const maps = getGoogleMaps();
    const map = mapRef.current;
    if (!maps || !map || streetLinesRef.current.length) return;
    for (const s of STREETS) {
      streetLinesRef.current.push(
        new maps.Polyline({
          path: s.path,
          strokeColor: "#38bdf8",
          strokeOpacity: 0.85,
          strokeWeight: 3,
          clickable: false,
          map,
        }),
      );
    }
  }, [mapsReady]);

  // Estacas: pool de marcadores reaproveitado, só o que está na viewport.
  useEffect(() => {
    const maps = getGoogleMaps();
    const map = mapRef.current;
    if (!maps || !map) return;

    const render = () => {
      const bounds = map.getBounds();
      const zoom = map.getZoom() ?? 0;
      const pool = poolRef.current;
      if (!bounds || zoom < STAKE_MIN_ZOOM) {
        pool.forEach((m) => m.setVisible(false));
        return;
      }
      const showLabel = zoom >= LABEL_MIN_ZOOM;
      // Busca só nas células da grade que cobrem a viewport (em vez de varrer ~1000 estacas).
      const visible = stakesInRect(bounds.toJSON(), MAX_VISIBLE_STAKES);
      for (let i = 0; i < visible.length; i++) {
        const st = visible[i];
        let m = pool[i];
        if (!m) {
          m = new maps.Marker({
            position: st.pos,
            map,
            optimized: true,
            clickable: false,
            zIndex: 500,
          });
          pool.push(m);
        }
        m.setOptions({
          position: st.pos,
          visible: true,
          label: showLabel
            ? { text: `E-${st.number}`, color: "#0f172a", fontWeight: "700", fontSize: "11px" }
            : null,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: showLabel ? 10 : 4,
            fillColor: "#f8fafc",
            fillOpacity: 0.95,
            strokeColor: "#0f172a",
            strokeWeight: 1.5,
          },
        });
      }
      for (let i = visible.length; i < pool.length; i++) pool[i].setVisible(false);
    };

    const listener = map.addListener("idle", render);
    render();
    return () => listener.remove();
  }, [mapsReady]);

  // Posição do usuário
  useEffect(() => {
    const maps = getGoogleMaps();
    const map = mapRef.current;
    if (!maps || !map || !geo.position) return;
    if (!userMarkerRef.current) {
      userMarkerRef.current = new maps.Marker({
        position: geo.position,
        map,
        clickable: false,
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
      map.setCenter(geo.position);
      lastCenterRef.current = geo.position;
    } else {
      userMarkerRef.current.setPosition(geo.position);
      // recentraliza só quando o usuário andou de verdade (evita animações constantes)
      const last = lastCenterRef.current;
      if (followRef.current && (!last || haversine(last, geo.position) > 8)) {
        map.panTo(geo.position);
        lastCenterRef.current = geo.position;
      }
    }
    if (geo.accuracy) {
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = new maps.Circle({
          center: geo.position,
          radius: geo.accuracy,
          map,
          clickable: false,
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

  // Destaque da rua/estaca atual
  useEffect(() => {
    const maps = getGoogleMaps();
    const map = mapRef.current;
    if (!maps || !map) return;
    if (!match) {
      highlightRef.current?.setMap(null);
      highlightRef.current = null;
      stakeMarkerRef.current?.setMap(null);
      stakeMarkerRef.current = null;
      return;
    }
    if (!highlightRef.current) {
      highlightRef.current = new maps.Polyline({
        path: match.street.path,
        strokeColor: "#facc15",
        strokeOpacity: 1,
        strokeWeight: 5,
        clickable: false,
        map,
      });
    } else {
      highlightRef.current.setPath(match.street.path);
      highlightRef.current.setMap(map);
    }
    if (!stakeMarkerRef.current) {
      stakeMarkerRef.current = new maps.Marker({
        position: match.snapped,
        map,
        clickable: false,
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
    }
    stakeMarkerRef.current.setOptions({
      position: match.snapped,
      map,
      visible: true,
      label: { text: `E-${match.estaca}`, color: "#0f172a", fontWeight: "800", fontSize: "12px" },
    });
  }, [match]);

  const recenter = () => {
    followRef.current = true;
    if (geo.position) mapRef.current?.panTo(geo.position);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-50">
      <Splash />
      <header className="px-4 pt-5 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
            Retiro São Joaquim · Itaboraí/RJ
          </div>
          <div className="flex items-center gap-2">
            {!online && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                Offline
              </span>
            )}
            <div className="text-[11px] font-semibold text-yellow-300/90">By Vitor Lucas</div>
          </div>
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-3">
          <div className="pointer-events-auto rounded-full bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 backdrop-blur">
            GPS ±{geo.accuracy ? geo.accuracy.toFixed(0) : "--"} m
          </div>
          <button
            type="button"
            onClick={recenter}
            className="pointer-events-auto rounded-full bg-yellow-300 px-4 py-1.5 text-xs font-bold text-slate-900"
          >
            Centralizar
          </button>
        </div>
      </div>
    </div>
  );
}
