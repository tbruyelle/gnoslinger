import { formatCoins } from "../chain/rpc";

/**
 * Stakes (the realm's stakes.gno): a showdown may be played for GNOT. Each
 * player puts the stake in (CreateGame and JoinGame send it, always signed
 * in Adena); the winner takes the pot less the house's cut, a draw splits
 * it between the seats tied for the most victory points, a showdown
 * cancelled or abandoned gives the stakes back.
 */

/** The share of the pot the house keeps, for events (the realm's HouseCutPercent). */
export const HOUSE_CUT_PERCENT = 5;

/** The stakes the New showdown form offers, in ugnot: free first. */
export const STAKE_OPTIONS = [0, 1, 5, 10, 25].map((gnot) => gnot * 1_000_000);

/** An amount of ugnot in GNOT: "5 GNOT", "9.5 GNOT". */
export function formatGnot(ugnot: number): string {
  return formatCoins(`${ugnot}ugnot`);
}

/** The stake as the form's select names it. */
export function stakeOption(ugnot: number): string {
  return ugnot === 0 ? "Free" : formatGnot(ugnot);
}

/** A showdown's stake and pot for its line or title: "5 GNOT stake · 10 GNOT pot", "" for a free one. */
export function stakeLine(g: { stake?: number; pot?: number }): string {
  if (!g.stake) return "";
  return `${formatGnot(g.stake)} stake · ${formatGnot(g.pot ?? 0)} pot`;
}

/** What the winner of a full pot takes, for the form's note. */
export function winnings(stake: number, seats: number): number {
  const pot = stake * seats;
  return pot - Math.floor((pot * HOUSE_CUT_PERCENT) / 100);
}

/**
 * What a finished showdown paid a seat, as its player reads it: "You won
 * 9.5 GNOT", "Your 5 GNOT stake came back", "You lost your 5 GNOT stake";
 * "" for a free showdown or one not paid yet.
 */
export function payoutLine(g: { stake?: number; payouts?: number[]; endReason?: string }, seat: number): string {
  if (!g.stake || !g.payouts?.length || seat < 0) return "";
  const got = g.payouts[seat] ?? 0;
  if (g.endReason === "abandoned") return `Your ${formatGnot(g.stake)} stake came back`;
  if (got === 0) return `You lost your ${formatGnot(g.stake)} stake`;
  return `You won ${formatGnot(got)}`;
}
