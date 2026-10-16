import { describe, expect, it } from "vitest";
import type { GunView, TurnEvent } from "../chain/types";
import type { CharView } from "./replay";
import { shotDelays, soundsForDelay, soundsForEvents, soundsForPreview } from "./sounds";

const ev = (partial: Partial<TurnEvent>): TurnEvent => ({
  seg: 1, p: 0, kind: "move", action: "", from: "", to: "", facing: 0, down: false, n: 0, delay: 0, reason: "", card: 0, result: "", endurance: 0, target: 1, hit: "", range: 0, gun: "", gunId: 0, step: 0, ...partial,
});

describe("soundsForEvents", () => {
  const groups = (events: TurnEvent[]) => soundsForEvents(events).map((c) => c.group);

  it("maps events to sound groups", () => {
    expect(groups([ev({ kind: "move" }), ev({ kind: "turn" })])).toEqual(["step", "turn"]);
    expect(groups([ev({ kind: "flip", down: true }), ev({ kind: "flip", down: false })])).toEqual(["fall"]);
    expect(groups([ev({ kind: "draw", from: "holstered" })])).toEqual(["unholster", "cock"]);
    expect(groups([ev({ kind: "draw", result: "jammed" })])).toEqual(["unholster"]);
    expect(groups([ev({ kind: "draw", from: "ground", n: 2 })])).toEqual(["groundPick", "cock"]);
    expect(groups([ev({ kind: "cock" }), ev({ kind: "aim" }), ev({ kind: "load" })])).toEqual(["cock", "aim", "reload"]);
    expect(groups([ev({ kind: "shot", hit: "vital" }), ev({ kind: "wild_shot" })])).toEqual(["gunshot", "gunshot"]);
    expect(groups([ev({ kind: "shot", hit: "-" })])).toEqual(["gunshot", "ricochet"]);
    expect(groups([ev({ kind: "shot", hit: "-", reason: "misfire" }), ev({ kind: "malfunction", result: "no_penalty" })])).toEqual(["gunshot", "ricochet"]);
    expect(groups([ev({ kind: "shot", hit: "-", reason: "misfire" }), ev({ kind: "malfunction", result: "jams" })])).toEqual([]);
    expect(groups([ev({ kind: "wound", result: "stun" }), ev({ kind: "pass_out" })])).toEqual(["wounded", "fall"]);
    // A shot with an empty gun only clicks; other cancels are silent.
    expect(groups([ev({ kind: "cancel", action: "shoot", reason: "empty" }), ev({ kind: "cancel", reason: "not_cocked" })])).toEqual(["emptyGun"]);
  });

  it("spaces out empty guns clicking together, and after a shot fired with them", () => {
    const empty = (p: number) => ev({ p, kind: "cancel", action: "shoot", reason: "empty" });
    expect(soundsForEvents([empty(0), empty(1)]).map((c) => c.delayMs)).toEqual([0, 220]);
    expect(soundsForEvents([ev({ kind: "shot", hit: "vital" }), empty(1)]).map((c) => [c.group, c.delayMs])).toEqual([["gunshot", 0], ["emptyGun", 220]]);
  });

  it("groans once per character when SERIOUS fatigue costs endurance", () => {
    const serious = (p: number, endurance: number) => ev({ seg: 0, p, kind: "delay", reason: "serious", endurance });
    expect(groups([serious(0, 2), serious(0, 1), serious(1, 0)])).toEqual(["wounded"]);
    expect(groups([serious(0, 1), serious(1, 3)])).toEqual(["wounded", "wounded"]);
    expect(groups([ev({ kind: "delay", reason: "sprint", endurance: 1 })])).toEqual([]);
  });

  it("climbs over a fence once per character, after the step", () => {
    const fence = (p: number) => ev({ p, kind: "delay", reason: "fence", card: 37, n: 1 });
    const cues = soundsForEvents([ev({ kind: "move" }), fence(0), fence(0), ev({ p: 1, kind: "move" }), fence(1), fence(1)]);
    expect(cues.map((c) => c.group)).toEqual(["step", "obstacle", "step", "obstacle"]);
    expect(cues[1].delayMs).toBeGreaterThan(0);
    expect(groups([ev({ kind: "delay", reason: "occupied" })])).toEqual([]);
    expect(groups([ev({ kind: "delay", reason: "obstacle" }), ev({ kind: "delay", reason: "obstacle" })])).toEqual(["obstacle"]);
  });

  it("times each gun of a step for the sounds and the bullets alike", () => {
    const empty = (p: number) => ev({ p, kind: "cancel", action: "shoot", reason: "empty" });
    const events = [ev({ kind: "shot", hit: "VITAL" }), ev({ kind: "move" }), empty(1), ev({ kind: "wild_shot", p: 2 }), ev({ kind: "shot", p: 3, hit: "-", reason: "misfire" }), ev({ kind: "malfunction", p: 3, result: "jams" })];
    expect(shotDelays(events)).toEqual([0, undefined, 220, 440, undefined, undefined]);
    expect(soundsForEvents(events).map((c) => [c.group, c.delayMs])).toEqual([["gunshot", 0], ["step", 0], ["emptyGun", 220], ["gunshot", 440]]);
  });

  it("spaces out shots fired together, each ricochet after its own shot", () => {
    const cues = soundsForEvents([ev({ kind: "shot", hit: "VITAL" }), ev({ kind: "shot", p: 1, hit: "-" })]);
    const shots = cues.filter((c) => c.group === "gunshot");
    const ricochet = cues.find((c) => c.group === "ricochet")!;
    expect(shots[0].delayMs).toBe(0);
    expect(shots[1].delayMs).toBeGreaterThan(0);
    expect(ricochet.delayMs).toBeGreaterThan(shots[1].delayMs);
  });

  it("plays one wound sound per segment, the death cry if any wound kills", () => {
    // A GUN hit: STUN, GUN HAND, SERIOUS and GUN ARM.
    const gunHit = ["stun", "gun_hand", "serious", "gun_arm"].map((result) => ev({ seg: 5, p: 1, kind: "wound", result }));
    expect(groups(gunHit)).toEqual(["wounded"]);
    // Both hit on the same segment, one killed.
    expect(groups([ev({ seg: 3, kind: "wound", result: "stun" }), ev({ seg: 3, p: 1, kind: "wound", result: "kill" })])).toEqual(["dead"]);
    // Two segments shown together: one each.
    expect(groups([ev({ seg: 2, kind: "wound", result: "leg" }), ev({ seg: 4, kind: "wound", result: "arm" })])).toEqual(["wounded", "wounded"]);
  });

  it("plays wounds after the gunshot", () => {
    const [shot, wound] = soundsForEvents([ev({ kind: "shot", hit: "vital" }), ev({ kind: "wound", result: "kill" })]);
    expect(shot.delayMs).toBeLessThan(wound.delayMs);
  });
});

