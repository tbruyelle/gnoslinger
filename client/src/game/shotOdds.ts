import type { BoardMap } from "../board/boardA";
import { hitChance, type HitChance } from "../rules/hitChance";
import { gunInFiringBox } from "./plan";
import type { CharView } from "./replay";
import { canSee } from "./sight";

/** Aim time printed on the shooting actions for a one-handed gun (13.52). */
export const COCK_AIM_SHOOT_AIM_TIME = 2;
export const SHOOT_AIM_TIME = 1;

export interface ShotOdds extends HitChance {
  aimTime: number;
  range: number;
  /** AIM points the shot would use. */
  aimPoints: number;
  /** Whether the target is in sight (rule 31); without it the shot is cancelled, so the chances read 0. */
  los: boolean;
  /** The obstacle in the way when the target is out of sight, "" otherwise. */
  blocker: string;
}

/**
 * The chance of hitting target from where me stands, as the realm computes
 * the shot: the card's aim time + AIM points − the arm wounds of the hands
 * holding the gun, at the range between the hexes. AIM points count only
 * when the target is within one hex of the markers and on the same side of
 * the shooter's own hex (both in it or both out of it, 12.5); markersHex is
 * where they stand (the aimed hex, or the hex of the character they follow).
 * standing is the character standing on the target hex, if any: the sight
 * (rule 31) is traced to it at its height, else to the hex.
 */
export function shotOdds(me: CharView, cardAimTime: number, target: string, markersHex: string, board: BoardMap, standing?: CharView | null): ShotOdds {
  const kept = markersHex !== "" && board.distance(markersHex, target) <= 1 && (markersHex === me.hex) === (target === me.hex);
  const aimPoints = me.aim > 0 && kept ? me.aim : 0;
  const gun = gunInFiringBox(me.guns);
  let wounds = 0;
  if (gun?.location === "gun_hand" || gun?.location === "both_hands") wounds += me.gunArm;
  if (gun?.location === "other_hand" || gun?.location === "both_hands") wounds += me.otherArm;
  const aimTime = cardAimTime + aimPoints - wounds;
  const range = board.distance(me.hex, target);
  const sight = canSee(board, me, target, standing);
  const chance = sight.clear ? hitChance(aimTime, range) : { hit: 0, bullseye: 0 };
  return { ...chance, aimTime, range, aimPoints, los: sight.clear, blocker: sight.blocker };
}
