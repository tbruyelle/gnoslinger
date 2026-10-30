import { describe, expect, it } from "vitest";
import { bugReportUrl, ISSUES_URL } from "./bugReport";

const page = { origin: "https://gnoslinger.xyz", pathname: "/", userAgent: "TestBrowser/1", width: 1458, height: 900 };

describe("bugReportUrl", () => {
  it("names the game and turn and links the turn's replay", () => {
    const url = new URL(bugReportUrl({ gameID: "0000003", turn: 4, shown: "replay · segment 3", seat: "2 (Reb)", address: "g1abc" }, page));
    expect(`${url.origin}${url.pathname}`).toBe(ISSUES_URL);
    expect(url.searchParams.get("title")).toBe("Bug · game 0000003 · turn 4");
    expect(url.searchParams.get("labels")).toBe("bug");
    const body = url.searchParams.get("body") ?? "";
    expect(body).toContain("**What happened?**");
    expect(body).toContain("Game: https://gnoslinger.xyz/#game/0000003/4");
    expect(body).toContain("Shown: replay · segment 3");
    expect(body).toContain("Seat: 2 (Reb)");
    expect(body).toContain("Player: g1abc");
    expect(body).toContain("1458×900 · TestBrowser/1");
  });

  it("from the lobby, has no game line", () => {
    const url = new URL(bugReportUrl({}, page));
    expect(url.searchParams.get("title")).toBe("Bug · lobby");
    expect(url.searchParams.get("body")).not.toContain("Game:");
  });

  it("stays well under GitHub's link limit", () => {
    expect(bugReportUrl({ gameID: "0000003", turn: 20, shown: "x".repeat(200), seat: "3 (Yankee)", address: "g1".padEnd(40, "q") }, page).length).toBeLessThan(4000);
  });
});
