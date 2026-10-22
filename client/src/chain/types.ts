/** Mirrors of the realm's JSON views (see gno.land/r/tbruyelle/gnoslinger/v0/json.gno). */

/** planning: the plans are committed (hidden); revealing: every plan is committed, the reveals come in. */
export type Phase = "waiting" | "planning" | "revealing" | "finished";
export type PlayerStatus = "alive" | "out" | "killed" | "passed_out" | "ran_away";
export type EventKind =
  | "move" | "turn" | "flip" | "delay" | "cancel" | "draw" | "wild_shot"
  | "cock" | "uncock" | "load" | "aim" | "lose_aim" | "nothing" | "shot" | "malfunction" | "wound" | "direction" | "drop_gun" | "move_gun" | "pass_out" | "serious_check" | "vp" | "run_away";

/** Seg of the events recorded after segment 5 (cancels, passing out, the serious-wound check, victory points); turn-start events have seg 0. */
export const END_OF_TURN_SEG = 6;

/** The seats a game may have (the realm's engine.MinPlayers and MaxPlayers). */
export const MIN_SEATS = 2;
export const MAX_SEATS = 4;

export interface PlayerView {
  addr: string;
  /** Registered name (namereg, in gno.land/r/sys/users), "" if none. */
  name?: string;
  char: string;
  /** The hex the character stands in, "" for a seat nobody took yet. */
  hex: string;
  /** Absolute facing 0=N 1=NE 2=SE 3=S 4=SW 5=NW. */
  facing: number;
  down: boolean;
  delay: number;
  status: PlayerStatus;
  /** The seat's plan for the turn in progress is in: committed (hidden), and revealed once its salt and plan are on chain (or passed). */
  committed: boolean;
  revealed: boolean;
  /** The seat's plan timelocked to the game's lockRound (tlock), "" once revealed or when its client sent none. */
  locked: string;
  /** Turns in a row the player let time out, each passed for them (MAX_MISSED puts them out); a commit resets it. */
  missed?: number;
  playedFoot: boolean;
  playedRun: boolean;
  /** A Run was played on the previous turn: required to Sprint (rule 9.23). */
  ranLastTurn: boolean;
  /** AIM points (0-8); the seat the markers follow (-1 when they sit on a hex, or without aim), and the hex they sit on ("" when they follow a seat). */
  aim: number;
  aimAt: number;
  aimHex: string;
  /** Endurance boxes left (20 at the start); wounds and fatigue cross them off. */
  endurance: number;
  /** Permanent wounds: fatigue cards per turn, aim penalties per hand, fatigue cards per hex moved. */
  serious: number;
  gunArm: number;
  otherArm: number;
  leg: number;
  guns: GunView[];
}

/** Wound and aim fields shared by the live view and the turn-start snapshots. */
export type WoundFields = Pick<PlayerView, "aim" | "aimAt" | "aimHex" | "endurance" | "serious" | "gunArm" | "otherArm" | "leg">;

/** A weapon lying in a hex; id is its ground id, "g<id>" in a plan. */
export interface GroundGunView {
  id: number;
  hex: string;
  guns: GunView[];
}

export type GunLocation = "holstered" | "gun_hand" | "other_hand" | "both_hands";

export interface GunView {
  /** Stable id of the gun within the game (the plan string refers to it). */
  id: number;
  type: string;
  name: string;
  location: GunLocation;
  cocked: boolean;
  shells: number;
  capacity: number;
  jammed: boolean;
  exploded: boolean;
}

export interface TurnEvent {
  /** Segment 1-5, or 0 for end-of-turn cancellations. */
  seg: number;
  /** Seat index. */
  p: number;
  kind: EventKind;
  action: string;
  from: string;
  to: string;
  facing: number;
  down: boolean;
  n: number;
  delay: number;
  reason: string;
  /** Result card drawn for a delay event (1-108; 0 when no card was drawn, e.g. crawl). */
  card: number;
  /** The card's penalty when its DELAY line is not a number (lose_aim, wild_shot, drop), a malfunction result, or a wound's penalty kind. */
  result: string;
  /** Endurance boxes crossed off by a wound or fatigue card. */
  endurance: number;
  /** Seat shot at (whoever stood in the hex named, for a shot at a hex) or aimed at, -1 for a hex. */
  target: number;
  /** Final hit location of a shot ("-" for a miss). */
  hit: string;
  /** Range of a shot in hexes. */
  range: number;
  /** Gun type and id for gun events ("" and 0 otherwise). */
  gun: string;
  gunId: number;
  /**
   * The part of the segment the event belongs to, in resolution order:
   * STEP_SHOTS, each seat's action (STEP_ACTION + seat), then STEP_END;
   * 0 outside the segments and for turns recorded before steps existed.
   */
  step: number;
  /** A shot's preliminary hit read on the FIRE card's chart, before Target Status ("" when no chart was read). */
  chart?: string;
  /** Target Status letters that changed a shot's hit (M move, R run, D down, H head), "" when none did. */
  status?: string;
}

