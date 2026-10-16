import { describe, expect, it } from "vitest";
import { BOARD_A } from "../board/boardA";
import { HEIGHT_DOWN, HEIGHT_UPRIGHT } from "../rules";
import type { CharView } from "./replay";
import { canSee, sightHeight, standingOn } from "./sight";

const char = (over: Partial<CharView> = {}): CharView => ({
  hex: "A-I10", facing: 3, down: false, delay: 0, status: "alive", guns: [],
  aim: 0, aimAt: -1, aimHex: "", endurance: 20, serious: 0, gunArm: 0, otherArm: 0, leg: 0, ...over,
});

describe("sightHeight", () => {
  it("is upright, or DOWN unless on the trough (30.32)", () => {
    expect(sightHeight(char(), BOARD_A)).toBe(HEIGHT_UPRIGHT);
    expect(sightHeight(char({ down: true }), BOARD_A)).toBe(HEIGHT_DOWN);
    expect(sightHeight(char({ hex: "A-I11*", down: true }), BOARD_A)).toBe(HEIGHT_UPRIGHT);
  });
});

describe("canSee", () => {
  it("traces the sight to a character at its height, else to the hex as upright (31.3)", () => {
    const me = char({ hex: "A-I10", down: true });
    const kid = char({ hex: "A-I12", facing: 0 });
    // A DOWN marshal next to the trough sees nothing across it...
    expect(canSee(BOARD_A, me, "A-I12", kid)).toEqual({ clear: false, blocker: "A-I11*" });
    expect(canSee(BOARD_A, me, "A-I12")).toEqual({ clear: false, blocker: "A-I11*" });
    // ...while a standing one sees a standing Kid, but not one lying next to the trough.
    const up = char({ hex: "A-I10" });
    expect(canSee(BOARD_A, up, "A-I12", kid).clear).toBe(true);
    expect(canSee(BOARD_A, up, "A-I12").clear).toBe(true);
    expect(canSee(BOARD_A, up, "A-I11", char({ hex: "A-I11", down: true })).clear).toBe(false);
    // The character's own hex counts, not the hex named.
    expect(canSee(BOARD_A, up, "A-J10", char({ hex: "A-I11", down: true })).clear).toBe(false);
  });
});

describe("standingOn", () => {
  it("finds another seat's alive character on a hex", () => {
    const chars = [char({ hex: "A-F3" }), char({ hex: "A-F9" })];
    expect(standingOn(chars, "A-F9", 0)).toBe(chars[1]);
    expect(standingOn(chars, "A-F3", 0)).toBeNull(); // my own seat
    expect(standingOn(chars, "A-F6", 0)).toBeNull();
    expect(standingOn([chars[0], char({ hex: "A-F9", status: "killed" })], "A-F9", 0)).toBeNull();
    expect(standingOn([chars[0], null], "A-F9", 0)).toBeNull();
  });
});
