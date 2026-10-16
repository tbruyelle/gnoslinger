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
 * in seat order, each a side of its own, around the middle of the corral:
 * the Marshal on the west side in D5-D7, E6 and E7, the Kid on the east
 * side in H5-H7, G6 and G7, El Jefe to the south in E8, F7, F8 and G8, Axe
 * to the north in E5, F5, F4 and G5. They face the middle: a flat-top grid
 * has no west or east, so
 * the Marshal looks south-east and the Kid north-west; El Jefe looks
 * north, Axe south.
 */
export const SETUPS: CharSetup[] = [
  { char: "marshal", hexes: ["A-D5", "A-D6", "A-D7", "A-E6", "A-E7"], facing: 2 },
  { char: "the_kid", hexes: ["A-H5", "A-H6", "A-H7", "A-G6", "A-G7"], facing: 5 },
  { char: "el_jefe", hexes: ["A-E8", "A-F7", "A-F8", "A-G8"], facing: 0 },
  { char: "axe", hexes: ["A-E5", "A-F5", "A-F4", "A-G5"], facing: 3 },
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
