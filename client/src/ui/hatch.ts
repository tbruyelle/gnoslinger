/** Diagonal hatching of a convex outline, like the hand's hatched card sides, as segments to draw. */

export interface Pt {
  x: number;
  y: number;
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** The part of the segment a-b inside a convex polygon, or null when none. */
export function clipToConvex(a: Pt, b: Pt, poly: Pt[]): [Pt, Pt] | null {
  const n = poly.length;
  let area = 0;
  for (let i = 1; i < n - 1; i++) area += cross(poly[0], poly[i], poly[i + 1]);
  const orient = Math.sign(area) || 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const fa = cross(p, q, a) * orient;
    const fb = cross(p, q, b) * orient;
    if (fa === fb) {
      if (fa < 0) return null;
      continue;
    }
    const t = -fa / (fb - fa);
    if (fb > fa) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
  }
  if (lo >= hi) return null;
  const at = (t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  return [at(lo), at(hi)];
}

/** Stripes at 45° every `step` pixels, clipped to a convex outline. */
export function hatchSegments(poly: Pt[], step: number): [Pt, Pt][] {
  if (poly.length < 3 || step <= 0) return [];
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const out: [Pt, Pt][] = [];
  // The lines x − y = c sweep the bounding box from its bottom-left corner to its top-right one.
  for (let c = minX - maxY; c <= maxX - minY; c += step) {
    const seg = clipToConvex({ x: minX, y: minX - c }, { x: maxX, y: maxX - c }, poly);
    if (seg) out.push(seg);
  }
  return out;
}
