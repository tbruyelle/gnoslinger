import { describe, expect, it } from "vitest";
import { STAKE_OPTIONS, formatGnot, payoutLine, stakeLine, stakeOption, winnings } from "./stakes";

describe("stakes", () => {
  it("offers glory first, then GNOT amounts in ugnot", () => {
    expect(STAKE_OPTIONS).toEqual([0, 1_000_000, 5_000_000, 10_000_000, 25_000_000, 100_000_000, 500_000_000]);
    expect(STAKE_OPTIONS.map(stakeOption)).toEqual(["For glory", "1 GNOT", "5 GNOT", "10 GNOT", "25 GNOT", "100 GNOT", "500 GNOT"]);
  });

  it("words amounts, lines and what a seat got", () => {
    expect(formatGnot(9_500_000)).toBe("9.5 GNOT");
    expect(stakeLine({ stake: 0, pot: 0 })).toBe("");
    expect(stakeLine({ stake: 5_000_000, pot: 10_000_000 })).toBe("5 GNOT stake · 10 GNOT pot");
    expect(winnings(5_000_000, 2)).toBe(9_500_000);
    const over = { stake: 5_000_000, payouts: [9_500_000, 0], endReason: "surrender" };
    expect(payoutLine(over, 0)).toBe("You won 9.5 GNOT");
    expect(payoutLine(over, 1)).toBe("You lost your 5 GNOT stake");
    expect(payoutLine({ stake: 5_000_000, payouts: [5_000_000, 5_000_000] }, 1)).toBe("Your 5 GNOT stake came back");
    // A draw splits the pot after the cut: not a refund.
    expect(payoutLine({ stake: 5_000_000, payouts: [4_750_000, 4_750_000] }, 1)).toBe("You won 4.75 GNOT");
    expect(payoutLine({ stake: 0, payouts: [] }, 0)).toBe("");
    expect(payoutLine(over, -1)).toBe("");
  });
});
