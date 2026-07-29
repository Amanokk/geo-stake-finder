// Geographic utilities for stake (estaca) calculation.
// Uses a local equirectangular projection anchored on the polyline's first point
// (accurate enough for a neighborhood-sized area like Retiro São Joaquim).

export type LatLng = { lat: number; lng: number };

const EARTH_R = 6378137; // meters

export function haversine(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

// Convert lat/lng to local ENU meters relative to origin.
function toXY(p: LatLng, origin: LatLng): { x: number; y: number } {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x = toRad(p.lng - origin.lng) * Math.cos(toRad(origin.lat)) * EARTH_R;
  const y = toRad(p.lat - origin.lat) * EARTH_R;
  return { x, y };
}

export type ProjectionResult = {
  chainage: number; // meters along polyline from start
  distance: number; // perpendicular distance from point to polyline (meters)
  segmentIndex: number;
  totalLength: number;
};

export function polylineLength(points: LatLng[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += haversine(points[i - 1], points[i]);
  return len;
}

// Project a point onto a polyline. Returns chainage (m) from the polyline's
// first vertex plus the perpendicular distance.
export function projectOnPolyline(point: LatLng, polyline: LatLng[]): ProjectionResult | null {
  if (polyline.length < 2) return null;
  const origin = polyline[0];
  const p = toXY(point, origin);

  let best: ProjectionResult | null = null;
  let cumulative = 0;
  let total = 0;

  // First compute total length for return.
  for (let i = 1; i < polyline.length; i++) total += haversine(polyline[i - 1], polyline[i]);

  for (let i = 1; i < polyline.length; i++) {
    const a = toXY(polyline[i - 1], origin);
    const b = toXY(polyline[i], origin);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const segLen = Math.hypot(abx, aby);
    if (segLen === 0) continue;
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / (segLen * segLen);
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + abx * t;
    const cy = a.y + aby * t;
    const d = Math.hypot(p.x - cx, p.y - cy);
    const chain = cumulative + t * segLen;
    if (best === null || d < best.distance) {
      best = { chainage: chain, distance: d, segmentIndex: i - 1, totalLength: total };
    }
    cumulative += segLen;
  }

  return best;
}

// Given a chainage in meters, return the lat/lng point on the polyline at that distance.
export function pointAtChainage(polyline: LatLng[], chainage: number): LatLng | null {
  if (polyline.length < 2) return null;
  const origin = polyline[0];
  let remaining = chainage;
  for (let i = 1; i < polyline.length; i++) {
    const a = toXY(polyline[i - 1], origin);
    const b = toXY(polyline[i], origin);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const segLen = Math.hypot(abx, aby);
    if (remaining <= segLen) {
      const t = segLen === 0 ? 0 : remaining / segLen;
      const x = a.x + abx * t;
      const y = a.y + aby * t;
      // Convert x,y back to lat/lng
      const lat = origin.lat + (y / EARTH_R) * (180 / Math.PI);
      const lng =
        origin.lng +
        (x / (EARTH_R * Math.cos((origin.lat * Math.PI) / 180))) * (180 / Math.PI);
      return { lat, lng };
    }
    remaining -= segLen;
  }
  return polyline[polyline.length - 1];
}
