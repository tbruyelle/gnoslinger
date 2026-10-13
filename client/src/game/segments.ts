/** Segments in a turn. */
export const SEGMENTS = 5;

/** What a segment of a character's turn holds on the segment tracker. */
export type SegFill = "empty" | "action" | "delay";

/**
 * Lays a character's plan out on the turn's five segments, with the engine's
 * timing (engine.Resolve): the next action executes on the first segment
 * where the time already used plus its cost plus the delay on the sheet reach
 * the segment. An action fills the segments it takes, ending on the one it
 * executes on; the segments the carried delay holds up come first; the rest
 * are empty. costs are the plan's action costs in order. Delay the turn will
 * add (SERIOUS fatigue, delay cards) is not known yet and not shown.
 */
export function segmentFills(costs: number[], delay: number): SegFill[] {
  const fills: SegFill[] = Array(SEGMENTS).fill("empty");
  let used = 0;
  let idx = 0;
  for (let seg = 1; seg <= SEGMENTS; seg++) {
    if (idx < costs.length && used + costs[idx] + delay <= seg) {
      for (let s = Math.max(1, seg - costs[idx] + 1); s <= seg; s++) fills[s - 1] = "action";
      used += costs[idx];
      idx++;
    } else if (used + delay >= seg) {
      fills[seg - 1] = "delay";
    }
  }
  return fills;
}
