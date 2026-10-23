import { MAX_SEATS } from "../chain/types";
import type { GroundGunView, GunView } from "../chain/types";
import { getActionDef, type CardNumber, type CardSide, type RelativeDirection } from "../rules";

/** One card side in the turn plan, with its committed choice when it takes one. */
export interface PlanEntry {
  card: CardNumber;
  side: CardSide;
  /** Relative direction, for move and turn cards. */
  dir?: RelativeDirection;
  /** Gun id, for Draw & Cock; or the ground id of a gun lying in the hex to pick up. */
  gun?: number;
  groundGun?: number;
  /** Destination hand for Draw & Cock: 0 gun hand, 1 other hand, 2 both hands. */
  hand?: number;
  /** What a Cock/Aim/Shoot does, a Shoot or a Throw (shoot or throw, or nothing), or what a Strength adds to. */
  opt?: ShootOption | StrengthOption;
  /** What an aim, a shot or a throw targets: a hex, or a character by seat. */
  hex?: string;
  target?: number;
  /** The gun moves done when this action is revealed (10.22), before it in the plan string. */
  moves?: GunMove[];
}

/**
 * A free gun move (rule 10.22, the engine's GunMove): when an action is
 * revealed, the gun in both hands may go to one hand, as it is, and a gun in
 * a hand may be dropped in the hex. In the plan string, "h<gun id>:<to>"
 * before the action it goes with: to 0 gun hand, 1 other hand, "g" the
 * ground (HAND_GROUND).
 */
export interface GunMove {
  gun: number;
  to: number;
}

export type ShootOption = "cock" | "uncock" | "aim" | "shoot" | "throw" | "nothing";

/** The options each action naming a target offers, in display order: the gun actions and Throw (17.1). */
export const SHOOT_OPTIONS: Record<string, ShootOption[]> = {
  "Cock/Aim/Shoot": ["cock", "uncock", "aim", "shoot"],
  Shoot: ["shoot", "nothing"],
  Throw: ["throw", "nothing"],
};

/** The options that name a target. */
export const TARGET_OPTIONS = new Set<string>(["aim", "shoot", "throw"]);

/** The sides whose bare entry ("7f", "6b") does nothing. */
const BARE_NOTHING = new Set(["Shoot", "Throw"]);

/** Whether the side takes a shoot option (Cock/Aim/Shoot, Shoot, Throw), naming its target. */
export function isShooting(entry: { card: CardNumber; side: CardSide }): boolean {
  return getActionDef(entry).name in SHOOT_OPTIONS;
}

/**
 * What a Strength adds (20.2): two to the penalties of the Throw it is
 * played on top of, or four to its wielding factor (how far it goes).
 */
export type StrengthOption = "damage" | "wield";
export const STRENGTH_OPTIONS: StrengthOption[] = ["damage", "wield"];
export const STRENGTH_DAMAGE = 2;
export const STRENGTH_WIELD = 4;
/** How far a Colt 45 can be thrown: its wielding factor (16.21, 17.2). */
export const COLT_WIELDING = 4;

export function isStrength(entry: { card: CardNumber; side: CardSide }): boolean {
  return getActionDef(entry).name === "Strength";
}

/** How far the Throw at plan[i] reaches: the wielding factor plus the Strengths played on top of it (20.22). */
export function throwReach(plan: PlanEntry[], i: number): number {
  let reach = COLT_WIELDING;
  for (let j = i - 1; j >= 0 && isStrength(plan[j]); j--) if (plan[j].opt === "wield") reach += STRENGTH_WIELD;
  return reach;
}

export const HAND_GUN = 0;
export const HAND_OTHER = 1;
export const HAND_BOTH = 2;
/** A gun move's destination "g": the hex the character stands in. */
export const HAND_GROUND = 3;
export const HAND_LOCATION: Record<number, GunView["location"]> = { 0: "gun_hand", 1: "other_hand", 2: "both_hands" };

export const MAX_ACTION_POINTS = 5;
/** The most AIM points a character holds on a target (rule 12.3). */
export const MAX_AIM = 8;
export const MAX_PLAN_ENTRIES = 5;

/** Actions the realm implements so far: the foot actions and the gun actions. */
export const ENABLED_ACTIONS = new Set(["Advance", "Back Up", "Run", "Spin Around", "Sprint", "Turn", "Leap/Drop", "Get Up/Down", "Draw & Cock", "Cock/Aim/Shoot", "Shoot", "Load", "Throw", "Strength"]);

/** The boxes a Draw & Cock can put a gun in for now (the other hand comes with a second gun). */
export const DRAW_HANDS = [HAND_GUN, HAND_BOTH];

