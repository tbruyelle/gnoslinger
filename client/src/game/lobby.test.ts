import { describe, expect, it } from "vitest";
import type { GameSummary } from "../chain/types";
import { CHAIN_CLOCK_MARGIN, claimable, formatLeft, OPEN_MAX_AGE, stillOffered, pastTimeout, lobbySections, MAX_MISSED, missOutcome, myResult, outcomeLine, runningOut, secondsLeft } from "./lobby";

const ME = "g1me";
const OTHER = "g1other";

type Seat = GameSummary["players"][number];

/** A summary as the realm writes it, every field and every seat's filled in. */
function game(id: string, p: Partial<Omit<GameSummary, "players">> & { players?: (Partial<Seat> & Pick<Seat, "addr" | "char">)[] }): GameSummary {
  return {
    id, rev: 1, phase: "planning", turn: 1, maxTurns: 20, timeout: 7200, winner: -1, endReason: "",
    vp: [], stake: 0, pot: 0, payouts: [], houseCut: 0, lockRound: 0, createdAt: 0, updatedAt: 0, timeoutAt: 0, ...p,
    players: (p.players ?? []).map((s) => ({ name: "", status: "alive", committed: false, revealed: false, ...s })),
  };
}

describe("lobbySections", () => {
  it("offers the showdowns being played to watch, and the last finished to replay, but mine", () => {
    const theirs = game("7", { players: [{ addr: OTHER, char: "marshal" }, { addr: "g1c", char: "the_kid" }] });
    const mine = game("8", { players: [{ addr: ME, char: "marshal" }, { addr: OTHER, char: "the_kid" }] });
    const over = (g: GameSummary) => ({ ...g, phase: "finished" as const, endReason: "last_standing", winner: 0 });
    const s = lobbySections({ name: "", open: [], live: [theirs, mine], ended: [over(theirs), over(mine)], mine: [mine] }, ME, 0);
    expect(s.live.map((g) => g.id)).toEqual(["7"]);
    expect(s.ended.map((g) => g.id)).toEqual(["7"]);
    // Told as nobody's: "you" is for my own games.
    expect(outcomeLine(s.ended[0], "")).toBe("won by Marshal");
  });

  it("sorts my games by whose move it is, and keeps others' open games", () => {
    const mine = [
      game("1", { players: [{ addr: ME, char: "marshal", committed: false }, { addr: OTHER, char: "the_kid", committed: true }] }),
      game("2", { players: [{ addr: ME, char: "marshal", committed: true }, { addr: OTHER, char: "the_kid", committed: false }] }),
      game("3", { phase: "waiting", players: [{ addr: ME, char: "marshal" }, { addr: "", char: "" }] }),
      game("4", { phase: "finished", players: [{ addr: ME, char: "marshal" }, { addr: OTHER, char: "the_kid" }] }),
    ];
    const open = [mine[2], game("5", { phase: "waiting", players: [{ addr: OTHER, char: "marshal" }, { addr: "", char: "" }] })];
    const s = lobbySections({ name: "", live: [], ended: [], mine, open }, ME, 0);
    expect(s.yourMove.map((g) => g.id)).toEqual(["1"]);
    expect(s.waiting.map((g) => g.id)).toEqual(["2", "3"]);
    expect(s.finished.map((g) => g.id)).toEqual(["4"]);
    expect(s.open.map((g) => g.id)).toEqual(["5"]);
  });

  it("puts my reveal in my move when this browser holds it and nothing sends it by itself", () => {
    const revealing = game("10", { phase: "revealing", timeoutAt: 1000, players: [{ addr: ME, char: "marshal", committed: true, revealed: false }, { addr: OTHER, char: "the_kid", committed: true, revealed: true }] });
    expect(lobbySections({ name: "", live: [], ended: [], mine: [revealing], open: [] }, ME, 0).waiting.map((g) => g.id)).toEqual(["10"]);
    const s = lobbySections({ name: "", live: [], ended: [], mine: [revealing], open: [] }, ME, 0, (g) => g.id === "10");
    expect(s.yourMove.map((g) => g.id)).toEqual(["10"]);
    expect(s.waiting).toEqual([]);
    // Past the reveals' grace, it is a claim, unless a plan is still to reveal or to open.
    expect(claimable(revealing, 1000 + CHAIN_CLOCK_MARGIN)).toBe(true);
    const late = lobbySections({ name: "", live: [], ended: [], mine: [revealing], open: [] }, ME, 1000 + CHAIN_CLOCK_MARGIN, () => false, (g) => g.id === "10");
    expect(late.yourMove.map((g) => g.id)).toEqual(["10"]);
    expect(late.waiting).toEqual([]);
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
    const players = [{ addr: ME, char: "marshal" }, { addr: OTHER, char: "the_kid", status: "out" as const }];
    expect(outcomeLine(game("1", { phase: "finished", winner: 0, endReason: "last_standing", players }), ME)).toBe("won by you");
    // Who gave up: the seats out of the fight.
    expect(outcomeLine(game("1", { phase: "finished", winner: 0, endReason: "surrender", players }), ME)).toBe("The Kid surrendered");
    // With the victory points of the seat I played.
    expect(outcomeLine(game("1", { phase: "finished", winner: 0, endReason: "surrender", vp: [4, -6], players }), OTHER)).toBe("you surrendered · you −6 VP");
    // With more seats, several may be out.
    const three = [{ addr: ME, char: "marshal", status: "out" as const }, { addr: OTHER, char: "the_kid", status: "out" as const }, { addr: "g1c", char: "reb", status: "alive" as const }];
    expect(outcomeLine(game("1", { phase: "finished", winner: 2, endReason: "surrender", vp: [-6, -6, 4], players: three }), ME)).toBe("you, The Kid surrendered · you −6 VP");
    expect(outcomeLine(game("1", { phase: "finished", winner: 2, endReason: "timeout", players: three }), "g1c")).toBe("Marshal, The Kid ran out of time");
  });

  it("does not wait for the plan of a character out of the fight", () => {
    const out = game("6", { players: [{ addr: ME, char: "marshal", status: "killed", committed: false }, { addr: OTHER, char: "the_kid", status: "alive", committed: false }, { addr: "g1c", char: "reb", status: "alive", committed: true }] });
    const s = lobbySections({ name: "", live: [], ended: [], mine: [out], open: [] }, ME, 0);
    expect(s.yourMove).toEqual([]);
    expect(s.waiting.map((g) => g.id)).toEqual(["6"]);
  });
});

