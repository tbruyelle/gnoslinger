import { hex } from "@scure/base";
import { describe, expect, it } from "vitest";
import { encodeTx, pubKeyAddress, pubKeyJSON, pubKeyProto, publicKey, sign, signBytes, signCall } from "./tx";

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
