import { describe, expect, it } from "vitest";
import { TUTORIAL_ADDR, TUTORIAL_TURNS, TutorialRealm, describePlan, planMatches, tutorialCoach } from "./tutorial";

describe("planMatches", () => {
  it("takes the two Cock/Aim/Shoot cards for one another, not a different choice or order", () => {
    expect(planMatches("6f:cock,5f:aim:@1,7f:shoot:@1", "6f:cock,5f:aim:@1,7f:shoot:@1")).toBe(true);
    expect(planMatches("5f:cock,6f:aim:@1,7f:shoot:@1", "6f:cock,5f:aim:@1,7f:shoot:@1")).toBe(true);
    expect(planMatches("6f:cock,7f:shoot:@1,5f:aim:@1", "6f:cock,5f:aim:@1,7f:shoot:@1")).toBe(false);
    expect(planMatches("1f:ahead,2f:ahead,3b:ahead_right", "1f:ahead,2f:ahead,3b:ahead_left")).toBe(false);
    expect(planMatches("", "9f:1:0")).toBe(false);
    expect(planMatches("not a plan", "9f:1:0")).toBe(false);
  });
});

describe("describePlan", () => {
  it("names each action as the coach asks for it", () => {
    expect(describePlan("1f:ahead,2f:ahead,3b:ahead_left")).toBe("Advance ahead, Run ahead, Turn ahead left");
    expect(describePlan("9f:1:0")).toBe("Draw & Cock the Colt to your gun hand");
    expect(describePlan("6f:cock,5f:aim:@1,7f:shoot:@1")).toBe("Cock/Aim/Shoot: Cock, Cock/Aim/Shoot: Aim at The Kid, Shoot at The Kid");
  });
});

describe("TutorialRealm", () => {
  it("plays the recorded showdown: the Kid committed each turn, the lesson's plan moves on, another is refused", async () => {
    const realm = new TutorialRealm();
    for (let turn = 1; turn <= TUTORIAL_TURNS; turn++) {
      const view = await realm.getGame("");
      expect(view.phase).toBe("planning");
      expect(view.turn).toBe(turn);
      expect(view.players[0].addr).toBe(TUTORIAL_ADDR);
      expect(view.players[1].committed).toBe(true);
      // No deadline has passed, though the showdown was recorded in 2009.
      expect(view.commitUntil).toBeGreaterThan(Date.now() / 1000);
      expect((await realm.getHistory("")).turns).toHaveLength(turn - 1);
      await expect(realm.reveal("", turn, 0, "aa", "")).rejects.toThrow(/This step asks for/);
      await realm.reveal("", turn, 0, "aa", recorded(turn));
      expect((await realm.getGame("")).lastTurn?.turn).toBe(turn);
    }
    const end = await realm.getGame("");
    expect(end.phase).toBe("finished");
    expect(end.winner).toBe(0);
    expect(end.players[1].status).toBe("killed");
  });
});

describe("tutorialCoach", () => {
  it("has a lesson for every turn, its playback, and the end", () => {
    for (let turn = 1; turn <= TUTORIAL_TURNS; turn++) {
      expect(tutorialCoach({ turn, phase: "planning", playbackTurn: null, atEnd: false })?.todo).toMatch(/^Play .+, then Send plan\.$/);
    }
    for (let turn = 1; turn < TUTORIAL_TURNS; turn++) {
      expect(tutorialCoach({ turn: turn + 1, phase: "planning", playbackTurn: turn, atEnd: false })?.title).toBe(`Turn ${turn}`);
    }
    // The last turn's replay keeps its lesson until its end.
    expect(tutorialCoach({ turn: TUTORIAL_TURNS, phase: "finished", playbackTurn: TUTORIAL_TURNS, atEnd: false })?.title).toBe(`Turn ${TUTORIAL_TURNS}`);
    expect(tutorialCoach({ turn: TUTORIAL_TURNS, phase: "finished", playbackTurn: TUTORIAL_TURNS, atEnd: true })?.title).toBe("Winning");
  });
});

/** The marshal's plan the realm played on that turn. */
function recorded(turn: number): string {
  return ["1f:ahead,2f:ahead,3b:ahead_left", "9f:1:0", "5f:aim:@1,7f:shoot:@1", "6f:cock,5f:aim:@1,7f:shoot:@1"][turn - 1];
}
