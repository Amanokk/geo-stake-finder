import type { Street } from "@/data/streets";

// Cada rua da planta tem numeração própria (ex.: 1300 → 1380).
// A numeração é interpolada linearmente entre o início e o fim do eixo,
// o que reproduz o espaçamento de 20 m da planta.

export function stakeSpacing(street: Street, totalLength: number): number {
  const delta = street.stakeEnd - street.stakeStart;
  if (delta === 0) return 20;
  return totalLength / delta; // metros por estaca (pode ser negativo)
}

export function stakeAtChainage(
  street: Street,
  chainage: number,
  totalLength: number,
): { number: number; offset: number } {
  const step = stakeSpacing(street, totalLength);
  const exact = street.stakeStart + chainage / step;
  const number = Math.round(exact);
  const offset = (exact - number) * Math.abs(step);
  return { number, offset };
}

export function stakesAlong(
  street: Street,
  totalLength: number,
): { number: number; chainageM: number }[] {
  const step = stakeSpacing(street, totalLength);
  const from = Math.ceil(Math.min(street.stakeStart, street.stakeEnd));
  const to = Math.floor(Math.max(street.stakeStart, street.stakeEnd));
  const out: { number: number; chainageM: number }[] = [];
  for (let n = from; n <= to; n++) {
    const chainageM = (n - street.stakeStart) * step;
    if (chainageM < -1 || chainageM > totalLength + 1) continue;
    out.push({ number: n, chainageM: Math.max(0, Math.min(totalLength, chainageM)) });
  }
  return out;
}
