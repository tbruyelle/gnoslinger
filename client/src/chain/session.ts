import { base64, hex } from "@scure/base";
import type { ChainConfig } from "../config";
import { WALLET_TIMEOUT_MS, type AdenaWallet, type ContractMessage, type VmCall, type Wallet } from "./adena";
import { ChainError } from "./errors";
import { gasWanted, isOutOfGas, SIM_GAS } from "./gas";
import { QueryError, type Rpc } from "./rpc";
import { pubKeyAddress, pubKeyProto, publicKey, randomSecretKey, signCall, simulationTx } from "./tx";

/**
 * Account sessions (the chain's auth module, DESIGN_HIDDEN_PLANS.md): a key
 * kept in this browser signs the game's calls for the player's account, so
 * Adena asks once, when the session is created. The chain lets the key call
 * the game realm only (its allow path), until it expires, and spend at most
 * a limit per day from the player's account (fees and storage deposits);
 * the realm sees the player's own address as the caller.
 *
 * SessionWallet is the Wallet the realm client uses: through the session
 * while there is a live one, else through Adena, which it falls back to when
 * the chain refuses the session (expired, revoked, over its limit).
 */

/** The gas a session's own messages need (create and revoke use about 1.4M). */
const SESSION_ADMIN_GAS = 10_000_000;
/** How much the fee exceeds the chain's minimum gas price, as the price may rise from block to block. */
const FEE_MARGIN = 1.2;
const POLL_MS = 1500;

const PUBKEY_TYPE_URL = "/tm.PubKeySecp256k1";
// CheckTx answers with the error's type (/std.SessionNotAllowedError), a
// failed delivery with its text ("…unable to lock deposit …, session not
// allowed error").
const SESSION_ERROR = /Session\w*Error|session (?:expired|not found|limit|not allowed) error/;

/** A session account as the chain shows it. */
export interface SessionInfo {
  /** The session key's address. */
  addr: string;
  accountNumber: number;
  sequence: number;
  /** Unix seconds, 0 = never. */
  expiresAt: number;
  /** ugnot per spendPeriod. */
  spendLimit: number;
  spendUsed: number;
  /** Seconds; 0 = the limit is for the session's whole life. */
  spendPeriod: number;
  /** Unix seconds: the start of the current spend period. */
  spendReset: number;
}

/** What the lobby shows: no session, a live one, or one the chain stopped taking. */
export type SessionState =
  | { kind: "none" }
  | { kind: "active"; info: SessionInfo }
  | { kind: "ended"; info: SessionInfo | null; reason: string };

/** The session's choices offered in the lobby. */
export interface SessionTerms {
  days: number;
  /** ugnot a day. */
  dailyLimit: number;
}

/** Parses the session account JSON of auth/accounts/<master>/session/<addr>. */
export function parseSessionAccount(json: string): SessionInfo {
  const raw = JSON.parse(json) as Record<string, unknown>;
  // gno.land wraps the session account with its allow paths.
  const s = (raw.BaseSessionAccount ?? raw) as Record<string, unknown>;
  const base = (s.BaseAccount ?? {}) as Record<string, string>;
  const ugnot = (coins: unknown) => {
    const m = /(\d+)ugnot/.exec(String(coins ?? ""));
    return m ? Number(m[1]) : 0;
  };
  return {
    addr: base.address ?? "",
    accountNumber: Number(base.account_number ?? 0),
    sequence: Number(base.sequence ?? 0),
    expiresAt: Number(s.expires_at ?? 0),
    spendLimit: ugnot(s.spend_limit),
    spendUsed: ugnot(s.spend_used),
    spendPeriod: Number(s.spend_period ?? 0),
    spendReset: Number(s.spend_reset ?? 0),
  };
}

/** What is spent in the current period: the chain resets it when a period has gone by. */
export function spentNow(info: SessionInfo, nowSec: number): number {
  return info.spendPeriod > 0 && nowSec >= info.spendReset + info.spendPeriod ? 0 : info.spendUsed;
}

/** Why the chain would not take the session now, "" if it would. */
export function sessionProblem(info: SessionInfo, nowSec: number): string {
  if (info.expiresAt > 0 && nowSec >= info.expiresAt) return "it expired";
  if (info.spendLimit > 0 && spentNow(info, nowSec) >= info.spendLimit) return "it reached its spending limit";
  return "";
}

/** Whether a chain error is the chain refusing the session itself (rather than the call). */
export function isSessionError(text: string): boolean {
  return SESSION_ERROR.test(text);
}

function storageKey(chainId: string, master: string): string {
  return `gnoslinger.session.${chainId}.${master}`;
}

function loadSecret(chainId: string, master: string): Uint8Array | null {
  try {
    const v = localStorage.getItem(storageKey(chainId, master));
    return v && /^[0-9a-f]{64}$/.test(v) ? hex.decode(v) : null;
  } catch {
    return null;
  }
}

function saveSecret(chainId: string, master: string, secret: Uint8Array | null) {
  try {
    if (secret) localStorage.setItem(storageKey(chainId, master), hex.encode(secret));
    else localStorage.removeItem(storageKey(chainId, master));
  } catch {
    // no storage: the session lives until the page reloads
  }
}

