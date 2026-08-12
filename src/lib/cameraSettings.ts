export type StampSize = "pequeno" | "medio" | "grande";
export type StampSide = "esquerda" | "direita";

export type CameraSettings = {
  clock24h: boolean;
  showSeconds: boolean;
  showDate: boolean;
  timeOffsetMin: number;
  timeOffsetSec: number;
  /** Data fixa no formato YYYY-MM-DD; null = usa a data atual do aparelho. */
  customDate: string | null;
  opacity: number;
  size: StampSize;
  mapSide: StampSide;
  showMap: boolean;
  showCoords: boolean;
  showAddress: boolean;
};

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  clock24h: true,
  showSeconds: false,
  showDate: true,
  timeOffsetMin: 0,
  timeOffsetSec: 0,
  customDate: null,
  opacity: 0.75,
  size: "medio",
  mapSide: "esquerda",
  showMap: true,
  showCoords: true,
  showAddress: true,
};

export const SIZE_FACTOR: Record<StampSize, number> = {
  pequeno: 0.75,
  medio: 1,
  grande: 1.35,
};


const KEY = "estacagps.camera.settings";

export function loadCameraSettings(): CameraSettings {
  if (typeof localStorage === "undefined") return DEFAULT_CAMERA_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CAMERA_SETTINGS;
    return { ...DEFAULT_CAMERA_SETTINGS, ...(JSON.parse(raw) as Partial<CameraSettings>) };
  } catch {
    return DEFAULT_CAMERA_SETTINGS;
  }
}

export function saveCameraSettings(s: CameraSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function stampNow(settings: CameraSettings, base = new Date()) {
  return new Date(
    base.getTime() + settings.timeOffsetMin * 60000 + (settings.timeOffsetSec || 0) * 1000,
  );
}

export function formatStamp(d: Date, s: CameraSettings) {
  const p = (n: number) => String(n).padStart(2, "0");
  let h = d.getHours();
  let suffix = "";
  if (!s.clock24h) {
    suffix = h >= 12 ? " PM" : " AM";
    h = h % 12 || 12;
  }
  const time = `${p(h)}:${p(d.getMinutes())}${s.showSeconds ? `:${p(d.getSeconds())}` : ""}${suffix}`;
  if (!s.showDate) return time;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${time}`;
}
