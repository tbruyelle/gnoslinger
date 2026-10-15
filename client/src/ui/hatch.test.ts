import { describe, expect, it } from "vitest";
import { clipToConvex, hatchSegments } from "./hatch";

const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

describe("clipToConvex", () => {
  it("keeps the part of a segment inside the polygon, whichever way it is wound", () => {
    for (const poly of [square, [...square].reverse()]) {
      expect(clipToConvex({ x: 5, y: -5 }, { x: 5, y: 15 }, poly)).toEqual([{ x: 5, y: 0 }, { x: 5, y: 10 }]);
      expect(clipToConvex({ x: 2, y: 2 }, { x: 4, y: 4 }, poly)).toEqual([{ x: 2, y: 2 }, { x: 4, y: 4 }]);
      expect(clipToConvex({ x: -5, y: -5 }, { x: 15, y: -5 }, poly)).toBeNull();
      expect(clipToConvex({ x: 20, y: 0 }, { x: 20, y: 10 }, poly)).toBeNull();
    }
  });
});

describe("hatchSegments", () => {
  it("covers a convex outline with 45° stripes inside it", () => {
    const segs = hatchSegments(square, 2);
    expect(segs.length).toBeGreaterThan(5);
    for (const [a, b] of segs) {
      for (const p of [a, b]) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(10 + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeLessThanOrEqual(10 + 1e-9);
      }
      expect(b.x - a.x).toBeCloseTo(b.y - a.y); // 45°
    }
    expect(hatchSegments(square.slice(0, 2), 2)).toEqual([]);
    expect(hatchSegments(square, 0)).toEqual([]);
  });
});
