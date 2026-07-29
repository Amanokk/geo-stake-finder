import { DEFAULT_STREETS, type Street } from "@/data/defaultStreets";

const KEY = "sjoaquim.streets.v1";

export function loadStreets(): Street[] {
  if (typeof window === "undefined") return DEFAULT_STREETS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STREETS;
    const parsed = JSON.parse(raw) as Street[];
    if (!Array.isArray(parsed)) return DEFAULT_STREETS;
    return parsed;
  } catch {
    return DEFAULT_STREETS;
  }
}

export function saveStreets(streets: Street[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(streets));
}

export function resetStreets() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export function exportJson(streets: Street[]) {
  return JSON.stringify(streets, null, 2);
}
