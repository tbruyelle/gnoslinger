import type { GunView } from "../chain/types";
import type { CharView } from "./replay";

/**
 * The showdown's SET UP (rules 3.4 and 29.2), as the realm's
 * engine/v0/setup.gno: each character of the showdown has its own hexes to
 * set up in and the way it faces unless its player turns it. The seats
 * take the characters in order: the creator is the first, each player
 * joining the next. Nobody is alerted: all start upright with the Colt
 * holstered.
 */
export interface CharSetup {
  char: string;
  hexes: string[];
  /** Absolute facing 0=N 1=NE 2=SE 3=S 4=SW 5=NW. */
  facing: number;
}

/**
 * The showdown played (the realm's engine.Setups), one character per seat
 * in seat order, each a side of its own: the Marshal inside the corral in
 * G5-G9, the Kid in E5-E9, El Jefe in I5-I9 and Axe in C5-C9, every column
 * two apart. They face the middle: a flat-top grid has no west or east, so
 * the Marshal and El Jefe look north-west, the Kid and Axe south-east.
 */
export const SETUPS: CharSetup[] = [
  { char: "marshal", hexes: ["A-G5", "A-G6", "A-G7", "A-G8", "A-G9"], facing: 5 },
  { char: "the_kid", hexes: ["A-E5", "A-E6", "A-E7", "A-E8", "A-E9"], facing: 2 },
  { char: "el_jefe", hexes: ["A-I5", "A-I6", "A-I7", "A-I8", "A-I9"], facing: 5 },
  { char: "axe", hexes: ["A-C5", "A-C6", "A-C7", "A-C8", "A-C9"], facing: 2 },
];

/** The seats a showdown may have: 2 to as many characters as the showdown has (the realm's engine.MinPlayers, MaxPlayers). */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = SETUPS.length;

/** The character of a seat (the realm's engine.SeatChar), "" for a seat the showdown does not have. */
export function seatChar(seat: number): string {
  return SETUPS[seat]?.char ?? "";
}

/** The seat the next player to join takes: the first one nobody took, -1 when every seat is taken. */
export function nextSeat(players: { addr: string }[]): number {
  return players.findIndex((p) => !p.addr);
}

/** The set up of a character, undefined when it is not in the showdown. */
export function setupOf(charKey: string): CharSetup | undefined {
  return SETUPS.find((s) => s.char === charKey);
}

/** The hexes a character may set up in (none for a character outside the showdown). */
export function setupZone(charKey: string): string[] {
  return setupOf(charKey)?.hexes ?? [];
}

/** Whether a character may set up in a hex (the realm's engine.CanSetUp). */
export function canSetUp(charKey: string, hex: string): boolean {
  return setupZone(charKey).includes(hex);
}

/** The way a character faces unless its player turns it (north when it is not in the showdown). */
export function defaultFacing(charKey: string): number {
  return setupOf(charKey)?.facing ?? 0;
}

/** The guns a character starts with (the realm's engine.startingGuns): a loaded, uncocked Colt 45 in the holster. */
export function startingGuns(): GunView[] {
  return [{ id: 1, type: "colt45", name: "Colt 45", location: "holstered", cocked: false, shells: 6, capacity: 6, jammed: false, exploded: false }];
}

/** A character as it stands when the showdown begins (the realm's engine.NewState and SetUp), in a hex ("" while unplaced) and facing. */
export function startingChar(hex: string, facing: number): CharView {
  return { hex, facing, down: false, delay: 0, status: "alive", aim: 0, aimAt: -1, aimHex: "", endurance: 20, serious: 0, gunArm: 0, otherArm: 0, leg: 0, guns: startingGuns() };
}
