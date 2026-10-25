import { describe, expect, it } from "vitest";
import { parseRoute, routeHash } from "./route";

describe("game routes", () => {
  it("reads a game, or a turn of its replay, from the hash", () => {
    expect(parseRoute("#game/0000012")).toEqual({ gameID: "0000012", turn: null });
    expect(parseRoute("#game/12/3")).toEqual({ gameID: "0000012", turn: 3 });
    // Turns start at 1.
    expect(parseRoute("#game/12/0")).toEqual({ gameID: "0000012", turn: null });
    for (const h of ["", "#how-to-play", "#game/", "#game/0", "#game/x", "#game/12/x", "#game/12/3/4"]) expect(parseRoute(h)).toBeNull();
  });

  it("writes the hash back", () => {
    expect(routeHash("0000012")).toBe("#game/0000012");
    expect(routeHash("0000012", 3)).toBe("#game/0000012/3");
    expect(parseRoute(routeHash("0000012", 3))).toEqual({ gameID: "0000012", turn: 3 });
  });
});
