/** Chain settings, read from Vite env vars (see .env.example). */
export interface ChainConfig {
  /** Tendermint2 JSON-RPC endpoint of the gno.land node. */
  rpcUrl: string;
  /** Chain id Adena must be on ("dev" for gnodev). */
  chainId: string;
  /** Name shown by Adena when the network is added. */
  chainName: string;
  /** Package path of the gnoslinger realm. */
  realmPath: string;
  /** Package path of the profiles realm (players, ranking), kept across game versions. */
  profilesPath: string;
  /** Gas overrides for transactions; undefined lets Adena pick. */
  gasWanted?: number;
  gasFee?: number;
  /** How often the game view is polled, in milliseconds. */
  pollMs: number;
  /** The gnotif server pushing the browser notifications (game/notifications.ts), "" for none offered: http://127.0.0.1:8080 with make notif. */
  gnotifServer: string;
  /** GoatCounter's endpoint counting the page views (analytics.ts), "" for none: https://gnoslinger.goatcounter.com/count in production. */
  goatcounter: string;
}

function str(value: string | undefined, fallback: string): string {
  return value && value.trim() !== "" ? value.trim() : fallback;
}

function num(value: string | undefined): number | undefined {
  if (!value || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export const CONFIG: ChainConfig = {
  rpcUrl: str(import.meta.env.VITE_RPC_URL, "http://127.0.0.1:26657"),
  chainId: str(import.meta.env.VITE_CHAIN_ID, "dev"),
  chainName: str(import.meta.env.VITE_CHAIN_NAME, "gnodev"),
  realmPath: str(import.meta.env.VITE_REALM_PATH, "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"),
  profilesPath: str(import.meta.env.VITE_PROFILES_PATH, "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/profiles/v0"),
  gasWanted: num(import.meta.env.VITE_GAS_WANTED),
  gasFee: num(import.meta.env.VITE_GAS_FEE),
  pollMs: num(import.meta.env.VITE_POLL_MS) ?? 2000,
  gnotifServer: str(import.meta.env.VITE_GNOTIF_SERVER, ""),
  goatcounter: str(import.meta.env.VITE_GOATCOUNTER, ""),
};
