import { base64, hex } from "@scure/base";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainConfig } from "../config";
import type { AdenaWallet } from "./adena";
import { QueryError, type Rpc, type TxResult } from "./rpc";
import { isSessionError, parseSessionAccount, sessionProblem, SessionWallet, spentNow } from "./session";
import { pubKeyAddress, publicKey, type Simulation } from "./tx";

const MASTER = "g1tnz4rhep0fhj3s52qerakj58q87fxes36f3558";
const SECRET = "1cd7e52b3a4f1b041d723f43e12453e9bbd8681020858cb0b91a13bd05889b85";
const KEY_ADDR = pubKeyAddress(publicKey(hex.decode(SECRET)));
const CFG: ChainConfig = { rpcUrl: "", chainId: "dev", chainName: "dev", realmPath: "gno.land/r/x/v0", profilesPath: "", pollMs: 2000 };
const NOW = 1792340000;

// As gnodev answers auth/accounts/<master>/session/<addr>.
const account = (o: { expires?: number; used?: string; reset?: number } = {}) =>
  JSON.stringify({
    BaseSessionAccount: {
      BaseAccount: { address: KEY_ADDR, coins: "", public_key: { "@type": "/tm.PubKeySecp256k1", value: "x" }, account_number: "31", sequence: "4" },
      master_address: MASTER,
      expires_at: String(o.expires ?? NOW + 86400),
      spend_limit: "10000000ugnot",
      spend_period: "86400",
      ...(o.used ? { spend_used: o.used } : {}),
      spend_reset: String(o.reset ?? NOW - 100),
    },
    allow_paths: ["vm/exec:gno.land/r/x/v0"],
  });

const CALL = { caller: MASTER, send: "", pkg_path: "gno.land/r/x/v0", func: "SubmitPlan", args: ["0000001", ""] };

function setup(opts: { session?: string | null; broadcastError?: { type: string; log: string }; txError?: string; txErrors?: (string | null)[]; simulate?: Simulation | Error; cfg?: Partial<ChainConfig> } = {}) {
  const session = opts.session === undefined ? account() : opts.session;
  const rpc = {
    abciQuery: vi.fn(async (path: string) => {
      if (session === null) throw new QueryError("Data: std.SessionNotFoundError{}", "--= Error =--\nData: std.SessionNotFoundError{abciError:std.abciError{}}");
      expect(path).toBe(`auth/accounts/${MASTER}/session/${KEY_ADDR}`);
      return session;
    }),
    gasPrice: vi.fn(async () => ({ gas: 1000, price: 1 })),
    broadcastTxSync: vi.fn(async (_tx: string) => ({ hash: "h", error: opts.broadcastError ?? null })),
    waitForTx: vi.fn(async (): Promise<TxResult> => {
      const error = opts.txErrors ? (opts.txErrors.shift() ?? null) : (opts.txError ?? null);
      return { height: 1, error, log: error ?? "", data: null, events: [] };
    }),
    // Without a simulation, the fixed limits.
    simulate: vi.fn(async (): Promise<Simulation> => {
      const sim = opts.simulate ?? new Error("no simulation");
      if (sim instanceof Error) throw sim;
      return sim;
    }),
  };
  const adena = { address: MASTER, doContract: vi.fn(async (_call: unknown) => ({ hash: "adena" })), doMessages: vi.fn() };
  const wallet = new SessionWallet(adena as unknown as AdenaWallet, rpc as unknown as Rpc, { ...CFG, ...opts.cfg }, () => NOW);
  return { rpc, adena, wallet };
}

// The tests run in node: a Map stands for the browser's storage.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

