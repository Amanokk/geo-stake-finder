import type { Street } from "@/data/defaultStreets";

// Effective "stake number at chainage 0" (start of the drawn polyline,
// respecting `reversed`). If an anchor is set it overrides startStake.
export function effectiveStartStake(street: Street): number {
  if (street.anchor) {
    return street.anchor.stake - street.anchor.chainageM / street.spacing;
  }
  return street.startStake;
}

export type StakeAt = {
  number: number; // nearest integer stake number
  offset: number; // signed meters past that stake (positive = forward)
};

// Given a chainage along the (possibly reversed) polyline, return the
// nearest integer stake number and the offset from it.
export function stakeAtChainage(street: Street, chainageM: number): StakeAt {
  const start = effectiveStartStake(street);
  const idxFloat = start + chainageM / street.spacing;
  const number = Math.round(idxFloat);
  const offset = (idxFloat - number) * street.spacing;
  return { number, offset };
}

// Integer stake numbers whose position falls inside [0, totalLengthM]
// along the polyline. Returns { number, chainageM } pairs.
export function stakesAlong(
  street: Street,
  totalLengthM: number,
): Array<{ number: number; chainageM: number }> {
  const start = effectiveStartStake(street);
  // number = start + chainage/spacing  →  chainage = (number - start) * spacing
  const minNum = Math.ceil(start);
  const maxNum = Math.floor(start + totalLengthM / street.spacing);
  const out: Array<{ number: number; chainageM: number }> = [];
  for (let n = minNum; n <= maxNum; n++) {
    out.push({ number: n, chainageM: (n - start) * street.spacing });
  }
  return out;
}
