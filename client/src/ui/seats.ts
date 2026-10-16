/**
 * The seat palette: how the characters are told apart on the board, the
 * panels, the sheet and the log, as the Design canvas's game screens drew
 * two of them (indigo for me, brick for the other). Four colours of the
 * palette (AGENTS.md, Design), apart in hue and in lightness so they hold
 * for colour-blind players: indigo, brick, action green, ochre.
 */
export const SEAT_COLORS = ["#33307F", "#B5482A", "#4F7A3A", "#B07A1E"];

/** The CSS colour of a seat. */
export function seatColor(seat: number): string {
  return SEAT_COLORS[seat] ?? SEAT_COLORS[0];
}

/** The seat's colour as a number, for Phaser. */
export function seatColorNum(seat: number): number {
  return parseInt(seatColor(seat).slice(1), 16);
}
