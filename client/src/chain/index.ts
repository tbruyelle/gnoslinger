import { CONFIG, type ChainConfig } from "../config";
import { adenaConnected, connectWallet, type Wallet } from "./adena";
import { ChainError } from "./errors";
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

/**
 * Connects the wallet when that needs no popup, Adena having this site
 * connected already (a page reloaded, a link opened by a player): the
 * chain shared by the scenes, else null.
 */
export async function connectIfAllowed(cfg: ChainConfig = CONFIG): Promise<Chain | null> {
  if (!(await adenaConnected())) return null;
  try {
    return await initChain(cfg);
  } catch {
    return null;
  }
}

/**
 * Reads the chain with no wallet: a game's address opened by anyone, to
 * watch the showdown or a turn of it (game/route.ts). It has no account, so
 * the game screen shows the showdown as a spectator; it signs nothing.
 */
export function viewerChain(cfg: ChainConfig = CONFIG): Chain {
  const rpc = new Rpc(cfg.rpcUrl);
  const wallet = {
    address: "",
    state: { kind: "none" },
    doContract: async () => {
      throw new ChainError("not-connected", "Connect with Adena to play");
    },
  };
  return { config: cfg, rpc, wallet, realm: new RealmClient(rpc, wallet as Wallet, cfg.realmPath, cfg.profilesPath) } as unknown as Chain;
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
