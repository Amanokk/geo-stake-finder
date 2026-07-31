import { STREETS, type Street } from "@/data/streets";
import { pointAtChainage, polylineLength, type LatLng } from "@/lib/geo";
import { stakesAlong } from "@/lib/stakes";

export type StakePoint = {
  street: Street;
  number: number;
  pos: LatLng;
};

export type StreetGeometry = {
  street: Street;
  length: number;
  stakes: StakePoint[];
};

// Calculado uma única vez por sessão (evita recriar centenas de pontos a cada render).
let cache: StreetGeometry[] | null = null;

export function getGeometries(): StreetGeometry[] {
  if (cache) return cache;
  cache = STREETS.map((street) => {
    const length = polylineLength(street.path);
    const stakes: StakePoint[] = [];
    for (const { number, chainageM } of stakesAlong(street, length)) {
      const pos = pointAtChainage(street.path, chainageM);
      if (pos) stakes.push({ street, number, pos });
    }
    return { street, length, stakes };
  });
  return cache;
}

let flat: StakePoint[] | null = null;

export function getAllStakes(): StakePoint[] {
  if (flat) return flat;
  flat = getGeometries().flatMap((g) => g.stakes);
  return flat;
}
