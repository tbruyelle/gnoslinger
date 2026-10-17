import { END_OF_TURN_SEG, type GroundGunView, type GunLocation, type TurnEvent, type TurnResult } from "../chain/types";
import { copyChar, type CharView } from "./replay";
import { signedVP, vpReason } from "./vp";

export const SEGMENTS = 5;

/** A position in a replay: which turn (index into the list) and the segment shown (0 = start). */
export interface ReplayPos {
  index: number;
  seg: number;
}

/** The next position, moving into the next turn after segment 5; null at the very end. */
export function stepForward(pos: ReplayPos, turns: number): ReplayPos | null {
  if (pos.seg < SEGMENTS) return { index: pos.index, seg: pos.seg + 1 };
  if (pos.index + 1 < turns) return { index: pos.index + 1, seg: 0 };
  return null;
}

/** The previous position, moving to the previous turn's end before segment 0; null at the very start. */
export function stepBack(pos: ReplayPos): ReplayPos | null {
  if (pos.seg > 0) return { index: pos.index, seg: pos.seg - 1 };
  if (pos.index > 0) return { index: pos.index - 1, seg: SEGMENTS };
  return null;
}

/** The characters' state when a turn began, from the stored snapshot. */
export function startOfTurn(t: TurnResult, fallback: CharView[]): CharView[] {
  if (!t.start || t.start.length === 0) return fallback.map(copyChar);
  return t.start.map((c) => ({
    hex: c.hex, facing: c.facing, down: c.down, delay: c.delay, status: c.status ?? "alive",
    aim: c.aim ?? 0, aimAt: c.aimAt ?? -1, aimHex: c.aimHex ?? "", endurance: c.endurance ?? 20, serious: c.serious ?? 0, gunArm: c.gunArm ?? 0, otherArm: c.otherArm ?? 0, leg: c.leg ?? 0,
    guns: (c.guns ?? []).map((g) => ({ ...g })),
  }));
}

/**
 * The characters' state once every event up to and including segment seg
 * has applied: turn-start events (seg 0) always, end-of-turn events
 * (END_OF_TURN_SEG) from segment 5. When ground is given, the guns dropped
 * in hexes by then are appended to it. cut, an index into events, stops
 * before that event: the segment shown up to one of its steps.
 */
export function snapshotAfterSegment(start: CharView[], events: TurnEvent[], seg: number, ground?: GroundGunView[], cut?: number): CharView[] {
  const out = start.map(copyChar);
  for (const [i, e] of events.entries()) {
    if (cut !== undefined && i >= cut) break; // a step of the segment not shown yet, and all that follows
    if (e.seg === END_OF_TURN_SEG ? seg < SEGMENTS : e.seg > seg) continue;
    const c = out[e.p];
    if (!c) continue;
    const gun = c.guns.find((x) => x.id === e.gunId);
    switch (e.kind) {
      case "move":
        c.hex = e.to;
        c.facing = e.facing;
        c.down = e.down;
        break;
      case "turn":
        c.facing = e.facing;
        break;
      case "flip":
        c.down = e.down;
        break;
      case "delay":
        c.delay = e.delay;
        if (e.endurance) c.endurance = Math.max(0, c.endurance - e.endurance);
        break;
      case "draw":
        if (e.from === "ground") {
          // Picked up from the hex: the gun comes off the ground list with its new id.
          const i = ground ? ground.findIndex((g) => g.id === e.n) : -1;
          const lying = i >= 0 && ground ? ground[i].guns[0] : undefined;
          if (lying) c.guns.push({ ...lying, id: e.gunId, location: e.to as GunLocation, cocked: !lying.jammed });
          if (i >= 0 && ground) ground.splice(i, 1);
        } else if (gun) {
          gun.location = e.to as GunLocation;
          gun.cocked = !gun.jammed;
        }
        break;
      case "wild_shot":
      case "shot":
        if (gun) {
          gun.cocked = false;
          gun.shells = Math.max(0, gun.shells - 1);
        }
        if (e.kind === "shot") {
          // Revealing the shot moved the markers onto its target (12.5); the aim is spent right after (lose_aim).
          c.aimAt = e.target;
          c.aimHex = "";
        }
        break;
      case "cock":
        if (gun) gun.cocked = true;
        break;
      case "load":
        if (gun) {
          gun.shells = e.n;
          gun.cocked = false;
          if (e.result === "unjammed") gun.jammed = false;
        }
        break;
      case "uncock":
        if (gun) gun.cocked = false;
        break;
      case "malfunction":
        if (gun && e.result === "jams") {
          gun.shells = 0;
          gun.jammed = true;
        } else if (gun && e.result === "explodes") gun.exploded = true;
        break;
      case "drop_gun":
        if (gun && ground) ground.push({ id: e.n, hex: e.to, guns: [{ ...gun, location: "holstered" }] });
        c.guns = c.guns.filter((x) => x.id !== e.gunId);
        break;
      case "aim":
        c.aim = e.n;
        c.aimAt = e.target;
        c.aimHex = e.target >= 0 ? "" : e.to;
        break;
      case "lose_aim":
        c.aim = 0;
        c.aimAt = -1;
        c.aimHex = "";
        break;
      case "wound":
        switch (e.result) {
          case "kill":
            c.status = "killed";
            c.down = true;
            c.aim = 0;
            c.aimAt = -1;
            c.aimHex = "";
            c.delay = 0;
            c.endurance = 0;
            break;
          case "serious":
            c.serious += e.n;
            break;
          case "gun_arm":
            c.gunArm += e.n;
            break;
          case "other_arm":
            c.otherArm += e.n;
            break;
          case "leg":
            c.leg += e.n;
            break;
        }
        break;
      case "pass_out":
        c.status = "passed_out";
        c.down = true;
        c.aim = 0;
        c.aimAt = -1;
        c.aimHex = "";
        break;
    }
  }
  return out;
}

