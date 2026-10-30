import { CONFIG } from "../config";
import { routeHash } from "./route";

/** Where the reports go: the repository's issues, which anyone with a GitHub account can open. */
export const ISSUES_URL = "https://github.com/tbruyelle/gnoslinger/issues/new";

/** The build's commit (vite.config.ts), "dev" when git could not tell. */
export const BUILD = typeof __BUILD__ === "string" ? __BUILD__ : "dev";

/** What the screen showed when the player reported, for the issue's body; every field may be missing (the lobby has no game). */
export interface BugContext {
  gameID?: string;
  /** The turn shown: the replay's, else the game's. */
  turn?: number;
  /** "planning", "revealing", "replay · segment 3"… */
  shown?: string;
  /** My seat and character, "2 (Reb)". */
  seat?: string;
  /** My address, "" when watching without a wallet. */
  address?: string;
}

/**
 * The link to a new GitHub issue filled with the game, the turn and what the
 * screen showed, under a blank for the player's comment. The game's link
 * opens that turn's replay (game/route.ts), where the chain holds the rest:
 * the plans, the cards drawn, the state. GitHub caps a link at about 8 KB,
 * so the body carries links and labels, never the game's JSON.
 */
export function bugReportUrl(ctx: BugContext, page: { origin: string; pathname: string; userAgent: string; width: number; height: number }): string {
  const where = ctx.gameID ? `game ${ctx.gameID}${ctx.turn ? ` · turn ${ctx.turn}` : ""}` : "lobby";
  const facts = [
    ctx.gameID && `Game: ${page.origin}${page.pathname}${routeHash(ctx.gameID, ctx.turn ?? null)}`,
    ctx.shown && `Shown: ${ctx.shown}`,
    ctx.seat && `Seat: ${ctx.seat}`,
    ctx.address && `Player: ${ctx.address}`,
    `Chain: ${CONFIG.chainId} · realm ${CONFIG.realmPath}`,
    `Build: ${BUILD} · ${page.width}×${page.height} · ${page.userAgent}`,
  ].filter(Boolean);
  const body = `**What happened?**\n\n\n\n**What did you expect?**\n\n\n\n---\n${facts.join("\n")}\n`;
  return `${ISSUES_URL}?${new URLSearchParams({ title: `Bug · ${where}`, body, labels: "bug" })}`;
}

/** bugReportUrl for this page. */
export function reportUrl(ctx: BugContext = {}): string {
  return bugReportUrl(ctx, { origin: location.origin, pathname: location.pathname, userAgent: navigator.userAgent, width: innerWidth, height: innerHeight });
}
