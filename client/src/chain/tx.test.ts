import { base64, hex } from "@scure/base";
import { describe, expect, it } from "vitest";
import { decodeSimulation, encodeTx, pubKeyAddress, pubKeyJSON, pubKeyProto, publicKey, sign, signBytes, signCall, simulationTx } from "./tx";

// Printed by the pinned gno (tm2 std, amino) for the same key and call.
const SECRET = hex.decode("1cd7e52b3a4f1b041d723f43e12453e9bbd8681020858cb0b91a13bd05889b85");
const MASTER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const SESSION = "g1mtdux4tnpyn8tezu340he033y50uyg7hg5d2aj";
const CALL = { caller: MASTER, send: "", pkg_path: "gno.land/r/tbruyelle/gnoslinger/v0", func: "SubmitPlan", args: ["0000001", "1f:ahead,3f"] };
const FEE = { gasWanted: 100_000_000, gasFee: 1_000_000 };
const SIGNER = { chainId: "dev", accountNumber: 42, sequence: 7 };
const SIGN_BYTES =
  '{"account_number":"42","chain_id":"dev","fee":{"amount":[{"amount":"1000000","denom":"ugnot"}],"gas":"100000000"},"memo":"",' +
  '"msgs":[{"@type":"/vm.m_call","args":["0000001","1f:ahead,3f"],"caller":"g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5","func":"SubmitPlan",' +
  '"max_deposit":"","pkg_path":"gno.land/r/tbruyelle/gnoslinger/v0","send":""}],"sequence":"7"}';
const SIG = "6e0b20be8bcdc7f57885844370f3947b4b1e7988559359b6c24ba6236c18157479cd557b5c6bdc92fe138bc021ea55698d1e48fd010544475839c11e47f9e7bd";
const TX =
  "0a7e0a0a2f766d2e6d5f63616c6c12700a2867316a67386d74757475396b6868667763346e786d756863706674663070616a64686676737166352222676e6f2e6c616e642f722f7462727579656c6c652f676e6f736c696e6765722f76302a0a5375626d6974506c616e320730303030303031320b31663a61686561642c33661213088084af5f120c3130303030303075676e6f741aa8010a3a0a132f746d2e5075624b6579536563703235366b3112230a21037027f90b40f01a85e72b9ff7bc0f6dc385dc1e6748278a83d019dcaff989e07212406e0b20be8bcdc7f57885844370f3947b4b1e7988559359b6c24ba6236c18157479cd557b5c6bdc92fe138bc021ea55698d1e48fd010544475839c11e47f9e7bd1a2867316d7464757834746e70796e3874657a753334306865303333793530757967376867356432616a";

describe("tx", () => {
  const pub = publicKey(SECRET);

  it("derives the key's address and encodings as tm2 does", () => {
    expect(pubKeyAddress(pub)).toBe(SESSION);
    expect(hex.encode(pubKeyProto(pub))).toBe("0a21037027f90b40f01a85e72b9ff7bc0f6dc385dc1e6748278a83d019dcaff989e072");
    expect(pubKeyJSON(pub)).toEqual({ "@type": "/tm.PubKeySecp256k1", value: "A3An+QtA8BqF5yuf97wPbcOF3B5nSCeKg9AZ3K/5ieBy" });
  });

  it("builds the sign bytes and the signature", () => {
    const sb = signBytes(CALL, FEE, "", SIGNER);
    expect(new TextDecoder().decode(sb)).toBe(SIGN_BYTES);
    expect(hex.encode(sign(SECRET, sb))).toBe(SIG);
  });

  it("encodes the session-signed tx as amino binary", () => {
    expect(hex.encode(encodeTx(CALL, FEE, "", pub, hex.decode(SIG), SESSION))).toBe(TX);
    expect(hex.encode(signCall(CALL, FEE, SIGNER, SECRET, SESSION).tx)).toBe(TX);
  });

  it("escapes as Go's JSON does and leaves out empty args", () => {
    const sb = new TextDecoder().decode(signBytes({ ...CALL, args: [] }, { gasWanted: 1, gasFee: 0 }, "a<b", SIGNER));
    expect(sb).toContain('"memo":"a\\u003cb"');
    expect(sb).toContain('"fee":{"amount":[],"gas":"1"}');
    expect(sb).not.toContain("args");
  });
});

