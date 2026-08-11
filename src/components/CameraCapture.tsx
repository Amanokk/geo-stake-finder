import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings2, X } from "lucide-react";
import { savePhoto, GALLERY_FOLDER } from "@/lib/savePhoto";
import { addExif } from "@/lib/exif";
import { addPhotoLog } from "@/lib/photoLog";
import {
  CameraSettings,
  DEFAULT_CAMERA_SETTINGS,
  SIZE_FACTOR,
  StampSize,
  formatStamp,
  loadCameraSettings,
  saveCameraSettings,
  stampNow,
} from "@/lib/cameraSettings";

export type CameraStamp = {
  estaca: string | null;
  street: string | null;
  lat: number | null;
  lng: number | null;
};


function staticMapUrl(lat: number, lng: number, size = 320) {
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=${size}x${size}&scale=2&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${key}`;
}

/** Relógio isolado: só ele re-renderiza a cada tique, mantendo a prévia fluida. */
const StampClock = memo(function StampClock({ settings }: { settings: CameraSettings }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), settings.showSeconds ? 1000 : 30000);
    return () => clearInterval(t);
  }, [settings.showSeconds]);
  return <>{formatStamp(stampNow(settings, now), settings)}</>;
});

export function CameraCapture({ stamp, onClose }: { stamp: CameraStamp; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mapImgRef = useRef<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [fileName, setFileName] = useState("foto");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [settings, setSettings] = useState<CameraSettings>(DEFAULT_CAMERA_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => setSettings(loadCameraSettings()), []);
  const update = (patch: Partial<CameraSettings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveCameraSettings(next);
      return next;
    });
  const mapUrl =
    stamp.lat !== null && stamp.lng !== null ? staticMapUrl(stamp.lat, stamp.lng) : null;

  const [angle, setAngle] = useState(0);
  const [landscape, setLandscape] = useState(false);

  // Rotatividade automática de layout: acompanha a orientação da tela.
  useEffect(() => {
    const read = () => {
      const so = window.screen?.orientation;
      const a = typeof so?.angle === "number" ? so.angle : ((window as unknown as { orientation?: number }).orientation ?? 0);
      setAngle(((a % 360) + 360) % 360);
      setLandscape(window.innerWidth > window.innerHeight);
    };
    read();
    window.addEventListener("resize", read);
    window.screen?.orientation?.addEventListener?.("change", read);
    return () => {
      window.removeEventListener("resize", read);
      window.screen?.orientation?.removeEventListener?.("change", read);
    };
  }, []);



  // Miniatura do mapa carregada com CORS para poder ser desenhada no canvas.
  useEffect(() => {
    if (!mapUrl) {
      mapImgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      mapImgRef.current = img;
    };
    img.src = mapUrl;
  }, [mapUrl]);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível abrir a câmera.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const lines = useMemo(
    () =>
      settings.showAddress
        ? [stamp.street ?? "Retiro São Joaquim", "Retiro São Joaquim", "Itaboraí", "Rio de Janeiro"]
        : [],
    [settings.showAddress, stamp.street],
  );
  const coords = useMemo(
    () =>
      settings.showCoords && stamp.lat !== null && stamp.lng !== null
        ? `${stamp.lat.toFixed(6)}, ${stamp.lng.toFixed(6)}`
        : null,
    [settings.showCoords, stamp.lat, stamp.lng],
  );
  const alpha = Math.min(1, Math.max(0, settings.opacity ?? 0.75));

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const portrait = vh > vw;
    // A foto sai sempre deitada (paisagem), independentemente de como o
    // celular estiver: giramos o quadro conforme a orientação da tela.
    // Com a tela em pé o topo da foto é o lado direito da tela → giro anti-horário.
    const clockwise = angle === 180;

    const fullW = portrait ? vh : vw;
    const fullH = portrait ? vw : vh;
    // Recorte central em 16:9 (formato paisagem padrão)
    const target = 16 / 9;
    let w = fullW;
    let h = fullH;
    if (fullW / fullH > target) w = Math.round(fullH * target);
    else h = Math.round(fullW / target);
    const dx = Math.round((fullW - w) / 2);
    const dy = Math.round((fullH - h) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.translate(-dx, -dy);
    if (portrait) {
      if (clockwise) {
        ctx.translate(fullW, 0);
        ctx.rotate(Math.PI / 2);
      } else {
        ctx.translate(0, fullH);
        ctx.rotate(-Math.PI / 2);
      }
    } else if (angle === 180) {
      ctx.translate(fullW, fullH);
      ctx.rotate(Math.PI);
    }
    ctx.drawImage(video, 0, 0, vw, vh);
    ctx.restore();

    const s = (w / 1600) * SIZE_FACTOR[settings.size]; // escala de referência

    const date = stampNow(settings);

    // Etiqueta da estaca (canto superior esquerdo)
    {
      const text = stamp.estaca ?? "Sem estaca";
      ctx.font = `800 ${Math.round(56 * s)}px system-ui, sans-serif`;
      const tw = ctx.measureText(text).width;
      const padX = 24 * s;
      const padY = 16 * s;
      const boxH = Math.round(76 * s);
      ctx.fillStyle = `rgba(15,23,42,${alpha})`;
      ctx.fillRect(24 * s, 24 * s, tw + padX * 2, boxH);
      ctx.fillStyle = "#facc15";
      ctx.textBaseline = "top";
      ctx.fillText(text, 24 * s + padX, 24 * s + padY);
    }

    // Bloco de data/endereço (canto inferior direito)
    const stampLines = [formatStamp(date, settings), ...lines, ...(coords ? [coords] : [])];
    const fs = Math.round(40 * s);
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    const maxW = Math.max(...stampLines.map((l) => ctx.measureText(l).width));
    const lineH = fs * 1.25;
    const padX2 = 24 * s;
    const padY2 = 18 * s;
    const boxW = maxW + padX2 * 2;
    const boxH2 = stampLines.length * lineH + padY2 * 2;
    const bx = w - boxW;
    const by = h - boxH2;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(bx, by, boxW, boxH2);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.textAlign = "right";
    stampLines.forEach((l, i) => {
      ctx.fillText(l, bx + boxW - padX2, by + padY2 + i * lineH);
    });
    ctx.textAlign = "left";

    // Miniatura do mapa (canto inferior, lado configurável)
    const mapImg = mapImgRef.current;
    if (mapImg && settings.showMap) {
      const mapS = boxH2;
      const mx = settings.mapSide === "direita" ? w - mapS : 0;
      const my = h - mapS;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.drawImage(mapImg, mx, my, mapS, mapS);
      ctx.restore();
    }

    setShot(
      addExif(canvas.toDataURL("image/jpeg", 0.92), {
        lat: stamp.lat,
        lng: stamp.lng,
        estaca: stamp.estaca,
        street: stamp.street,
        date,
      }),
    );

    const p = (n: number) => String(n).padStart(2, "0");
    setFileName(
      `${stamp.estaca ?? "foto"}-${p(date.getDate())}${p(date.getMonth() + 1)}${date.getFullYear()}-${p(date.getHours())}${p(date.getMinutes())}`,
    );
  }, [angle, coords, lines, settings, stamp.estaca, stamp.lat, stamp.lng, stamp.street]);


  const save = async () => {
    if (!shot || saving) return;
    setSaving(true);
    const res = await savePhoto(shot, fileName);
    if (res.ok) {
      addPhotoLog({
        file: `${fileName}.jpg`,
        timestamp: new Date().toISOString(),
        lat: stamp.lat,
        lng: stamp.lng,
        street: stamp.street,
        estaca: stamp.estaca,
      });
    }
    setSaving(false);
    setStatus(res.message);
  };


  return (
    <div className="fixed inset-0 z-50 bg-black">
      {shot ? (
        <img src={shot} alt="Foto capturada com carimbo de estaca e data" className="h-full w-full object-contain" />
      ) : (
        <>
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          {/* Layout rotativo automático: com o celular em pé os carimbos
              aparecem deitados; ao girar para paisagem eles ficam de pé,
              sempre na mesma posição em que saem na foto (horizontal). */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 origin-center transition-transform duration-200"
            style={{
              width: landscape ? "100dvw" : "100dvh",
              height: landscape ? "100dvh" : "100dvw",
              transform: `translate(-50%, -50%) rotate(${landscape ? 0 : 90}deg)`,
            }}
          >

            <div
              className="absolute left-3 top-3 rounded bg-slate-900/85 px-3 py-1.5 font-black text-yellow-300"
              style={{ fontSize: `${1.25 * SIZE_FACTOR[settings.size]}rem` }}
            >
              {stamp.estaca ?? "Sem estaca"}
            </div>
            {mapUrl && settings.showMap && (
              <img
                src={mapUrl}
                alt="Mini mapa da localização atual"
                className={`absolute bottom-0 object-cover opacity-90 ${settings.mapSide === "direita" ? "right-0" : "left-0"}`}
                style={{ height: `${6 * SIZE_FACTOR[settings.size]}rem`, width: `${6 * SIZE_FACTOR[settings.size]}rem` }}
              />
            )}
            <div
              className="absolute bottom-0 right-0 bg-black/70 px-3 py-2 text-right font-semibold leading-snug text-white"
              style={{ fontSize: `${0.75 * SIZE_FACTOR[settings.size]}rem` }}
            >
              <div>{formatStamp(stampNow(settings, now), settings)}</div>
              {lines.map((l) => (
                <div key={l}>{l}</div>
              ))}
              {coords && <div>{coords}</div>}
            </div>
            {!landscape && (
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[11px] font-semibold text-white/60">
                Vire o celular de lado
              </div>
            )}

          </div>


        </>

      )}

      {/* Área fixa (sempre de pé) mostrando a estaca que será carimbada na foto */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
        <div className="flex items-center gap-2 rounded-full bg-slate-900/85 px-4 py-2 backdrop-blur">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
            Estaca na foto
          </span>
          <span
            className={`text-base font-black ${stamp.estaca ? "text-yellow-300" : "text-red-300"}`}
          >
            {stamp.estaca ?? "Sem estaca"}
          </span>
        </div>
      </div>

      {/* Botão de configurações da câmera */}
      <button
        type="button"
        aria-label="Configurações da câmera"
        onClick={() => setShowSettings((v) => !v)}
        className="absolute right-3 top-3 rounded-full bg-slate-900/85 p-2.5 text-white backdrop-blur"
      >
        <Settings2 className="h-5 w-5" />
      </button>

      {showSettings && (
        <div className="absolute inset-x-3 top-16 max-h-[70dvh] space-y-4 overflow-y-auto rounded-2xl bg-slate-900/95 p-4 text-sm text-white backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Configurações do carimbo</h2>
            <button type="button" aria-label="Fechar configurações" onClick={() => setShowSettings(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hora</p>
            <div className="flex gap-2">
              {[
                { l: "24h", v: true },
                { l: "12h (AM/PM)", v: false },
              ].map((o) => (
                <button
                  key={o.l}
                  type="button"
                  onClick={() => update({ clock24h: o.v })}
                  className={`flex-1 rounded-lg px-3 py-2 font-semibold ${settings.clock24h === o.v ? "bg-yellow-300 text-slate-900" : "bg-slate-800"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <label className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2">
              <span>Mostrar segundos</span>
              <input
                type="checkbox"
                checked={settings.showSeconds}
                onChange={(e) => update({ showSeconds: e.target.checked })}
                className="h-4 w-4 accent-yellow-300"
              />
            </label>
            <label className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2">
              <span>Mostrar data</span>
              <input
                type="checkbox"
                checked={settings.showDate}
                onChange={(e) => update({ showDate: e.target.checked })}
                className="h-4 w-4 accent-yellow-300"
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-2">
              <span>Ajuste de hora (min)</span>
              <input
                type="number"
                value={settings.timeOffsetMin}
                onChange={(e) => update({ timeOffsetMin: Number(e.target.value) || 0 })}
                className="w-20 rounded bg-slate-700 px-2 py-1 text-right"
              />
            </label>
            <p className="text-[11px] text-slate-400">
              Prévia: {formatStamp(stampNow(settings, now), settings)}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tamanho</p>
            <div className="flex gap-2">
              {(["pequeno", "medio", "grande"] as StampSize[]).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => update({ size: sz })}
                  className={`flex-1 rounded-lg px-3 py-2 font-semibold capitalize ${settings.size === sz ? "bg-yellow-300 text-slate-900" : "bg-slate-800"}`}
                >
                  {sz === "medio" ? "médio" : sz}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Layout</p>
            <label className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2">
              <span>Mostrar mini mapa</span>
              <input
                type="checkbox"
                checked={settings.showMap}
                onChange={(e) => update({ showMap: e.target.checked })}
                className="h-4 w-4 accent-yellow-300"
              />
            </label>
            <div className="flex gap-2">
              {(["esquerda", "direita"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => update({ mapSide: side })}
                  className={`flex-1 rounded-lg px-3 py-2 font-semibold capitalize ${settings.mapSide === side ? "bg-yellow-300 text-slate-900" : "bg-slate-800"}`}
                >
                  Mapa à {side}
                </button>
              ))}
            </div>
            <label className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2">
              <span>Mostrar endereço</span>
              <input
                type="checkbox"
                checked={settings.showAddress}
                onChange={(e) => update({ showAddress: e.target.checked })}
                className="h-4 w-4 accent-yellow-300"
              />
            </label>
            <label className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2">
              <span>Mostrar coordenadas</span>
              <input
                type="checkbox"
                checked={settings.showCoords}
                onChange={(e) => update({ showCoords: e.target.checked })}
                className="h-4 w-4 accent-yellow-300"
              />
            </label>
          </div>
        </div>
      )}



      {error && (
        <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-xl bg-slate-900 p-4 text-center text-sm text-red-300">
          {error}
        </div>
      )}

      {shot && (
        <div className="absolute inset-x-0 bottom-24 space-y-1 px-5">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            Nome do arquivo · pasta {GALLERY_FOLDER}
          </label>
          <div className="flex items-center gap-2 rounded-xl bg-slate-900/85 px-3 py-2 backdrop-blur">
            <input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
              placeholder="nome-da-foto"
            />
            <span className="text-sm text-slate-400">.jpg</span>
          </div>
          {status && <p className="text-[11px] text-yellow-300">{status}</p>}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-5">
        <button
          type="button"
          onClick={
            shot
              ? () => {
                  setShot(null);
                  setStatus(null);
                }
              : onClose
          }
          className="rounded-full bg-slate-800/90 px-4 py-2 text-sm font-semibold text-white"
        >
          {shot ? "Repetir" : "Fechar"}
        </button>
        {shot ? (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-yellow-300 px-6 py-2 text-sm font-bold text-slate-900 disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar na galeria"}
          </button>
        ) : (
          <button
            type="button"
            aria-label="Tirar foto"
            onClick={capture}
            className="h-16 w-16 rounded-full border-4 border-white bg-white/30"
          />
        )}
        <div className="w-16" />
      </div>

    </div>
  );
}
