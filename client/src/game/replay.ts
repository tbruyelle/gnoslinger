import { getActionDef, relativeToAbsoluteDir } from "../rules";
import type { BoardMap } from "../board/boardA";
import type { GroundGunView, GunLocation, GunView, PlayerStatus, WoundFields } from "../chain/types";
import { HAND_GROUND, MAX_AIM, gunInFiringBox, type GunMove, type PlanEntry } from "./plan";

/** What the board shows for one character. */
export interface CharView extends WoundFields {
  hex: string;
  /** Absolute facing 0=N 1=NE 2=SE 3=S 4=SW 5=NW. */
  facing: number;
  down: boolean;
  delay: number;
  status: PlayerStatus;
  /** The character's guns; the one in a hand shows on the token. */
  guns: GunView[];
  /** Ran away: the absolute direction it left the map in, for the token's exit. */
  away?: number;
  /** In a plan's preview: the guns its gun moves drop, each in the hex where it falls. */
  dropped?: { hex: string; gun: GunView }[];
}

/** The gun that can fire from its box: a one-handed gun in the gun hand or both hands. */
export const firingGun = gunInFiringBox;

/** Destination of a Draw & Cock by hand code (0 gun hand, 1 other hand, 2 both hands). */
const HAND_LOCATIONS: GunLocation[] = ["gun_hand", "other_hand", "both_hands"];

/** The gun held in a hand, if any. */
export function gunInHand(guns: GunView[]): GunView | null {
  return guns.find((g) => g.location !== "holstered") ?? null;
}

/** A copy of a character view that shares nothing with the original. */
export function copyChar(c: CharView): CharView {
  return { ...c, guns: c.guns.map((g) => ({ ...g })), dropped: c.dropped?.map((d) => ({ hex: d.hex, gun: { ...d.gun } })) };
}

/**
 * Applies gun moves (10.22) to a preview: the gun in both hands to a hand,
 * as it is, or a gun in a hand dropped in the hex, a cocked one going off
 * harmlessly (a shell less, uncocked) and the aim going with the gun it
 * would fire, as the realm does; a move its gun
 * no longer allows does nothing.
 */
function applyMoves(s: CharView, moves: GunMove[]) {
  for (const m of moves) {
    const i = s.guns.findIndex((g) => g.id === m.gun);
    const g = s.guns[i];
    if (!g) continue;
    if (m.to === HAND_GROUND) {
      if (g.location === "holstered") continue;
      // Dropping the gun it would fire loses the aim (the realm's gun_dropped).
      if (g.location === "gun_hand" || g.location === "both_hands") {
        s.aim = 0;
        s.aimAt = -1;
        s.aimHex = "";
      }
      const fell = { ...g, location: "holstered" as GunLocation, cocked: false, shells: g.cocked && g.shells > 0 ? g.shells - 1 : g.shells };
      s.guns.splice(i, 1);
      s.dropped = [...(s.dropped ?? []), { hex: s.hex, gun: fell }];
    } else if (g.location === "both_hands") {
      g.location = HAND_LOCATIONS[m.to];
    }
  }
}

/**
 * Previews where a plan would leave a character if every action executed:
 * each relative choice is resolved against the state left by the previous
 * one, exactly as the realm replays the committed plan. ground is the
 * weapons lying on the board as the chain has them: a pick-up finds its gun
 * in the hex the character stands in by then, as the realm checks it.
 * seatHexes is where each seat stands, for the aims and shots naming one.
 * Gun moves are done as their action is revealed; pendingMoves, those not
 * tied to an action yet, are shown last. Guns dropped go to dropped.
 */
