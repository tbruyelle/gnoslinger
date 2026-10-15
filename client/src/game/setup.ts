import type { GunView } from "../chain/types";
import type { CharView } from "./replay";

/**
 * The showdown's SET UP (rules 3.4 and 29.2), as the realm's
 * engine/v0/setup.gno: each character of the showdown has its own hexes to
 * set up in and the way it faces unless its player turns it. The creator
 * sets up first. Nobody is alerted: both start upright with the Colt
 * holstered.
 */
export interface CharSetup {
  char: string;
  hexes: string[];
  /** Absolute facing 0=N 1=NE 2=SE 3=S 4=SW 5=NW. */
  facing: number;
}

/**
 * The showdown played (the realm's engine.Setups): the Marshal, side A,
 * inside the corral in G5-G9, the Kid, side B, in E5-E9, facing each other
 * across column F: a flat-top grid has no west or east, so the Marshal
 * looks north-west and the Kid south-east.
 */
export const SETUPS: CharSetup[] = [
  { char: "marshal", hexes: ["A-G5", "A-G6", "A-G7", "A-G8", "A-G9"], facing: 5 },
  { char: "the_kid", hexes: ["A-E5", "A-E6", "A-E7", "A-E8", "A-E9"], facing: 2 },
];

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

/** The character of the showdown the given one fights: the first other one (the showdown has two). */
export function opponentOf(charKey: string): string {
  return SETUPS.find((s) => s.char !== charKey)?.char ?? "";
}

/** The guns a character starts with (the realm's engine.startingGuns): a loaded, uncocked Colt 45 in the holster. */
export function startingGuns(): GunView[] {
  return [{ id: 1, type: "colt45", name: "Colt 45", location: "holstered", cocked: false, shells: 6, capacity: 6, jammed: false, exploded: false }];
}

/** A character as it stands when the showdown begins (the realm's engine.NewState and SetUp), in a hex ("" while unplaced) and facing. */
export function startingChar(hex: string, facing: number): CharView {
  return { hex, facing, down: false, delay: 0, status: "alive", aim: 0, aimHex: "", endurance: 20, serious: 0, gunArm: 0, otherArm: 0, leg: 0, guns: startingGuns() };
}