/** Steps of a segment (engine StepShots, StepEnd, StepAction). */
export const STEP_SHOTS = 1;
export const STEP_END = 2;
export const STEP_ACTION = 3;

/** A character's state when a turn began. */
export interface StartChar extends WoundFields {
  hex: string;
  facing: number;
  down: boolean;
  delay: number;
  status: PlayerStatus;
  guns: GunView[];
}

export interface TurnResult {
  turn: number;
  seed: string;
  /** Result cards drawn during the turn (1-108), in draw order. */
  cards: number[];
  plans: string[];
  events: TurnEvent[];
  /** State of every seat at the start of the turn. */
  start: StartChar[];
}

/** Every resolved turn of a game, oldest first. */
export interface HistoryView {
  id: string;
  turn: number;
  phase: Phase;
  players: { addr: string; name?: string; char: string }[];
  turns: TurnResult[];
}

export interface GameView {
  id: string;
  rev: number;
  phase: Phase;
  turn: number;
  maxTurns: number;
  /** Inactivity, in seconds, after which anyone may claim the timeout. */
  timeout: number;
  board: string;
  /** One entry per seat (2 to 4), in the order the players joined; addr "" for a seat nobody took yet. */
  players: PlayerView[];
  /** Weapons lying on the board. */
  ground: GroundGunView[];
  /** Seat index of the winner (the most victory points), -1 for none. */
  winner: number;
  endReason: string;
  /** Victory points per seat, once a played game ended. */
  vp?: number[];
  /** The victory points earned and lost, per seat (rule 15). */
  awards?: VPAward[];
  /** Stakes (the realm's stakes.gno), in ugnot: what each player puts in (0: a free showdown), the stakes paid so far, what each seat got once over ([] before), what the house kept. */
  stake?: number;
  pot?: number;
  payouts?: number[];
  houseCut?: number;
  createdAt: number;
  updatedAt: number;
  /** Unix seconds after which ClaimTimeout succeeds: commitUntil while planning, revealUntil while revealing; 0 otherwise. */
  timeoutAt: number;
  /** The turn's deadline: commits are refused from then (unix seconds; 0 unless planning or revealing). */
  commitUntil: number;
  /** When a claim can pass the turn of the seats whose plan is not revealed (a missed turn). */
  revealUntil: number;
  /** The drand quicknet round the turn's plans are timelocked to. */
  lockRound: number;
  lastTurn: TurnResult | null;
}

/** Victory points a seat earns (points > 0) or loses: reason is survive, hold_field, surrender, captured, killed, kill_enemy, knock_out_enemy or run_away. */
export interface VPAward {
  p: number;
  reason: string;
  points: number;
}

export interface GameSummary {
  id: string;
  rev: number;
  phase: Phase;
  turn: number;
  maxTurns: number;
  /** The time a turn gives, in seconds, after which anyone may claim it. */
  timeout: number;
  /** Seat index of the winner (the most victory points), -1 for none. */
  winner: number;
  /** "" while running; expired (games from before the join phase lost its timeout), surrender, timeout, abandoned, all_down, max_turns, last_standing. */
  endReason: string;
  /** Victory points per seat, once a played game ended. */
  vp?: number[];
  /** Stakes (the realm's stakes.gno), in ugnot: what each player puts in (0: a free showdown), the stakes paid so far, what each seat got once over ([] before), what the house kept. */
  stake?: number;
  pot?: number;
  payouts?: number[];
  houseCut?: number;
  createdAt: number;
  updatedAt: number;
  /** Unix seconds after which ClaimTimeout succeeds: the deadline while planning, its grace while revealing; 0 otherwise. */
  timeoutAt: number;
  /** The drand round the turn's plans are timelocked to (0 unless planning or revealing): the lobby opens them from then. */
  lockRound?: number;
  /** One entry per seat, addr "" for a seat nobody took yet; committed/revealed: the seat's plan for the turn in progress; name: the registered name, "" if none; status: alive, out, killed or passed_out. */
  players: { addr: string; name?: string; char: string; status?: PlayerStatus; committed?: boolean; revealed?: boolean }[];
}

