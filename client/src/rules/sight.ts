/**
 * Heights for the line of sight (rule 31.3, the HEIGHTS table at ground
 * elevation), as the realm's hex.Height: a higher number is higher on the
 * map.
 */
export type Height = number;
/** A DOWN body counter. */
export const HEIGHT_DOWN: Height = 3;
/** An obstacle (36.3) or a window sill (33.5). */
export const HEIGHT_OBSTACLE: Height = 4;
/** An upright counter, a counter on an obstacle (30.32) and a hex aimed at (31.3). */
export const HEIGHT_UPRIGHT: Height = 5;
/** A wall or a treetrunk, higher than anything (33.2, 38.3). */
export const HEIGHT_WALL: Height = 10;

/**
 * Rules 31.31 and 31.32 for a feature of height h lying between two
 * counters of heights h1 and h2, each adjacent to it or not, as the realm
 * applies them: the feature blocks the sight when higher than both, never
 * when lower than both, and when between the two heights only if the lower
 * counter is adjacent to it (the plateau effect of 31.33 needs hill or
 * gully hexes, which no board has).
 */
export function blocks(h: Height, h1: Height, h2: Height, adj1: boolean, adj2: boolean): boolean {
  if (h > h1 && h > h2) return true;
  if (h < h1 && h < h2) return false;
  if (h1 < h) return adj1;
  if (h2 < h) return adj2;
  return false;
}
