import { describe, expect, it } from "vitest";
import { signedVP, vpRecap, vpReason, vpResult } from "./vp";

// From the realm's z9 filetest: bob surrenders.
const AWARDS = [
  { p: 0, reason: "survive", points: 2 },
  { p: 0, reason: "hold_field", points: 2 },
  { p: 1, reason: "surrender", points: -2 },
  { p: 1, reason: "captured", points: -4 },
];

describe("victory points", () => {
  it("signs the points", () => {
    expect([signedVP(2), signedVP(-4), signedVP(0)]).toEqual(["+2", "−4", "0"]);
  });
  it("words the reasons", () => {
    expect(vpReason("kill_enemy")).toBe("killed the enemy");
    expect(vpReason("new_thing")).toBe("new thing");
  });
  it("recaps each seat's total and its awards", () => {
    expect(vpRecap(AWARDS, [4, -6], ["Marshal", "The Kid"])).toEqual([
      "Showdown over, victory points:",
      "    Marshal +4 VP: survives +2, holds the field +2",
      "    The Kid −6 VP: surrendered −2, captured −4",
    ]);
    expect(vpRecap([], [0, 0], [])).toEqual([]);
  });
  it("words the result", () => {
    expect(vpResult(0, [4, -6], AWARDS, ["Marshal", "The Kid"])).toBe("Marshal wins 4 to −6 VP");
    expect(vpResult(-1, [2, 2], [{ p: 0, reason: "survive", points: 2 }], ["Marshal", "The Kid"])).toBe("a draw, 2 to 2 VP");
    expect(vpResult(-1, [0, 0], [], ["Marshal", "The Kid"])).toBe("");
    // More than two seats: everyone's score.
    const three = [{ p: 2, reason: "survive", points: 2 }];
    expect(vpResult(2, [-6, -6, 4], three, ["Marshal", "The Kid", "Reb"])).toBe("Reb wins: Marshal −6, The Kid −6, Reb 4 VP");
    expect(vpResult(-1, [2, 2, 2], three, ["Marshal", "The Kid", "Reb"])).toBe("a draw: Marshal 2, The Kid 2, Reb 2 VP");
  });
});
