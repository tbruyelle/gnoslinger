import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64, bech32 } from "@scure/base";
import type { VmCall } from "./adena";

/**
 * The Tendermint2 transaction of one /vm.m_call, built and signed in the
 * browser for a session key (chain/session.ts): the amino JSON the signature
 * covers and the amino binary the node takes in broadcast_tx_sync. Only what
 * the game sends is covered: one MsgCall, a fee, one signature. Tested
 * against encodings printed by the pinned gno (tx.test.ts).
 */

export interface Fee {
  gasWanted: number;
  /** The fee in ugnot, charged in full whatever the gas used. */
  gasFee: number;
}

/** What a signature commits to besides the transaction: the signer account's number and sequence. */
export interface SignerInfo {
  chainId: string;
  accountNumber: number;
  sequence: number;
}

const PUBKEY_TYPE = "/tm.PubKeySecp256k1";

/** The bech32 g1… address of a compressed secp256k1 public key. */
export function pubKeyAddress(pub: Uint8Array): string {
  return bech32.encode("g", bech32.toWords(ripemd160(sha256(pub))));
}

/** The compressed public key of a secret key. */
export function publicKey(secret: Uint8Array): Uint8Array {
  return secp256k1.getPublicKey(secret, true);
}

/** A fresh secret key. */
export function randomSecretKey(): Uint8Array {
  return secp256k1.utils.randomSecretKey();
}

/** The proto encoding of the public key itself (PubKeySecp256k1{key}), the value of its Any. */
export function pubKeyProto(pub: Uint8Array): Uint8Array {
  return new Proto().bytes(1, pub).finish();
}

/** The amino JSON of a public key, as MsgCreateSession and the accounts carry it. */
export function pubKeyJSON(pub: Uint8Array): { "@type": string; value: string } {
  return { "@type": PUBKEY_TYPE, value: base64.encode(pub) };
}

/**
 * The bytes signed: the sign doc's amino JSON with its keys sorted (tm2
 * std.GetSignaturePayload: the fee as an amount list and a gas string).
 */
export function signBytes(call: VmCall, fee: Fee, memo: string, signer: SignerInfo): Uint8Array {
  const msg =
    `{"@type":"/vm.m_call",` +
    (call.args.length ? `"args":[${call.args.map(jsonString).join(",")}],` : "") +
    `"caller":${jsonString(call.caller)},"func":${jsonString(call.func)},"max_deposit":"",` +
    `"pkg_path":${jsonString(call.pkg_path)},"send":${jsonString(call.send)}}`;
  const amount = fee.gasFee > 0 ? `[{"amount":"${fee.gasFee}","denom":"ugnot"}]` : "[]";
  const doc =
    `{"account_number":"${signer.accountNumber}","chain_id":${jsonString(signer.chainId)},` +
    `"fee":{"amount":${amount},"gas":"${fee.gasWanted}"},"memo":${jsonString(memo)},` +
    `"msgs":[${msg}],"sequence":"${signer.sequence}"}`;
  return new TextEncoder().encode(doc);
}

/** Signs bytes as tm2's secp256k1 does: ECDSA over their sha256, 64 bytes r‖s with a low s. */
export function sign(secret: Uint8Array, bytes: Uint8Array): Uint8Array {
  return secp256k1.sign(bytes, secret, { prehash: true, lowS: true });
}

/**
 * The amino binary of the signed transaction. sessionAddr is the session
 * account that signed for the caller ("" for the caller's own key).
 */
export function encodeTx(call: VmCall, fee: Fee, memo: string, pub: Uint8Array, signature: Uint8Array, sessionAddr: string): Uint8Array {
  const msgCall = new Proto().string(1, call.caller).string(2, call.send).string(4, call.pkg_path).string(5, call.func);
  for (const a of call.args) msgCall.string(6, a, true);
  const msgAny = new Proto().string(1, "/vm.m_call").bytes(2, msgCall.finish());
  const feeMsg = new Proto().int64(1, fee.gasWanted).string(2, fee.gasFee > 0 ? `${fee.gasFee}ugnot` : "");
  const pubAny = new Proto().string(1, PUBKEY_TYPE).bytes(2, pubKeyProto(pub));
  const sig = new Proto().bytes(1, pubAny.finish()).bytes(2, signature).string(3, sessionAddr);
  return new Proto().bytes(1, msgAny.finish()).bytes(2, feeMsg.finish()).bytes(3, sig.finish()).string(4, memo).finish();
}

/** Builds, signs and encodes a call; returns the tx bytes and their hash (base64, as the node indexes it). */
export function signCall(call: VmCall, fee: Fee, signer: SignerInfo, secret: Uint8Array, sessionAddr: string): { tx: Uint8Array; hash: string } {
  const pub = publicKey(secret);
  const signature = sign(secret, signBytes(call, fee, "", signer));
  const tx = encodeTx(call, fee, "", pub, signature, sessionAddr);
  return { tx, hash: base64.encode(sha256(tx)) };
}

/** A JSON string as Go's encoding/json writes it (amino JSON escapes <, > and & too). */
function jsonString(s: string): string {
  return JSON.stringify(s).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** A minimal protobuf writer; like amino, it leaves out empty fields (forced for repeated strings). */
class Proto {
  private out: number[] = [];

  private varint(n: number) {
    let v = BigInt(n);
    while (v > 0x7fn) {
      this.out.push(Number(v & 0x7fn) | 0x80);
      v >>= 7n;
    }
    this.out.push(Number(v));
  }

  /** An int64, which amino writes zigzag-encoded (sint64). */
  int64(field: number, n: number): this {
    if (n === 0) return this;
    this.varint(field << 3);
    this.varint(n >= 0 ? 2 * n : -2 * n - 1);
    return this;
  }

  bytes(field: number, b: Uint8Array, force = false): this {
    if (b.length === 0 && !force) return this;
    this.varint((field << 3) | 2);
    this.varint(b.length);
    for (const x of b) this.out.push(x);
    return this;
  }

  string(field: number, s: string, force = false): this {
    return this.bytes(field, new TextEncoder().encode(s), force);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.out);
  }
}
