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
