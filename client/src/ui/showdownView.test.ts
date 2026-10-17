import { describe, expect, it } from "vitest";
import { colorNames } from "./showdownView";

describe("colorNames", () => {
  const color = colorNames([
    { name: "Marshal", color: "#33307F" },
    { name: "The Kid", color: "#B5482A" },
    { name: "El Jefe", color: "#4F7A3A" },
    { name: "Axe", color: "#1F7A8C" },
  ]);
  const span = (name: string, c: string) => `<span class="gv-who-c" style="color:${c}">${name}</span>`;

  it("colours every name of a line, whole words only", () => {
    expect(color("The Kid draws card 80 (occupied): gains 2 delay, now 2")).toBe(`${span("The Kid", "#B5482A")} draws card 80 (occupied): gains 2 delay, now 2`);
    expect(color("Marshal aims at A-F9 (El Jefe): 4 AIM points")).toBe(`${span("Marshal", "#33307F")} aims at A-F9 (${span("El Jefe", "#4F7A3A")}): 4 AIM points`);
    expect(color("Axe's Colt 45 goes off (wild shot)")).toBe(`${span("Axe", "#1F7A8C")}&#39;s Colt 45 goes off (wild shot)`);
    expect(color("Axes and an axe")).toBe("Axes and an axe");
  });

  it("escapes the rest of the line", () => {
    expect(color("Marshal <b>")).toBe(`${span("Marshal", "#33307F")} &lt;b&gt;`);
  });
});