function keyAny(secret: Uint8Array): { type_url: string; value: string } {
  return { type_url: PUBKEY_TYPE_URL, value: base64.encode(pubKeyProto(publicKey(secret))) };
}

const sessionListeners = new Set<(state: SessionState) => void>();

/** Calls cb whenever the session's state changes (created, revoked, refused by the chain); returns an unsubscribe function. */
export function subscribeSession(cb: (state: SessionState) => void): () => void {
  sessionListeners.add(cb);
  return () => sessionListeners.delete(cb);
}

export class SessionWallet implements Wallet {
  readonly address: string;
  private secret: Uint8Array | null;
  private current: SessionState = { kind: "none" };
  /**
   * Once the chain refused the session, it is not tried again before this
   * (unix seconds): the next spend period for a deposit over the limit
   * (which the account's numbers cannot foresee), never for anything else.
   */
  private refused: { until: number; reason: string } | null = null;

  constructor(
    private readonly adena: AdenaWallet,
    private readonly rpc: Rpc,
    private readonly cfg: ChainConfig,
    private readonly now: () => number = () => Date.now() / 1000,
  ) {
    this.address = adena.address;
    this.secret = loadSecret(cfg.chainId, this.address);
  }

  get state(): SessionState {
    return this.current;
  }

  /** The session key's address, "" without one. */
  get keyAddress(): string {
    return this.secret ? pubKeyAddress(publicKey(this.secret)) : "";
  }

  /** Reads the session from the chain; never throws (the state says what is known). */
  async refresh(): Promise<SessionState> {
    if (!this.secret) return this.setState({ kind: "none" });
    let info: SessionInfo | null;
    try {
      info = await this.query(this.keyAddress);
    } catch {
      return this.current; // node unreachable: keep what we knew
    }
    if (!info) return this.setState({ kind: "ended", info: null, reason: "it was revoked" });
    if (this.refused && this.now() < this.refused.until) return this.setState({ kind: "ended", info, reason: this.refused.reason });
    const problem = sessionProblem(info, this.now());
    return this.setState(problem ? { kind: "ended", info, reason: problem } : { kind: "active", info });
  }

  /**
   * Creates a session (one Adena popup) with a fresh key, revoking the
   * previous one of this browser in the same transaction if the chain still
   * has it. Resolves once the chain shows the new session.
   */
  async enable(terms: SessionTerms): Promise<void> {
    const old = this.secret;
    const oldOnChain = old ? await this.query(pubKeyAddress(publicKey(old))).catch(() => null) : null;
    const secret = randomSecretKey();
    const addr = pubKeyAddress(publicKey(secret));
    const messages: ContractMessage[] = [];
    if (old && oldOnChain) messages.push({ type: "/auth.m_revoke_session", value: { creator: this.address, session_key: keyAny(old) } });
    messages.push({
      type: "/auth.m_create_session",
      value: {
        creator: this.address,
        session_key: keyAny(secret),
        expires_at: String(Math.floor(this.now()) + terms.days * 86400),
        allow_paths: [`vm/exec:${this.cfg.realmPath}`],
        spend_limit: `${terms.dailyLimit}ugnot`,
        spend_period: "86400",
      },
    });
    await this.adminTx(messages, () => this.query(addr));
    this.refused = null;
    this.secret = secret;
    saveSecret(this.cfg.chainId, this.address, secret);
    await this.refresh();
  }

  /** Revokes this browser's session (one Adena popup) and forgets its key. */
  async revoke(): Promise<void> {
    const secret = this.secret;
    if (!secret) return;
    const addr = pubKeyAddress(publicKey(secret));
    if (await this.query(addr).catch(() => null)) {
      await this.adminTx([{ type: "/auth.m_revoke_session", value: { creator: this.address, session_key: keyAny(secret) } }], async () =>
        (await this.query(addr)) ? null : true,
      );
    }
    this.secret = null;
    this.refused = null;
    saveSecret(this.cfg.chainId, this.address, null);
    this.setState({ kind: "none" });
  }

  /** Signs with the session when there is a live one, else (or when the chain refuses it) through Adena. */
  async doContract(call: VmCall): Promise<{ hash: string }> {
    // A call sending coins (a stake) is always signed in Adena: the player sees the money it puts in.
    if (!this.secret || call.send) return this.adena.doContract(call, await this.gasFor(call, null, ""));
    const state = await this.refresh();
    if (state.kind !== "active") return this.adena.doContract(call, await this.gasFor(call, null, ""));
    return this.viaSession(call, state.info, await this.gasFor(call, publicKey(this.secret), state.info.addr), true);
  }

