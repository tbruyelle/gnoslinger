import { describe, expect, it } from "vitest";
import { segmentFills } from "./segments";

describe("segmentFills", () => {
  it("leaves an empty plan empty", () => {
    expect(segmentFills([], 0)).toEqual(["empty", "empty", "empty", "empty", "empty"]);
  });

  it("fills each action over its cost, back from the segment it executes on", () => {
    // Advance (2) executes on 2, Run (1) on 3.
    expect(segmentFills([2, 1], 0)).toEqual(["action", "action", "action", "empty", "empty"]);
  });

  it("puts the carried delay first", () => {
    // Delay 2: Advance executes on 4.
    expect(segmentFills([2], 2)).toEqual(["delay", "delay", "action", "action", "empty"]);
  });

  it("shows carried delay with nothing planned", () => {
    expect(segmentFills([], 3)).toEqual(["delay", "delay", "delay", "empty", "empty"]);
  });
});