/**
 * Whether a gun other than except holds loc or a hand box overlapping it
 * (BOTH HANDS takes both hands), as the realm's Guns.Blocked.
 */
export function handBlocked(guns: GunView[], loc: GunView["location"], except?: number): boolean {
  return guns.some((g) => g.id !== except && g.location !== "holstered" && (g.location === loc || g.location === "both_hands" || loc === "both_hands"));
}

/** The boxes (hand codes) a Draw & Cock can move gun to: not where it is, and free. */
export function drawDestinations(guns: GunView[], gun?: GunView): number[] {
  return DRAW_HANDS.filter((h) => HAND_LOCATION[h] !== gun?.location && !handBlocked(guns, HAND_LOCATION[h], gun?.id));
}

/** The guns on the sheet a Draw & Cock can move: holstered or in hand, with a free box to go to. */
export function drawableGuns(guns: GunView[]): GunView[] {
  return guns.filter((g) => drawDestinations(guns, g).length > 0);
}

/**
 * Where a gun move can take the gun: from both hands, to the gun hand or the
 * ground (the other hand comes with a second gun, as for Draw & Cock); from
 * a hand, to the ground; from the holster, nowhere (nothing in the rules
 * holsters a gun, nor draws it for free).
 */
export function moveDestinations(gun: GunView | undefined): number[] {
  if (!gun) return [];
  if (gun.location === "both_hands") return [HAND_GUN, HAND_GROUND];
  if (gun.location === "gun_hand" || gun.location === "other_hand") return [HAND_GROUND];
  return [];
}

/** The gun a Load would load: the one in BOTH HANDS, if it is not blown up and has room for a shell. */
export function loadableGun(guns: GunView[]): GunView | undefined {
  const g = guns.find((x) => x.location === "both_hands");
  return g && !g.exploded && g.shells < g.capacity ? g : undefined;
}

const AHEAD = new Set<RelativeDirection>(["ahead_left", "ahead", "ahead_right"]);
const BACK = new Set<RelativeDirection>(["back_left", "back", "back_right"]);
const ALL_DIRS = new Set<string>([...AHEAD, ...BACK]);

export function isEnabled(entry: { card: CardNumber; side: CardSide }): boolean {
  return ENABLED_ACTIONS.has(getActionDef(entry).name);
}

/** The gun that can fire from its box: a one-handed gun in the gun hand or both hands. */
export function gunInFiringBox(guns: GunView[]): GunView | undefined {
  return guns.find((g) => g.location === "gun_hand" || g.location === "both_hands");
}

/**
 * Whether a side can be picked now: implemented, Sprint only after a Run on
 * the previous turn, Draw & Cock only with a gun that can move to a free
 * hand box or a weapon lying in the hex (groundHere), Cock/Aim/Shoot only
 * with a gun in hand that is not blown up (a jammed one can still aim, for
 * a throw), Shoot only with one that is not jammed or blown up, Throw with any
 * gun in hand (jammed or blown up too), Load only with a gun in both
 * hands that has room (guns is the state the plan leaves before the
 * card, so a Draw & Cock earlier in the plan counts). Where a side may go
 * in the plan (a Strength just before a Throw) is planAllows's.
 */
export function canPlay(entry: { card: CardNumber; side: CardSide }, ranLastTurn: boolean, guns: GunView[] = [], groundHere: GroundGunView[] = []): boolean {
  if (!isEnabled(entry)) return false;
  const name = getActionDef(entry).name;
  if (name === "Sprint") return ranLastTurn;
  if (name === "Draw & Cock") return drawableGuns(guns).length > 0 || (groundHere.length > 0 && drawDestinations(guns).length > 0);
  if (name === "Throw" || name === "Strength") return gunInFiringBox(guns) !== undefined;
  if (name in SHOOT_OPTIONS) {
    // A jammed gun can neither be cocked nor fire until completely reloaded,
    // but can aim (for a throw); a blown-up one is good for nothing but
    // throwing (13.31).
    const g = gunInFiringBox(guns);
    if (!g || g.exploded) return false;
    return name === "Cock/Aim/Shoot" || !(g.jammed && !g.cocked);
  }
  if (name === "Load") return loadableGun(guns) !== undefined;
  return true;
}

/**
 * Whether side may come next in plan, as Strength goes (20.1): played just
 * before a Throw, like Sprint after Run but in a fixed place. After a
 * Strength only the Throw may come; a Strength needs the Throw still free
 * (its card unused) and the points for both.
 */
