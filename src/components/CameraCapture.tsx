import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings2, Share2, X, ZoomIn, ZoomOut } from "lucide-react";
import { savePhoto, sharePhoto, GALLERY_FOLDER } from "@/lib/savePhoto";
import { addExif } from "@/lib/exif";
import { addPhotoLog } from "@/lib/photoLog";
import { putPhoto } from "@/lib/photoStore";
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
  const [rawShot, setRawShot] = useState<string | null>(null);
  const [fileName, setFileName] = useState("foto");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saved, setSaved] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const boxRef = useRef<{ x: number; y: number; w: number; h: number; fontSize: number } | null>(null);
  const stampDateRef = useRef<Date>(new Date());
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoomVal, setZoomVal] = useState(1);

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

  // Giro do carimbo na prévia, acompanhando a orientação real da tela.
  const layoutRotation = landscape ? (angle === 180 ? 180 : 0) : angle === 180 ? -90 : 90;



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


  const openStream = useCallback(async () => {
    // Pede a resolução máxima do sensor em 4:3. Resoluções fixas menores
    // (ex.: 1920) fazem alguns celulares recortarem o sensor, o que aparece
    // como "zoom" na prévia e perde qualidade. Com ideal alto o navegador
    // escolhe a maior resolução disponível = campo de visão total da lente.
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        aspectRatio: { ideal: 4 / 3 },
        width: { ideal: 4000 },
        height: { ideal: 3000 },
      },
      audio: false,
    });
    streamRef.current = stream;
    return stream;
  }, []);

  // Reanexa o stream ao <video> com força total: alguns celulares congelam a
  // prévia quando o elemento fica invisível, então reatribuímos o srcObject
  // e chamamos play() de novo. Se a trilha morreu, reabrimos a câmera.
  const attachStream = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    let s = streamRef.current;
    if (!s || !s.getVideoTracks().some((t) => t.readyState === "live")) {
      try {
        s = await openStream();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível abrir a câmera.");
        return;
      }
    }
    v.srcObject = null;
    v.srcObject = s;
    v.muted = true;
    try {
      await v.play();
    } catch {
      // Segunda tentativa logo em seguida cobre o caso de autoplay negado.
      setTimeout(() => void v.play().catch(() => undefined), 150);
    }
    // Detecta suporte a zoom óptico/digital da câmera (Android Chrome suporta).
    const track = s.getVideoTracks()[0];
    const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
      zoom?: { min: number; max: number; step: number };
    };
    if (caps.zoom && caps.zoom.max > caps.zoom.min) {
      setZoomRange(caps.zoom);
      // Sempre começa no zoom mínimo (lente toda aberta, sem corte digital).
      setZoomVal(caps.zoom.min);
      void track
        .applyConstraints({ advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet] })
        .catch(() => undefined);
    } else {
      setZoomRange(null);
    }
  }, [openStream]);

  const applyZoom = useCallback(
    (v: number) => {
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || !zoomRange) return;
      const clamped = Math.min(zoomRange.max, Math.max(zoomRange.min, v));
      setZoomVal(clamped);
      void track
        .applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] })
        .catch(() => setZoomRange(null));
    },
    [zoomRange],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await openStream();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        await attachStream();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível abrir a câmera.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [attachStream, openStream]);

  // Ao voltar da foto tirada (Repetir), garante que a prévia volte a rodar.
  useEffect(() => {
    if (!shot) void attachStream();
  }, [shot, attachStream]);



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

    const dateForRaw = stampNow(settings);
    // Cópia original (sem nenhum carimbo), salva junto com a versão carimbada.
    setRawShot(
      addExif(canvas.toDataURL("image/jpeg", 0.92), {
        lat: stamp.lat,
        lng: stamp.lng,
        estaca: stamp.estaca,
        street: stamp.street,
        date: dateForRaw,
      }),
    );


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
      boxRef.current = {
        x: Math.round(24 * s),
        y: Math.round(24 * s),
        w: Math.round(tw + padX * 2),
        h: boxH,
        fontSize: Math.round(56 * s),
      };
    }
    stampDateRef.current = date;

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
      ctx.globalAlpha = Math.max(0.2, alpha + 0.2);
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

    // Nome único por foto: data do carimbo + hora real (com segundos e milissegundos),
    // assim cada captura vira um arquivo novo e o navegador não pergunta de novo.
    const p = (n: number) => String(n).padStart(2, "0");
    const real = new Date();
    setFileName(
      `${stamp.estaca ?? "foto"}-${p(date.getDate())}${p(date.getMonth() + 1)}${date.getFullYear()}-${p(real.getHours())}${p(real.getMinutes())}${p(real.getSeconds())}-${String(real.getMilliseconds()).padStart(3, "0")}`,
    );
  }, [alpha, angle, coords, lines, settings, stamp.estaca, stamp.lat, stamp.lng, stamp.street]);


  const save = useCallback(async () => {
    if (!shot || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    // Sempre duas imagens: a original (sem layout) e a carimbada.
    const resRaw = rawShot ? await savePhoto(rawShot, `${fileName}-original`) : null;
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
    if (resRaw?.ok) {
      addPhotoLog({
        file: `${fileName}-original.jpg`,
        timestamp: new Date().toISOString(),
        lat: stamp.lat,
        lng: stamp.lng,
        street: stamp.street,
        estaca: stamp.estaca,
      });
    }
    // Guarda a foto na tela de Fotos do app (com mapa, dados e retoque da estaca).
    await putPhoto({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: `${fileName}.jpg`,
      timestamp: new Date().toISOString(),
      stampDate: stampDateRef.current.toISOString(),
      lat: stamp.lat,
      lng: stamp.lng,
      street: stamp.street,
      estaca: stamp.estaca,
      stamped: shot,
      raw: rawShot,
      box: boxRef.current,
    });
    savingRef.current = false;
    setSaving(false);
    setSaved(res.ok);
    setStatus(
      res.ok && resRaw?.ok
        ? `Salvas 2 imagens: ${fileName}.jpg (com layout) e ${fileName}-original.jpg`
        : res.message,
    );
  }, [fileName, rawShot, shot, stamp.estaca, stamp.lat, stamp.lng, stamp.street]);

  // Salvamento automático na galeria assim que a foto é tirada.
  useEffect(() => {
    if (shot && !saved && !savingRef.current) void save();
  }, [save, saved, shot]);

  const sendWhatsApp = async () => {
    if (!shot || sharing) return;
    setSharing(true);
    const legenda = [stamp.estaca ? `Estaca ${stamp.estaca}` : null, stamp.street, formatStamp(stampNow(settings), settings)]
      .filter(Boolean)
      .join(" · ");
    const res = await sharePhoto(shot, fileName, legenda);
    setSharing(false);
    setStatus(res.message);
  };



  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* O vídeo nunca é desmontado: ao repetir a foto a prévia volta na hora
          (antes a tela ficava preta porque o elemento era recriado sem o stream). */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="h-full w-full object-contain"
        style={{
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          visibility: shot ? "hidden" : "visible",
        }}
      />
      {shot ? (
        <img
          src={shot}
          alt="Foto capturada com carimbo de estaca e data"
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <>
          {/* Layout rotativo automático: acompanha a orientação da tela em
              todos os ângulos (retrato, retrato invertido e paisagem). */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 origin-center"
            style={{
              width: landscape ? "100dvw" : "100dvh",
              height: landscape ? "100dvh" : "100dvw",
              transform: `translate(-50%, -50%) rotate(${layoutRotation}deg) translateZ(0)`,
              willChange: "transform",
              contain: "layout paint",
            }}
          >

            <div
              className="absolute left-3 top-3 rounded-xl px-3 py-1.5 font-black text-yellow-300 shadow-lg ring-1 ring-yellow-300/30"
              style={{
                fontSize: `${1.25 * SIZE_FACTOR[settings.size]}rem`,
                backgroundColor: `rgba(15,23,42,${alpha})`,
              }}
            >
              {stamp.estaca ?? "Sem estaca"}
            </div>
            {mapUrl && settings.showMap && (
              <img
                src={mapUrl}
                alt="Mini mapa da localização atual"
                className={`absolute bottom-3 rounded-xl object-cover ring-1 ring-white/25 ${settings.mapSide === "direita" ? "right-3" : "left-3"}`}
                style={{
                  height: `${6 * SIZE_FACTOR[settings.size]}rem`,
                  width: `${6 * SIZE_FACTOR[settings.size]}rem`,
                  opacity: Math.max(0.2, alpha + 0.2),
                }}
              />
            )}
            <div
              className="absolute bottom-3 right-3 rounded-xl px-3 py-2 text-right font-semibold leading-snug text-white ring-1 ring-white/15"
              style={{
                fontSize: `${0.75 * SIZE_FACTOR[settings.size]}rem`,
                backgroundColor: `rgba(0,0,0,${alpha})`,
              }}
            >
              <div className="text-yellow-200">
                <StampClock settings={settings} />
              </div>
              {lines.map((l) => (
                <div key={l}>{l}</div>
              ))}
              {coords && <div className="text-white/80">{coords}</div>}
            </div>

            {!landscape && (
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[11px] font-semibold text-white/60">
                Vire o celular de lado
              </div>
            )}

          </div>


        </>

      )}

      {/* Estaca que será carimbada na foto */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-4 py-2 shadow-lg">

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
        className="absolute right-3 top-3 rounded-full bg-slate-900/85 p-2.5 text-white"
      >
        <Settings2 className="h-5 w-5" />
      </button>

      {showSettings && (
        <div className="absolute inset-x-3 top-16 max-h-[70dvh] space-y-4 overflow-y-auto rounded-2xl bg-slate-900/95 p-4 text-sm text-white">
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
              <span>Data do carimbo</span>
              <input
                type="date"
                value={settings.customDate ?? ""}
                onChange={(e) => update({ customDate: e.target.value || null })}
                className="rounded bg-slate-700 px-2 py-1"
              />
            </label>
            {settings.customDate && (
              <button
                type="button"
                onClick={() => update({ customDate: null })}
                className="w-full rounded-lg bg-slate-800 px-3 py-2 text-[12px] font-semibold text-yellow-300"
              >
                Usar a data de hoje
              </button>
            )}
            <label className="flex items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-2">
              <span>Ajuste de minutos</span>
              <input
                type="number"
                value={settings.timeOffsetMin}
                onChange={(e) => update({ timeOffsetMin: Number(e.target.value) || 0 })}
                className="w-20 rounded bg-slate-700 px-2 py-1 text-right"
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-2">
              <span>Ajuste de segundos</span>
              <input
                type="number"
                value={settings.timeOffsetSec ?? 0}
                onChange={(e) => update({ timeOffsetSec: Number(e.target.value) || 0 })}
                className="w-20 rounded bg-slate-700 px-2 py-1 text-right"
              />
            </label>
            <p className="text-[11px] text-slate-400">
              Prévia: <StampClock settings={settings} />
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Transparência do layout
            </p>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(alpha * 100)}
              onChange={(e) => update({ opacity: Number(e.target.value) / 100 })}
              className="w-full accent-yellow-300"
            />
            <p className="text-[11px] text-slate-400">
              Fundo do carimbo: {Math.round(alpha * 100)}% opaco (0% = totalmente transparente)
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
          <div className="flex items-center gap-2 rounded-xl bg-slate-900/85 px-3 py-2">
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

      {!shot && zoomRange && (
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-2 backdrop-blur">
          <button
            type="button"
            aria-label="Aumentar zoom"
            onClick={() => applyZoom(zoomVal + (zoomRange.step || 0.1) * 5)}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-yellow-300 active:scale-95"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <input
            type="range"
            aria-label="Zoom da câmera"
            min={zoomRange.min}
            max={zoomRange.max}
            step={zoomRange.step || 0.1}
            value={zoomVal}
            onChange={(e) => applyZoom(Number(e.target.value))}
            className="h-28 w-6 accent-yellow-300 [writing-mode:vertical-lr] [direction:rtl]"
          />
          <button
            type="button"
            aria-label="Diminuir zoom"
            onClick={() => applyZoom(zoomVal - (zoomRange.step || 0.1) * 5)}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-yellow-300 active:scale-95"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-[10px] font-bold tabular-nums text-white/80">
            {zoomVal.toFixed(1)}x
          </span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-5">
        <button
          type="button"
          onClick={
            shot
              ? () => {
                  setShot(null);
                  setRawShot(null);
                  setSaved(false);
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
            onClick={sendWhatsApp}
            disabled={sharing}
            aria-label="Enviar para o WhatsApp"
            className="flex items-center gap-2 rounded-full bg-green-500 px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            <Share2 className="h-4 w-4" />
            {sharing ? "Enviando…" : "WhatsApp"}
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
