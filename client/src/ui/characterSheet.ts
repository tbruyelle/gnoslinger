import type { GroundGunView, GunView } from "../chain/types";
import { uprightTokenAngle } from "../rules";
import { MAX_MISSED } from "../game/lobby";
import template from "./characterSheet.html?raw";
import { seatColor } from "./seats";

/** What the sheet shows for one character. */
export interface SheetData {
  name: string;
  /** Who plays it: the registered name ("" for none) and the full address, which a click copies. */
  player: string;
  addr: string;
  charKey: string;
  seat: number;
  hex: string;
  facing: number;
  down: boolean;
  delay: number;
  status: string;
  submitted: boolean;
  /** Turns in a row the player let time out (MAX_MISSED puts the character out of the fight). */
  missed: number;
  phase: string;
  isMe: boolean;
  guns: GunView[];
  /** The weapons lying in the character's hex. */
  ground: GroundGunView[];
  /** AIM points, the hex the markers sit on ("" when they follow a character) and that character's name ("" when they sit on a hex). */
  aim: number;
  aimHex: string;
  aimTarget: string;
  /** Who holds AIM points on this character: "The Kid 4", "Axe 2". */
  aimedBy: string[];
  /** Endurance boxes left (20 at the start). */
  endurance: number;
  /** Permanent wounds. */
  serious: number;
  gunArm: number;
  otherArm: number;
  leg: number;
}

const DIRS = ["N", "NE", "SE", "S", "SW", "NW"];
const SHEET_W = 1100;
const SHEET_H = 850;
/** Length of the open/close animation. */
const ANIM_MS = 180;

/**
 * Lets the player pick a gun on the sheet (holstered or in a hand), or one
 * lying in the hex, by dragging it to a hand box (or clicking it, which
 * takes its first destination); onPick gets the pick (the gun id, or the
 * ground id) and the hand code (0 gun hand, 1 other hand, 2 both hands).
 * destinations names the hand codes a pick may go to: a gun with none is
 * not draggable, a box not listed refuses the drop.
 */
export interface GunPick {
  prompt: string;
  destinations: (pick: { gun?: number; ground?: number }) => number[];
  onPick: (pick: { gun?: number; ground?: number }, hand: number) => void;
}

const DROP_HANDS: { box: string; hand: number }[] = [
  { box: "gun_hand", hand: 0 },
  { box: "other_hand", hand: 1 },
  { box: "both_hands", hand: 2 },
];

/** The pick a drag reference designates: "<gun id>" or "g<ground id>". */
function refPick(ref: string): { gun?: number; ground?: number } | null {
  const m = /^(g?)([1-9][0-9]*)$/.exec(ref);
  if (!m) return null;
  return m[1] ? { ground: Number(m[2]) } : { gun: Number(m[2]) };
}

let backdrop: HTMLDivElement | null = null;
let onClose: (() => void) | null = null;

/**
 * Opens the character sheet as an HTML overlay above the game canvas.
 * onClosed runs once the sheet is closed, however it was closed. With pick,
 * the guns can be dragged to the hand boxes pick.destinations allows;
 * dropping one calls onPick and closes the sheet.
 */
