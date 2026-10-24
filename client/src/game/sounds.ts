import type { TurnEvent } from "../chain/types";
import type { CharView } from "./replay";

/**
 * Sound effects, by group: each group lists its variants under
 * assets/sounds/, one is picked at random every time the group plays so a
 * repeated action does not sound mechanical; a resolved turn's sounds pick
 * theirs from the turn's seed (variantIndex), so the turn sounds the same
 * on every playback.
 */
export const SOUND_FILES = {
  // A card added to the plan, and reversed when it leaves; both converted
  // from pick-card.aiff (only Safari decodes AIFF), the reverse with
  // ffmpeg -af "atrim=start=0.05,areverse,atrim=start=0.205,asetpts=N/SR/TB,
  // afade=t=in:d=0.01", which shortens the quiet fade-out it starts with.
  pickCard: ["pick-card.mp3"],
  unpickCard: ["pick-card-reverse.mp3"],
  // An option button clicked (Cock, Aim, Shoot).
  select: ["select.mp3"],
  step: ["advance1.wav", "advance2.wav", "advance3.wav", "advance4.wav"],
  turn: ["turn1.wav"],
  unholster: ["unholster-gun1.wav", "unholster-gun2.wav"],
  // A Draw & Cock picking a gun up from the ground (instead of the holster).
  groundPick: ["ground_pick1.wav"],
  cock: ["cock-gun1.wav", "cock-gun2.wav", "cock-gun3.wav"],
  aim: ["aim1.wav"],
  // A shot's target picked while planning (the shot itself waits for the cards).
  planShoot: ["plan-shoot.wav"],
  gunshot: ["gunshot1.wav", "gunshot2.wav", "gunshot3.wav", "gunshot4.mp3", "gunshot5.wav"],
  // A missed bullet ricocheting past the target.
  ricochet: ["missed1.wav", "missed2.wav", "missed3.mp3"],
  // The hammer falling on an empty chamber: a shot with no shell left (13.1).
  emptyGun: ["empty-gun1.wav", "empty-gun2.wav"],
  reload: ["reload-gun1.mp3", "reload-gun2.wav", "reload-gun3.wav", "reload-gun4.wav"],
  delay: ["delay1.mp3"],
  // delay1.mp3 reversed (ffmpeg -af "atrim=0:0.29,areverse"): delay going down.
  undelay: ["delay1-reverse.mp3"],
  fall: ["drop1.ogg", "drop2.wav"],
  // Climbing over a fence or another obstacle.
  obstacle: ["obstacle1.wav", "obstacle2.wav"],
  wounded: ["wounded1.wav", "wounded2.ogg"],
  dead: ["dead1.wav", "dead2.wav", "dead3.wav", "dead4.wav", "dead5.wav"],
  // A character leaving the map (15.5).
  runAway: ["run-away.wav"],
  // A thrown weapon striking its target or the ground.
  impact: ["impact1.wav", "impact2.wav"],
} as const;

export type SoundGroup = keyof typeof SOUND_FILES;

/** Volume per group: gunshots stand out, footsteps stay in the background. */
export const SOUND_VOLUME: Record<SoundGroup, number> = {
  pickCard: 0.6, unpickCard: 0.6, select: 0.6, step: 0.5, turn: 0.5, unholster: 0.8, groundPick: 0.8, cock: 0.8, aim: 0.8, planShoot: 0.8, gunshot: 1, ricochet: 0.8, emptyGun: 0.9, reload: 0.8, delay: 0.7, undelay: 0.7, fall: 0.8, obstacle: 0.8, wounded: 0.9, dead: 0.9, runAway: 0.8, impact: 0.9,
};

/** The Phaser audio key of one variant of a group. */
export const soundKey = (group: SoundGroup, i: number) => `sfx_${group}_${i}`;

