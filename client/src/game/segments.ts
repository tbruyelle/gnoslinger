import type { TurnEvent } from "../chain/types";

/** Segments in a turn. */
export const SEGMENTS = 5;

/** What a segment of a character's turn holds on the segment tracker. */
export type SegFill = "empty" | "action" | "delay";

/**
 * One segment of a character's turn: what fills it, the plan entry (index) of
 * the action filling it (-1 for none), and whether the action executes on it
 * (the last of its segments) rather than being prepared.
 */
export interface SegCell {
  fill: SegFill;
  action: number;
  exec: boolean;
}

/**
 * Lays a character's turn out on its five segments, with the engine's timing
 * (engine.Resolve): the next action executes on the first segment where the
 * time already used plus its cost plus the delay on the sheet reach the
 * segment, and delay gained during a segment counts from the next one. An
 * action fills the segments it takes, ending on the one it executes on; a
 * segment the delay holds up before the next action is delay; the rest are
 * empty. costs are the plan's action costs in order; gained[i] is the delay
 * gained during segment i+1; out (1-5) is the segment the character was
 * killed or passed out on, after which nothing more happens.
 */
export function segmentCells(costs: number[], delay: number, gained: number[] = [], out = 0): SegCell[] {
  const cells: SegCell[] = Array.from({ length: SEGMENTS }, () => ({ fill: "empty" as SegFill, action: -1, exec: false }));
  let used = 0;
  let idx = 0;
  for (let seg = 1; seg <= SEGMENTS; seg++) {
    if (out && seg > out) break;
    if (idx < costs.length && used + costs[idx] + delay <= seg) {
      for (let s = Math.max(1, seg - costs[idx] + 1); s <= seg; s++) cells[s - 1] = { fill: "action", action: idx, exec: s === seg };
      used += costs[idx];
      idx++;
    } else if (used + delay >= seg) {
      cells[seg - 1] = { fill: "delay", action: -1, exec: false };
    }
    delay += gained[seg - 1] ?? 0;
  }
  return cells;
}

/** A plan being picked or sent, on the segment tracker: the carried delay, then each action (delay to come is not known yet). */
export function segmentFills(costs: number[], delay: number): SegFill[] {
  return segmentCells(costs, delay).map((c) => c.fill);
}

/**
 * A seat's segments in a resolved turn, for the replay timeline: its plan's
 * costs, the delay it started with plus what SERIOUS fatigue added at the turn
 * start, the delay events of each segment, and the segment it went out of the
 * fight on.
 */
export function turnSegmentCells(costs: number[], startDelay: number, events: TurnEvent[], seat: number): SegCell[] {
  let delay = startDelay;
  const gained: number[] = Array(SEGMENTS).fill(0);
  let out = 0;
  for (const e of events) {
    if (e.p !== seat) continue;
    if (e.kind === "delay") {
      if (e.seg === 0) delay += e.n;
      else if (e.seg <= SEGMENTS) gained[e.seg - 1] += e.n;
    }
    const gone = e.kind === "pass_out" || (e.kind === "wound" && e.result === "kill");
    if (gone && e.seg >= 1 && e.seg <= SEGMENTS && !out) out = e.seg;
  }
  return segmentCells(costs, delay, gained, out);
}
