import type { GameSummary, GamesView } from "../chain/types";
import { signedVP } from "./vp";

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
  /** Running games waiting for my plan, then those out of time I may claim. */
  yourMove: GameSummary[];
  /** My games waiting on someone else: a second player, or the others' plans. */
  waiting: GameSummary[];
  finished: GameSummary[];
  /** Games waiting for a player, not mine. */
  open: GameSummary[];
}

/** A running game: its plans are committed or revealed. */
export function running(g: { phase: string }): boolean {
  return g.phase === "planning" || g.phase === "revealing";
}

/**
 * Sorts the games of a player (address me) into the lobby's sections at
 * nowSec (unix seconds): a plan is mine to send while my character is in the
 * fight and its plan is not committed, my reveal is mine to send when
 * revealWaits says this browser holds it and nothing sends it by itself,
 * and a running game out of time is mine to claim.
 */
export function lobbySections(games: GamesView, me: string, nowSec: number, revealWaits: (g: GameSummary) => boolean = () => false): LobbySections {
  const myPlan = (g: GameSummary) => {
    const s = g.players.find((p) => p.addr === me);
    return g.phase === "planning" && !!s && !s.committed && (s.status ?? "alive") === "alive";
  };
  const myMove = (g: GameSummary) => myPlan(g) || (g.phase === "revealing" && revealWaits(g)) || claimable(g, nowSec);
  return {
    yourMove: [
      ...games.mine.filter((g) => myPlan(g) || (g.phase === "revealing" && revealWaits(g) && !claimable(g, nowSec))),
      ...games.mine.filter((g) => running(g) && !myPlan(g) && claimable(g, nowSec)),
    ],
    waiting: games.mine.filter((g) => g.phase === "waiting" || (running(g) && !myMove(g))),
    finished: games.mine.filter((g) => g.phase === "finished"),
    open: games.open.filter((g) => !g.players.some((p) => p.addr === me)),
  };
}

/** Turns in a row a player may let time out (the realm's MaxMissed): each claimed one is passed for them, the last puts them out of the fight. */
export const MAX_MISSED = 3;

/** What claiming the timeout does to a seat without a plan: passes its turn, or puts it out at its MAX_MISSED-th miss in a row. */
export function missOutcome(p: { missed?: number }): "pass" | "out" {
  return (p.missed ?? 0) + 1 >= MAX_MISSED ? "out" : "pass";
}

/**
 * Seconds a timeout is given past the wall clock: the chain's clock (the
 * block time) trails it by about a block, and the JSON's times are rounded
 * down to the second, so a claim sent right at the timeout would be refused.
 */
export const CHAIN_CLOCK_MARGIN = 3;

/** Whether the turn ending at timeoutAt (unix seconds, 0 for none) is out of time at nowSec, with the chain's clock margin. */
export function pastTimeout(timeoutAt: number, nowSec: number): boolean {
  return timeoutAt > 0 && nowSec >= timeoutAt + CHAIN_CLOCK_MARGIN;
}

/** A running game whose turn is out of time: it takes no more plans (or, revealing, its reveals' grace is over), anyone may claim it. */
export function claimable(g: GameSummary, nowSec: number): boolean {
  return running(g) && secondsLeft(g, nowSec) === 0;
}

/** How long an open showdown is offered without anyone joining: the realm keeps it open, the lobby stops listing it. */
export const OPEN_MAX_AGE = 7 * 86400;

/** Whether an open showdown is still offered at nowSec: someone joined, or it was called, within OPEN_MAX_AGE. */
export function stillOffered(g: GameSummary, nowSec: number): boolean {
  return nowSec - g.updatedAt < OPEN_MAX_AGE;
}

/** Seconds left in a running game's turn before anyone may claim it (0 once it is due, CHAIN_CLOCK_MARGIN included); nowSec in unix seconds. */
export function secondsLeft(g: GameSummary, nowSec: number): number {
  return Math.max(0, g.timeoutAt + CHAIN_CLOCK_MARGIN - nowSec);
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

/** "3 of 4 seats taken", for a game waiting for players. */
export function seatsTaken(g: GameSummary): string {
  const taken = g.players.filter((p) => p.addr).length;
  return `${taken} of ${g.players.length} seats taken`;
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
  // Who gave up or ran out of time: the seats out of the fight by status; without it (older summaries), the loser of a duel.
  const out = g.players.flatMap((p, i) => (p.addr && p.status === "out" ? [who(i)] : []));
  const losers = out.length > 0 ? out.join(", ") : who(1 - g.winner);
  switch (g.endReason) {
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired, the seats never filled up";
    case "surrender":
      return `${losers} surrendered` + myVP(g, me);
    case "timeout":
      return `${losers} ran out of time` + myVP(g, me);
    case "abandoned":
      return "abandoned";
    case "all_down":
      return (g.winner >= 0 ? `everyone out of the fight, won by ${who(g.winner)}` : "everyone out of the fight: a draw") + myVP(g, me);
    default:
      return (g.winner >= 0 ? `won by ${who(g.winner)}` : `a draw after ${g.turn} turns`) + myVP(g, me);
  }
}

/** " · you +4 VP" when I played the game and it earned points; "" otherwise. */
function myVP(g: GameSummary, me: string): string {
  const seat = g.players.findIndex((p) => p.addr && p.addr === me);
  const v = seat >= 0 ? g.vp?.[seat] : undefined;
  return v === undefined ? "" : ` · you ${signedVP(v)} VP`;
}