describe("myResult", () => {
  it("says whether I won, lost or drew a game played out", () => {
    const players = [{ addr: ME, char: "marshal" }, { addr: OTHER, char: "the_kid" }];
    expect(myResult(game("1", { phase: "finished", winner: 0, endReason: "last_standing", players }), ME)).toBe("won");
    expect(myResult(game("1", { phase: "finished", winner: 0, endReason: "surrender", players }), OTHER)).toBe("lost");
    expect(myResult(game("1", { phase: "finished", winner: -1, endReason: "max_turns", players }), ME)).toBe("draw");
    // Not over, or not my game: nothing to say.
    expect(myResult(game("1", { phase: "planning", players }), ME)).toBeNull();
    expect(myResult(game("1", { phase: "finished", winner: 0, endReason: "last_standing", players }), "g1c")).toBeNull();
  });
});

describe("missOutcome", () => {
  it("passes the turn until the MAX_MISSED-th miss in a row", () => {
    expect(missOutcome({ missed: 0 })).toBe("pass");
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
    const s = lobbySections({ name: "", live: [], ended: [], mine: [late, mine, open], open: [] }, ME, due);
    expect(s.yourMove.map((g) => g.id)).toEqual(["8", "7"]);
    expect(s.waiting.map((g) => g.id)).toEqual(["9"]);
  });
});
