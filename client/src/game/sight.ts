import type { BoardMap } from "../board/boardA";
import { HEIGHT_DOWN, HEIGHT_UPRIGHT, type Height } from "../rules";
import type { CharView } from "./replay";

/**
 * A character's height for the line of sight (30.32), as the realm's
 * engine: upright, or DOWN unless it lies on an obstacle, where it counts
 * as upright.
 */
export function sightHeight(c: CharView, board: BoardMap): Height {
  return c.down && !board.obstacle(c.hex) ? HEIGHT_DOWN : HEIGHT_UPRIGHT;
}

/**
 * Whether `me` has a clear line of sight (rule 31) to its target, as the
 * realm decides it: the character `target` when given, wherever it stands
 * and at its height, else the hex `at`, which counts as upright (31.3).
 * blocker names the obstacle in the way. The aim zone is checked apart.
 */
export function canSee(board: BoardMap, me: CharView, at: string, target?: CharView | null): { clear: boolean; blocker: string } {
  const hTo = target ? sightHeight(target, board) : HEIGHT_UPRIGHT;
  return board.lineOfSight(me.hex, target ? target.hex : at, sightHeight(me, board), hTo);
}

/** The alive character of another seat standing on a hex, if any: a shot or an aim at that hex is at it. */
export function standingOn(chars: (CharView | null | undefined)[], hex: string, except: number): CharView | null {
  return chars.find((c, i) => i !== except && !!c && c.status === "alive" && c.hex === hex) ?? null;
}