// The node's answers to .app/simulate on gnodev (pinned gno, 2026-10-25), for
// test1: a CreateGame that goes through (22,686,124 gas), and a Commit the
// realm refuses.
const SIM_OK = "CrQEEhQoIjAwMDAwMDIiIHN0cmluZykKChqNAgoJL3RtLkV2ZW50Ev8BCgtHYW1lQ3JlYXRlZBINCgJpZBIHMDAwMDAwMhIzCgdjcmVhdG9yEihnMWpnOG10dXR1OWtoaGZ3YzRueG11aGNwZnRmMHBhamRoZnZzcWY1Eg8KBGNoYXISB21hcnNoYWwSCgoFc2VhdHMSATISDgoIbWF4VHVybnMSAjIwEhYKDnRpbWVvdXRNaW51dGVzEgQyODgwEgsKA2hleBIEQS1ENhILCgZmYWNpbmcSATISCgoFc3Rha2USATAaQWduby5sYW5kL3IvZzF0aDBtYXNwNjd6ZnM5bGc2ZDM0cWhnaGxkaGc2a2pjcWp1djdjMi9nbm9zbGluZ2VyL3YwGncKFy90bS5TdG9yYWdlRGVwb3NpdEV2ZW50ElwI1FwSCzU5MzAwMHVnbm90Gkpnbm8ubGFuZC9yL2cxdGgwbWFzcDY3emZzOWxnNmQzNHFoZ2hsZGhnNmtqY3FqdXY3YzIvZ25vc2xpbmdlci9wcm9maWxlcy92MBpwChcvdG0uU3RvcmFnZURlcG9zaXRFdmVudBJVCN6qAxIMMjczMTEwMHVnbm90GkFnbm8ubGFuZC9yL2cxdGgwbWFzcDY3emZzOWxnNmQzNHFoZ2hsZGhnNmtqY3FqdXY3YzIvZ25vc2xpbmdlci92MCIhbXNnOjAsc3VjY2Vzczp0cnVlLGxvZzosZXZlbnRzOltdEID4gq0WGNim0RU=";
const SIM_REFUSED = "CqUHCkQKES9hYmNpLlN0cmluZ0Vycm9yEi8KLWdub3NsaW5nZXI6IHlvdSBhcmUgbm90IGEgcGxheWVyIG9mIHRoaXMgZ2FtZSLIBm1zZzowLHN1Y2Nlc3M6ZmFsc2UsbG9nOi0tPSBFcnJvciA9LS0KRGF0YTogZXJyb3JzLkZtdEVycm9ye2Zvcm1hdDoiZ25vc2xpbmdlcjogeW91IGFyZSBub3QgYSBwbGF5ZXIgb2YgdGhpcyBnYW1lIiwgYXJnczpbXWludGVyZmFjZSB7fShuaWwpfQpNc2cgVHJhY2VzOgogICAgMCAgZ25vL3RtMi9wa2cvZXJyb3JzL2Vycm9ycy5nbzoxMDMgLSBWTSBwYW5pYzogZ25vc2xpbmdlcjogeW91IGFyZSBub3QgYSBwbGF5ZXIgb2YgdGhpcyBnYW1lClN0YWNrdHJhY2U6CnBhbmljOiBnbm9zbGluZ2VyOiB5b3UgYXJlIG5vdCBhIHBsYXllciBvZiB0aGlzIGdhbWUKKCpnbm8ubGFuZC9yL2cxdGgwbWFzcDY3emZzOWxnNmQzNHFoZ2hsZGhnNmtqY3FqdXY3YzIvZ25vc2xpbmdlci92MC5HYW1lKS5tdXN0U2VhdCBhdCBnbm8ubGFuZC9yL2cxdGgwbWFzcDY3emZzOWxnNmQzNHFoZ2hsZGhnNmtqY3FqdXY3YzIvZ25vc2xpbmdlci92MC9nbm9zbGluZ2VyLmdubzoxOTkKQ29tbWl0IGF0IGduby5sYW5kL3IvZzF0aDBtYXNwNjd6ZnM5bGc2ZDM0cWhnaGxkaGc2a2pjcWp1djdjMi9nbm9zbGluZ2VyL3YwL3BsYXkuZ25vOjMwCgoKU3RhY2sgVHJhY2U6CiAgICAwICBnbm8vdG0yL3BrZy9lcnJvcnMvZXJyb3JzLmdvOjg4CiAgICAxICBnbm8vdG0yL3BrZy9lcnJvcnMvZXJyb3JzLmdvOjEwMwogICAgMiAgZ25vL2duby5sYW5kL3BrZy9zZGsvdm0va2VlcGVyLmdvOjE0NTMKICAgIDMgIGduby9nbm8ubGFuZC9wa2cvc2RrL3ZtL2tlZXBlci5nbzoxNDI2CiAgICA0ICAvdXNyL2xpYi9nby9zcmMvcnVudGltZS9wYW5pYy5nbzo4NjAKLi4uIDI5IG1vcmUgbGluZXMgZWxpZGVkLGV2ZW50czpbXSoSdm0udmVyc2lvbj1kZXZlbG9wEID4gq0WGLjPyQc=";

describe("simulation", () => {
  it("reads the gas used, or the realm's refusal", () => {
    expect(decodeSimulation(base64.decode(SIM_OK))).toEqual({ gasUsed: 22_686_124, error: null });
    const refused = decodeSimulation(base64.decode(SIM_REFUSED));
    expect(refused.error).toBe("gnoslinger: you are not a player of this game");
    expect(refused.gasUsed).toBeGreaterThan(0);
    expect(decodeSimulation(new Uint8Array())).toEqual({ gasUsed: 0, error: null });
  });

  it("builds the transaction to simulate: a 1 ugnot fee, a blank signature, the key when given", () => {
    const pub = publicKey(SECRET);
    const withKey = simulationTx(CALL, 1_000_000_000, pub, SESSION);
    const keyless = simulationTx(CALL, 1_000_000_000, null, "");
    expect(withKey).toEqual(encodeTx(CALL, { gasWanted: 1_000_000_000, gasFee: 1 }, "", pub, new Uint8Array(64), SESSION));
    const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
    expect(text(withKey)).toContain("/tm.PubKeySecp256k1");
    expect(text(keyless)).not.toContain("/tm.PubKeySecp256k1");
    expect(text(keyless)).toContain("1ugnot");
  });
});
