import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { loadStreets, saveStreets, resetStreets, exportJson } from "@/lib/streetsStore";
import type { Street } from "@/data/defaultStreets";
import { PROJECT_CENTER } from "@/data/defaultStreets";
import type { LatLng } from "@/lib/geo";
import { polylineLength } from "@/lib/geo";

export const Route = createFileRoute("/calibrar")({
  head: () => ({
    meta: [
      { title: "Calibrar ruas — Estaca GPS" },
      { name: "description", content: "Trace os eixos das ruas do projeto no mapa." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CalibrarPage,
});

function CalibrarPage() {
  const mapsReady = useGoogleMaps();
  const [streets, setStreets] = useState<Street[]>(() => loadStreets());
  const [activeId, setActiveId] = useState<string>(streets[0]?.id ?? "");
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const activePolyRef = useRef<google.maps.Polyline | null>(null);
  const activeMarkersRef = useRef<google.maps.Marker[]>([]);
  const otherLinesRef = useRef<google.maps.Polyline[]>([]);
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");

  const active = useMemo(
    () => streets.find((s) => s.id === activeId) ?? null,
    [streets, activeId],
  );

  const persist = (next: Street[]) => {
    setStreets(next);
    saveStreets(next);
  };

  const updateActive = (patch: Partial<Street>) => {
    if (!active) return;
    persist(streets.map((s) => (s.id === active.id ? { ...s, ...patch } : s)));
  };

  // Init map
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

  // Map click → append point to active street
  useEffect(() => {
    if (!mapRef.current) return;
    if (clickListenerRef.current) clickListenerRef.current.remove();
    clickListenerRef.current = mapRef.current.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng || !active) return;
      const pt: LatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      updateActive({ polyline: [...active.polyline, pt] });
    });
    return () => {
      if (clickListenerRef.current) clickListenerRef.current.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, streets]);

  // Draw other (non-active) streets faintly
  useEffect(() => {
    if (!mapRef.current) return;
    otherLinesRef.current.forEach((l) => l.setMap(null));
    otherLinesRef.current = [];
    for (const s of streets) {
      if (s.id === activeId) continue;
      if (s.polyline.length < 2) continue;
      const line = new google.maps.Polyline({
        path: s.polyline,
        strokeColor: "#64748b",
        strokeOpacity: 0.7,
        strokeWeight: 2,
        map: mapRef.current,
      });
      otherLinesRef.current.push(line);
    }
  }, [streets, activeId, mapsReady]);

  // Draw active street polyline + vertex markers
  useEffect(() => {
    if (!mapRef.current) return;
    if (activePolyRef.current) {
      activePolyRef.current.setMap(null);
      activePolyRef.current = null;
    }
    activeMarkersRef.current.forEach((m) => m.setMap(null));
    activeMarkersRef.current = [];
    if (!active) return;
    if (active.polyline.length >= 2) {
      activePolyRef.current = new google.maps.Polyline({
        path: active.polyline,
        strokeColor: "#facc15",
        strokeOpacity: 1,
        strokeWeight: 4,
        map: mapRef.current,
      });
    }
    active.polyline.forEach((p, i) => {
      const isStart = active.reversed ? i === active.polyline.length - 1 : i === 0;
      activeMarkersRef.current.push(
        new google.maps.Marker({
          position: p,
          map: mapRef.current!,
          label: isStart
            ? { text: "0", color: "#0f172a", fontWeight: "800" }
            : undefined,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: isStart ? 9 : 5,
            fillColor: isStart ? "#facc15" : "#f8fafc",
            fillOpacity: 1,
            strokeColor: "#0f172a",
            strokeWeight: 2,
          },
        }),
      );
    });
  }, [active, mapsReady]);

  const activeLen = active ? polylineLength(active.polyline) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-50">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
        <Link
          to="/"
          className="rounded-full bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
        >
          ← Voltar
        </Link>
        <h1 className="text-base font-bold">Calibrar ruas</h1>
      </header>

      <div className="grid grid-cols-1 gap-3 px-4 py-3">
        <label className="text-xs uppercase tracking-wider text-slate-400">
          Rua ativa
        </label>
        <select
          value={activeId}
          onChange={(e) => setActiveId(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        >
          {streets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.polyline.length >= 2 ? "✓ " : "○ "}
              {s.name}
            </option>
          ))}
        </select>

        {active && (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <label className="col-span-1">
              <span className="block text-[11px] text-slate-400">Estaca inicial</span>
              <input
                type="number"
                value={active.startStake}
                onChange={(e) =>
                  updateActive({ startStake: Number(e.target.value) || 0 })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5"
              />
            </label>
            <label className="col-span-1">
              <span className="block text-[11px] text-slate-400">Passo (m)</span>
              <input
                type="number"
                min={1}
                step="0.5"
                value={active.spacing}
                onChange={(e) =>
                  updateActive({ spacing: Number(e.target.value) || 20 })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5"
              />
            </label>
            <label className="col-span-1 flex items-end gap-2">
              <input
                type="checkbox"
                checked={active.reversed}
                onChange={(e) => updateActive({ reversed: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-xs text-slate-300">Inverter (E0 na outra ponta)</span>
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-xs">
          <button
            onClick={() => active && updateActive({ polyline: active.polyline.slice(0, -1) })}
            className="rounded bg-slate-800 px-3 py-1.5"
          >
            Desfazer último ponto
          </button>
          <button
            onClick={() => active && updateActive({ polyline: [] })}
            className="rounded bg-slate-800 px-3 py-1.5"
          >
            Limpar rua
          </button>
          <span className="ml-auto self-center text-slate-400">
            {active?.polyline.length ?? 0} pontos · {activeLen.toFixed(0)} m ·{" "}
            {active ? Math.floor(activeLen / active.spacing) + 1 : 0} estacas
          </span>
        </div>
      </div>

      <div className="relative flex-1 min-h-[360px]">
        <div ref={mapDivRef} className="absolute inset-0" />
        {!mapsReady && (
          <div className="absolute inset-0 grid place-items-center bg-slate-900 text-sm text-slate-400">
            Carregando mapa…
          </div>
        )}
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 backdrop-blur">
          Toque no mapa para adicionar pontos ao eixo
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-800 px-4 py-3 text-xs">
        <button
          onClick={() => {
            setJsonText(exportJson(streets));
            setShowJson(true);
          }}
          className="rounded bg-slate-800 px-3 py-1.5"
        >
          Exportar JSON
        </button>
        <button
          onClick={() => {
            setJsonText("");
            setShowJson(true);
          }}
          className="rounded bg-slate-800 px-3 py-1.5"
        >
          Importar JSON
        </button>
        <button
          onClick={() => {
            if (confirm("Reset a todas as ruas para o padrão?")) {
              resetStreets();
              setStreets(loadStreets());
            }
          }}
          className="ml-auto rounded bg-red-900/50 px-3 py-1.5 text-red-200"
        >
          Reset tudo
        </button>
      </div>

      {showJson && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg bg-slate-900 p-3">
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="h-72 w-full resize-none rounded bg-slate-950 p-2 font-mono text-xs text-slate-200"
              placeholder="Cole aqui um JSON exportado…"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => setShowJson(false)}
                className="rounded bg-slate-800 px-3 py-1.5 text-xs"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  try {
                    const parsed = JSON.parse(jsonText) as Street[];
                    if (!Array.isArray(parsed)) throw new Error("JSON inválido");
                    persist(parsed);
                    setShowJson(false);
                  } catch (err) {
                    alert("JSON inválido: " + (err as Error).message);
                  }
                }}
                className="rounded bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-slate-950"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
