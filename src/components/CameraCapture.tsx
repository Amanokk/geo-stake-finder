import { useCallback, useEffect, useRef, useState } from "react";
import { savePhoto, GALLERY_FOLDER } from "@/lib/savePhoto";

export type CameraStamp = {
  estaca: string | null;
  street: string | null;
  lat: number | null;
  lng: number | null;
};

function formatDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function staticMapUrl(lat: number, lng: number, size = 320) {
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=${size}x${size}&scale=2&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${key}`;
}

export function CameraCapture({ stamp, onClose }: { stamp: CameraStamp; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mapImgRef = useRef<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [fileName, setFileName] = useState("foto");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const mapUrl =
    stamp.lat !== null && stamp.lng !== null ? staticMapUrl(stamp.lat, stamp.lng) : null;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
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

  const lines = [
    stamp.street ?? "Retiro São Joaquim",
    "Retiro São Joaquim",
    "Itaboraí",
    "Rio de Janeiro",
  ];
  const coords =
    stamp.lat !== null && stamp.lng !== null
      ? `${stamp.lat.toFixed(6)}, ${stamp.lng.toFixed(6)}`
      : null;

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const portrait = vh > vw;
    // A foto sai sempre deitada (paisagem), como no exemplo.
    const w = portrait ? vh : vw;
    const h = portrait ? vw : vh;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (portrait) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(video, 0, 0, vw, vh);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0, w, h);
    }

    const s = w / 1600; // escala de referência
    const date = new Date();

    // Etiqueta da estaca (canto superior esquerdo)
    if (stamp.estaca) {
      const text = stamp.estaca;
      ctx.font = `800 ${Math.round(56 * s)}px system-ui, sans-serif`;
      const tw = ctx.measureText(text).width;
      const padX = 24 * s;
      const padY = 16 * s;
      const boxH = Math.round(76 * s);
      ctx.fillStyle = "rgba(15,23,42,0.85)";
      ctx.fillRect(24 * s, 24 * s, tw + padX * 2, boxH);
      ctx.fillStyle = "#facc15";
      ctx.textBaseline = "top";
      ctx.fillText(text, 24 * s + padX, 24 * s + padY);
    }

    // Bloco de data/endereço (canto inferior direito)
    const stampLines = [formatDate(date), ...lines, ...(coords ? [coords] : [])];
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
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(bx, by, boxW, boxH2);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.textAlign = "right";
    stampLines.forEach((l, i) => {
      ctx.fillText(l, bx + boxW - padX2, by + padY2 + i * lineH);
    });
    ctx.textAlign = "left";

    // Miniatura do mapa (canto inferior esquerdo), como no exemplo
    const mapImg = mapImgRef.current;
    if (mapImg) {
      const mapS = boxH2;
      const mx = 0;
      const my = h - mapS;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.drawImage(mapImg, mx, my, mapS, mapS);
      ctx.restore();
    }

    setShot(canvas.toDataURL("image/jpeg", 0.92));
    const p = (n: number) => String(n).padStart(2, "0");
    setFileName(
      `${stamp.estaca ?? "foto"}-${p(date.getDate())}${p(date.getMonth() + 1)}${date.getFullYear()}-${p(date.getHours())}${p(date.getMinutes())}`,
    );
  }, [coords, lines, stamp.estaca]);


  const save = async () => {
    if (!shot || saving) return;
    setSaving(true);
    const res = await savePhoto(shot, fileName);
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
          {/* Prévia do carimbo horizontal */}
          <div className="absolute inset-x-3 bottom-24 flex items-center gap-3 rounded-lg bg-black/70 p-2 text-white">
            {mapUrl && (
              <img
                src={mapUrl}
                alt="Mini mapa da localização atual"
                className="h-16 w-16 shrink-0 rounded border border-white/30 object-cover"
              />
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-extrabold">{formatDate(now)}</div>
              <div className="truncate text-[11px] font-semibold text-white/90">
                {lines.join(" · ")}
              </div>
              {coords && <div className="truncate text-[10px] text-white/75">{coords}</div>}
            </div>
            {stamp.estaca && (
              <div className="shrink-0 text-xl font-black text-yellow-300">{stamp.estaca}</div>
            )}
          </div>
        </>

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