export function planAllows(plan: PlanEntry[], side: { card: CardNumber; side: CardSide }, budget: number): boolean {
  const last = plan[plan.length - 1];
  if (last && isStrength(last) && getActionDef(side).name !== "Throw") return false;
  if (!isStrength(side)) return true;
  const THROW_CARD = 6;
  return !plan.some((e) => e.card === THROW_CARD) && planCost(plan) + getActionDef(side).cost + getActionDef({ card: THROW_CARD, side: "back" }).cost <= budget;
}

/** The realm's plan string: "<card><f|b>[:<choice>]" entries joined by commas (a direction, or "<gun id>:<hand>" for Draw & Cock). */
export function encodePlan(plan: PlanEntry[]): string {
  return plan
    .map((e) => {
      const moves = (e.moves ?? []).map((m) => `${encodeMove(m)},`).join("");
      return moves + encodeEntry(e);
    })
    .join(",");
}

/** A gun move's plan string entry: "h1:g", "h1:1". */
export function encodeMove(m: GunMove): string {
  return `h${m.gun}:${m.to === HAND_GROUND ? "g" : m.to}`;
}

function encodeEntry(e: PlanEntry): string {
  const def = getActionDef(e);
  const base = `${e.card}${e.side === "front" ? "f" : "b"}`;
  if (def.name === "Strength") return `${base}:${e.opt ?? "damage"}`;
  if (def.name in SHOOT_OPTIONS) {
    if (!e.opt || (BARE_NOTHING.has(def.name) && e.opt === "nothing")) return base;
    if (!TARGET_OPTIONS.has(e.opt)) return `${base}:${e.opt}`;
    return e.target !== undefined ? `${base}:${e.opt}:@${e.target}` : `${base}:${e.opt}:${e.hex ?? ""}`;
  }
  if (def.choiceType === "gun") {
    if (e.groundGun !== undefined) return `${base}:g${e.groundGun}:${e.hand ?? HAND_GUN}`;
    return e.gun !== undefined ? `${base}:${e.gun}:${e.hand ?? HAND_GUN}` : base;
  }
  const needsDir = def.choiceType === "move_ahead" || def.choiceType === "move_back" || def.choiceType === "turn_ahead" || def.choiceType === "turn_back";
  return needsDir && e.dir ? `${base}:${e.dir}` : base;
}

export function decodePlan(s: string): PlanEntry[] {
  if (s === "") return [];
  const plan: PlanEntry[] = [];
  let moves: GunMove[] = [];
  for (const token of s.split(",")) {
    const m = /^h([1-9][0-9]*):([01g])$/.exec(token);
    if (m) {
      moves.push({ gun: Number(m[1]), to: m[2] === "g" ? HAND_GROUND : Number(m[2]) });
      continue;
    }
    if (token.startsWith("h")) throw new Error(`invalid gun move "${token}" (expected h<gun id>:<0|1|g>)`);
    const entry = decodeEntry(token);
    if (moves.length) entry.moves = moves;
    moves = [];
    plan.push(entry);
  }
  if (moves.length) throw new Error("a gun move goes before an action: it is done when that action comes up");
  return plan;
}

function decodeEntry(token: string): PlanEntry {
  const m = /^(\d{1,2})([fb])(?::([a-zA-Z_0-9:@-]+))?$/.exec(token);
  if (!m) throw new Error(`invalid plan entry "${token}"`);
  const card = Number(m[1]);
  if (card < 1 || card > 12) throw new Error(`invalid card ${card}`);
  const entry: PlanEntry = { card: card as CardNumber, side: m[2] === "f" ? "front" : "back" };
  const name = getActionDef(entry).name;
  if (name === "Strength") {
    // A Strength whose use is not stated adds to the damage (20.2).
    const opt = m[3] ?? "damage";
    if (!(STRENGTH_OPTIONS as string[]).includes(opt)) throw new Error(`invalid option "${opt}" for Strength (damage or wield)`);
    entry.opt = opt as StrengthOption;
    return entry;
  }
  if (name in SHOOT_OPTIONS) {
    const choice = m[3] ?? (BARE_NOTHING.has(name) ? "nothing" : "");
    const i = choice.indexOf(":");
    const opt = i >= 0 ? choice.slice(0, i) : choice;
    const arg = i >= 0 ? choice.slice(i + 1) : "";
    if (!(SHOOT_OPTIONS[name] as string[]).includes(opt)) throw new Error(`invalid option "${opt}" for ${name}`);
    if (TARGET_OPTIONS.has(opt)) {
      // A character by seat, any seat a game may have (the realm checks it against the game's).
      if (/^@\d$/.test(arg) && Number(arg.slice(1)) < MAX_SEATS) entry.target = Number(arg.slice(1));
      else if (/^[A-Z0-9-]{3,8}$/.test(arg)) entry.hex = arg;
      else throw new Error(`${opt} needs a hex or a character to ${opt} at, e.g. "${token.split(":")[0]}:${opt}:A-F6" or "…:${opt}:@1"`);
    } else if (arg) throw new Error(`option "${opt}" takes no argument`);
    entry.opt = opt as ShootOption;
    return entry;
  }
  if (m[3] !== undefined) {
    if (getActionDef(entry).choiceType === "gun") {
      const g = /^(g?)([1-9][0-9]*):([0-2])$/.exec(m[3]);
      if (!g) throw new Error(`invalid gun choice "${m[3]}" (expected <gun id>:<hand> or g<ground id>:<hand>)`);
      if (g[1]) entry.groundGun = Number(g[2]);
      else entry.gun = Number(g[2]);
      entry.hand = Number(g[3]);
    } else {
      if (!ALL_DIRS.has(m[3])) throw new Error(`invalid direction "${m[3]}"`);
      entry.dir = m[3] as RelativeDirection;
    }
  }
  return entry;
}