const colt = (partial: Partial<GunView> = {}): GunView =>
  ({ id: 1, type: "colt45", name: "Colt 45", location: "holstered", cocked: false, shells: 6, capacity: 6, jammed: false, exploded: false, ...partial }) as GunView;
const char = (partial: Partial<CharView> = {}): CharView =>
  ({ hex: "A-F3", facing: 3, down: false, delay: 0, status: "alive", aim: 0, aimAt: -1, aimHex: "", guns: [colt()], ...partial }) as CharView;

describe("soundsForPreview", () => {
  const groups = (before: CharView, after: CharView) => soundsForPreview(before, after).map((c) => c.group);

  it("plays what the plan decides", () => {
    expect(groups(char(), char({ hex: "A-F4" }))).toEqual(["step"]);
    expect(groups(char(), char({ facing: 2 }))).toEqual(["turn"]);
    expect(groups(char(), char({ down: true }))).toEqual(["fall"]);
    expect(groups(char({ aim: 2 }), char({ aim: 4 }))).toEqual(["aim"]);
    expect(groups(char({ down: true }), char())).toEqual([]);
    expect(groups(char(), char({ guns: [colt({ location: "gun_hand", cocked: true })] }))).toEqual(["unholster", "cock"]);
    expect(groups(char(), char({ guns: [colt({ location: "gun_hand", jammed: true })] }))).toEqual(["unholster"]);
    // A gun that was not on the sheet comes from the ground.
    expect(groups(char({ guns: [] }), char({ guns: [colt({ id: 2, location: "gun_hand", cocked: true })] }))).toEqual(["groundPick", "cock"]);
    expect(groups(char({ guns: [colt({ location: "gun_hand" })] }), char({ guns: [colt({ location: "gun_hand", cocked: true })] }))).toEqual(["cock"]);
    expect(groups(char({ guns: [colt({ location: "both_hands", shells: 5 })] }), char({ guns: [colt({ location: "both_hands" })] }))).toEqual(["reload"]);
  });

  it("climbs over an obstacle the move crosses", () => {
    const fenced = (from: string, to: string) => from === "A-E3" && to === "A-E2";
    expect(soundsForPreview(char({ hex: "A-E3" }), char({ hex: "A-E2" }), fenced).map((c) => c.group)).toEqual(["step", "obstacle"]);
    expect(soundsForPreview(char({ hex: "A-F3" }), char({ hex: "A-F2" }), fenced).map((c) => c.group)).toEqual(["step"]);
  });

  it("leaves shots silent", () => {
    expect(groups(char({ guns: [colt({ location: "gun_hand", cocked: true })] }), char({ guns: [colt({ location: "gun_hand", shells: 5 })] }))).toEqual([]);
  });
});

describe("soundsForDelay", () => {
  const groups = (before: number[], after: CharView[]) => soundsForDelay(before, after).map((c) => c.group);

  it("plays delay1 up, reversed down, once each", () => {
    expect(groups([0, 0], [char({ delay: 1 }), char({ delay: 2 })])).toEqual(["delay"]);
    expect(groups([4, 1], [char({ delay: 2 }), char({ delay: 1 })])).toEqual(["undelay"]);
    expect(groups([1, 4], [char({ delay: 2 }), char({ delay: 2 })])).toEqual(["delay", "undelay"]);
    expect(groups([1, 1], [char({ delay: 1 }), char({ delay: 1 })])).toEqual([]);
  });

  it("keeps a killed character silent", () => {
    expect(groups([3], [char({ delay: 0, status: "killed" })])).toEqual([]);
  });
});