export function openCharacterSheet(d: SheetData, onClosed?: () => void, pick?: GunPick): void {
  closeCharacterSheet();
  onClose = onClosed ?? null;
  const accent = seatColor(d.seat);
  const html = template
    .replace(/{{accent}}/g, accent)
    .replace("{{characterName}}", escapeHtml(d.name))
    .replace("{{tokenImage}}", tokenImage(d))
    .replace("{{statusRow}}", statusRow(d, accent))
    .replace("{{otherHand}}", gunBox(d.guns, "other_hand", pick))
    .replace("{{bothHands}}", gunBox(d.guns, "both_hands", pick))
    .replace("{{gunHand}}", gunBox(d.guns, "gun_hand", pick))
    .replace("{{holstered}}", gunBox(d.guns, "holstered", pick))
    .replace("{{ground}}", groundBox(d.ground, pick))
    .replace("{{serious}}", wound(d.serious, "fatigue card per turn"))
    .replace("{{gunArm}}", wound(d.gunArm, "aim time with the gun hand", "−"))
    .replace("{{otherArm}}", wound(d.otherArm, "aim time with the other hand", "−"))
    .replace("{{leg}}", wound(d.leg, "fatigue card per hex moved"));

  backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(10,6,2,.72);cursor:pointer;" +
    `opacity:0;transition:opacity ${ANIM_MS}ms ease-out`;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeCharacterSheet();
  });
  // Keep every pointer event on the overlay away from the game canvas.
  for (const type of ["pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "touchstart", "touchend", "wheel"]) {
    backdrop.addEventListener(type, (e) => e.stopPropagation(), { passive: type === "wheel" });
  }

  const frame = document.createElement("div");
  frame.style.cssText =
    "position:relative;cursor:default;transform-origin:center center;" +
    `transition:transform ${ANIM_MS}ms cubic-bezier(.2,.8,.3,1.1),opacity ${ANIM_MS}ms ease-out;opacity:0`;
  frame.innerHTML = (pick ? promptBanner(pick.prompt) : "") + html;
  markEndurance(frame, d.endurance);
  wireCopy(frame);
  if (pick) wirePick(frame, pick);
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Close");
  close.style.cssText =
    "position:absolute;top:22px;right:26px;width:40px;height:40px;border-radius:50%;border:3px solid #2A1C14;background:#F3E7CE;color:#2A1C14;font:700 26px/1 'Zilla Slab',Rockwell,serif;cursor:pointer";
  close.addEventListener("click", closeCharacterSheet);
  frame.appendChild(close);
  backdrop.appendChild(frame);
  document.body.appendChild(backdrop);

  let scale = 1;
  const fit = () => {
    const h = Math.max(SHEET_H, frame.querySelector<HTMLElement>(".gs-sheet")?.offsetHeight ?? SHEET_H);
    scale = Math.min(1, (window.innerWidth - 32) / SHEET_W, (window.innerHeight - 32) / h);
    frame.style.transform = `scale(${scale})`;
  };
  // Start slightly smaller and lower, then settle: the transition does the rest.
  fit();
  frame.style.transform = `scale(${scale * 0.94}) translateY(16px)`;
  requestAnimationFrame(() => {
    if (!backdrop) return;
    backdrop.style.opacity = "1";
    frame.style.opacity = "1";
    frame.style.transform = `scale(${scale})`;
  });
  exitAnimation = () => {
    frame.style.transform = `scale(${scale * 0.96}) translateY(8px)`;
    frame.style.opacity = "0";
  };
  window.addEventListener("resize", fit);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeCharacterSheet();
  };
  window.addEventListener("keydown", onKey);
  cleanup = () => {
    window.removeEventListener("resize", fit);
    window.removeEventListener("keydown", onKey);
  };
}

let cleanup: (() => void) | null = null;
let exitAnimation: (() => void) | null = null;

export function closeCharacterSheet(): void {
  const el = backdrop;
  if (!el) return;
  cleanup?.();
  cleanup = null;
  backdrop = null;
  // Fade out, then drop the element.
  el.style.pointerEvents = "none";
  el.style.opacity = "0";
  exitAnimation?.();
  exitAnimation = null;
  setTimeout(() => el.remove(), ANIM_MS + 20);
  const cb = onClose;
  onClose = null;
  cb?.();
}

export function isCharacterSheetOpen(): boolean {
  return backdrop !== null;
}

/** The token turned to stand upright (uprightTokenAngle). */
function tokenImage(d: SheetData): string {
  const deg = uprightTokenAngle(d.charKey);
  return `<img src="/char_${escapeHtml(d.charKey)}.png" alt="" style="width: 84px; height: 84px; border-radius: 50%; border: 3px solid #2A1C14; background: #FBF4E4; transform: rotate(${deg}deg); flex: none">`;
}

function statusRow(d: SheetData, accent: string): string {
  const chip = (label: string, value: string, strong = false) =>
    `<div style="display: flex; align-items: baseline; gap: 8px; border: 2px solid #2A1C14; border-radius: 8px; padding: 4px 12px; background: ${strong ? "#8E2F1A" : "#FBF4E4"}; color: ${strong ? "#F3E7CE" : "#2A1C14"}"><span style="font-size: 14px; letter-spacing: 2px; font-weight: 700">${label}</span><span style="font-size: 20px; font-weight: 700">${value}</span></div>`;
  const plan = d.phase === "planning" ? (d.submitted ? "SENT" : "PENDING") : d.phase.toUpperCase();
  const chips = [
    chip("HEX", escapeHtml(d.hex)),
    chip("FACING", DIRS[d.facing] ?? String(d.facing)),
    chip("DELAY", String(d.delay), d.delay > 0),
    d.down ? chip("BODY", "DOWN", true) : chip("BODY", "UPRIGHT"),
    chip("STATUS", escapeHtml(d.status.replace(/_/g, " ").toUpperCase()), d.status !== "alive"),
    chip("AIM", d.aim > 0 ? `${d.aim} on ${escapeHtml(d.aimHex || d.aimTarget || "target")}` : "0", d.aim > 0),
    chip("END", String(d.endurance), d.endurance < 10),
    chip("PLAN", plan),
  ];
  if (d.missed > 0) chips.push(chip("MISSED", `${d.missed} of ${MAX_MISSED}`, true));
  if (d.aimedBy.length > 0) chips.push(chip("AIMED BY", escapeHtml(d.aimedBy.join(", ")), true));
  if (d.isMe) chips.push(`<div style="margin-left: auto; font-family: Rye, Georgia, serif; font-size: 22px; color: ${accent}; letter-spacing: 1px">YOUR CHARACTER</div>`);
  const row = `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px">${chips.join("")}</div>`;
  // Who plays the character goes on a line of its own, in ink, above the status chips.
  return d.addr ? `<div style="display: flex; flex-direction: column; align-items: flex-start; gap: 10px">${playerRow(d)}${row}</div>` : row;
}

