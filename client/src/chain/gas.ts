/**
 * The gas limit each call goes out with. The fee is the gas price times the
 * limit, charged in full whatever the call uses, so a limit fitted to the
 * call costs less than a fixed one; and a fixed one runs out on the heaviest
 * turns (four seats all shooting: about 101M, measured 2026-10-25). The
 * limit comes from simulating the call (Rpc.simulate) with a margin. A call
 * that may resolve the turn gets twice its simulated gas: the deck is
 * shuffled from a seed that includes the block height, so its block can
 * draw more cards than the simulation did.
 */

/** The calls that may resolve a turn: the reveal that completes it, a claim, a surrender completing the plans. */
const MAY_RESOLVE = new Set(["Reveal", "RevealMany", "ClaimTimeout", "Surrender"]);

/** The limit a call is simulated with: ample for any call, within a block (3 billion on Onyx). */
export const SIM_GAS = 1_000_000_000;
/** The bounds of a fitted limit. */
export const MIN_GAS_WANTED = 25_000_000;
export const MAX_GAS_WANTED = 500_000_000;
/** Without a simulation: today's fixed limit, and more for a call that may resolve the turn. */
export const DEFAULT_GAS_WANTED = 100_000_000;
export const RESOLVE_GAS_WANTED = 300_000_000;

/** The margin over the simulated gas. */
const MARGIN = 1.5;
const RESOLVE_MARGIN = 2;

/** The gas limit for a call to func, from its simulated gas (null when it could not be simulated). */
export function gasWanted(func: string, simulated: number | null): number {
  const resolves = MAY_RESOLVE.has(func);
  if (simulated === null || simulated <= 0) return resolves ? RESOLVE_GAS_WANTED : DEFAULT_GAS_WANTED;
  const wanted = Math.ceil(simulated * (resolves ? RESOLVE_MARGIN : MARGIN));
  return Math.min(MAX_GAS_WANTED, Math.max(MIN_GAS_WANTED, wanted));
}

/** Whether a transaction failed for lack of gas (/std.OutOfGasError, "out of gas in location: …"). */
export function isOutOfGas(text: string): boolean {
  return /OutOfGas|out of gas/i.test(text);
}
