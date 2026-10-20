import { describe, expect, it } from "vitest";
import { lastToCommit, openableSeats, ownRevealDue } from "./reveals";
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
    expect(openableSeats(view, roundTime(1000) - 1)).toEqual([]);
    expect(openableSeats(view, roundTime(1000))).toEqual([0]);
  });
});