export function planCost(plan: PlanEntry[]): number {
  return plan.reduce((sum, e) => sum + getActionDef(e).cost, 0);
}

/**
 * Checks the plan the way the realm does (engine.Plan.Validate); returns the
 * error message or null. budget is 5 minus the character's carried delay;
 * ranLastTurn says whether a Run was played on the previous turn; guns are
 * the character's guns, for Draw & Cock.
 */
export function validatePlan(plan: PlanEntry[], budget = MAX_ACTION_POINTS, ranLastTurn = true, guns: GunView[] = [], groundHere: GroundGunView[] = []): string | null {
  if (plan.length > MAX_PLAN_ENTRIES) return "too many actions in plan";
  const used = new Set<number>();
  const names = new Set<string>();
  for (const [i, e] of plan.entries()) {
    const def = getActionDef(e);
    if (!ENABLED_ACTIONS.has(def.name)) return "that action is not available yet";
    if (used.has(e.card)) return "you cannot use both sides of a card";
    used.add(e.card);
    names.add(def.name);
    // The gun may be one the plan picks up first: whether it is there is checked when the move is done.
    for (const m of e.moves ?? []) {
      if (m.to === HAND_OTHER) return "a gun moves to the gun hand or the ground for now";
      if (m.to !== HAND_GUN && m.to !== HAND_GROUND) return "a gun moves to the gun hand or the ground";
    }
    if (def.name === "Strength") {
      if (!e.opt || !(STRENGTH_OPTIONS as string[]).includes(e.opt)) return "choose what the strength adds to";
      // Played just before (on top of) the action it combines with (20.1).
      if (plan[i + 1] === undefined || getActionDef(plan[i + 1]).name !== "Throw") return "strength is played just before a throw";
      continue;
    }
    if (def.name in SHOOT_OPTIONS) {
      if (!e.opt || !(SHOOT_OPTIONS[def.name] as string[]).includes(e.opt)) return def.name === "Throw" ? "choose whether to throw" : "choose what to do with the gun";
      if (TARGET_OPTIONS.has(e.opt) && !e.hex && e.target === undefined) return `choose what to ${e.opt} at`;
      continue;
    }
    switch (def.choiceType) {
      case "move_ahead":
      case "turn_ahead":
        if (!e.dir || !AHEAD.has(e.dir)) return "choose a forward direction";
        break;
      case "move_back":
      case "turn_back":
        if (!e.dir || !BACK.has(e.dir)) return "choose a backward direction";
        break;
      case "gun": {
        if (e.gun === undefined && e.groundGun === undefined) return "choose the gun to draw";
        const hand = e.hand ?? HAND_GUN;
        if (!DRAW_HANDS.includes(hand)) return "only the gun hand or both hands can take a gun for now";
        let g: GunView | undefined;
        if (e.groundGun !== undefined) {
          if (!groundHere.some((x) => x.id === e.groundGun)) return "that weapon is not in your hex";
        } else {
          g = guns.find((x) => x.id === e.gun);
          if (!g) return "you have no such gun";
          if (g.location === HAND_LOCATION[hand]) return "that gun is already there";
        }
        if (handBlocked(guns, HAND_LOCATION[hand], g?.id)) return "that hand already holds a gun";
        break;
      }
      default:
        if (e.dir) return "that action takes no direction";
        if (e.gun !== undefined || e.groundGun !== undefined) return "that action takes no gun";
    }
  }
  if (planCost(plan) > budget) return "those actions cost more time points than you have";
  if (names.has("Run") && !names.has("Advance")) return "run can only be played together with advance";
  if (names.has("Sprint")) {
    if (!names.has("Run")) return "sprint can only be played together with run";
    if (!ranLastTurn) return "sprint can only be played after a run on the previous turn";
  }
  return null;
}
