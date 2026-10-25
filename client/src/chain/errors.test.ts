import { describe, expect, it } from "vitest";
import { ChainError, userMessage } from "./errors";

describe("userMessage", () => {
  it("says what to do when a transaction ran out of gas", () => {
    // As tm2 reports it: the error's type, its log naming the place.
    const oog = new ChainError("delivertx", "transaction failed", "--= Error =--\nData: std.OutOfGasError{abciError:std.abciError{}}\nMsg Traces:\n    0  out of gas in location: ReadFlat; gasWanted: 18261998, gasUsed: 18300112");
    expect(userMessage(oog)).toMatch(/^The transaction ran out of gas: send it again/);
    // Any other failure keeps the realm's message.
    expect(userMessage(new ChainError("delivertx", "gnoslinger: turn 2 is not the turn in progress"))).toBe("gnoslinger: turn 2 is not the turn in progress");
  });
});
