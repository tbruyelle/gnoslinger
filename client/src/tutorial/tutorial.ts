import type { Chain } from "../chain";
import type { ChainConfig } from "../config";
import { CONFIG } from "../config";
import type { RealmClient } from "../chain/realm";
import type { GameView, HistoryView, PlanView, TurnResult } from "../chain/types";
import { decodePlan, type PlanEntry } from "../game/plan";
import { getActionDef } from "../rules";
import data from "./showdown.json";

/**
 * How to play: a showdown against the Kid, played on the game screen with no
 * chain and no wallet. The realm played it beforehand (filetest z16,
 * `make gen-tutorial`): showdown.json holds the game view at the start of
 * each turn, the Kid's plan already committed, then the final view and the
 * history. The player is the marshal and must send the plan each step asks
 * for (the cards were picked for those plans); TutorialRealm then moves on
 * to the next view, whose last turn the game screen plays back as usual.
 */

const VIEWS = data.views as unknown as GameView[];
const HISTORY = data.history as unknown as HistoryView;

/** How to play's address: the app opens on it (BootScene) and shows it while the tutorial is on. */
export const TUTORIAL_HASH = "#how-to-play";

/** The marshal's address in the recorded showdown: the tutorial's player. */
export const TUTORIAL_ADDR = VIEWS[0].players[0].addr;
export const TUTORIAL_GAME = VIEWS[0].id;
/** The turns the player plans, one per lesson; the last one ends the showdown. */
export const TUTORIAL_TURNS = VIEWS.length - 1;

/** What each turn asks the marshal to play, and how the coach says it. */
const EXPECTED = HISTORY.turns.map((t) => t.plans[0]);

/** The recorded block time; served views are shifted to now, so no deadline has passed. */
const RECORDED_AT = VIEWS[0].createdAt;

