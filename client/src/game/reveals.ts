import type { GameSummary, PlayerStatus } from "../chain/types";
import { roundTime } from "./commit";

/**
 * What the hidden plans (DESIGN_HIDDEN_PLANS.md) wait for from this
 * browser, read off the game view: my own reveal, the timelocked plans to
 * open, and whether my plan is the last to commit (then it goes in clear).
 */

/** A seat as the game view and the lobby's summaries both carry it. */
interface Seat {
  addr: string;
  status?: PlayerStatus;
  committed?: boolean;
  revealed?: boolean;
  locked?: string;
}

const inFight = (p: Seat | undefined) => !!p?.addr && (p.status ?? "alive") === "alive";

/** Whether every other character in the fight committed: my plan, the last, can then be revealed at once, in clear. */
export function lastToCommit(view: { phase: string; players: Seat[] }, seat: number): boolean {
  if (view.phase !== "planning" || !inFight(view.players[seat]) || view.players[seat]?.committed) return false;
  return view.players.every((p, i) => i === seat || !inFight(p) || p.committed);
}

/** Whether my committed plan waits for its reveal (the game collects them and mine is not in). */
export function ownRevealDue(view: { phase: string; players: Seat[] }, seat: number): boolean {
  const p = view.players[seat];
  return view.phase === "revealing" && inFight(p) && !p?.revealed;
}

/** The seats whose timelocked plan can be opened now: in the fight, not revealed, a timelocked plan, its drand round out. */
export function openableSeats(view: { phase: string; players: Seat[]; lockRound: number }, nowSec: number): number[] {
  if (view.phase !== "revealing" || !view.lockRound || nowSec < roundTime(view.lockRound)) return [];
  return view.players.flatMap((p, i) => (inFight(p) && !p.revealed && p.locked ? [i] : []));
}

/** In the lobby: my reveal is due in that game (the summary has no timelocked plans, the game screen opens those). */
export function summaryRevealDue(g: GameSummary, seat: number): boolean {
  return seat >= 0 && ownRevealDue(g, seat);
}
