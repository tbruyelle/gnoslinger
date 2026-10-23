import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/**
 * Hidden plans (DESIGN_HIDDEN_PLANS.md): a plan is committed as a hash of a
 * random salt and the plan, kept in this browser until the reveal, and
 * timelocked to the turn's drand round so that anyone can open it if its
 * player vanishes.
 */

/** drand quicknet, the chain the realm's lockRound counts on: genesis (unix seconds) and seconds per round. */
export const DRAND_GENESIS = 1692803367;
export const DRAND_PERIOD = 3;

/** A plan and its salt, as committed. */
export interface Sealed {
  salt: string;
  plan: string;
}

/** Where a pending reveal is kept: the chain and realm too, since game ids restart on each. */
export interface RevealScope {
  chainId: string;
  realmPath: string;
}

/** What a seat commits, as the realm's PlanHash: sha256 hex of "gnoslinger|id|turn|seat|salt|plan". */
export function planHash(id: string, turn: number, seat: number, salt: string, plan: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(`gnoslinger|${id}|${turn}|${seat}|${salt}|${plan}`)));
}

/** 16 random bytes, in hex. */
export function newSalt(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

/** When a drand quicknet round comes out (unix seconds). */
export function roundTime(round: number): number {
  return DRAND_GENESIS + (round - 1) * DRAND_PERIOD;
}

const PREFIX = "gnoslinger.reveal.";

function key(scope: RevealScope, game: string, turn: number, seat: number): string {
  return `${PREFIX}${scope.chainId}.${scope.realmPath}.${game}.${turn}.${seat}`;
}

/** Keeps a committed plan until it is revealed; a reload, another tab or the lobby can then reveal it. */
export function savePending(scope: RevealScope, game: string, turn: number, seat: number, sealed: Sealed): void {
  try {
    localStorage.setItem(key(scope, game, turn, seat), JSON.stringify(sealed));
  } catch {
    // no storage: only the timelocked copy can reveal the plan
  }
}

/** The committed plan this browser holds for that seat and turn, if any. */
export function loadPending(scope: RevealScope, game: string, turn: number, seat: number): Sealed | null {
  try {
    const v = localStorage.getItem(key(scope, game, turn, seat));
    if (!v) return null;
    const s = JSON.parse(v) as Sealed;
    return typeof s.salt === "string" && typeof s.plan === "string" ? s : null;
  } catch {
    return null;
  }
}

/** Forgets the pending reveals of a game older than turn (revealed or past). */
export function prunePending(scope: RevealScope, game: string, turn: number): void {
  try {
    const head = `${PREFIX}${scope.chainId}.${scope.realmPath}.${game}.`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(head)) continue;
      const t = Number(k.slice(head.length).split(".")[0]);
      if (t < turn) localStorage.removeItem(k);
    }
  } catch {
    // nothing to prune
  }
}

/**
 * The last resolved turn of a game this browser played back for the account
 * addr (0 for none): opening the game replays a later one, each account
 * keeping its own (two accounts may play from one browser). The entry is stored with the game's
 * creation time ("<createdAt>:<turn>"): a chain started over (gnodev) hands
 * the same ids out again, and the new game must not take the old one's
 * turns as seen; an entry of another game, or written before, counts as none.
 */
export function loadSeenTurn(scope: RevealScope, game: string, addr: string, createdAt: number): number {
  try {
    const [at, turn] = (localStorage.getItem(seenKey(scope, game, addr)) ?? "").split(":");
    return turn !== undefined && Number(at) === createdAt ? Number(turn) || 0 : 0;
  } catch {
    return 0;
  }
}

export function saveSeenTurn(scope: RevealScope, game: string, addr: string, createdAt: number, turn: number): void {
  try {
    localStorage.setItem(seenKey(scope, game, addr), `${createdAt}:${turn}`);
  } catch {
    // no storage: the turn may be replayed again
  }
}

/** The salt and plan as they are timelocked: the salt is hex, so "|" cannot be part of it. */
export function packSealed(s: Sealed): string {
  return `${s.salt}|${s.plan}`;
}

export function unpackSealed(text: string): Sealed {
  const i = text.indexOf("|");
  if (i < 0) throw new Error("not a sealed plan");
  return { salt: text.slice(0, i), plan: text.slice(i + 1) };
}

// tlock-js and its drand client are loaded on first use: they are only
// needed to commit and to open a vanished player's plan.
async function tlock() {
  return import("tlock-js");
}

/**
 * Timelocks a salt and plan to a drand quicknet round (the game's
 * lockRound): an age file, armored. Offline: encrypting only needs the
 * network's public key and scheme, built into tlock-js as defaultChainInfo
 * (quicknet), so no drand node is asked; only opening needs one.
 */
export async function lockSealed(round: number, sealed: Sealed): Promise<string> {
  const t = await tlock();
  const offline = { chain: () => ({ info: async () => t.defaultChainInfo }) } as unknown as Parameters<typeof t.timelockEncrypt>[2];
  return t.timelockEncrypt(round, t.Buffer.from(packSealed(sealed)), offline);
}

/** Opens a timelocked plan once its round is out (fetches the round's signature from drand). */
export async function openLocked(locked: string): Promise<Sealed> {
  const t = await tlock();
  return unpackSealed((await t.timelockDecrypt(locked, t.mainnetClient())).toString());
}

function seenKey(scope: RevealScope, game: string, addr: string): string {
  return `gnoslinger.seen.${scope.chainId}.${scope.realmPath}.${game}.${addr}`;
}
