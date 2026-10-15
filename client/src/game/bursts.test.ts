import { describe, expect, it } from "vitest";
import { BURST_KEYS, HIT_BURSTS, hitBurst } from "./bursts";

describe("hitBurst", () => {
  it("picks the burst of the hit location", () => {
    expect(hitBurst("VITAL")).toBe("hit_vital");
    expect(hitBurst("CRIT")).toBe("hit_critical");
    expect(hitBurst("GUN")).toBe("hit_gun");
    expect(hitBurst("ARM")).toBe("hit_arm");
    expect(hitBurst("LEG")).toBe("hit_leg");
    expect(hitBurst("SIDE")).toBe("hit_side");
    expect(hitBurst("BODY")).toBe("hit_body");
    expect(hitBurst("HEAD")).toBe("hit_head");
  });

  it("falls back to the plain HIT! burst", () => {
    expect(hitBurst("BE")).toBe("hit");
    expect(hitBurst("")).toBe("hit");
  });

  it("lists every burst once for preloading", () => {
    expect(new Set(BURST_KEYS).size).toBe(BURST_KEYS.length);
    for (const key of Object.values(HIT_BURSTS)) expect(BURST_KEYS).toContain(key);
    expect(BURST_KEYS).toEqual(expect.arrayContaining(["missed", "hit", "jammed", "exploded"]));
  });
});
