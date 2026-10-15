import { describe, expect, it } from "vitest";
import type { GameSummary } from "../chain/types";
import { formatLeft, lobbySections, outcomeLine, runningOut, secondsLeft } from "./lobby";

const ME = "g1me";
const OTHER = "g1other";

function game(id: string, p: Partial<GameSummary>): GameSummary {
  return {
    id, rev: 1, phase: "planning", turn: 1, maxTurns: 20, timeout: 7200, winner: -1, endReason: "",
    createdAt: 0, updatedAt: 0, players: [], ...p,
  };
}

describe("lobbySections", () => {
  it("sorts my games by whose move it is, and keeps others' open games", () => {
    const mine = [
      game("1", { players: [{ addr: ME, char: "marshal", submitted: false }, { addr: OTHER, char: "the_kid", submitted: true }] }),
      game("2", { players: [{ addr: ME, char: "marshal", submitted: true }, { addr: OTHER, char: "the_kid", submitted: false }] }),
      game("3", { phase: "waiting", players: [{ addr: ME, char: "marshal" }, { addr: "", char: "" }] }),
      game("4", { phase: "finished", players: [{ addr: ME, char: "marshal" }, { addr: OTHER, char: "the_kid" }] }),
    ];
    const open = [mine[2], game("5", { phase: "waiting", players: [{ addr: OTHER, char: "marshal" }, { addr: "", char: "" }] })];
    const s = lobbySections({ mine, open }, ME);
    expect(s.yourMove.map((g) => g.id)).toEqual(["1"]);
    expect(s.waiting.map((g) => g.id)).toEqual(["2", "3"]);
    expect(s.finished.map((g) => g.id)).toEqual(["4"]);
    expect(s.open.map((g) => g.id)).toEqual(["5"]);
  });
});

describe("time left", () => {
  it("counts from the last change", () => {
    const g = game("1", { updatedAt: 1000, timeout: 3600 });
    expect(secondsLeft(g, 1600)).toBe(3000);
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
  });
});
