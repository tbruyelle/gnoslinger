import type { GameView } from "../chain/types";
import { formatDuration, seatsTaken } from "./lobby";
import { routeHash } from "./route";
import { nextSeat } from "./setup";
import { formatGnot } from "./stakes";

/**
 * What the showdown's Share button copies: an invitation to join while a
 * seat is free (the terms, not the character: the seats fill up in join
 * order, so it may be another by then), else to come and watch as a
 * spectator, or watch the replay once over, then the showdown's link
 * (game/route.ts), which opens it on the game screen where a newcomer
 * connects Adena and joins.
 */
export function shareText(view: GameView, base: string, me = ""): string {
  const link = base + routeHash(view.id);
  const seat = view.phase === "waiting" ? nextSeat(view.players) : -1;
  if (seat >= 0) {
    const terms = [seatsTaken(view), `${view.maxTurns} turns`, `${formatDuration(view.timeout)} per turn`, view.stake ? `${formatGnot(view.stake)} stake` : "played for the glory"].join(", ");
    const whose = me && view.players.some((p) => p.addr === me) ? "my" : "this";
    return `Draw, partner! Join ${whose} Gnoslinger showdown on gno.land (${terms}): ${link}`;
  }
  if (view.phase === "finished") return `The dust has settled: watch the replay of this Gnoslinger showdown on gno.land, turn by turn: ${link}`;
  return `Pull up a chair, the lead is flying! Watch this Gnoslinger showdown on gno.land from the spectators' bench: ${link}`;
}
