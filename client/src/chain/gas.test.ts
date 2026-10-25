import { describe, expect, it } from "vitest";
import { DEFAULT_GAS_WANTED, gasWanted, isOutOfGas, MAX_GAS_WANTED, MIN_GAS_WANTED, RESOLVE_GAS_WANTED } from "./gas";

describe("gas", () => {
  it("fits the limit to the simulated gas, with more margin for a call that may resolve the turn", () => {
    expect(gasWanted("Commit", 20_000_000)).toBe(30_000_000);
    expect(gasWanted("Reveal", 50_000_000)).toBe(100_000_000);
    expect(gasWanted("RevealMany", 101_000_000)).toBe(202_000_000);
    expect(gasWanted("ClaimTimeout", 40_000_000)).toBe(80_000_000);
    expect(gasWanted("Surrender", 40_000_000)).toBe(80_000_000);
    // Within bounds.
    expect(gasWanted("Commit", 1_000_000)).toBe(MIN_GAS_WANTED);
    expect(gasWanted("Reveal", 400_000_000)).toBe(MAX_GAS_WANTED);
  });

  it("falls back to fixed limits without a simulation", () => {
    expect(gasWanted("Commit", null)).toBe(DEFAULT_GAS_WANTED);
    expect(gasWanted("CreateGame", 0)).toBe(DEFAULT_GAS_WANTED);
    expect(gasWanted("Reveal", null)).toBe(RESOLVE_GAS_WANTED);
  });

  it("tells a transaction that ran out of gas", () => {
    expect(isOutOfGas("/std.OutOfGasError")).toBe(true);
    expect(isOutOfGas("out of gas in location: ReadFlat; gasWanted: 100000000, gasUsed: 100001234")).toBe(true);
    expect(isOutOfGas("gnoslinger: not your turn")).toBe(false);
  });
});
