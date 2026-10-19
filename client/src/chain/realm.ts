import type { Wallet, VmCall } from "./adena";
import { WALLET_TIMEOUT_MS } from "./adena";
import { ChainError } from "./errors";
import { Rpc, unwrapQevalString, type TxResult } from "./rpc";
import {
  parseGameView,
  parseGamesView,
  parseHistoryView,
  parsePlayersView,
  parseProfile,
  seatOf,
  type GameView,
  type GamesView,
  type HistoryView,
  parsePlanView,
  type PlanView,
  type PlayersView,
  type Profile,
} from "./types";

const WATCH_INTERVAL_MS = 1500;

/** What a write returned: the tx result when the wallet answered, or what the chain showed first. */
interface Sent<R> {
  hash: string | null;
  tx: TxResult | null;
  watched: R | null;
}

/** Typed access to the gnoslinger realm: reads through Render, writes through Adena; the profiles live in their own realm. */
export class RealmClient {
  private busy = false;

  constructor(
    readonly rpc: Rpc,
    readonly wallet: Wallet,
    readonly pkgPath: string,
    readonly profilesPath = "gno.land/r/tbruyelle/gnoslinger/profiles/v0",
  ) {}

  async getGame(id: string): Promise<GameView> {
    return parseGameView(await this.rpc.qrender(this.pkgPath, `json/game/${id}`));
  }

  async getHistory(id: string): Promise<HistoryView> {
    return parseHistoryView(await this.rpc.qrender(this.pkgPath, `json/history/${id}`));
  }

  /** The plan addr submitted for the turn in progress (plans are plain on chain). */
  async getPlan(id: string, addr: string): Promise<PlanView> {
    return parsePlanView(await this.rpc.qrender(this.pkgPath, `json/plan/${id}/${addr}`));
  }

  /** addr's profile, null before its first game. */
  async getProfile(addr: string): Promise<Profile | null> {
    return parseProfile(await this.rpc.qrender(this.profilesPath, `json/profile/${addr}`));
  }

  /** count players of the ranking from offset (0-based), at most 50. */
  async listPlayers(offset: number, count: number): Promise<PlayersView> {
    return parsePlayersView(await this.rpc.qrender(this.profilesPath, `json/players/${offset}/${count}`));
  }

  async listGames(addr: string): Promise<GamesView> {
    return parseGamesView(await this.rpc.qrender(this.pkgPath, `json/games/${addr}`));
  }

  /**
   * Creates a game of seats players (2 to 4), the creator in seat 0 as the
   * showdown's first character, standing in startHex facing f (0=N … 5=NW,
   * one of that character's hexes, game/setup.ts), and returns its id
   * (null only if neither the wallet nor the chain told us in time).
   * timeoutMinutes 0 keeps the realm's default inactivity timeout (2 days).
   */
  async createGame(seats: number, maxTurns: number, timeoutMinutes: number, startHex: string, facing: number): Promise<{ hash: string | null; gameID: string | null }> {
    const me = this.wallet.address;
    const before = new Set((await this.listGames(me)).mine.map((g) => g.id));
    const r = await this.send("CreateGame", [String(seats), String(maxTurns), String(timeoutMinutes), startHex, String(facing)], async () => {
      const games = await this.listGames(me);
      const fresh = games.mine.find((g) => !before.has(g.id) && g.players[0]?.addr === me);
      return fresh?.id ?? null;
    });
    return { hash: r.hash, gameID: r.tx?.data ? unwrapQevalString(r.tx.data) : r.watched };
  }

  /** Takes the next free seat of a waiting game (its character is the seat's), standing in startHex (one of that character's hexes) facing f. */
  async joinGame(id: string, startHex: string, facing: number): Promise<void> {
    const me = this.wallet.address;
    await this.send("JoinGame", [id, startHex, String(facing)], async () => ((await this.getGame(id)).players.some((p) => p.addr === me) ? true : null));
  }

