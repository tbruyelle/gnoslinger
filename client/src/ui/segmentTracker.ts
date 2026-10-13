import { SEGMENTS, type SegFill } from "../game/segments";

/**
 * The segment tracker shown while planning: five squares, one per segment of
 * the turn, empty, green with a check for a planned action or red with an
 * hourglass for delay. An HTML overlay over the canvas (like the character
 * sheet), from the design reference "Segment tracker" (colours, fonts and
 * drawings kept, sizes cut down), on a parchment card since the design's dark
 * ink is meant for a light background.
 */

const SQUARE = 54;
const GAP = 9;
const PAD = 14;
const BORDER = 3;
const INK = "#2A1C14";
const PAPER = "#EDE4CF";
const LIGHT = "#F3E7CE";
const FILL: Record<SegFill, string> = { empty: "transparent", action: "#4F7A3A", delay: "#B5482A" };
/** How fast a square changes colour. */
const ANIM_MS = 250;

const CHECK_SVG =
  `<svg width="26" height="26" viewBox="0 0 56 56" aria-hidden="true"><path d="M10,30 L23,43 L47,13" fill="none" stroke="${LIGHT}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const HOURGLASS_SVG =
  `<svg width="22" height="27" viewBox="0 0 52 62" aria-hidden="true">` +
  `<rect x="6" y="2" width="40" height="7" rx="2" fill="${LIGHT}"/><rect x="6" y="53" width="40" height="7" rx="2" fill="${LIGHT}"/>` +
  `<path d="M11,9 H41 Q41,24 26,31 Q11,24 11,9 Z M11,53 H41 Q41,38 26,31 Q11,38 11,53 Z" fill="none" stroke="${LIGHT}" stroke-width="4" stroke-linejoin="round"/>` +
  `<path d="M17,48 Q26,40 35,48 Z" fill="${LIGHT}"/><path d="M18,15 H34 Q31,21 26,24 Q21,21 18,15 Z" fill="${LIGHT}"/></svg>`;

function legendItem(fill: string, label: string): string {
  return (
    `<div style="display:flex;align-items:center;gap:5px">` +
    `<span style="width:13px;height:13px;box-sizing:border-box;border:2px solid ${INK};border-radius:3px;background:${fill}"></span>${label}</div>`
  );
}

export class SegmentTracker {
  /** The tracker's width at scale 1, to fit it beside the board. */
  static readonly WIDTH = SEGMENTS * SQUARE + (SEGMENTS - 1) * GAP + 2 * PAD + 2 * BORDER;

  private root: HTMLDivElement;
  private squares: HTMLDivElement[] = [];
  private icons: HTMLDivElement[] = [];
  private nums: HTMLSpanElement[] = [];

  constructor() {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      zIndex: "500",
      display: "none",
      boxSizing: "border-box",
      padding: `10px ${PAD}px 9px`,
      background: PAPER,
      border: `${BORDER}px solid ${INK}`,
      borderRadius: "12px",
      boxShadow: "0 4px 14px rgba(0,0,0,0.55)",
      fontFamily: "'Zilla Slab', Rockwell, Georgia, serif",
      color: INK,
      transformOrigin: "top left",
      pointerEvents: "none",
      userSelect: "none",
    } satisfies Partial<CSSStyleDeclaration>);

    const row = document.createElement("div");
    Object.assign(row.style, { display: "grid", gridTemplateColumns: `repeat(${SEGMENTS}, ${SQUARE}px)`, gap: `${GAP}px` });
    for (let i = 0; i < SEGMENTS; i++) {
      const sq = document.createElement("div");
      Object.assign(sq.style, {
        width: `${SQUARE}px`,
        height: `${SQUARE}px`,
        boxSizing: "border-box",
        border: `${BORDER}px solid ${INK}`,
        borderRadius: "6px",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: `background-color ${ANIM_MS}ms, box-shadow ${ANIM_MS}ms`,
      });
      const num = document.createElement("span");
      num.textContent = String(i + 1);
      Object.assign(num.style, { position: "absolute", top: "1px", left: "5px", fontFamily: "Rye, Georgia, serif", fontSize: "14px" });
      const icon = document.createElement("div");
      Object.assign(icon.style, { display: "flex", marginTop: "6px" });
      sq.append(num, icon);
      row.appendChild(sq);
      this.squares.push(sq);
      this.nums.push(num);
      this.icons.push(icon);
    }
    this.root.appendChild(row);

    const legend = document.createElement("div");
    Object.assign(legend.style, { display: "flex", justifyContent: "center", gap: "12px", marginTop: "7px", fontSize: "13px", fontWeight: "700" });
    legend.innerHTML = legendItem(FILL.action, "Action") + legendItem(FILL.delay, "Delay");
    this.root.appendChild(legend);

    document.body.appendChild(this.root);
  }

  /** Puts the tracker's top left corner at (x, y) in page pixels, scaled. */
  place(x: number, y: number, scale = 1) {
    Object.assign(this.root.style, { left: `${x}px`, top: `${y}px`, transform: scale === 1 ? "" : `scale(${scale})` });
  }

  show(fills: SegFill[]) {
    fills.forEach((fill, i) => {
      const sq = this.squares[i];
      sq.style.background = FILL[fill];
      sq.style.boxShadow = fill === "empty" ? "none" : "inset 0 0 0 2px rgba(243,231,206,0.35)";
      this.nums[i].style.color = fill === "empty" ? INK : LIGHT;
      this.icons[i].innerHTML = fill === "action" ? CHECK_SVG : fill === "delay" ? HOURGLASS_SVG : "";
    });
    this.root.style.display = "block";
  }

  hide() {
    this.root.style.display = "none";
  }

  destroy() {
    this.root.remove();
  }
}
