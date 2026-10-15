/**
 * The burst shown beside a target when a shot hits it: one image per hit
 * location (`assets/hit_<location>.png`), by the shot event's final `hit`
 * (the engine's HitLoc: LEG, GUN, ARM, SIDE, BODY, CRIT, VITAL, HEAD; a
 * bullseye is already turned into VITAL). The plain "HIT!" of `hit.png`
 * is kept for a location without an image of its own.
 */
export const HIT_BURSTS: Record<string, string> = {
  LEG: "hit_leg",
  GUN: "hit_gun",
  ARM: "hit_arm",
  SIDE: "hit_side",
  BODY: "hit_body",
  CRIT: "hit_critical",
  VITAL: "hit_vital",
  HEAD: "hit_head",
};

/** The texture key of the burst for a hit location. */
export function hitBurst(hit: string): string {
  return HIT_BURSTS[hit] ?? "hit";
}

/** Every burst texture, each loaded from `assets/<key>.png`. */
export const BURST_KEYS = ["missed", "hit", "jammed", "exploded", ...Object.values(HIT_BURSTS)];