  /** Cancels a game nobody joined; the realm deletes it (refunding its storage deposit). */
  async cancelGame(id: string): Promise<void> {
    await this.send("CancelGame", [id], () => this.gone(id));
  }

  /** Submits the ordered plan string, e.g. "1f:ahead_left,2f:ahead,3f" ("" passes). */
  async submitPlan(id: string, plan: string): Promise<void> {
    const me = this.wallet.address;
    const before = await this.getGame(id);
    await this.send("SubmitPlan", [id, plan], async () => {
      const g = await this.getGame(id);
      const seat = seatOf(g, me);
      const mine = seat >= 0 && g.players[seat].submitted;
      return mine || g.turn !== before.turn || g.phase === "finished" ? true : null;
    });
  }

  async surrender(id: string): Promise<void> {
    await this.send("Surrender", [id], () => this.finished(id));
  }

  /** Claims a timed-out turn: the turn moves on (the late players passed, or out) or the game ends. */
  async claimTimeout(id: string): Promise<void> {
    const before = await this.getGame(id);
    await this.send("ClaimTimeout", [id], async () => {
      const g = await this.getGame(id);
      return g.turn !== before.turn || g.phase === "finished" ? true : null;
    });
  }

  private async gone(id: string): Promise<true | null> {
    try {
      await this.getGame(id);
      return null;
    } catch (e) {
      if (/game not found/.test(String((e as Error)?.message ?? e))) return true;
      throw e;
    }
  }

  private async finished(id: string): Promise<true | null> {
    return (await this.getGame(id)).phase === "finished" ? true : null;
  }

  /**
   * Signs and broadcasts one call through the wallet, then waits for either
   * the wallet's answer (followed by the tx result, which carries a realm
   * panic if the call failed) or for the chain to show the call's effect
   * (`watch` returning non-null), whichever comes first.
   *
   * Adena broadcasts sync and only hands its answer to the page when the
   * user dismisses its result screen, so the chain is the reliable signal;
   * the wallet answer is still the only way to learn a rejection or a panic.
   * One call at a time, because two quick calls race on the account sequence.
   */
  private async send<R>(func: string, args: string[], watch?: () => Promise<R | null>): Promise<Sent<R>> {
    if (this.busy) throw new ChainError("busy", "A transaction is still pending");
    this.busy = true;
    const stop = { done: false };
    try {
      const call: VmCall = { caller: this.wallet.address, send: "", pkg_path: this.pkgPath, func, args };
      const fromWallet = this.wallet.doContract(call).then((r) => ({ hash: r.hash, watched: null as R | null }));
      const fromChain = watch
        ? this.watchChain(watch, stop).then((watched) => ({ hash: null as string | null, watched }))
        : new Promise<{ hash: string | null; watched: R | null }>(() => {});
      const first = await Promise.race([fromWallet, fromChain]);
      stop.done = true;
      if (first.hash) {
        const tx = await this.rpc.waitForTx(first.hash);
        if (tx?.error) throw new ChainError("delivertx", tx.error, tx.log);
        // No result in time: ask the chain once whether the effect is there anyway.
        const watched = !tx && watch ? await watch().catch(() => null) : null;
        return { hash: first.hash, tx, watched };
      }
      // The chain showed the effect first; the wallet's late answer no longer matters.
      fromWallet.catch(() => {});
      return { hash: null, tx: null, watched: first.watched };
    } finally {
      stop.done = true;
      this.busy = false;
    }
  }

  /** Polls watch() until it returns a value, the wallet answered, or the wallet timeout elapses. */
  private async watchChain<R>(watch: () => Promise<R | null>, stop: { done: boolean }): Promise<R> {
    const deadline = Date.now() + WALLET_TIMEOUT_MS;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, WATCH_INTERVAL_MS));
      if (stop.done) return new Promise<R>(() => {}); // the wallet answered: never settle
      try {
        const r = await watch();
        if (r !== null) return r;
      } catch {
        // transient RPC error: keep polling
      }
      if (Date.now() > deadline) return new Promise<R>(() => {});
    }
  }
}
