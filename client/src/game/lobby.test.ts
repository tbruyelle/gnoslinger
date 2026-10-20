import { describe, expect, it } from "vitest";
import type { GameSummary } from "../chain/types";
import { CHAIN_CLOCK_MARGIN, claimable, formatLeft, OPEN_MAX_AGE, stillOffered, pastTimeout, lobbySections, MAX_MISSED, missOutcome, outcomeLine, runningOut, secondsLeft } from "./lobby";

const ME = "g1me";
const OTHER = "g1other";

function game(id: string, p: Partial<GameSummary>): GameSummary {
  return {
    id, rev: 1, phase: "planning", turn: 1, maxTurns: 20, timeout: 7200, winner: -1, endReason: "",
    createdAt: 0, updatedAt: 0, timeoutAt: 0, players: [], ...p,
  };
}

describe("lobbySections", () => {
  it("sorts my games by whose move it is, and keeps others' open games", () => {
    const mine = [
      game("1", { players: [{ addr: ME, char: "marshal", committed: false }, { addr: OTHER, char: "the_kid", committed: true }] }),
      game("2", { players: [{ addr: ME, char: "marshal", committed: true }, { addr: OTHER, char: "the_kid", committed: false }] }),
      game("3", { phase: "waiting", players: [{ addr: ME, char: "marshal" }, { addr: "", char: "" }] }),
      game("4", { phase: "finished", players: [{ addr: ME, char: "marshal" }, { addr: OTHER, char: "the_kid" }] }),
    ];
    const open = [mine[2], game("5", { phase: "waiting", players: [{ addr: OTHER, char: "marshal" }, { addr: "", char: "" }] })];
    const s = lobbySections({ mine, open }, ME, 0);
    expect(s.yourMove.map((g) => g.id)).toEqual(["1"]);
    expect(s.waiting.map((g) => g.id)).toEqual(["2", "3"]);
    expect(s.finished.map((g) => g.id)).toEqual(["4"]);
    expect(s.open.map((g) => g.id)).toEqual(["5"]);
  });

  it("puts my reveal in my move when this browser holds it and nothing sends it by itself", () => {
    const revealing = game("10", { phase: "revealing", timeoutAt: 1000, players: [{ addr: ME, char: "marshal", committed: true, revealed: false }, { addr: OTHER, char: "the_kid", committed: true, revealed: true }] });
    expect(lobbySections({ mine: [revealing], open: [] }, ME, 0).waiting.map((g) => g.id)).toEqual(["10"]);
    const s = lobbySections({ mine: [revealing], open: [] }, ME, 0, (g) => g.id === "10");
    expect(s.yourMove.map((g) => g.id)).toEqual(["10"]);
    expect(s.waiting).toEqual([]);
    // Past the reveals' grace, it is a claim.
    expect(claimable(revealing, 1000 + CHAIN_CLOCK_MARGIN)).toBe(true);
  });
});

describe("time left", () => {
  it("offers an open showdown for a week after its last join, whatever its turn timeout", () => {
    const g = game("1", { phase: "waiting", updatedAt: 1000, timeout: 300 });
    expect(stillOffered(g, 1000 + 3600)).toBe(true);
    expect(stillOffered(g, 1000 + OPEN_MAX_AGE)).toBe(false);
  });
  it("gives the chain's clock a margin past the timeout", () => {
    expect(pastTimeout(0, 9999)).toBe(false);
    expect(pastTimeout(1000, 1000 + CHAIN_CLOCK_MARGIN - 1)).toBe(false);
    expect(pastTimeout(1000, 1000 + CHAIN_CLOCK_MARGIN)).toBe(true);
  });
  it("counts to the turn's timeout, whatever changed since", () => {
    const g = game("1", { updatedAt: 1500, timeoutAt: 4600, timeout: 3600 });
    expect(secondsLeft(g, 1600)).toBe(3000 + CHAIN_CLOCK_MARGIN);
    expect(secondsLeft(g, 9000)).toBe(0);
  });

  it("reads in days, hours and minutes", () => {
    expect(formatLeft(110000)).toBe("1 d 6 h");
    expect(formatLeft(7500)).toBe("2 h 5 min");
    expect(formatLeft(2280)).toBe("38 min");
    expect(formatLeft(20)).toBe("under a minute");
  });

  it("runs out under 2 hours, or a quarter of a short timeout", () => {
    expect(runningOut(3600, 2 * 86400)).toBe(true);
    expect(runningOut(3 * 3600, 2 * 86400)).toBe(false);
    expect(runningOut(600, 1800)).toBe(false);
    expect(runningOut(400, 1800)).toBe(true);
  });
});