  /** Signs and broadcasts a call with the session key; retry: once more with twice the gas if it runs out. */
  private async viaSession(call: VmCall, info: SessionInfo, gas: number, retry: boolean): Promise<{ hash: string }> {
    const secret = this.secret;
    if (!secret) return this.adena.doContract(call, gas);
    const gasFee = this.cfg.gasFee ?? (await this.fee(gas));
    const { tx, hash } = signCall(call, { gasWanted: gas, gasFee }, { chainId: this.cfg.chainId, accountNumber: info.accountNumber, sequence: info.sequence }, secret, info.addr);
    const res = await this.rpc.broadcastTxSync(base64.encode(tx));
    if (res.error) {
      if (isSessionError(res.error.type + res.error.log)) return this.fallBack(call, info, res.error.log || res.error.type, gas);
      throw new ChainError("checktx", `Transaction refused: ${firstLine(res.error.log) || res.error.type}`, res.error.log);
    }
    // A session spends at delivery too (storage deposits): over its limit,
    // the call fails there, and goes again through Adena.
    const result = await this.rpc.waitForTx(hash);
    if (result?.error && isSessionError(result.error + result.log)) return this.fallBack(call, info, result.error, gas);
    // A reveal resolving the turn can draw more cards in its block than in
    // its simulation: run out of gas, it goes again with twice the limit
    // (the failed one took its fee and its sequence number).
    if (retry && result?.error && isOutOfGas(result.error + result.log)) {
      const state = await this.refresh();
      if (state.kind === "active") return this.viaSession(call, state.info, Math.min(SIM_GAS, gas * 2), false);
    }
    return { hash };
  }

  /**
   * The gas limit for a call (chain/gas.ts): its simulated gas with a
   * margin, the simulation signed by pub for the session sessionAddr
   * ("" for the account's own key, which the chain then supplies); the
   * fixed limits when it cannot be simulated, or VITE_GAS_WANTED.
   */
  private async gasFor(call: VmCall, pub: Uint8Array | null, sessionAddr: string): Promise<number> {
    if (this.cfg.gasWanted) return this.cfg.gasWanted;
    let simulated: number | null = null;
    try {
      const sim = await this.rpc.simulate(simulationTx(call, SIM_GAS, pub, sessionAddr));
      // A call the realm would refuse goes out all the same, with the fixed
      // limit: the node may be a block behind (a claim just due), and the
      // transaction result is where the client reads the realm's refusal.
      if (!sim.error) simulated = sim.gasUsed;
    } catch {
      // Node unreachable or the account unknown to it: the fixed limits.
    }
    return gasWanted(call.func, simulated);
  }

  private async fallBack(call: VmCall, info: SessionInfo, why: string, gas: number): Promise<{ hash: string }> {
    const overLimit = /limit|spend|deposit/i.test(why);
    const reason = overLimit ? "it reached its spending limit" : /expire/i.test(why) ? "it expired" : "the chain refused it";
    // The chain starts a new period at spendReset + spendPeriod (or at the next spend once that has passed).
    const nextPeriod = info.spendReset + info.spendPeriod > this.now() ? info.spendReset + info.spendPeriod : this.now() + info.spendPeriod;
    this.refused = { until: overLimit && info.spendPeriod > 0 ? nextPeriod : Infinity, reason };
    this.setState({ kind: "ended", info, reason });
    return this.adena.doContract(call, gas);
  }

  /** The fee for gasWanted at the chain's gas price, with a margin. */
  private async fee(gasWanted: number): Promise<number> {
    const p = await this.rpc.gasPrice();
    return p.gas > 0 ? Math.ceil((gasWanted * p.price * FEE_MARGIN) / p.gas) : 0;
  }

  private async query(addr: string): Promise<SessionInfo | null> {
    try {
      return parseSessionAccount(await this.rpc.abciQuery(`auth/accounts/${this.address}/session/${addr}`, ""));
    } catch (e) {
      if (e instanceof QueryError && /SessionNotFound/.test(e.log + e.message)) return null;
      throw e;
    }
  }

  /**
   * Sends session messages through Adena and returns once the chain shows
   * their effect (`done` non-null) or the tx result comes: Adena only answers
   * the page when its result screen is closed (see RealmClient.send).
   */
  private async adminTx(messages: ContractMessage[], done: () => Promise<unknown>): Promise<void> {
    let settled = false;
    const fromWallet = this.adena.doMessages(messages, SESSION_ADMIN_GAS).then(async (r) => {
      const tx = await this.rpc.waitForTx(r.hash);
      if (tx?.error) throw new ChainError("delivertx", tx.error, tx.log);
    });
    const fromChain = (async () => {
      const deadline = Date.now() + WALLET_TIMEOUT_MS;
      while (!settled && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        if (await done().catch(() => null)) return;
      }
      return new Promise<void>(() => {});
    })();
    try {
      await Promise.race([fromWallet, fromChain]);
    } finally {
      settled = true;
      fromWallet.catch(() => {});
    }
  }

  private setState(s: SessionState): SessionState {
    const changed = JSON.stringify(s) !== JSON.stringify(this.current);
    this.current = s;
    if (changed) sessionListeners.forEach((cb) => cb(s));
    return s;
  }
}

function firstLine(log: string): string {
  const m = /^(?:Data: )?(.+)$/m.exec(log.replace(/^--= Error =--\n/, ""));
  return m ? m[1] : "";
}
