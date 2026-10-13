import type { GameSummary, GamesView } from "../chain/types";

/** "fast_eddie" -> "Fast Eddie". */
export function charName(key: string | undefined): string {
  if (!key) return "?";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** The lobby's sections, each newest first as the realm lists them. */
export interface LobbySections {
  /** Running games waiting for my plan. */
  yourMove: GameSummary[];
  /** My games waiting on someone else: a second player, or the others' plans. */
  waiting: GameSummary[];
  finished: GameSummary[];
  /** Games waiting for a player, not mine. */
  open: GameSummary[];
}

/** Sorts the games of a player (address me) into the lobby's sections. */
export function lobbySections(games: GamesView, me: string): LobbySections {
  const mySeat = (g: GameSummary) => g.players.find((p) => p.addr === me);
  return {
    yourMove: games.mine.filter((g) => g.phase === "planning" && !mySeat(g)?.submitted),
    waiting: games.mine.filter((g) => g.phase === "waiting" || (g.phase === "planning" && !!mySeat(g)?.submitted)),
    finished: games.mine.filter((g) => g.phase === "finished"),
    open: games.open.filter((g) => !g.players.some((p) => p.addr === me)),
  };
}

/** Seconds left before anyone may claim the game's timeout (0 once it is due); nowSec in unix seconds. */
export function secondsLeft(g: GameSummary, nowSec: number): number {
  return Math.max(0, g.updatedAt + g.timeout - nowSec);
}

/** 110000 -> "1 d 6 h", 7500 -> "2 h 5 min", 2280 -> "38 min". */
export function formatLeft(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return m > 0 ? `${m} min` : "under a minute";
}

/** Time is running out: under 2 hours left, or under a quarter of the game's timeout when that is shorter. */
export function runningOut(left: number, timeout: number): boolean {
  return left < Math.min(2 * 3600, timeout / 4);
}

/** 172800 seconds -> "2 days", 1800 -> "30 min". */
export function formatDuration(seconds: number): string {
  if (!seconds) return "?";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h > 1 ? "s" : ""}`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? "s" : ""}`;
}

/** How a finished game ended, from my point of view (address me). */
export function outcomeLine(g: GameSummary, me: string): string {
  const who = (seat: number) => {
    const p = g.players[seat];
    return p?.addr ? (p.addr === me ? "you" : charName(p.char)) : "?";
  };
  switch (g.endReason) {
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired, nobody joined";
    case "resign":
      return `${who(1 - g.winner)} resigned`;
    case "timeout":
      return `${who(1 - g.winner)} ran out of time`;
    case "abandoned":
      return "abandoned";
    case "all_down":
      return "everyone out of the fight: a draw";
    default:
      return g.winner >= 0 ? `won by ${who(g.winner)}` : `a draw after ${g.turn} turns`;
  }
}
