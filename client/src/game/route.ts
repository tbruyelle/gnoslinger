/**
 * A showdown's address in the page URL, to open or share it: "#game/<id>"
 * for the game, "#game/<id>/<turn>" for its replay on that turn. Ids are the
 * realm's zero-padded game ids; a short one ("#game/12") is padded.
 */
export interface GameRoute {
  gameID: string;
  /** The turn to replay, null for the game itself. */
  turn: number | null;
}

/** The realm's game ids: seqid, zero-padded to 7 digits. */
const GAME_ID_DIGITS = 7;

/** The route in a location hash, null when it addresses no game. */
export function parseRoute(hash: string): GameRoute | null {
  const m = /^#game\/(\d+)(?:\/(\d+))?$/.exec(hash);
  if (!m || Number(m[1]) === 0) return null;
  const turn = m[2] !== undefined ? Number(m[2]) : 0;
  return { gameID: m[1].padStart(GAME_ID_DIGITS, "0"), turn: turn >= 1 ? turn : null };
}

/** The location hash of a game, or of its replay on a turn. */
export function routeHash(gameID: string, turn: number | null = null): string {
  return turn ? `#game/${gameID}/${turn}` : `#game/${gameID}`;
}
