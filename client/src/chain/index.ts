import { CONFIG, type ChainConfig } from "../config";
import { connectWallet } from "./adena";
import { RealmClient } from "./realm";
import { Rpc } from "./rpc";
import { SessionWallet } from "./session";

export interface Chain {
  config: ChainConfig;
  rpc: Rpc;
  /** Signs through the account's session when it has a live one, else through Adena. */
  wallet: SessionWallet;
  realm: RealmClient;
}

let chain: Chain | null = null;

/** Connects Adena, reads this browser's session, and builds the realm client; the result is shared by all scenes. */
export async function initChain(cfg: ChainConfig = CONFIG): Promise<Chain> {
  const rpc = new Rpc(cfg.rpcUrl);
  const wallet = new SessionWallet(await connectWallet(cfg), rpc, cfg);
  await wallet.refresh();
  chain = { config: cfg, rpc, wallet, realm: new RealmClient(rpc, wallet, cfg.realmPath, cfg.profilesPath) };
  return chain;
}

export function getChain(): Chain {
  if (!chain) throw new Error("chain not initialised: connect in the lobby first");
  return chain;
}

export function currentChain(): Chain | null {
  return chain;
}

export function resetChain(): void {
  chain = null;
}
