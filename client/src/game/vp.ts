import type { VPAward } from "../chain/types";

/** The VICTORY POINTS schedule (rule 15.11), in words. */
const REASONS: Record<string, string> = {
  survive: "survives",
  hold_field: "holds the field",
  surrender: "surrendered",
  captured: "captured",
  killed: "killed",
  kill_enemy: "killed the enemy",
  knock_out_enemy: "knocked the enemy out",
};

/** A number of victory points with its sign, "+2", "−4", "0". */
export function signedVP(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

/** An award's reason in words: "survives", "killed the enemy"… */
export function vpReason(reason: string): string {
  return REASONS[reason] ?? reason.replace(/_/g, " ");
}

/**
 * The recap closing a finished game's log: a title, then one indented line
 * per seat with its total and the awards making it up ("Marshal +4 VP:
 * survives +2, holds the field +2"). [] for a game that earned no points.
 */
export function vpRecap(awards: VPAward[], vp: number[], names: string[]): string[] {
  if (awards.length === 0) return [];
  return [
    "Showdown over, victory points:",
    ...vp.map((v, p) => {
      const parts = awards.filter((a) => a.p === p).map((a) => `${vpReason(a.reason)} ${signedVP(a.points)}`);
      return `    ${names[p] ?? `seat ${p}`} ${signedVP(v)} VP${parts.length ? ": " + parts.join(", ") : ""}`;
    }),
  ];
}

/** "Marshal wins 4 to −6 VP", "a draw, 2 to 2 VP"; "" for a game that earned no points. */
export function vpResult(winner: number, vp: number[] | undefined, awards: VPAward[] | undefined, names: string[]): string {
  if (!vp || !awards?.length) return "";
  const score = vp.map((v) => (v < 0 ? `−${-v}` : String(v)));
  if (winner < 0) return `a draw, ${score.join(" to ")} VP`;
  const other = vp.length === 2 ? 1 - winner : -1;
  return `${names[winner] ?? `seat ${winner}`} wins ${score[winner]} to ${other >= 0 ? score[other] : "?"} VP`;
}
