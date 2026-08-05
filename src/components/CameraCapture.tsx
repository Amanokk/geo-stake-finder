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
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    const s = w / 1600; // escala de referência
    const date = new Date();

    // Faixa horizontal no rodapé: mapa + data/endereço + estaca
    const margin = 20 * s;
    const barH = 200 * s;
    const bx = margin;
    const by = h - barH - margin;
    const barW = w - margin * 2;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(bx, by, barW, barH);

    const pad = 18 * s;
    const mapSize = barH - pad * 2;
    let cursorX = bx + pad;
    const mapImg = mapImgRef.current;
    if (mapImg) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cursorX, by + pad, mapSize, mapSize);
      ctx.clip();
      ctx.drawImage(mapImg, cursorX, by + pad, mapSize, mapSize);
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2 * s;
      ctx.strokeRect(cursorX, by + pad, mapSize, mapSize);
      cursorX += mapSize + pad;
    }

    // Estaca à direita da faixa
    ctx.textBaseline = "middle";
    let rightLimit = bx + barW - pad;
    if (stamp.estaca) {
      ctx.font = `900 ${Math.round(64 * s)}px system-ui, sans-serif`;
      const tw = ctx.measureText(stamp.estaca).width;
      ctx.fillStyle = "#facc15";
      ctx.textAlign = "right";
      ctx.fillText(stamp.estaca, rightLimit, by + barH / 2);
      rightLimit -= tw + pad * 2;
    }

    // Bloco de texto horizontalizado
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    const dateFs = Math.round(46 * s);
    const infoFs = Math.round(34 * s);
    const address = [stamp.street, "Retiro São Joaquim", "Itaboraí", "Rio de Janeiro"]
      .filter(Boolean)
      .join(" · ");
    const textTop = by + pad;
    ctx.textBaseline = "top";
    ctx.font = `800 ${dateFs}px system-ui, sans-serif`;
    ctx.fillText(formatDate(date), cursorX, textTop);
    ctx.font = `600 ${infoFs}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(address, cursorX, textTop + dateFs * 1.35);
    if (coords) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(coords, cursorX, textTop + dateFs * 1.35 + infoFs * 1.4);
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";


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
          {/* Prévia dos carimbos */}
          {stamp.estaca && (
            <div className="absolute left-3 top-3 rounded bg-slate-900/85 px-3 py-1.5 text-xl font-black text-yellow-300">
              {stamp.estaca}
            </div>
          )}
          <div className="absolute bottom-24 right-3 rounded bg-black/70 px-3 py-2 text-right text-xs font-semibold leading-snug text-white">
            <div>{formatDate(now)}</div>
            {lines.map((l) => (
              <div key={l}>{l}</div>
            ))}
            {coords && <div>{coords}</div>}
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
