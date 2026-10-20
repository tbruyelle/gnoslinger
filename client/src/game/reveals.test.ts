import { describe, expect, it } from "vitest";
import { DRAND_MARGIN, lastToCommit, openableSeats, ownRevealDue, summaryOpenable } from "./reveals";
import type { GameSummary } from "../chain/types";
import { roundTime } from "./commit";

const seat = (o: Partial<{ addr: string; status: "alive" | "out" | "killed"; committed: boolean; revealed: boolean; locked: string }> = {}) => ({
  addr: "g1x",
  status: "alive" as const,
  committed: false,
  revealed: false,
  locked: "",
  ...o,
});

describe("reveals", () => {
  it("knows the last plan to commit", () => {
    const players = [seat({ committed: true }), seat(), seat({ status: "killed" })];
    expect(lastToCommit({ phase: "planning", players }, 1)).toBe(true);
    expect(lastToCommit({ phase: "planning", players }, 0)).toBe(false); // already committed
    expect(lastToCommit({ phase: "planning", players: [seat(), seat(), seat()] }, 1)).toBe(false);
    expect(lastToCommit({ phase: "revealing", players }, 1)).toBe(false);
  });

  it("knows when my reveal is due", () => {
    expect(ownRevealDue({ phase: "revealing", players: [seat({ committed: true })] }, 0)).toBe(true);
    expect(ownRevealDue({ phase: "revealing", players: [seat({ committed: true, revealed: true })] }, 0)).toBe(false);
    expect(ownRevealDue({ phase: "planning", players: [seat({ committed: true })] }, 0)).toBe(false);
  });

  it("opens the timelocked plans once their round is out", () => {
    const view = {
      phase: "revealing" as const,
      lockRound: 1000,
      players: [seat({ committed: true, locked: "age…" }), seat({ revealed: true }), seat({ committed: true }), seat({ status: "out", locked: "age…" })],
    };
    expect(openableSeats(view, roundTime(1000) + DRAND_MARGIN - 1)).toEqual([]);
    expect(openableSeats(view, roundTime(1000) + DRAND_MARGIN)).toEqual([0]);
  });

  it("tells the lobby when a game has plans to open", () => {
    const g = (o: Partial<GameSummary>): GameSummary => ({
      id: "1", rev: 1, phase: "revealing", turn: 2, maxTurns: 10, timeout: 300, winner: -1, endReason: "", createdAt: 0, updatedAt: 0, timeoutAt: 0, lockRound: 1000,
      players: [{ addr: "g1a", char: "marshal", status: "alive", committed: true, revealed: true }, { addr: "g1b", char: "the_kid", status: "alive", committed: true, revealed: false }],
      ...o,
    });
    const at = roundTime(1000) + DRAND_MARGIN;
    expect(summaryOpenable(g({}), at - 1)).toBe(false);
    expect(summaryOpenable(g({}), at)).toBe(true);
    expect(summaryOpenable(g({ phase: "planning" }), at)).toBe(false);
    expect(summaryOpenable(g({ lockRound: 0 }), at)).toBe(false);
    expect(summaryOpenable(g({ players: [{ addr: "g1a", char: "marshal", committed: true, revealed: true }] }), at)).toBe(false);
  });
});