export function replayPlan(
  start: CharView,
  plan: PlanEntry[],
  board: BoardMap,
  ground: GroundGunView[] = [],
  seatHexes: string[] = [],
  pendingMoves: GunMove[] = [],
): CharView {
  const s = copyChar(start);
  for (const e of plan) {
    if (s.status === "ran_away") break; // off the map: nothing more happens
    applyMoves(s, e.moves ?? []); // done as the action is revealed
    const def = getActionDef(e);
    // Revealing anything but a Turn, an aim or a shot loses the aim (12.44 as played here).
    const gunAction = def.name === "Cock/Aim/Shoot" || def.name === "Shoot";
    if (gunAction && !e.opt) continue; // option not picked yet: nothing to show
    if (!(def.name === "Turn" || (gunAction && (e.opt === "aim" || e.opt === "shoot")))) {
      s.aim = 0;
      s.aimAt = -1;
      s.aimHex = "";
    }
    if (gunAction && s.aim > 0) {
      // A new target keeps the markers only within one hex of their place,
      // and never moves them into or out of the character's own hex (12.5).
      const markers = s.aimAt >= 0 ? (seatHexes[s.aimAt] ?? "") : s.aimHex;
      const named = e.target !== undefined ? (seatHexes[e.target] ?? "") : (e.hex ?? "");
      const same = e.target !== undefined ? e.target === s.aimAt : s.aimAt < 0 && e.hex === s.aimHex;
      const ownHex = !same && (markers === s.hex) !== (named === s.hex);
      if (named && (!markers || board.distance(markers, named) > 1 || ownHex)) {
        s.aim = 0;
        s.aimAt = -1;
        s.aimHex = "";
      }
    }
    if (gunAction) {
      const g = firingGun(s.guns);
      if (!g) continue;
      switch (e.opt) {
        case "cock":
          if (!g.jammed) g.cocked = true;
          break;
        case "uncock":
          g.cocked = false;
          break;
        case "aim":
          if (!e.hex && e.target === undefined) break; // the target is not picked yet: nothing to show
          s.aim = Math.min(MAX_AIM, s.aim + 2);
          s.aimAt = e.target ?? -1; // the seat the markers follow, -1 for a hex
          s.aimHex = e.hex ?? "";
          break;
        case "shoot":
          if (g.cocked && g.shells > 0 && !g.jammed) {
            g.cocked = false;
            g.shells--;
          }
          s.aim = 0;
          s.aimAt = -1;
          s.aimHex = "";
          break;
      }
      continue;
    }
    if (def.choiceType === "gun") {
      // Draw & Cock: the gun (from a holster or a hand), or the one picked up from the hex, goes to the chosen box, cocked.
      const loc = HAND_LOCATIONS[e.hand ?? 0];
      if (e.groundGun !== undefined) {
        const lying = ground.find((x) => x.id === e.groundGun && x.hex === s.hex)?.guns[0];
        if (lying && loc) s.guns.push({ ...lying, id: Math.max(0, ...s.guns.map((x) => x.id)) + 1, location: loc, cocked: !lying.jammed });
        continue;
      }
      const g = s.guns.find((x) => x.id === e.gun);
      if (g && loc && g.location !== loc) {
        g.location = loc;
        g.cocked = !g.jammed; // a jammed gun stays uncocked until completely reloaded
      }
      continue;
    }
    if (def.name === "Load") {
      // One shell into the gun in both hands, which uncocks it; a jammed gun is cleared once full (13.31).
      const g = s.guns.find((x) => x.location === "both_hands");
      if (g && !g.exploded && g.shells < g.capacity) {
        g.shells++;
        g.cocked = false;
        if (g.jammed && g.shells === g.capacity) g.jammed = false;
      }
      continue;
    }
    if (def.category !== "foot") continue;
    switch (def.choiceType) {
      case "move_ahead":
      case "move_back":
        // Off the map, the character runs away (15.5).
        if (e.dir) {
          const to = board.relNeighbor(s.hex, s.facing, e.dir);
          if (to) s.hex = to;
          else {
            s.status = "ran_away";
            s.away = relativeToAbsoluteDir(s.facing, e.dir);
          }
        }
        break;
      case "turn_ahead":
      case "turn_back":
        if (e.dir) s.facing = relativeToAbsoluteDir(s.facing, e.dir);
        break;
      case "none":
        if (def.name === "Sprint") {
          const to = board.neighbor(s.hex, s.facing);
          if (to) s.hex = to;
          else {
            s.status = "ran_away";
            s.away = s.facing;
          }
        }
        else if (def.name === "Leap/Drop" || def.name === "Get Up/Down") s.down = !s.down;
        break;
    }
  }
  // Moves not tied to an action yet (pendingMoves) show as they would go with the next one.
  if (s.status !== "ran_away") applyMoves(s, pendingMoves);
  return s;
}
