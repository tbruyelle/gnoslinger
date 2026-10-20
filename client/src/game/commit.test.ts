import { describe, expect, it, vi } from "vitest";
import { loadPending, loadSeenTurn, saveSeenTurn, newSalt, packSealed, planHash, prunePending, roundTime, savePending, unpackSealed } from "./commit";

// The tests run in node: a Map stands for the browser's storage.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
});

const SCOPE = { chainId: "dev", realmPath: "gno.land/r/x/v0" };

describe("hidden plans", () => {
  it("hashes as the realm's PlanHash", () => {
    // sha256("gnoslinger|0000001|3|1|a1|1f:ahead,3f")
    expect(planHash("0000001", 3, 1, "a1", "1f:ahead,3f")).toBe("b85305da381137b71bc5dc457c705122a033acb29746e2a4cb2d0b44a432adc8");
  });

  it("makes 16-byte hex salts", () => {
    expect(newSalt()).toMatch(/^[0-9a-f]{32}$/);
    expect(newSalt()).not.toBe(newSalt());
  });

  it("packs a salt and plan for the timelock", () => {
    const s = { salt: "ab12", plan: "5f:aim:A-I11*,7f:shoot:@1" };
    expect(unpackSealed(packSealed(s))).toEqual(s);
    expect(unpackSealed("ab|")).toEqual({ salt: "ab", plan: "" });
  });

  it("dates a drand quicknet round", () => {
    expect(roundTime(1)).toBe(1692803367);
    expect(roundTime(101)).toBe(1692803367 + 300);
  });

  it("keeps the pending reveals per chain, realm, game, turn and seat", () => {
    savePending(SCOPE, "0000001", 2, 0, { salt: "aa", plan: "1f:ahead" });
    savePending(SCOPE, "0000001", 3, 0, { salt: "bb", plan: "" });
    savePending(SCOPE, "0000002", 1, 1, { salt: "cc", plan: "3f" });
    expect(loadPending(SCOPE, "0000001", 2, 0)).toEqual({ salt: "aa", plan: "1f:ahead" });
    expect(loadPending(SCOPE, "0000001", 2, 1)).toBeNull();
    expect(loadPending({ ...SCOPE, chainId: "test" }, "0000001", 2, 0)).toBeNull();
    prunePending(SCOPE, "0000001", 3);
    expect(loadPending(SCOPE, "0000001", 2, 0)).toBeNull();
    expect(loadPending(SCOPE, "0000001", 3, 0)).toEqual({ salt: "bb", plan: "" });
    expect(loadPending(SCOPE, "0000002", 1, 1)).not.toBeNull();
  });

  it("remembers the last turn played back, per game", () => {
    expect(loadSeenTurn(SCOPE, "0000003")).toBe(0);
    saveSeenTurn(SCOPE, "0000003", 2);
    expect(loadSeenTurn(SCOPE, "0000003")).toBe(2);
    expect(loadSeenTurn({ ...SCOPE, realmPath: "gno.land/r/x/v1" }, "0000003")).toBe(0);
  });
});