/** An action as it plays, whichever card side it is on: the two Cock/Aim/Shoot cards are the same action. */
function actionKey(e: PlanEntry): string {
  const { card: _card, side: _side, ...rest } = e;
  const choice = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${String(rest[k as keyof typeof rest])}`)
    .join(";");
  return `${getActionDef(e).name}|${choice}`;
}

/** Whether a plan does what the turn's lesson asks, card for card in that order. */
export function planMatches(plan: string, expected: string): boolean {
  try {
    const a = decodePlan(plan).map(actionKey);
    const b = decodePlan(expected).map(actionKey);
    return a.length === b.length && a.every((k, i) => k === b[i]);
  } catch {
    return false;
  }
}

/** The recorded view with its times moved to now, and the players named as the tutorial calls them. */
function served(view: GameView, shift: number): GameView {
  const t = (s: number) => (s ? s + shift : 0);
  return {
    ...view,
    createdAt: t(view.createdAt),
    updatedAt: t(view.updatedAt),
    timeoutAt: t(view.timeoutAt),
    commitUntil: t(view.commitUntil),
    revealUntil: t(view.revealUntil),
    players: view.players.map((p, i) => ({ ...p, name: i === 0 ? "You" : "Tutorial" })),
  };
}

/** The realm calls the game screen makes, answered from the recorded showdown. */
export class TutorialRealm {
  /** The view shown: the start of turn index+1, or the final view. */
  private index = 0;
  private readonly shift = Math.floor(Date.now() / 1000) - RECORDED_AT;

  async getGame(_id: string): Promise<GameView> {
    return served(VIEWS[this.index], this.shift);
  }

  /** The first count turns resolved so far. */
  async getTurns(_id: string, count: number): Promise<TurnResult[]> {
    return HISTORY.turns.slice(0, Math.min(count, this.index));
  }

  async getPlan(_id: string, _addr: string): Promise<PlanView> {
    return { committed: false, revealed: false, plan: "" } as unknown as PlanView;
  }

  /** The marshal's plan, in clear (the Kid committed first): the turn's lesson, or a hint at it. */
  async reveal(_id: string, turn: number, _seat: number, _salt: string, plan: string): Promise<void> {
    const expected = EXPECTED[turn - 1];
    if (turn !== this.index + 1 || expected === undefined) throw new Error("This turn is over");
    if (!planMatches(plan, expected)) throw new Error(`This step asks for: ${describePlan(expected)}`);
    this.index++;
  }

  async commit(): Promise<void> {
    throw new Error("The tutorial reveals your plan in clear");
  }

  async revealMany(): Promise<void> {}

  async surrender(): Promise<void> {
    throw new Error("No surrender in the tutorial");
  }

  async claimTimeout(): Promise<void> {
    throw new Error("No timeout in the tutorial");
  }

  async cancelGame(): Promise<void> {
    throw new Error("Nothing to cancel in the tutorial");
  }

  /** Back to the first turn. */
  restart() {
    this.index = 0;
  }
}

/** A plan as the coach names it: "Advance ahead, Run ahead, Turn ahead left". */
export function describePlan(plan: string): string {
  return decodePlan(plan)
    .map((e) => {
      const name = getActionDef(e).name;
      if (e.dir) return `${name} ${e.dir.replace(/_/g, " ")}`;
      if (e.gun !== undefined) return `${name} the Colt to your gun hand`;
      if (e.opt === "cock") return `${name}: Cock`;
      if (e.opt === "aim") return `${name}: Aim at The Kid`;
      if (e.opt === "shoot") return name === "Shoot" ? "Shoot at The Kid" : `${name}: Shoot at The Kid`;
      return name;
    })
    .join(", ");
}

/** A tutorial chain: the scripted realm, a wallet that is the marshal, and no node behind it. */
export function tutorialChain(): Chain {
  const config: ChainConfig = { ...CONFIG, chainId: "tutorial", pollMs: 500 };
  const wallet = { address: TUTORIAL_ADDR, state: { kind: "none" } };
  const realm = new TutorialRealm() satisfies Pick<RealmClient, "getGame" | "getTurns" | "getPlan" | "reveal" | "surrender" | "claimTimeout" | "cancelGame">;
  return { config, rpc: null, wallet, realm } as unknown as Chain;
}

/** What the coach panel says: the lesson, and what to do now. */
export interface Coach {
  /** "Step 2 of 5". */
  step: string;
  title: string;
  text: string[];
  /** What to play, or to watch; "" for none. */
  todo: string;
}

export const COACH_STEPS = 5;

const step = (n: number) => `Step ${n} of ${COACH_STEPS}`;

/** Planning each turn: the lesson, then the plan it asks for. */
const PLANNING: Omit<Coach, "todo">[] = [
  {
    step: step(1),
    title: "Moving",
    text: [
      "You are the Marshal, in blue; The Kid stands across the corral. Each turn you plan up to 5 time points of action cards from your hand, then every plan plays out at once over 5 segments.",
      "An action goes off on the segment its time points reach, counting the ones before it: Advance (2) on segment 2, Run (1) on 3, Turn (1) on 4. Your plan shows them on the segment tracker.",
      "Moves and turns are relative to your facing: ahead is where your token's arrow points.",
    ],
  },
  {
    step: step(2),
    title: "Draw & Cock",
    text: [
      "Your Colt 45 sits in its holster, loaded but not cocked: it cannot fire from there.",
      "Draw & Cock (3) brings a gun into your hand, cocked and ready. Picking it opens your character sheet: drag the Colt into the GUN HAND box.",
      "That leaves 2 points this turn: points you do not use are lost.",
    ],
  },
  {
    step: step(3),
    title: "Aim & Shoot",
    text: [
      "You can aim at and shoot whatever stands in your aim zone, the cone ahead of you (hover a token to see its own).",
      "Cock/Aim/Shoot → Aim puts 2 AIM points on your target. A shot's aim time is its card's (Shoot 1) plus your AIM points; with the range it gives your chance to hit, shown when you hover the target. The Kid aimed at you last turn.",
      "Click The Kid to name it as the target.",
    ],
  },
  {
    step: step(4),
    title: "Delays",
    text: [
      "Your shot hit: The Kid carries 2 delay points (the DEL badge on its token). Every action of its plan goes off 2 segments later, and it could plan only 3 points.",
      "Delay comes from wounds, from running into trouble (fences, the horse trough, two in one hex) and from some cards (Sprint, Leap/Drop). Half of it goes at the end of each turn; a character with more delay than endurance two turns running passes out.",
      "Firing uncocked your Colt: cock it, aim, and shoot again.",
    ],
  },
];

/** Watching the turn just played. */
const PLAYBACK: string[] = [
  "Both plans play out segment by segment: the timeline at the bottom shows each one's actions. You walk two hexes and turn to face The Kid, who steps in and turns to you.",
  "You both draw on segment 3. The Kid then aims at you on segment 5: 2 AIM points on your token, for its next shot.",
  "Shots go first in a segment. The Kid fires on segment 1 and misses. You aim on 2 and fire on 3: an ARM hit. Wound cards cost The Kid endurance and delay, and a SERIOUS wound will draw a card at every turn start.",
  "The Kid's SERIOUS wound costs it one more delay at the turn start: with 3, its aim comes on segment 5 and its shot never does. You cock on 2, aim on 4 and fire on 5.",
];

/** The showdown is over. */
const WON: Coach = {
  step: step(5),
  title: "Winning",
  text: [
    "A VITAL hit on segment 5: The Kid is killed, and you are the last one standing.",
    "A showdown ends when one character is left in the fight, or after its last turn. Victory points decide it: Kill enemy +2 and Killed −8, Survive +2 and Hold the field +2 at the end; a character leaving the map runs away (−2) and is out.",
    "That is the whole loop. Call a showdown from the lobby when you are ready.",
  ],
  todo: "",
};

/**
 * The coach for the screen shown: planning turn n (1-based), watching
 * turn n played back, or the showdown over; once over, the replay shows
 * the last turn's lesson until its end (atEnd), so as not to tell how it
 * ends before it is seen.
 */
export function tutorialCoach(s: { turn: number; phase: string; playbackTurn: number | null; atEnd: boolean }): Coach | null {
  if (s.phase === "finished" && (s.playbackTurn === null || s.atEnd)) return WON;
  if (s.playbackTurn !== null) {
    const text = PLAYBACK[s.playbackTurn - 1];
    if (!text) return null;
    return { step: step(s.playbackTurn), title: `Turn ${s.playbackTurn}`, text: [text], todo: "Press PLAY, or step through the segments with ▶, then close the playback with the cross at the top right." };
  }
  const lesson = PLANNING[s.turn - 1];
  if (!lesson) return null;
  return { ...lesson, todo: `Play ${describePlan(EXPECTED[s.turn - 1])}, then Send plan.` };
}
