/**
 * The seat palette: how the characters are told apart on the board, the
 * panels, the sheet and the log, as the Design canvas's game screens drew
 * two of them (indigo for me, brick for the other). Three colours of the
 * palette (AGENTS.md, Design) and a teal, apart in hue and in lightness so
 * they hold for colour-blind players, and all standing out on the tan of
 * the board (the palette's gold and ochre vanish on it): indigo, brick,
 * action green, teal.
 */
export const SEAT_COLORS = ["#33307F", "#B5482A", "#4F7A3A", "#1F7A8C"];

/** The CSS colour of a seat. */
export function seatColor(seat: number): string {
  return SEAT_COLORS[seat] ?? SEAT_COLORS[0];
}

/** The seat's colour as a number, for Phaser. */
export function seatColorNum(seat: number): number {
  return parseInt(seatColor(seat).slice(1), 16);
}