/** Who plays the character, in ink: the name if registered, and the full address as a button that copies it (wireCopy). */
function playerRow(d: SheetData): string {
  const name = d.player ? `<span style="font-family: Rye, Georgia, serif; font-size: 20px; letter-spacing: 1px">${escapeHtml(d.player)}</span>` : "";
  return (
    `<div style="display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; max-width: 100%; box-sizing: border-box; background: #2A1C14; color: #F3E7CE; border-radius: 8px; padding: 6px 14px">` +
    `<span style="font-size: 14px; letter-spacing: 2px; font-weight: 700; color: #F2B544">PLAYED BY</span>${name}` +
    `<button type="button" data-copy="${escapeHtml(d.addr)}" title="Copy the address" aria-label="Copy the address ${escapeHtml(d.addr)}" style="display: inline-flex; align-items: center; gap: 8px; padding: 0; background: none; border: 0; font: inherit; font-size: 17px; font-weight: 700; color: #F3E7CE; cursor: copy; word-break: break-all; text-align: left">` +
    `<span data-copy-text>${escapeHtml(d.addr)}</span>${COPY_SVG}</button></div>`
  );
}

/** Two overlapping sheets, the copy icon beside the address. */
const COPY_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F2B544" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15 H4 a1 1 0 0 1 -1 -1 V4 a1 1 0 0 1 1 -1 H14 a1 1 0 0 1 1 1 V5"></path></svg>';

/** A click on the address copies it; the button says so for a moment. */
function wireCopy(frame: HTMLElement) {
  const btn = frame.querySelector<HTMLButtonElement>("[data-copy]");
  const text = btn?.querySelector<HTMLElement>("[data-copy-text]");
  if (!btn || !text) return;
  const addr = btn.dataset.copy ?? "";
  btn.addEventListener("click", async () => {
    let said = "copied";
    try {
      await navigator.clipboard.writeText(addr);
    } catch {
      said = "could not copy";
    }
    text.textContent = said;
    btn.blur(); // no focus ring left after a click
    setTimeout(() => (text.textContent = addr), 1500);
  });
}

/** A permanent wound value, with its meaning; empty when none. */
function wound(n: number, meaning: string, sign = ""): string {
  if (n <= 0) return "";
  return `<span style="font-size: 26px; color: #8E2F1A">${sign}${n}</span><span style="margin-left: 12px; font-weight: 400; font-size: 15px; letter-spacing: 0">${escapeHtml(meaning)}${n > 1 && sign === "" ? "s" : ""}</span>`;
}

/** Crosses off the endurance boxes above the ones left. */
function markEndurance(frame: HTMLElement, endurance: number) {
  frame.querySelectorAll<HTMLElement>("[data-end]").forEach((box) => {
    const n = Number(box.dataset.end);
    if (n > endurance) {
      box.style.background = "repeating-linear-gradient(45deg, #2A1C14 0 3px, transparent 3px 9px)";
      box.style.color = "#8E2F1A";
    }
  });
}

/** The instruction shown above the sheet while a gun is being picked. */
function promptBanner(text: string): string {
  return (
    `<div style="margin: 0 0 12px; padding: 12px 20px; border-radius: 14px; background: #8E2F1A; color: #F3E7CE; ` +
    `font-family: 'Zilla Slab', Rockwell, serif; font-size: 22px; font-weight: 700; text-align: center">${escapeHtml(text)}</div>`
  );
}

