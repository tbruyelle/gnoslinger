import { describe, expect, it } from "vitest";
import { BOARD_A } from "../board/boardA";
import { MAX_PLAYERS, MIN_PLAYERS, SETUPS, canSetUp, defaultFacing, nextSeat, seatChar, setupZone, startingChar } from "./setup";

describe("SETUPS", () => {
  it("assigns each character hexes of board A, no obstacle, each hex to one character, as the realm's engine.Setups", () => {
    const seen = new Map<string, string>();
    for (const s of SETUPS) {
      expect(s.hexes.length).toBeGreaterThan(0);
      expect(s.facing).toBeGreaterThanOrEqual(0);
      expect(s.facing).toBeLessThanOrEqual(5);
      for (const h of s.hexes) {
        expect(BOARD_A.has(h)).toBe(true);
        expect(BOARD_A.obstacle(h)).toBe(false);
        expect(seen.get(h)).toBeUndefined();
        seen.set(h, s.char);
      }
    }
  });

  it("puts the marshal in D5-D7, E6, E7 looking south-east, the kid in H5-H7, G6, G7 looking north-west, el jefe in E8, F7, F8, G8 looking north and axe in E5, F5, F4, G5 looking south", () => {
    expect(setupZone("marshal")).toEqual(["A-D5", "A-D6", "A-D7", "A-E6", "A-E7"]);
    expect(setupZone("the_kid")).toEqual(["A-H5", "A-H6", "A-H7", "A-G6", "A-G7"]);
    expect(setupZone("el_jefe")).toEqual(["A-E8", "A-F7", "A-F8", "A-G8"]);
    expect(setupZone("axe")).toEqual(["A-E5", "A-F5", "A-F4", "A-G5"]);
    expect(setupZone("dude")).toEqual([]);
    expect(defaultFacing("marshal")).toBe(2);
    expect(defaultFacing("the_kid")).toBe(5);
    expect(defaultFacing("el_jefe")).toBe(0);
    expect(defaultFacing("axe")).toBe(3);
    expect(defaultFacing("dude")).toBe(0);
  });

  it("seats the characters in order, 2 to 4 of them", () => {
    expect([MIN_PLAYERS, MAX_PLAYERS]).toEqual([2, 4]);
    expect([0, 1, 2, 3, 4].map(seatChar)).toEqual(["marshal", "the_kid", "el_jefe", "axe", ""]);
    expect(nextSeat([{ addr: "g1a" }, { addr: "" }, { addr: "" }])).toBe(1);
    expect(nextSeat([{ addr: "g1a" }, { addr: "g1b" }])).toBe(-1);
  });

  it("checks a hex for a character", () => {
    expect(canSetUp("marshal", "A-D6")).toBe(true);
    expect(canSetUp("marshal", "A-H6")).toBe(false);
    expect(canSetUp("marshal", "A-D4")).toBe(false);
    expect(canSetUp("the_kid", "A-H5")).toBe(true);
    expect(canSetUp("marshal", "A-E7")).toBe(true);
    expect(canSetUp("the_kid", "A-G6")).toBe(true);
    expect(canSetUp("the_kid", "A-F8")).toBe(false);
    expect(canSetUp("el_jefe", "A-F7")).toBe(true);
    expect(canSetUp("el_jefe", "A-F6")).toBe(false);
    expect(canSetUp("axe", "A-E5")).toBe(true);
    expect(canSetUp("axe", "A-E6")).toBe(false);
    expect(canSetUp("dude", "A-D6")).toBe(false);
  });

});

describe("startingChar", () => {
  it("stands upright with a holstered, loaded Colt and full endurance", () => {
    const c = startingChar("A-G5", 5);
    expect(c.hex).toBe("A-G5");
    expect(c.facing).toBe(5);
    expect(c.down).toBe(false);
    expect(c.endurance).toBe(20);
    expect(c.aimAt).toBe(-1);
    expect(c.guns).toEqual([expect.objectContaining({ type: "colt45", location: "holstered", cocked: false, shells: 6 })]);
  });
});