/** A sound to play, delayMs after the segment is shown. */
export interface SoundCue {
  group: SoundGroup;
  delayMs: number;
  /** The resolved turn's event the sound is for, which picks its variant (variantIndex). */
  event?: TurnEvent;
}

/**
 * The variant (0 to count − 1) a resolved turn's sound plays: a hash of the
 * turn's seed and key (the event's place in the turn and the group), so a
 * turn sounds the same on every playback, whether its segments play step
 * by step or in one go, in whatever order.
 */
export function variantIndex(seed: string, key: string, count: number): number {
  // FNV-1a, 32 bits.
  let h = 0x811c9dc5;
  for (const c of `${seed}/${key}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return (h >>> 0) % count;
}

/** A Draw & Cock cocks the gun once it is out of the holster. */
const COCK_AFTER_DRAW_MS = 350;
/** Hits apply when the bullet lands, after the gunshot. */
const WOUND_AFTER_SHOT_MS = 350;
/** How long a thrown weapon takes to fly, spinning, to where it lands. */
export const THROW_FLIGHT_MS = 550;
/** A miss ricochets once the bullet has passed the target. */
const RICOCHET_AFTER_SHOT_MS = 350;
/** The token reaches the hexside it climbs over halfway through its move. */
const OBSTACLE_AFTER_MOVE_MS = 200;
/**
 * Between shots fired in the same step (both characters shooting on the same
 * segment, empty guns clicking included): played at the same instant the
 * sounds merge into one.
 */
const SIMULTANEOUS_GAP_MS = 220;

/** Delay reasons of crossing an obstacle: a fence (rule 35.2), onto or off an obstacle hex (36.4). */
const OBSTACLE_REASONS = new Set(["fence", "obstacle"]);

/** A shot whose misfire jams or blows up the gun: no bullet leaves it, no sound. */
function silentMisfire(e: TurnEvent, events: TurnEvent[]): boolean {
  return e.reason === "misfire" && events.some((x) => x.kind === "malfunction" && x.p === e.p && (x.result === "jams" || x.result === "explodes"));
}

/**
 * When each gun of a step goes off, in ms after the step is shown, by
 * event index: the shots fired, the empty guns clicking, the wild shots and
 * the weapons thrown (as they leave the hand), in event order, SIMULTANEOUS_GAP_MS apart so they can be told apart;
 * undefined for the other events and for a shot whose misfire jams or blows
 * up the gun. The sounds and the bullets on the board share this timing.
 */
export function shotDelays(events: TurnEvent[]): (number | undefined)[] {
  let shots = 0;
  return events.map((e) => {
    switch (e.kind) {
      case "shot":
        return silentMisfire(e, events) ? undefined : shots++ * SIMULTANEOUS_GAP_MS;
      case "cancel":
        return e.reason === "empty" ? shots++ * SIMULTANEOUS_GAP_MS : undefined;
      case "wild_shot":
      case "throw":
        return shots++ * SIMULTANEOUS_GAP_MS;
      default:
        return undefined;
    }
  });
}

/**
 * When each character hit in a step reacts, in ms after the step is shown,
 * by seat: WOUND_AFTER_SHOT_MS after the shot that hit it when that shot is
 * in the step (the bullet lands), or after the thrown weapon lands, else
 * after the step is shown; two
 * characters due at the same instant react one after the other,
 * SIMULTANEOUS_GAP_MS apart, in event order. One reaction per character,
 * however many effects its hits have (a GUN hit is STUN, GUN HAND, SERIOUS
 * and GUN ARM). The groans and death cries and the tokens' falls share
 * this timing.
 */
export function woundDelays(events: TurnEvent[]): Map<number, number> {
  const shotAt = new Map<number, number>(); // the seat hit -> when the shot went off (or the throw landed)
  shotDelays(events).forEach((d, i) => {
    const e = events[i];
    if (d === undefined || (e.kind !== "shot" && e.kind !== "throw") || e.hit === "-" || e.target < 0 || shotAt.has(e.target)) return;
    shotAt.set(e.target, e.kind === "throw" ? d + THROW_FLIGHT_MS : d);
  });
  const out = new Map<number, number>();
  const taken = new Set<number>();
  for (const e of events) {
    if ((e.kind !== "wound" && e.kind !== "pass_out") || out.has(e.p)) continue;
    let at = (shotAt.get(e.p) ?? 0) + WOUND_AFTER_SHOT_MS;
    while (taken.has(at)) at += SIMULTANEOUS_GAP_MS;
    taken.add(at);
    out.set(e.p, at);
  }
  return out;
}

/** The sounds of one step's events, in the order they happen. */
export function soundsForEvents(events: TurnEvent[]): SoundCue[] {
  const cues: SoundCue[] = [];
  const bled = new Set<number>();
  const climbed = new Set<number>();
  // One wound sound per character hit in a segment, when it reacts (woundDelays).
  const wounded = new Map<string, SoundCue>();
  const reacts = woundDelays(events);
  const delays = shotDelays(events);
  events.forEach((e, i) => {
    const at = delays[i] ?? 0;
    switch (e.kind) {
      case "move":
        cues.push({ group: "step", delayMs: 0, event: e });
        break;
      case "turn":
        cues.push({ group: "turn", delayMs: 0, event: e });
        break;
      case "flip":
        if (e.down) cues.push({ group: "fall", delayMs: 0, event: e });
        break;
      case "draw":
        cues.push({ group: e.from === "ground" ? "groundPick" : "unholster", delayMs: 0, event: e });
        if (e.result !== "jammed") cues.push({ group: "cock", delayMs: COCK_AFTER_DRAW_MS, event: e });
        break;
      case "cock":
        cues.push({ group: "cock", delayMs: 0, event: e });
        break;
      case "aim":
        cues.push({ group: "aim", delayMs: 0, event: e });
        break;
      case "load":
        cues.push({ group: "reload", delayMs: 0, event: e });
        break;
      case "shot":
        // A misfire sounds like a missed shot, as it shows, unless the second
        // MALFUNCTION jams or blows up the gun: no bullet then.
        if (delays[i] === undefined) break;
        cues.push({ group: "gunshot", delayMs: at, event: e });
        if (e.hit === "-") cues.push({ group: "ricochet", delayMs: at + RICOCHET_AFTER_SHOT_MS, event: e });
        break;
      case "cancel":
        // A shot with an empty gun only clicks, spaced out like the shots fired with it.
        if (e.reason === "empty") cues.push({ group: "emptyGun", delayMs: at, event: e });
        break;
      case "wild_shot":
        cues.push({ group: "gunshot", delayMs: at, event: e });
        break;
      case "throw":
        // The weapon strikes the target, or the ground beside it, as it lands.
        cues.push({ group: "impact", delayMs: at + THROW_FLIGHT_MS, event: e });
        break;
      case "wound": {
        // A kill among a character's wounds makes its groan the death cry.
        const cue = wounded.get(`${e.seg}/${e.p}`);
        if (cue) {
          if (e.result === "kill") cue.group = "dead";
          break;
        }
        const first: SoundCue = { group: e.result === "kill" ? "dead" : "wounded", delayMs: reacts.get(e.p) ?? WOUND_AFTER_SHOT_MS, event: e };
        wounded.set(`${e.seg}/${e.p}`, first);
        cues.push(first);
        break;
      }
      case "delay":
        // Crossing an obstacle draws its delay cards: one sound per character.
        if (OBSTACLE_REASONS.has(e.reason) && !climbed.has(e.p)) {
          climbed.add(e.p);
          cues.push({ group: "obstacle", delayMs: OBSTACLE_AFTER_MOVE_MS, event: e });
        }
        // SERIOUS fatigue cards at the turn start: a groan when they cost
        // endurance, once per character however many cards it draws.
        if (e.reason === "serious" && e.endurance > 0 && !bled.has(e.p)) {
          bled.add(e.p);
          cues.push({ group: "wounded", delayMs: 0, event: e });
        }
        break;
      case "pass_out":
        cues.push({ group: "fall", delayMs: 0, event: e });
        break;
      case "run_away":
        cues.push({ group: "runAway", delayMs: 0, event: e });
        break;
    }
  });
  return cues;
}

/**
 * Whether a plan step took an aim: more AIM points, or markers on a new
 * target, which a target farther than one hex from them starts again at 2 (12.5).
 */
export function aimTaken(before: CharView, after: CharView): boolean {
  return after.aim > 0 && (after.aim > before.aim || after.aimHex !== before.aimHex || after.aimAt !== before.aimAt);
}

/**
 * The sounds of a plan step while planning, from the preview before and
 * after it: only what the plan alone decides (moves, climbing over an
 * obstacle, turns, going down, drawing or picking a gun up, cocking, aiming, loading); shots and penalties wait for the cards
 * drawn.
 */
export function soundsForPreview(before: CharView, after: CharView, crossesObstacle?: (from: string, to: string) => boolean): SoundCue[] {
  const cues: SoundCue[] = [];
  if (after.hex !== before.hex) {
    cues.push({ group: "step", delayMs: 0 });
    if (crossesObstacle?.(before.hex, after.hex)) cues.push({ group: "obstacle", delayMs: OBSTACLE_AFTER_MOVE_MS });
  }
  if (after.facing !== before.facing) cues.push({ group: "turn", delayMs: 0 });
  if (after.status === "ran_away" && before.status !== "ran_away") cues.push({ group: "runAway", delayMs: 0 });
  if (after.down && !before.down) cues.push({ group: "fall", delayMs: 0 });
  if (aimTaken(before, after)) cues.push({ group: "aim", delayMs: 0 });
  for (const g of after.guns) {
    const b = before.guns.find((x) => x.id === g.id);
    if (!b || b.location !== g.location) {
      // Not on the sheet before: picked up from the ground.
      cues.push({ group: b ? "unholster" : "groundPick", delayMs: 0 });
      if (g.cocked) cues.push({ group: "cock", delayMs: COCK_AFTER_DRAW_MS });
    } else if (g.shells > b.shells) {
      cues.push({ group: "reload", delayMs: 0 });
    } else if (g.cocked && !b.cocked) {
      cues.push({ group: "cock", delayMs: 0 });
    }
  }
  return cues;
}

/**
 * The DEL badge sounds of a state change: delay1 when a character's delay
 * goes up, reversed when it goes down; once each whoever it is. A character
 * killed or passed out drops its delay silently.
 */
export function soundsForDelay(before: number[], after: CharView[]): SoundCue[] {
  let up = false;
  let down = false;
  after.forEach((c, i) => {
    if (!c || c.status !== "alive" || before[i] === undefined) return;
    if (c.delay > before[i]) up = true;
    else if (c.delay < before[i]) down = true;
  });
  const cues: SoundCue[] = [];
  if (up) cues.push({ group: "delay", delayMs: 0 });
  if (down) cues.push({ group: "undelay", delayMs: 0 });
  return cues;
}

/**
 * When each weapon thrown in a step lands, in ms after the step is shown,
 * by its ground id (the drop_gun of the throw): it shows on the ground
 * then, not before.
 */
export function throwLandings(events: TurnEvent[]): Map<number, number> {
  const out = new Map<number, number>();
  const delays = shotDelays(events);
  events.forEach((e, i) => {
    if (e.kind !== "throw" || delays[i] === undefined) return;
    const lands = events.find((x) => x.kind === "drop_gun" && x.p === e.p && x.reason === "throw");
    if (lands) out.set(lands.n, delays[i]! + THROW_FLIGHT_MS);
  });
  return out;
}
