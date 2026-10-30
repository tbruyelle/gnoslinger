import { describe, expect, it } from "vitest";
import type { GameView } from "../chain/types";
import { shareText } from "./share";

const base = "https://gnoslinger.xyz/";
const game = (over: Partial<GameView>): GameView =>
  ({ id: "0000004", phase: "waiting", turn: 1, maxTurns: 20, timeout: 172800, stake: 0, players: [{ addr: "g1a", char: "marshal" }, { addr: "", char: "" }], ...over }) as unknown as GameView;

describe("shareText", () => {
  it("invites to join with the terms and the link, not the character", () => {
    expect(shareText(game({}), base, "g1a")).toBe(
      "Draw, partner! Join my Gnoslinger showdown on gno.land (1 of 2 seats taken, 20 turns, 2 days per turn, played for the glory): https://gnoslinger.xyz/#game/0000004",
    );
  });

  it("says this showdown to a spectator sharing it", () => {
    expect(shareText(game({}), base, "g1other")).toContain("Join this Gnoslinger showdown");
  });

  it("names the stake", () => {
    expect(shareText(game({ stake: 5_000_000 }), base)).toContain("5 GNOT stake");
  });

  it("invites to watch as a spectator once the seats are taken, or the replay once over", () => {
    expect(shareText(game({ phase: "planning", turn: 3 }), base)).toBe(
      "Pull up a chair, the lead is flying! Watch this Gnoslinger showdown on gno.land from the spectators' bench: https://gnoslinger.xyz/#game/0000004",
    );
    expect(shareText(game({ phase: "finished" }), base)).toContain("watch the replay");
  });
});
