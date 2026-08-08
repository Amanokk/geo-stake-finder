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

    setShotAt(date);
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
  }, [angle, coords, lines, stamp.estaca]);


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

            {stamp.estaca && (
              <div className="absolute left-3 top-3 rounded bg-slate-900/85 px-3 py-1.5 text-xl font-black text-yellow-300">
                {stamp.estaca}
              </div>
            )}
            {mapUrl && (
              <img
                src={mapUrl}
                alt="Mini mapa da localização atual"
                className="absolute bottom-0 left-0 h-24 w-24 object-cover opacity-90"
              />
            )}
            <div className="absolute bottom-0 right-0 bg-black/70 px-3 py-2 text-right text-xs font-semibold leading-snug text-white">
              <div>{formatDate(now)}</div>
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
