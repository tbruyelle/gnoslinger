import { describe, expect, it } from "vitest";
import { BOARD_A } from "./boardA";

describe("BOARD_A", () => {
  it("has 138 hexes (I11 split in two) with symmetric adjacency", () => {
    const ids = BOARD_A.ids();
    expect(ids).toHaveLength(138);
    const whole = (id: string | null) => id?.replace(/\*$/, "");
    for (const id of ids) {
      let n = 0;
      for (let d = 0; d < 6; d++) {
        const nb = BOARD_A.neighbor(id, d);
        if (!nb) continue;
        n++;
        expect(whole(BOARD_A.neighbor(nb, (d + 3) % 6))).toBe(whole(id)); // back to the hex, or the other half of a split one
      }
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it("knows the corral fence, as the realm's Board.Fenced", () => {
    expect(BOARD_A.fenced("A-E3", "A-E2")).toBe(true);
    expect(BOARD_A.fenced("A-E2", "A-E3")).toBe(true);
    expect(BOARD_A.fenced("A-F3", "A-F2")).toBe(false); // the Upper Gate
    expect(BOARD_A.fenced("A-F6", "A-F5")).toBe(false);
  });

  it("knows the trough, as the realm's Board.Obstacle", () => {
    expect(BOARD_A.ids().filter((id) => BOARD_A.obstacle(id))).toEqual(["A-I11*"]);
    expect(BOARD_A.crossesObstacle("A-H10", "A-I11*")).toBe(true);
    expect(BOARD_A.crossesObstacle("A-I11*", "A-I11")).toBe(true);
    expect(BOARD_A.crossesObstacle("A-I11", "A-I12")).toBe(false);
    expect(BOARD_A.crossesObstacle("A-I10", "A-J10")).toBe(false);
    expect(BOARD_A.crossesObstacle("A-E3", "A-E2")).toBe(true); // the fence
  });

  it("outlines regular hexes and the traced half-hexes", () => {
    expect(BOARD_A.hexRadius).toBeGreaterThan(100);
    expect(BOARD_A.hexRadius).toBeLessThan(115);
    const f6 = BOARD_A.outline("A-F6");
    const c = BOARD_A.hexPos("A-F6");
    expect(f6).toHaveLength(6);
    for (const p of f6) expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeCloseTo(BOARD_A.hexRadius);
    expect(BOARD_A.outline("A-I11*")).toHaveLength(4);
    expect(BOARD_A.outline("A-I11")).toHaveLength(5);
  });

  it("offers I10, J10 and I11 to an advance from the trough facing NE", () => {
    expect(BOARD_A.relNeighbors("A-I11*", 1, ["ahead_left", "ahead", "ahead_right"]).map((n) => n.hex)).toEqual(["A-I10", "A-J10", "A-I11"]);
  });

  it("matches the realm's sample rings", () => {
    expect([0, 1, 2, 3, 4, 5].map((d) => BOARD_A.neighbor("A-F6", d))).toEqual(["A-F5", "A-G6", "A-G7", "A-F7", "A-E7", "A-E6"]);
    expect(BOARD_A.neighbor("A-F12", 3)).toBeNull();
    expect(BOARD_A.neighbor("A-F1", 3)).toBe("A-F2");
    expect(BOARD_A.neighbor("nope", 0)).toBeNull();
    expect(BOARD_A.neighbor("A-F6", 6)).toBeNull();
  });

  it("resolves relative directions against a facing", () => {
    // Facing S (3): ahead is S, ahead_left is SE, back_right is NW.
    expect(BOARD_A.relNeighbor("A-F6", 3, "ahead")).toBe("A-F7");
    expect(BOARD_A.relNeighbor("A-F6", 3, "ahead_left")).toBe("A-G7");
    expect(BOARD_A.relNeighbor("A-F6", 3, "back_right")).toBe("A-E6");
    expect(BOARD_A.relNeighbors("A-F12", 3, ["ahead_left", "ahead", "ahead_right"]).map((o) => o.hex)).toEqual([null, null, null]);
  });

  it("finds the nearest hex and hex positions", () => {
    const p = BOARD_A.hexPos("A-F6");
    expect(BOARD_A.nearest(p.x + 10, p.y - 10)).toBe("A-F6");
    expect(() => BOARD_A.hexPos("nope")).toThrow();
    expect(BOARD_A.w).toBe(1600);
  });
});

describe("BOARD_A line of sight", () => {
  const up = 5;
  const down = 3;

  it("knows which hexes the trough lies between, as the realm's Board.Between", () => {
    for (const [a, b] of [["A-H10", "A-I11"], ["A-I10", "A-I11"], ["A-H10", "A-J11"], ["A-I10", "A-I12"], ["A-I9", "A-I12"], ["A-H9", "A-J12"]]) {
      expect(BOARD_A.between(a, b), `${a} ${b}`).toEqual(["A-I11*"]);
      expect(BOARD_A.between(b, a), `${b} ${a}`).toEqual(["A-I11*"]);
    }
    for (const [a, b] of [
      ["A-H11", "A-I11"], ["A-J10", "A-I11"], ["A-H10", "A-J10"], ["A-I10", "A-J10"], ["A-H10", "A-H11"],
      ["A-H11", "A-J10"], // along the trough's length
      ["A-I11", "A-I12"], ["A-I11", "A-J11"], ["A-F3", "A-F9"],
      ["A-I11*", "A-I10"], ["A-I11*", "A-H12"], ["A-I11*", "A-I11"],
      ["A-I10", "A-I10"], ["A-X1", "A-I11"], ["A-I10", "A-X1"],
    ]) {
      expect(BOARD_A.between(a, b), `${a} ${b}`).toEqual([]);
    }
  });

  it("applies the heights, as the realm's Board.LineOfSight", () => {
    const los = (from: string, to: string, hFrom: number, hTo: number) => BOARD_A.lineOfSight(from, to, hFrom, hTo);
    // I10 and I11, on the two sides of the trough, both adjacent to it.
    expect(los("A-I10", "A-I11", up, up)).toEqual({ clear: true, blocker: "" });
    expect(los("A-I10", "A-I11", down, down)).toEqual({ clear: false, blocker: "A-I11*" });
    expect(los("A-I10", "A-I11", down, up)).toEqual({ clear: false, blocker: "A-I11*" });
    expect(los("A-I10", "A-I11", up, down)).toEqual({ clear: false, blocker: "A-I11*" });
    expect(los("A-I11", "A-I10", down, up)).toEqual({ clear: false, blocker: "A-I11*" });
    // I9 and I12, across the trough but not adjacent to it.
    expect(los("A-I9", "A-I12", up, up).clear).toBe(true);
    expect(los("A-I9", "A-I12", down, down).clear).toBe(false);
    expect(los("A-I9", "A-I12", down, up).clear).toBe(true);
    expect(los("A-I9", "A-I12", up, down).clear).toBe(true);
    // H10 and J11: the DOWN end adjacent to the trough blocks, the other not.
    expect(los("A-H10", "A-J11", down, up).clear).toBe(false);
    expect(los("A-H10", "A-J11", up, down).clear).toBe(true);
    // Beside the trough, to or from it, and far from it: nothing blocks.
    expect(los("A-H11", "A-I11", down, down).clear).toBe(true);
    expect(los("A-J10", "A-I11", down, down).clear).toBe(true);
    expect(los("A-I11*", "A-I10", down, down).clear).toBe(true);
    expect(los("A-H12", "A-I11*", down, down).clear).toBe(true);
    expect(los("A-F3", "A-F9", down, down).clear).toBe(true);
    expect(los("A-F3", "A-F3", down, down).clear).toBe(true);
    // An unknown hex blocks, with no blocker to name.
    expect(los("A-X1", "A-I11", up, up)).toEqual({ clear: false, blocker: "" });
    expect(los("A-I11", "", up, up)).toEqual({ clear: false, blocker: "" });
  });

  it("knows the neighbours of the trough", () => {
    for (const id of ["A-I10", "A-J10", "A-I11", "A-H11", "A-H10"]) expect(BOARD_A.adjacent(id, "A-I11*"), id).toBe(true);
    expect(BOARD_A.adjacent("A-I12", "A-I11*")).toBe(false);
    expect(BOARD_A.adjacent("A-X1", "A-I11*")).toBe(false);
  });
});