/** The events of one segment; segment 0 holds the turn-start events (fatigue, aim lost on the first reveal). */
export function eventsForSegment(events: TurnEvent[], seg: number): TurnEvent[] {
  return events.filter((e) => e.seg === seg);
}

/**
 * A segment's events split into the steps that resolved one after the
 * other (shots, each seat's action in seat order, the end of the segment),
 * as runs of the same step; a turn recorded before steps existed is one.
 */
export function splitSteps(events: TurnEvent[]): TurnEvent[][] {
  const out: TurnEvent[][] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (last && last[0].step === e.step) last.push(e);
    else out.push([e]);
  }
  return out;
}

/** Events recorded after segment 5: cancellations, passing out, the serious-wound check. */
export function endOfTurnEvents(events: TurnEvent[]): TurnEvent[] {
  return events.filter((e) => e.seg === END_OF_TURN_SEG);
}

const DIRS = ["N", "NE", "SE", "S", "SW", "NW"];
const GUN_NAMES: Record<string, string> = { colt45: "Colt 45" };

/** What a shot's miss is put down to. */
const MISS_REASONS: Record<string, string> = { out_of_zone: "out of the aim zone", empty_hex: "empty hex" };

/** What a cancel or an aim loss is put down to: a target out of sight names the obstacle in the way (rule 31). */
function reasonText(e: TurnEvent): string {
  if (e.reason === "no_los") return e.to ? `no line of sight, ${e.to} in the way` : "no line of sight";
  return e.reason.replace(/_/g, " ");
}

/** What a MALFUNCTION card drawn for a shot did, by its result. */
const MALFUNCTION_LINES: Record<string, string> = {
  no_effect: "MALFUNCTION, no effect: discarded, draws again",
  misfire: "MALFUNCTION, misfire: the shot is cancelled, draws for the gun",
  no_penalty: "FIRE, the gun is fine", // the draw after a misfire was a FIRE card (13.32)
  jams: "MALFUNCTION, the gun jams",
  explodes: "MALFUNCTION, the gun explodes",
};

const CARD_INDENT = "    ";

/**
 * The log lines of events: one per event, except that a shot is followed
 * by the cards it drew, one indented line each in the order drawn (its
 * MALFUNCTION cards, then the FIRE card read for the hit unless it
 * misfired), and those MALFUNCTION events get no line of their own.
 */
export function describeEvents(events: TurnEvent[], names: string[]): string[] {
  const shooters = new Set(events.filter((e) => e.kind === "shot").map((e) => e.p));
  const lines: string[] = [];
  for (const e of events) {
    if (e.kind === "malfunction" && shooters.has(e.p)) continue;
    lines.push(describeEvent(e, names));
    if (e.kind !== "shot") continue;
    for (const m of events) {
      if (m.kind === "malfunction" && m.p === e.p) lines.push(`${CARD_INDENT}card ${m.card}: ${MALFUNCTION_LINES[m.result] ?? `MALFUNCTION, ${m.result.replace(/_/g, " ")}`}`);
    }
    if (e.reason === "misfire") continue;
    let outcome = e.hit === "-" ? "miss" + (e.reason ? ` (${MISS_REASONS[e.reason] ?? e.reason.replace(/_/g, " ")})` : "") : `${e.hit} hit`;
    if (e.status) outcome = `${e.chart} → ${outcome} (target ${targetStatusNames(e.status)})`;
    lines.push(`${CARD_INDENT}card ${e.card}: FIRE, ${outcome}`);
  }
  return lines;
}

