import type { RealmClient } from "../chain/realm";
import type { GameView } from "../chain/types";
import { openLocked, type Sealed } from "./commit";

/** A reveal to send: a seat's salt and plan. */
export interface SeatReveal extends Sealed {
  seat: number;
}

/**
 * Opens the timelocked plans of seats (one drand round opens them all) and
 * reveals them in one transaction, with my own pending reveal if any, as
 * the game screen and the lobby both do. A plan that does not open is left
 * out, and the realm skips one that does not match its commit. Returns the
 * seats revealed; [] when nothing could be decrypted (drand's round not
 * served yet, or broken copies), nothing being sent then. Throws when the
 * transaction fails.
 */
export async function openAndReveal(realm: RealmClient, view: GameView, seats: number[], mine: SeatReveal | null): Promise<number[]> {
  const reveals: SeatReveal[] = mine ? [mine] : [];
  for (const seat of seats) {
    if (seat === mine?.seat) continue;
    try {
      const s = await openLocked(view.players[seat].locked);
      // A ";" would break RevealMany's lists.
      if (!s.plan.includes(";")) reveals.push({ seat, ...s });
    } catch {
      // not openable (yet, or broken)
    }
  }
  if (reveals.length === (mine ? 1 : 0)) return [];
  if (reveals.length === 1) await realm.reveal(view.id, view.turn, reveals[0].seat, reveals[0].salt, reveals[0].plan);
  else await realm.revealMany(view.id, view.turn, reveals);
  return reveals.map((r) => r.seat);
}