export interface GamesView {
  /** The registered name of the address listed, "" if none. */
  name?: string;
  open: GameSummary[];
  mine: GameSummary[];
}

function bad(what: string): never {
  throw new Error(`bad game JSON: ${what}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function checkPlayer(v: unknown): PlayerView {
  if (!isRecord(v) || typeof v.addr !== "string" || typeof v.hex !== "string" || typeof v.facing !== "number") {
    bad("player");
  }
  return v as unknown as PlayerView;
}

function checkSummary(v: unknown): GameSummary {
  if (!isRecord(v) || typeof v.id !== "string" || typeof v.rev !== "number" || !Array.isArray(v.players)) {
    bad("summary");
  }
  return v as unknown as GameSummary;
}

export function parseGameView(json: string): GameView {
  const v: unknown = JSON.parse(json);
  if (!isRecord(v)) bad("not an object");
  if (typeof v.id !== "string" || typeof v.rev !== "number" || typeof v.turn !== "number") bad("header");
  if (v.phase !== "waiting" && v.phase !== "planning" && v.phase !== "revealing" && v.phase !== "finished") bad("phase");
  if (!Array.isArray(v.players) || v.players.length < MIN_SEATS || v.players.length > MAX_SEATS) bad("players");
  v.players.forEach(checkPlayer);
  if (v.lastTurn !== null) {
    if (!isRecord(v.lastTurn) || !Array.isArray(v.lastTurn.events)) bad("lastTurn");
  }
  return v as unknown as GameView;
}

/** Where an address's plan for the turn in progress stands (json/plan/{id}/{addr}); the plan shows once revealed. */
export interface PlanView {
  id: string;
  turn: number;
  /** Seat of the address, -1 when it is not a player. */
  seat: number;
  committed: boolean;
  revealed: boolean;
  /** "" until revealed. */
  plan: string;
}

export function parsePlanView(json: string): PlanView {
  const v: unknown = JSON.parse(json);
  if (!isRecord(v) || typeof v.id !== "string" || typeof v.turn !== "number" || typeof v.committed !== "boolean" || typeof v.plan !== "string") bad("plan");
  return v as unknown as PlanView;
}

export function parseHistoryView(json: string): HistoryView {
  const v: unknown = JSON.parse(json);
  if (!isRecord(v) || typeof v.id !== "string" || !Array.isArray(v.players) || !Array.isArray(v.turns)) bad("history");
  for (const t of v.turns) {
    if (!isRecord(t) || typeof t.turn !== "number" || !Array.isArray(t.events) || !Array.isArray(t.start)) bad("turn");
  }
  return v as unknown as HistoryView;
}

export function parseGamesView(json: string): GamesView {
  const v: unknown = JSON.parse(json);
  if (!isRecord(v) || !Array.isArray(v.open) || !Array.isArray(v.mine)) bad("games");
  v.open.forEach(checkSummary);
  v.mine.forEach(checkSummary);
  return v as unknown as GamesView;
}

/** A player's record (json/profile/{addr}, json/players/{offset}/{count}). */
export interface Profile {
  addr: string;
  /** Registered name in gno.land/r/sys/users, "" if none. */
  name: string;
  /** 1-based position in the ranking. */
  rank: number;
  gamesPlayed: number;
  victoryPoints: number;
  createdAt: number;
}

/** One page of the ranking, best first. */
export interface PlayersView {
  total: number;
  offset: number;
  players: Profile[];
}

function checkProfile(v: unknown): Profile {
  if (!isRecord(v) || typeof v.addr !== "string" || typeof v.name !== "string" || typeof v.rank !== "number" || typeof v.gamesPlayed !== "number" || typeof v.victoryPoints !== "number") {
    bad("profile");
  }
  return v as unknown as Profile;
}

/** null: the address has no profile yet (it never created or joined a game). */
export function parseProfile(json: string): Profile | null {
  const v: unknown = JSON.parse(json);
  return v === null ? null : checkProfile(v);
}

export function parsePlayersView(json: string): PlayersView {
  const v: unknown = JSON.parse(json);
  if (!isRecord(v) || typeof v.total !== "number" || typeof v.offset !== "number" || !Array.isArray(v.players)) bad("players");
  v.players.forEach(checkProfile);
  return v as unknown as PlayersView;
}

/** A player as shown in lists: the registered name, else the short address. */
export function playerLabel(p: { addr: string; name?: string }): string {
  return p.name || shortAddr(p.addr);
}

/** Seat of an address in a game, or -1. */
export function seatOf(game: { players: { addr: string }[] }, addr: string): number {
  return game.players.findIndex((p) => p.addr !== "" && p.addr === addr);
}

export function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