/** Drag and drop (and click as a fallback) from a gun to a hand box it may go to. */
function wirePick(frame: HTMLElement, pick: GunPick) {
  const choose = (ref: string, hand: number) => {
    const p = refPick(ref);
    if (!p || !pick.destinations(p).includes(hand)) return;
    // Record the pick before closing: the close handler treats a sheet
    // closed without a pick as a cancelled choice.
    pick.onPick(p, hand);
    closeCharacterSheet();
  };
  // dragover cannot read the drag data, so the reference dragged is kept here.
  let dragging = "";
  const accepts = (hand: number) => {
    const p = refPick(dragging);
    return !!p && pick.destinations(p).includes(hand);
  };
  const boxes: { target: HTMLElement; hand: number }[] = [];
  const paint = (target: HTMLElement, mode: "off" | "open" | "over") => {
    target.style.background = mode === "over" ? "#E9D6A8" : "";
    target.style.outline = mode === "off" ? "" : "3px dashed #8E2F1A";
  };
  const highlight = (on: boolean) => {
    for (const { target, hand } of boxes) paint(target, on && accepts(hand) ? "open" : "off");
  };
  for (const { box, hand } of DROP_HANDS) {
    const target = frame.querySelector<HTMLElement>(`[data-box="${box}"]`);
    if (!target) continue;
    boxes.push({ target, hand });
    target.addEventListener("dragover", (e) => {
      if (!accepts(hand)) return;
      e.preventDefault();
      paint(target, "over");
    });
    target.addEventListener("dragleave", () => {
      if (accepts(hand)) paint(target, "open");
    });
    target.addEventListener("drop", (e) => {
      e.preventDefault();
      choose(e.dataTransfer?.getData("text/plain") ?? dragging, hand);
    });
  }
  frame.querySelectorAll<HTMLElement>("[data-drag-gun]").forEach((el) => {
    const ref = el.dataset.dragGun ?? "";
    el.addEventListener("dragstart", (e: DragEvent) => {
      e.dataTransfer?.setData("text/plain", ref);
      dragging = ref;
      el.style.opacity = "0.5";
      highlight(true);
    });
    el.addEventListener("dragend", () => {
      el.style.opacity = "";
      dragging = "";
      highlight(false);
    });
    el.addEventListener("click", () => {
      const p = refPick(ref);
      const first = p ? pick.destinations(p)[0] : undefined;
      if (first !== undefined) choose(ref, first);
    });
  });
}

/** The guns kept at one location, as cards inside the sheet's box. */
/** One gun as a small card: icon, name, cocked state and shells; draggable (with the given drag reference) when being picked. */
function gunCard(g: GunView, draggable: string | null): string {
  return (
    `<div${draggable ? ` draggable="true" data-drag-gun="${draggable}" title="Drag me to a hand box"` : ""} ` +
    `style="display: flex; align-items: center; gap: 12px; border: 2px solid #2A1C14; border-radius: 10px; padding: 8px 14px; background: #F3E7CE; min-width: 220px${
      draggable ? "; cursor: grab; box-shadow: 0 0 0 3px #8E2F1A" : ""
    }">` +
    `<img src="/guns/${escapeHtml(g.type)}.gif" alt="" style="width: 56px; height: 56px; image-rendering: pixelated; flex: none">` +
    `<div>` +
    `<div style="font-family: Rye, Georgia, serif; font-size: 22px; letter-spacing: 1px">${escapeHtml(g.name)}</div>` +
    `<div style="font-size: 16px; font-weight: 700">${g.cocked ? "cocked" : "uncocked"} · ${g.shells}/${g.capacity} shells${
      g.exploded ? ` · <span style="color: #b0121a">EXPLODED</span>` : g.jammed ? ` · <span style="color: #b0121a">JAMMED</span>` : ""
    }</div>` +
    `</div></div>`
  );
}

function gunBox(guns: GunView[], location: GunView["location"], pick?: GunPick): string {
  const cards = guns
    .filter((g) => g.location === location)
    .map((g) => gunCard(g, pick && pick.destinations({ gun: g.id }).length > 0 ? String(g.id) : null));
  const hand = DROP_HANDS.find((d) => d.box === location)?.hand;
  const open = pick && hand !== undefined && guns.some((g) => pick.destinations({ gun: g.id }).includes(hand));
  const hint = open && cards.length === 0 ? `<div style="font-size: 16px; font-style: italic; opacity: .7">drop the gun here</div>` : "";
  return `<div data-box="${location}" style="flex: 1; padding: 12px; display: flex; flex-wrap: wrap; gap: 10px; align-content: flex-start; min-height: 60px">${cards.join("")}${hint}</div>`;
}

/** The weapons lying in the character's hex; draggable to the gun hand when being picked. */
function groundBox(ground: GroundGunView[], pick?: GunPick): string {
  const cards = ground.flatMap((gg) => gg.guns.map((g) => gunCard(g, pick && pick.destinations({ ground: gg.id }).length > 0 ? `g${gg.id}` : null)));
  const hint = cards.length === 0 ? `<div style="font-size: 16px; font-style: italic; opacity: .7">nothing on the ground here</div>` : "";
  return `<div data-box="ground" style="flex: 1; padding: 12px; display: flex; flex-wrap: wrap; gap: 10px; align-content: flex-start; min-height: 60px">${cards.join("")}${hint}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
