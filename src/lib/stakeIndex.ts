import { getAllStakes, getGeometries, type StakePoint } from "@/lib/stakePoints";
import type { LatLng } from "@/lib/geo";

// Índice espacial simples (grade de ~0.002° ≈ 200 m) para não varrer
// todas as estacas/ruas a cada movimento do mapa ou do GPS.
const CELL = 0.002;

function key(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;
}

let grid: Map<string, StakePoint[]> | null = null;

function getGrid(): Map<string, StakePoint[]> {
  if (grid) return grid;
  grid = new Map();
  for (const st of getAllStakes()) {
    const k = key(st.pos.lat, st.pos.lng);
    const bucket = grid.get(k);
    if (bucket) bucket.push(st);
    else grid.set(k, [st]);
  }
  return grid;
}

export type Bounds = { contains: (p: LatLng) => boolean };
export type BoundsRect = { south: number; west: number; north: number; east: number };

// Estacas dentro de um retângulo, visitando só as células que o cobrem.
export function stakesInRect(rect: BoundsRect, limit: number): StakePoint[] {
  const g = getGrid();
  const out: StakePoint[] = [];
  const y0 = Math.floor(rect.south / CELL);
  const y1 = Math.floor(rect.north / CELL);
  const x0 = Math.floor(rect.west / CELL);
  const x1 = Math.floor(rect.east / CELL);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const bucket = g.get(`${y}:${x}`);
      if (!bucket) continue;
      for (const st of bucket) {
        if (
          st.pos.lat < rect.south ||
          st.pos.lat > rect.north ||
          st.pos.lng < rect.west ||
          st.pos.lng > rect.east
        )
          continue;
        out.push(st);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

// Caixa envolvente de cada rua, para descartar ruas distantes sem projetar ponto a ponto.
export type StreetBox = {
  index: number;
  south: number;
  west: number;
  north: number;
  east: number;
};

let boxes: StreetBox[] | null = null;

export function getStreetBoxes(): StreetBox[] {
  if (boxes) return boxes;
  boxes = getGeometries().map((g, index) => {
    let south = Infinity,
      west = Infinity,
      north = -Infinity,
      east = -Infinity;
    for (const p of g.street.path) {
      if (p.lat < south) south = p.lat;
      if (p.lat > north) north = p.lat;
      if (p.lng < west) west = p.lng;
      if (p.lng > east) east = p.lng;
    }
    return { index, south, west, north, east };
  });
  return boxes;
}
