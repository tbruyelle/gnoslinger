import { describe, expect, it } from "vitest";
import type { TurnEvent } from "../chain/types";
import { segmentCells, segmentFills, turnSegmentCells } from "./segments";

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


describe("segmentCells", () => {
  it("names the plan entry filling each segment", () => {
    // Delay 1: Advance (entry 0) on 2-3, Turn (entry 1) on 4.
    expect(segmentCells([2, 1], 1).map((c) => c.action)).toEqual([-1, 0, 0, 1, -1]);
  });

  it("marks the segment each action executes on, the others prepare it", () => {
    // Advance (2) prepared on 1, executed on 2; Run (1) executed on 3.
    expect(segmentCells([2, 1], 0).map((c) => c.exec)).toEqual([false, true, true, false, false]);
  });

  it("counts delay gained in a segment from the next one", () => {
    // Advance on 2, Leap on 3 gaining 3 delay: the Turn would need 3+1+3 = 7, cancelled.
    expect(segmentCells([2, 1, 1], 0, [0, 0, 3, 0, 0]).map((c) => c.fill)).toEqual(["action", "action", "action", "delay", "delay"]);
  });

  it("stops when the character goes out", () => {
    expect(segmentCells([1, 1, 1], 0, [], 2).map((c) => c.fill)).toEqual(["action", "action", "empty", "empty", "empty"]);
  });
});

describe("turnSegmentCells", () => {
  const ev = (p: Partial<TurnEvent>): TurnEvent => ({
    seg: 0, p: 0, kind: "delay", action: "", from: "", to: "", facing: 0, down: false, n: 0, delay: 0, reason: "",
    card: 0, result: "", endurance: 0, target: -1, hit: "", range: 0, gun: "", gunId: 0, step: 0, chart: "", status: "", ...p,
  });

  it("reads the seat's delay: turn start, then per segment", () => {
    const events = [ev({ seg: 0, n: 1 }), ev({ p: 1, seg: 1, n: 4 }), ev({ seg: 2, n: 2 })];
    // Delay 1: Run executes on 2 and gains 2; the Turn needs 1+1+3 = 5.
    expect(turnSegmentCells([1, 1], 0, events, 0).map((c) => c.fill)).toEqual(["delay", "action", "delay", "delay", "action"]);
  });

  it("stops on a kill", () => {
    const events = [ev({ seg: 1, kind: "wound", result: "kill" })];
    expect(turnSegmentCells([1, 1], 0, events, 0).map((c) => c.fill)).toEqual(["action", "empty", "empty", "empty", "empty"]);
  });
});
