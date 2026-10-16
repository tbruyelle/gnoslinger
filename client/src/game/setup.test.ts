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

  it("puts the marshal in G5-G9 looking north-west, the kid in E5-E9 looking south-east, el jefe in I5-I9 and axe in C5-C9", () => {
    expect(setupZone("marshal")).toEqual(["A-G5", "A-G6", "A-G7", "A-G8", "A-G9"]);
    expect(setupZone("the_kid")).toEqual(["A-E5", "A-E6", "A-E7", "A-E8", "A-E9"]);
    expect(setupZone("el_jefe")).toEqual(["A-I5", "A-I6", "A-I7", "A-I8", "A-I9"]);
    expect(setupZone("axe")).toEqual(["A-C5", "A-C6", "A-C7", "A-C8", "A-C9"]);
    expect(setupZone("dude")).toEqual([]);
    expect(defaultFacing("marshal")).toBe(5);
    expect(defaultFacing("the_kid")).toBe(2);
    expect(defaultFacing("el_jefe")).toBe(5);
    expect(defaultFacing("axe")).toBe(2);
    expect(defaultFacing("dude")).toBe(0);
  });

  it("seats the characters in order, 2 to 4 of them", () => {
    expect([MIN_PLAYERS, MAX_PLAYERS]).toEqual([2, 4]);
    expect([0, 1, 2, 3, 4].map(seatChar)).toEqual(["marshal", "the_kid", "el_jefe", "axe", ""]);
    expect(nextSeat([{ addr: "g1a" }, { addr: "" }, { addr: "" }])).toBe(1);
    expect(nextSeat([{ addr: "g1a" }, { addr: "g1b" }])).toBe(-1);
  });

  it("checks a hex for a character", () => {
    expect(canSetUp("marshal", "A-G7")).toBe(true);
    expect(canSetUp("marshal", "A-E7")).toBe(false);
    expect(canSetUp("marshal", "A-G4")).toBe(false);
    expect(canSetUp("the_kid", "A-E5")).toBe(true);
    expect(canSetUp("the_kid", "A-F9")).toBe(false);
    expect(canSetUp("dude", "A-G7")).toBe(false);
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
