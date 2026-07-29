import type { LatLng } from "@/lib/geo";

export type StakeAnchor = {
  // Known stake number on the planta (e.g. 1127).
  stake: number;
  // Distance in meters from the polyline's start (respecting `reversed`)
  // where that stake sits.
  chainageM: number;
};

export type Street = {
  id: string;
  name: string;
  // Polyline in lat/lng along the street axis.
  // Empty by default — user draws it in the "Calibrar" screen.
  polyline: LatLng[];
  // Distance in meters between consecutive stakes.
  spacing: number;
  // First stake number at the polyline start (used when no anchor is set).
  startStake: number;
  // If true, chainage is measured from the LAST vertex of the polyline instead
  // of the first. Useful when the estaca 0 is on the "other end" than where
  // the user started drawing.
  reversed: boolean;
  // Optional: a known stake on the planta, anywhere along the polyline.
  // When present, overrides `startStake` for numbering.
  anchor?: StakeAnchor;
};

// Streets present in the project "Retiro São Joaquim - Itaboraí/RJ"
// (planta geral 2024_SJOAQUIM_PE_GEO_DE_001-R01). Polylines start empty —
// use the Calibrar screen to trace each street on the map.
export const DEFAULT_STREETS: Street[] = [
  "Rua Cid",
  "Rua Bacajá",
  "Rua Dimas Lopes",
  "Rua Padre Mariano de Castro",
  "Rua Coronel Mariano de Castro",
  "Rua Desembargador Ferreira Pinto",
  "Rua Dr. Altamir Moreira",
  "Rua Coronel Antônio Leal",
  "Rua Ângelo Burches",
  "Rua Alberto Torres",
  "Rua Major Simões da Fonseca",
  "Rua Madre Mercês da Fonseca",
  "Rua Prefeito Augusto de Andrade",
  "Rua Prefeito Antônio Vianna",
  "Rua Ministro Joaquim Antunes",
  "Rua Dr. Leal Júnior",
  "Rua João Caetano",
  "Rua Maceió",
  "Rua Nossa Senhora",
  "Avenida São Miguel",
].map((name, i) => ({
  id: `s${i + 1}`,
  name,
  polyline: [] as LatLng[],
  spacing: 20,
  startStake: 0,
  reversed: false,
  anchor: undefined as StakeAnchor | undefined,
}));

// Approximate center of the neighborhood (for initial map view).
export const PROJECT_CENTER: LatLng = { lat: -22.7466, lng: -42.8593 };