/** Target Status letters, as they read in the log (13.61-13.64). */
const TARGET_STATUS: Record<string, string> = { M: "moved", R: "ran", D: "down", H: "head" };

function targetStatusNames(letters: string): string {
  return [...letters].map((l) => TARGET_STATUS[l] ?? l).join(", ");
}

/** A one-line description of an event; names are indexed by seat. */
export function describeEvent(e: TurnEvent, names: string[]): string {
  const who = names[e.p] ?? `seat ${e.p}`;
  const action = e.action.replace(/_/g, " ");
  switch (e.kind) {
    case "move":
      return `${who} ${action}: ${e.from} → ${e.to}${e.down ? " (crawling)" : ""}`;
    case "turn":
      return `${who} ${action}: now facing ${DIRS[e.facing] ?? e.facing}`;
    case "flip":
      return e.down ? `${who} goes down` : `${who} gets up`;
    case "delay": {
      if (e.card === 0) return `${who} gains ${e.n} delay (${e.reason}), now ${e.delay}`;
      // Every card drawn reads the same: who draws which card and why, then what it does.
      const drawn = `${who} draws card ${e.card} (${e.reason})`;
      if (e.result !== "") return `${drawn}: ${e.result.replace(/_/g, " ").toUpperCase()}`;
      const lost = e.endurance > 0 ? `, loses ${e.endurance} endurance` : "";
      return `${drawn}: ${e.n > 0 ? `gains ${e.n} delay` : "no delay"}, now ${e.delay}${lost}`;
    }
    case "wild_shot":
      return `${who}'s ${GUN_NAMES[e.gun] ?? e.gun} goes off (wild shot)`;
    case "cock":
      return `${who} cocks the ${GUN_NAMES[e.gun] ?? e.gun}`;
    case "uncock":
      return `${who} uncocks the ${GUN_NAMES[e.gun] ?? e.gun}`;
    case "aim":
      return `${who} aims at ${e.to}${e.target >= 0 ? ` (${names[e.target] ?? `seat ${e.target}`})` : ""}: ${e.n} AIM points`;
    case "lose_aim":
      return `${who} loses the aim (${reasonText(e)})`;
    case "nothing":
      // A shot at a hex nobody stands in, or at a target out of sight, is held, like a Shoot doing nothing.
      if (e.reason === "empty_hex") return `${who} holds fire: nobody in ${e.to}`;
      if (e.reason === "no_los") return `${who} holds fire: ${names[e.target] ?? `seat ${e.target}`} in ${e.to} is out of sight`;
      return `${who} does nothing (${action})`;
    case "shot": {
      // The cards it drew follow on their own lines (describeEvents).
      const at = e.target >= 0 ? `${names[e.target] ?? `seat ${e.target}`} in ${e.to}` : `at ${e.to}`;
      return `${who} shoots ${at} (aim time ${e.n}, range ${e.range})`;
    }
    case "malfunction":
      return `${who} draws card ${e.card}: MALFUNCTION, ${e.result.replace(/_/g, " ")}`;
    case "wound":
      return `${who} suffers ${e.result.replace(/_/g, " ").toUpperCase()}${e.n > 0 ? ` ${e.n}` : ""}`;
    case "direction":
      return `${who} draws card ${e.card} as a direction: ${e.to.replace(/_/g, " ")}`;
    case "drop_gun":
      return `${who} drops the ${GUN_NAMES[e.gun] ?? e.gun} in ${e.to}`;
    case "pass_out":
      return `${who} passes out`;
    case "serious_check":
      return `${who} draws card ${e.card} for the SERIOUS wounds: ${e.n} points`;
    case "vp":
      return `${who}: ${signedVP(e.n)} VP, ${vpReason(e.reason)}`;
    case "cancel":
      return `${who}: ${action} is cancelled (${reasonText(e)})`;
    case "draw":
    {
      const name = GUN_NAMES[e.gun] ?? e.gun;
      const to = e.to === "both_hands" ? "into both hands" : `to the ${e.to.replace(/_/g, " ")}`;
      const cocks = e.result === "jammed" ? " (jammed: not cocked)" : " and cocks it";
      if (e.from === "ground") return `${who} picks up the ${name} from the ground ${to}${cocks}`;
      if (e.from === "holstered") return `${who} draws the ${name} ${to}${cocks}`;
      return `${who} moves the ${name} ${to}${cocks}`;
    }
    case "load":
      return `${who} loads a shell in the ${GUN_NAMES[e.gun] ?? e.gun} (${e.n} now)${e.result === "unjammed" ? ": no longer jammed" : ""}`;
    default:
      return `${who} ${e.kind}`;
  }
}