describe("outcomeLine", () => {
  it("names who won or gave up, me as you", () => {
    const players = [{ addr: ME, char: "marshal" }, { addr: OTHER, char: "the_kid" }];
    expect(outcomeLine(game("1", { phase: "finished", winner: 0, endReason: "last_standing", players }), ME)).toBe("won by you");
    expect(outcomeLine(game("1", { phase: "finished", winner: 0, endReason: "surrender", players }), ME)).toBe("The Kid surrendered");
    // With the victory points of the seat I played.
    expect(outcomeLine(game("1", { phase: "finished", winner: 0, endReason: "surrender", vp: [4, -6], players }), OTHER)).toBe("you surrendered · you −6 VP");
    // With more seats, the summaries say who is out of the fight.
    const three = [{ addr: ME, char: "marshal", status: "out" as const }, { addr: OTHER, char: "the_kid", status: "out" as const }, { addr: "g1c", char: "el_jefe", status: "alive" as const }];
    expect(outcomeLine(game("1", { phase: "finished", winner: 2, endReason: "surrender", vp: [-6, -6, 4], players: three }), ME)).toBe("you, The Kid surrendered · you −6 VP");
    expect(outcomeLine(game("1", { phase: "finished", winner: 2, endReason: "timeout", players: three }), "g1c")).toBe("Marshal, The Kid ran out of time");
  });

  it("does not wait for the plan of a character out of the fight", () => {
    const out = game("6", { players: [{ addr: ME, char: "marshal", status: "killed", committed: false }, { addr: OTHER, char: "the_kid", status: "alive", committed: false }, { addr: "g1c", char: "el_jefe", status: "alive", committed: true }] });
    const s = lobbySections({ mine: [out], open: [] }, ME, 0);
    expect(s.yourMove).toEqual([]);
    expect(s.waiting.map((g) => g.id)).toEqual(["6"]);
  });
});

describe("missOutcome", () => {
  it("passes the turn until the MAX_MISSED-th miss in a row", () => {
    expect(missOutcome({})).toBe("pass");
    expect(missOutcome({ missed: MAX_MISSED - 2 })).toBe("pass");
    expect(missOutcome({ missed: MAX_MISSED - 1 })).toBe("out");
  });
});

describe("claimable", () => {
  it("puts a running game out of time in my move, after the plans I owe", () => {
    const late = game("7", { timeoutAt: 300, timeout: 300, players: [{ addr: ME, char: "marshal", committed: true }, { addr: OTHER, char: "the_kid", committed: false }] });
    const mine = game("8", { timeoutAt: 8200, timeout: 7200, players: [{ addr: ME, char: "marshal", committed: false }, { addr: OTHER, char: "the_kid", committed: true }] });
    const open = game("9", { phase: "waiting", timeout: 300, players: [{ addr: ME, char: "marshal" }, { addr: "", char: "" }] });
    const due = 300 + CHAIN_CLOCK_MARGIN;
    expect(claimable(late, due)).toBe(true);
    expect(claimable(late, due - 1)).toBe(false);
    expect(claimable(open, due)).toBe(false);
    const s = lobbySections({ mine: [late, mine, open], open: [] }, ME, due);
    expect(s.yourMove.map((g) => g.id)).toEqual(["8", "7"]);
    expect(s.waiting.map((g) => g.id)).toEqual(["9"]);
  });
});