describe("session accounts", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(`gnoslinger.session.dev.${MASTER}`, SECRET);
  });

  it("parses the session account", () => {
    const info = parseSessionAccount(account({ used: "2624200ugnot" }));
    expect(info).toEqual({ addr: KEY_ADDR, accountNumber: 31, sequence: 4, expiresAt: NOW + 86400, spendLimit: 10_000_000, spendUsed: 2_624_200, spendPeriod: 86400, spendReset: NOW - 100 });
    expect(spentNow(info, NOW)).toBe(2_624_200);
    expect(spentNow(info, NOW - 100 + 86400)).toBe(0); // a new period
    expect(sessionProblem(info, NOW)).toBe("");
    expect(sessionProblem(info, NOW + 86400)).toBe("it expired");
    expect(sessionProblem({ ...info, spendUsed: 10_000_000 }, NOW)).toBe("it reached its spending limit");
    expect(isSessionError("/std.SessionNotAllowedError")).toBe(true);
    expect(isSessionError("gnoslinger: not your turn")).toBe(false);
  });

  it("signs through the session, the fee at the gas price", async () => {
    const { rpc, adena, wallet } = setup();
    expect(await wallet.doContract(CALL)).toEqual({ hash: expect.any(String) });
    expect(adena.doContract).not.toHaveBeenCalled();
    expect(rpc.broadcastTxSync).toHaveBeenCalledOnce();
    expect(wallet.state.kind).toBe("active");
  });

  it("goes through Adena without a key, or with the session gone", async () => {
    localStorage.clear();
    let s = setup();
    await s.wallet.doContract(CALL);
    expect(s.adena.doContract).toHaveBeenCalledOnce();
    expect(s.rpc.broadcastTxSync).not.toHaveBeenCalled();

    localStorage.setItem(`gnoslinger.session.dev.${MASTER}`, SECRET);
    s = setup({ session: null });
    await s.wallet.doContract(CALL);
    expect(s.adena.doContract).toHaveBeenCalledOnce();
    expect(s.wallet.state).toEqual({ kind: "ended", info: null, reason: "it was revoked" });

    s = setup({ session: account({ expires: NOW - 1 }) });
    await s.wallet.doContract(CALL);
    expect(s.adena.doContract).toHaveBeenCalledOnce();
    expect(s.wallet.state).toMatchObject({ kind: "ended", reason: "it expired" });
  });

  it("falls back to Adena when the chain refuses the session", async () => {
    let s = setup({ broadcastError: { type: "/std.SessionNotAllowedError", log: "session spend limit would be exceeded" } });
    await s.wallet.doContract(CALL);
    expect(s.adena.doContract).toHaveBeenCalledOnce();
    expect(s.wallet.state).toMatchObject({ kind: "ended", reason: "it reached its spending limit" });
    // Not tried again (another fee) while the chain would still refuse it.
    await s.wallet.doContract(CALL);
    expect(s.rpc.broadcastTxSync).toHaveBeenCalledOnce();
    expect(s.adena.doContract).toHaveBeenCalledTimes(2);

    // As gnodev words a storage deposit over the limit.
    s = setup({
      txError:
        "storage deposit processing encountered one or more errors: lockStorageDeposit failed for realm gno.land/r/x/v0: " +
        "unable to lock deposit gno.land/r/x/v0, session not allowed error",
    });
    await s.wallet.doContract(CALL);
    expect(s.adena.doContract).toHaveBeenCalledOnce();
    expect(s.wallet.state).toMatchObject({ kind: "ended", reason: "it reached its spending limit" });
  });

  it("fits the session's gas limit to the simulated gas", async () => {
    // The fee: gas price 1 ugnot per 1000 gas, 20 % over.
    const fee = (tx: string) => /(\d+)ugnot/.exec(new TextDecoder("latin1").decode(base64.decode(tx)))?.[1];
    let s = setup({ simulate: { gasUsed: 20_000_000, error: null } });
    await s.wallet.doContract(CALL);
    expect(fee(s.rpc.broadcastTxSync.mock.calls[0][0])).toBe("36000"); // 30M
    // A reveal may resolve the turn: twice the simulated gas.
    s = setup({ simulate: { gasUsed: 50_000_000, error: null } });
    await s.wallet.doContract({ ...CALL, func: "Reveal" });
    expect(fee(s.rpc.broadcastTxSync.mock.calls[0][0])).toBe("120000"); // 100M

    // Through Adena: it fits the limit itself, nothing is simulated here.
    localStorage.clear();
    s = setup({ simulate: { gasUsed: 20_000_000, error: null } });
    await s.wallet.doContract(CALL);
    expect(s.adena.doContract).toHaveBeenCalledWith(CALL);
    expect(s.rpc.simulate).not.toHaveBeenCalled();
    // Not simulated (a realm refusal): the fixed limit.
    localStorage.setItem(`gnoslinger.session.dev.${MASTER}`, SECRET);
    s = setup({ simulate: { gasUsed: 9_000_000, error: "gnoslinger: not your turn" } });
    await s.wallet.doContract(CALL);
    expect(fee(s.rpc.broadcastTxSync.mock.calls[0][0])).toBe("120000"); // 100M
    // VITE_GAS_WANTED fixes it.
    s = setup({ simulate: { gasUsed: 20_000_000, error: null }, cfg: { gasWanted: 70_000_000 } });
    await s.wallet.doContract(CALL);
    expect(s.rpc.simulate).not.toHaveBeenCalled();
    expect(fee(s.rpc.broadcastTxSync.mock.calls[0][0])).toBe("84000"); // 70M
  });

  it("goes again once with twice the gas when it runs out", async () => {
    const fee = (tx: string) => /(\d+)ugnot/.exec(new TextDecoder("latin1").decode(base64.decode(tx)))?.[1];
    let s = setup({ simulate: { gasUsed: 50_000_000, error: null }, txErrors: ["out of gas in location: ReadFlat; gasWanted: 100000000", null] });
    expect(await s.wallet.doContract({ ...CALL, func: "Reveal" })).toEqual({ hash: expect.any(String) });
    expect(s.rpc.broadcastTxSync).toHaveBeenCalledTimes(2);
    expect(fee(s.rpc.broadcastTxSync.mock.calls[1][0])).toBe("240000"); // 200M
    // Only once.
    s = setup({ simulate: { gasUsed: 50_000_000, error: null }, txErrors: ["out of gas", "out of gas", null] });
    await s.wallet.doContract({ ...CALL, func: "Reveal" });
    expect(s.rpc.broadcastTxSync).toHaveBeenCalledTimes(2);
  });

  it("leaves other failures to the caller", async () => {
    const s = setup({ broadcastError: { type: "/std.InsufficientFeeError", log: "--= Error =--\nData: insufficient fee" } });
    await expect(s.wallet.doContract(CALL)).rejects.toThrow("Transaction refused: insufficient fee");
    expect(s.adena.doContract).not.toHaveBeenCalled();
    // A realm panic comes back through the tx result as usual.
    const t = setup({ txError: "gnoslinger: not your turn" });
    expect(await t.wallet.doContract(CALL)).toEqual({ hash: expect.any(String) });
  });
});
