import { uprightTokenAngle } from "../rules";
import type { SegFill } from "../game/segments";

/**
 * The showdown screen around the board, an HTML overlay over the canvas (like
 * the lobby and the character sheet), from the "Screen · Game" mockups of the
 * Design canvas (AGENTS.md, Design): the header; while planning (and waiting,
 * and once over) my character and my plan (with the segment tracker) on the left,
 * the other characters on the right, the hand along the bottom; in a replay
 * the characters on the left, the resolution log on the right, the timeline
 * and the controls along the bottom. The board stays on the canvas, in the
 * centre cell left free (showdownLayout); the overlay lets the pointer through
 * everywhere but its panels. The scene owns the state and renders it again on
 * every change.
 */

/** Where the board goes: the centre cell of the overlay, in page pixels. */
export interface BoardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShowdownLayout {
  header: number;
  left: number;
  right: number;
  bottom: number;
  board: BoardRect;
}

/**
 * The overlay's grid for a window size; the scene draws the board in its
 * centre cell. The hand and the replay controls share the bottom strip's
 * height, so the board stays put between planning and replays.
 */
export function showdownLayout(w: number, h: number): ShowdownLayout {
  const header = 56;
  const bottom = 268;
  const narrow = w < 1180;
  const left = narrow ? 240 : 290;
  const right = narrow ? 270 : 320;
  return { header, left, right, bottom, board: { x: left, y: header, w: Math.max(120, w - left - right), h: Math.max(120, h - header - bottom) } };
}

export interface GunLine {
  /** Gun type, for its icon (guns/<type>.gif). */
  type: string;
  name: string;
  /** Where it is and its state: "gun hand · cocked". */
  state: string;
  shells: number;
  capacity: number;
  broken: boolean;
}

/** A character as the side panels show it. */
export interface CharPanel {
  seat: number;
  name: string;
  charKey: string;
  you: boolean;
  /** "A-F4 · facing S · down". */
  where: string;
  /** "" while in the fight, else "DEAD" / "PASSED OUT". */
  out: string;
  endurance: number;
  maxEndurance: number;
  delay: number;
  aim: number;
  wounds: number;
  guns: GunLine[];
  /** A badge on the right of the name ("PLAN SENT", "YOUR TURN"…), "" for none. */
  badge: string;
}

export interface HandSide {
  card: number;
  side: "front" | "back";
  name: string;
  cost: number;
  tag: string;
  /** picked (last: can be taken back), choice (picked, waiting for its choice), open, off (not now), later (not in the game yet). */
  state: "picked" | "last" | "choice" | "open" | "off" | "later";
  /** Order in the plan, 1-based, for picked sides. */
  order: number;
  /** The full card image, shown on hover. */
  image: string;
}

export interface PlanLine {
  name: string;
  detail: string;
  cost: number;
}

export interface Button {
  id: string;
  label: string;
  tone: "primary" | "plain" | "danger";
  disabled?: boolean;
}

export interface TimelineRow {
  name: string;
  charKey: string;
  /** exec: the action executes on this segment (the others with it prepare it). */
  cells: { fill: SegFill; label: string; exec: boolean }[];
}

export interface ShowdownModel {
  title: string;
  status: string;
  /** move: my move; wait: waiting; replay; over; info (loading, spectating). */
  statusTone: "move" | "wait" | "replay" | "over" | "info";
  right: string;
  rightError: boolean;
  /** Left column: the characters (mine first, marked as such). */
  left: CharPanel[];
  /** Under them while planning or waiting: my plan on the segments. */
  tracker: SegFill[] | null;
  /** Right column, planning layout. */
  others: CharPanel[];
  plan: {
    title: string;
    points: string;
    lines: PlanLine[];
    empty: string;
    note: string;
    warn: boolean;
    buttons: Button[];
  } | null;
  hand: { cards: HandSide[][]; note: string } | null;
  replay: {
    logTitle: string;
    log: string[];
    /** The segment shown, 0 for the turn start. */
    seg: number;
    rows: TimelineRow[];
    prevTurn: boolean;
    nextTurn: boolean;
    prevSeg: boolean;
    nextSeg: boolean;
    playing: boolean;
    closeLabel: string;
  } | null;
}

export interface ShowdownActions {
  button(id: string): void;
  card(card: number, side: "front" | "back"): void;
  sheet(seat: number): void;
  segment(seg: number): void;
}

const CSS = `
.gv-root{position:fixed;inset:0;z-index:300;pointer-events:none;display:grid;font-family:'Zilla Slab',Rockwell,Georgia,serif;color:#2A1C14}
.gv-root *{box-sizing:border-box}
.gv-root button{font-family:inherit}
.gv-root button:focus-visible{outline:3px solid #F2B544;outline-offset:2px}
.gv-root button:disabled{opacity:.45;cursor:default}
.gv-header,.gv-left,.gv-right,.gv-bottom{pointer-events:auto}
.gv-header{grid-area:header;background:#2A1C14;border-bottom:3px solid #5A4636;display:flex;align-items:center;gap:10px 20px;padding:0 18px;color:#F3E7CE;min-width:0;overflow:hidden}
.gv-lobby{display:flex;align-items:center;gap:6px;min-height:44px;padding:0 6px;background:transparent;border:0;color:#F2B544;font-size:17px;font-weight:700;cursor:pointer}
.gv-lobby:hover{color:#FBF4E4}
.gv-title{font-family:Rye,Georgia,serif;font-size:21px;letter-spacing:1px;white-space:nowrap}
.gv-status{border:2px solid #F3E7CE;border-radius:999px;padding:3px 14px;font-size:16px;font-weight:700;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.gv-status.move{background:#B5482A;color:#FBF4E4}
.gv-status.replay{background:#33307F;color:#FBF4E4}
.gv-status.wait,.gv-status.info{background:transparent;color:#F3E7CE;border-color:#5A4636}
.gv-status.over{background:#F3E7CE;color:#2A1C14}
.gv-hright{margin-left:auto;font-size:15px;color:#D9C9A8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.gv-hright.err{color:#F2B544}
.gv-left,.gv-right{background:#1E1618;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:12px}
.gv-left{grid-area:left}
.gv-right{grid-area:right}
.gv-panel{background:#F3E7CE;border:3px solid #2A1C14;border-radius:16px;box-shadow:inset 0 0 0 4px #F3E7CE,inset 0 0 0 6px var(--rule,#2A1C14);padding:14px;display:flex;flex-direction:column;gap:10px}
.gv-char{cursor:pointer;text-align:left;width:100%;font:inherit;color:inherit}
.gv-char:hover{background:#FBF4E4}
.gv-char.out{filter:grayscale(.85);opacity:.75}
.gv-who{display:flex;align-items:center;gap:10px}
.gv-who img{width:52px;height:52px;flex-shrink:0}
.gv-who-txt{display:flex;flex-direction:column;min-width:0;flex:1}
.gv-kicker{font-size:12px;font-weight:700;letter-spacing:1.5px;color:#33307F}
.gv-name{font-family:Rye,Georgia,serif;font-size:21px;line-height:1.1}
.gv-where{font-size:14px;color:#5A4636}
.gv-badge{font-size:12px;font-weight:700;letter-spacing:1px;color:#FBF4E4;background:#4F7A3A;border-radius:999px;padding:3px 9px;white-space:nowrap}
.gv-badge.out{background:#8E2F1A}
.gv-end{display:flex;flex-direction:column;gap:4px}
.gv-endrow{display:flex;justify-content:space-between;font-size:14px;font-weight:700}
.gv-boxes{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:3px}
.gv-boxes span{height:12px;border:2px solid #2A1C14;border-radius:3px;background:#4F7A3A}
.gv-boxes span.x{background:repeating-linear-gradient(135deg,#F3E7CE 0 3px,#2A1C14 3px 5px)}
.gv-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;text-align:center}
.gv-stats div{min-width:0;background:#FBF4E4;border:2px solid #2A1C14;border-radius:9px;padding:3px}
.gv-stats div.hot{background:#B5482A;color:#FBF4E4;border-color:#B5482A}
.gv-stats b{display:block;font-family:Rye,Georgia,serif;font-weight:400;font-size:20px;line-height:1.1}
.gv-stats small{display:block;font-size:10px;font-weight:700;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gv-gun{display:flex;align-items:center;gap:8px;background:#FBF4E4;border:2px solid #2A1C14;border-radius:9px;padding:6px 8px}
.gv-gun img{width:40px;height:auto;flex-shrink:0}
.gv-gun.broken img{filter:grayscale(1)}
.gv-gun-txt{display:flex;flex-direction:column;gap:3px;font-size:14px;font-weight:700;min-width:0}
.gv-shells{display:flex;gap:3px}
.gv-shells span{width:10px;height:10px;border-radius:50%;border:2px solid #2A1C14}
.gv-shells span.in{background:#B5482A}
.gv-small .gv-who img{width:42px;height:42px}
.gv-small .gv-name{font-size:18px}
.gv-segs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.gv-seg{aspect-ratio:1;border:3px solid #2A1C14;border-radius:7px;position:relative;display:flex;align-items:center;justify-content:center}
.gv-seg i{position:absolute;top:0;left:4px;font-family:Rye,Georgia,serif;font-style:normal;font-size:12px}
.gv-seg.action{background:#4F7A3A;box-shadow:inset 0 0 0 2px rgba(243,231,206,.35);color:#F3E7CE}
.gv-seg.delay{background:#B5482A;box-shadow:inset 0 0 0 2px rgba(243,231,206,.35);color:#F3E7CE}
.gv-legend{display:flex;justify-content:center;gap:12px;font-size:13px;font-weight:700}
.gv-legend span{display:flex;align-items:center;gap:5px}
.gv-legend em{width:12px;height:12px;border:2px solid #2A1C14;border-radius:3px}
.gv-plan{--rule:#B5482A}
.gv-plan-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;border-bottom:3px solid #2A1C14;padding-bottom:6px}
.gv-plan-head h2{margin:0;font-family:Rye,Georgia,serif;font-weight:400;font-size:24px;color:#33307F}
.gv-plan-head span{font-size:16px;font-weight:700}
.gv-plan ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px}
.gv-plan li{display:flex;align-items:center;gap:9px;background:#FBF4E4;border:2px solid #2A1C14;border-radius:9px;padding:7px 9px}
.gv-plan li b{width:28px;height:28px;flex-shrink:0;border-radius:50%;background:#33307F;color:#FBF4E4;display:flex;align-items:center;justify-content:center;font-family:Rye,Georgia,serif;font-weight:400;font-size:15px}
.gv-plan li div{flex:1;display:flex;flex-direction:column;min-width:0}
.gv-plan li strong{font-size:16px}
.gv-plan li small{font-size:14px;font-style:italic;color:#5A4636}
.gv-plan li em{font-family:Rye,Georgia,serif;font-style:normal;font-size:17px;color:#8E2F1A}
.gv-empty{margin:0;font-size:15px;font-style:italic;color:#5A4636}
.gv-note{margin:0;font-size:15px;color:#5A4636}
.gv-note.warn{color:#8E2F1A;font-weight:700}
.gv-buttons{display:flex;flex-wrap:wrap;gap:8px}
.gv-btn{flex:1 1 auto;min-height:44px;padding:0 12px;background:#FBF4E4;color:#2A1C14;border:2px solid #2A1C14;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer}
.gv-btn:hover:not(:disabled){background:#FFFFFF}
.gv-btn.danger{color:#8E2F1A;border-color:#8E2F1A}
.gv-btn.primary{flex:1 1 100%;min-height:54px;background:#B5482A;color:#FBF4E4;border:3px solid #2A1C14;border-radius:12px;box-shadow:0 5px 0 #2A1C14;font-family:Rye,Georgia,serif;font-size:21px;font-weight:400;letter-spacing:1.5px}
.gv-btn.primary:hover:not(:disabled){background:#C65634}
.gv-bottom{grid-area:bottom;background:#2A1C14;border-top:3px solid #5A4636;padding:8px 18px 12px;color:#F3E7CE;min-width:0;overflow:hidden;display:flex;flex-direction:column}
.gv-hand-head{display:flex;align-items:baseline;gap:14px;margin-bottom:6px}
.gv-hand-head h2{margin:0;font-family:Rye,Georgia,serif;font-weight:400;font-size:18px}
.gv-hand-head span{font-size:14px;color:#D9C9A8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gv-hand{flex:1;min-height:0;display:grid;grid-template-columns:repeat(var(--cards),minmax(0,1fr));gap:8px}
.gv-card{background:#F3E7CE;border:3px solid #2A1C14;border-radius:12px;box-shadow:inset 0 0 0 3px #F3E7CE,inset 0 0 0 5px #B5482A;overflow:hidden;display:flex;flex-direction:column;min-height:0}
.gv-side{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:4px;padding:8px 46px 8px 12px;text-align:left;background:transparent;color:#2A1C14;border:0;border-bottom:2px solid #2A1C14;cursor:pointer;min-width:0}
.gv-side:last-child{border-bottom:0}
.gv-side small{font-size:12px;font-weight:700;letter-spacing:1.5px}
.gv-side strong{font-family:Rye,Georgia,serif;font-weight:400;font-size:19px;line-height:1.1;overflow:hidden;text-overflow:ellipsis}
.gv-side em{position:absolute;right:9px;top:50%;margin-top:-17px;width:34px;height:34px;border-radius:50%;background:#B5482A;color:#F3E7CE;box-shadow:0 0 0 3px #F3E7CE,0 0 0 5px #2A1C14;display:flex;align-items:center;justify-content:center;font-family:Rye,Georgia,serif;font-style:normal;font-size:20px}
.gv-side i{position:absolute;left:8px;top:5px;font-style:normal;font-size:13px;font-weight:700;color:#F2B544}
.gv-side:hover:not(:disabled){background:#FBF4E4}
.gv-side.picked,.gv-side.last{background:#33307F;color:#FBF4E4}
.gv-side.picked{opacity:.75}
.gv-side.last:hover:not(:disabled),.gv-side.picked:hover:not(:disabled){background:#403D96}
.gv-side.choice{background:#F2B544}
.gv-side.off:disabled{opacity:.4}
.gv-side.later{background:repeating-linear-gradient(135deg,#E9DCC0 0 8px,#DDCCAA 8px 16px)}
.gv-side.later:disabled{opacity:.7}
.gv-side.later em{background:#8A7A66}
.gv-preview{position:fixed;z-index:310;pointer-events:none;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.6)}
.gv-rp{display:flex;gap:16px 24px;align-items:stretch;height:100%}
.gv-tl{flex:999 1 520px;min-width:0;display:grid;grid-template-columns:9rem repeat(5,minmax(0,1fr));gap:8px 9px;align-items:center;align-content:center}
.gv-head{min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;background:transparent;border:0;color:#F3E7CE;font-family:Rye,Georgia,serif;font-size:18px;cursor:pointer}
.gv-head:hover{color:#F2B544}
.gv-rowname{display:flex;align-items:center;gap:9px;font-size:17px;font-weight:700;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gv-rowname img{width:36px;height:36px;flex-shrink:0}
.gv-cell{height:54px;border:2px solid #5A4636;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 6px;font-size:16px;font-weight:700;color:#F3E7CE;text-align:center;line-height:1.1;overflow:hidden}
.gv-cell.action{background:#4F7A3A;border-color:#F3E7CE}
.gv-cell.prep{background:#B7D3A3;color:#2A1C14;border-color:#F3E7CE;font-weight:500;font-style:italic}
.gv-cell.delay{background:#B5482A;border-color:#F3E7CE}
.gv-cell.now{outline:3px solid #F2B544;outline-offset:1px}
.gv-ctl{flex:1 1 280px;display:flex;flex-direction:column;justify-content:center;gap:8px}
.gv-ctl-row{display:flex;gap:8px}
.gv-ghost{flex:1;min-height:44px;background:transparent;color:#F3E7CE;border:2px solid #5A4636;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer}
.gv-ghost:hover:not(:disabled){border-color:#F3E7CE}
.gv-icon{width:50px;min-height:50px;background:#F3E7CE;border:3px solid #F3E7CE;border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.gv-play{flex:1;min-height:50px;background:#B5482A;color:#FBF4E4;border:3px solid #F3E7CE;border-radius:12px;font-family:Rye,Georgia,serif;font-size:19px;letter-spacing:1.5px;cursor:pointer}
.gv-log{--rule:#2A1C14;flex:1;min-height:0}
.gv-log h2{margin:0;font-family:Rye,Georgia,serif;font-weight:400;font-size:22px;color:#33307F;border-bottom:3px solid #2A1C14;padding-bottom:6px}
.gv-log ol{margin:0;padding:0 0 0 2px;list-style:none;display:flex;flex-direction:column;gap:7px;font-size:15px;line-height:1.35}
.gv-log li.sub{padding-left:18px}
`;

const POINTER_SVG =
  '<svg width="13" height="26" viewBox="2 -2 36 76" aria-hidden="true"><defs><linearGradient id="gvPointer" gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="69">' +
  '<stop offset="0" stop-color="#3E9DB0"></stop><stop offset="0.55" stop-color="#3F4F9E"></stop><stop offset="1" stop-color="#3A2384"></stop></linearGradient></defs>' +
  '<g fill="url(#gvPointer)" stroke="#EDE4CF" stroke-width="5" paint-order="stroke"><circle cx="20" cy="9" r="6.5"></circle><path d="M17.6,14 H22.4 V41 H17.6 Z"></path>' +
  '<circle cx="20" cy="26" r="3.6"></circle><path d="M18,39 C14,43 6.5,42 7.5,50 C8.5,57 16,60 20,69 C24,60 31.5,57 32.5,50 C33.5,42 26,43 22,39 Z"></path></g></svg>';
const CHECK_SVG =
  '<svg width="22" height="22" viewBox="0 0 56 56" aria-hidden="true"><path d="M10,30 L23,43 L47,13" fill="none" stroke="#F3E7CE" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
const HOURGLASS_SVG =
  '<svg width="18" height="22" viewBox="0 0 52 62" aria-hidden="true"><rect x="6" y="2" width="40" height="7" rx="2" fill="#F3E7CE"></rect><rect x="6" y="53" width="40" height="7" rx="2" fill="#F3E7CE"></rect>' +
  '<path d="M11,9 H41 Q41,24 26,31 Q11,24 11,9 Z M11,53 H41 Q41,38 26,31 Q11,38 11,53 Z" fill="none" stroke="#F3E7CE" stroke-width="4" stroke-linejoin="round"></path><path d="M17,48 Q26,40 35,48 Z" fill="#F3E7CE"></path></svg>';
const BACK_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5 L8 12 L15 19"></path></svg>';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function tokenImg(charKey: string): string {
  return `<img src="char_${esc(charKey)}.png" alt="" style="transform: rotate(${uprightTokenAngle(charKey)}deg)">`;
}

export class ShowdownView {
  private root: HTMLDivElement;
  private header: HTMLElement;
  private left: HTMLElement;
  private right: HTMLElement;
  private bottom: HTMLElement;
  private preview: HTMLImageElement;
  private images = new Map<string, string>();

  constructor(private actions: ShowdownActions) {
    if (!document.getElementById("gv-style")) {
      const style = document.createElement("style");
      style.id = "gv-style";
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = document.createElement("div");
    this.root.className = "gv-root";
    this.header = document.createElement("header");
    this.header.className = "gv-header";
    this.left = document.createElement("aside");
    this.left.className = "gv-left";
    this.right = document.createElement("aside");
    this.right.className = "gv-right";
    this.bottom = document.createElement("section");
    this.bottom.className = "gv-bottom";
    this.root.append(this.header, this.left, this.right, this.bottom);
    this.preview = document.createElement("img");
    this.preview.className = "gv-preview";
    this.preview.alt = "";
    this.preview.style.display = "none";

    this.root.addEventListener("click", (e) => {
      const el = (e.target as Element).closest<HTMLElement>("[data-act]");
      if (!el || (el as HTMLButtonElement).disabled) return;
      const d = el.dataset;
      switch (d.act) {
        case "btn":
          return this.actions.button(d.id ?? "");
        case "card":
          this.hidePreview();
          return this.actions.card(Number(d.card), d.side as "front" | "back");
        case "sheet":
          return this.actions.sheet(Number(d.seat));
        case "seg":
          return this.actions.segment(Number(d.seg));
      }
    });
    // The whole card over the side under the pointer, just above the hand.
    this.bottom.addEventListener("mouseover", (e) => {
      const el = (e.target as Element).closest<HTMLElement>("[data-image]");
      if (el) this.showPreview(el);
      else this.hidePreview();
    });
    this.bottom.addEventListener("mouseleave", () => this.hidePreview());
    document.body.append(this.root, this.preview);
  }

  render(m: ShowdownModel, layout: ShowdownLayout) {
    Object.assign(this.root.style, {
      gridTemplateRows: `${layout.header}px 1fr ${layout.bottom}px`,
      gridTemplateColumns: `${layout.left}px 1fr ${layout.right}px`,
      gridTemplateAreas: '"header header header" "left . right" "bottom bottom bottom"',
      display: "grid",
    });
    this.header.innerHTML = this.headerHtml(m);
    if (m.replay) {
      this.left.innerHTML = m.left.map((c) => this.charHtml(c, true)).join("");
      this.right.innerHTML = this.logHtml(m);
      this.bottom.innerHTML = this.replayHtml(m);
    } else {
      // My plan goes with my character and the segment tracker; the other characters fill the right.
      this.left.innerHTML = m.left.map((c) => this.charHtml(c, false)).join("") + this.planHtml(m);
      this.right.innerHTML = m.others.map((c) => this.charHtml(c, false)).join("");
      this.bottom.innerHTML = this.handHtml(m);
    }
  }

  destroy() {
    this.root.remove();
    this.preview.remove();
  }

  private headerHtml(m: ShowdownModel): string {
    return (
      `<button type="button" class="gv-lobby" data-act="btn" data-id="lobby">${BACK_SVG}Lobby</button>` +
      `<span class="gv-title">${esc(m.title)}</span>` +
      (m.status ? `<span class="gv-status ${m.statusTone}">${esc(m.status)}</span>` : "") +
      `<span class="gv-hright${m.rightError ? " err" : ""}">${esc(m.right)}</span>`
    );
  }

  private charHtml(c: CharPanel, small: boolean): string {
    const boxes = Array.from({ length: c.maxEndurance }, (_, i) => `<span${i < c.endurance ? "" : ' class="x"'}></span>`).join("");
    const guns = c.guns
      .map(
        (g) =>
          `<div class="gv-gun${g.broken ? " broken" : ""}"><img src="guns/${esc(g.type)}.gif" alt=""><div class="gv-gun-txt"><span>${esc(g.name)} · ${esc(g.state)}</span>` +
          `<div class="gv-shells" aria-label="${g.shells} of ${g.capacity} shells loaded">` +
          Array.from({ length: g.capacity }, (_, i) => `<span${i < g.shells ? ' class="in"' : ""}></span>`).join("") +
          "</div></div></div>",
      )
      .join("");
    const badge = c.out ? `<span class="gv-badge out">${esc(c.out)}</span>` : c.badge ? `<span class="gv-badge">${esc(c.badge)}</span>` : "";
    const detail = small
      ? `<div class="gv-stats"><div${c.delay ? ' class="hot"' : ""}><b>${c.delay}</b><small>DELAY</small></div><div><b>${c.endurance}</b><small>ENDURANCE</small></div><div><b>${c.aim}</b><small>AIM</small></div></div>`
      : `<div class="gv-end"><div class="gv-endrow"><span>Endurance</span><span>${c.endurance} / ${c.maxEndurance}</span></div><div class="gv-boxes">${boxes}</div></div>` +
        `<div class="gv-stats"><div${c.delay ? ' class="hot"' : ""}><b>${c.delay}</b><small>DELAY</small></div><div><b>${c.aim}</b><small>AIM</small></div><div><b>${c.wounds}</b><small>WOUNDS</small></div></div>` +
        guns;
    const rule = c.you ? "#33307F" : "#8E2F1A";
    return (
      `<button type="button" class="gv-panel gv-char${small ? " gv-small" : ""}${c.out ? " out" : ""}" style="--rule:${rule}" data-act="sheet" data-seat="${c.seat}" aria-label="${esc(c.name)}: open the character sheet">` +
      `<div class="gv-who">${tokenImg(c.charKey)}<div class="gv-who-txt">${c.you ? '<span class="gv-kicker">YOUR CHARACTER</span>' : ""}` +
      `<span class="gv-name">${esc(c.name)}</span><span class="gv-where">${esc(c.where)}</span></div>${badge}</div>${detail}</button>`
    );
  }

  /** My plan on the turn's five segments, inside the plan panel. */
  private trackerHtml(fills: SegFill[] | null): string {
    if (!fills) return "";
    const segs = fills
      .map((f, i) => `<div class="gv-seg ${f}"><i>${i + 1}</i>${f === "action" ? CHECK_SVG : f === "delay" ? HOURGLASS_SVG : ""}</div>`)
      .join("");
    return (
      `<div class="gv-segs" role="img" aria-label="Your plan on the turn's five segments">${segs}</div>` +
      '<div class="gv-legend"><span><em style="background:#4F7A3A"></em>Action</span><span><em style="background:#B5482A"></em>Delay</span></div>'
    );
  }

  private planHtml(m: ShowdownModel): string {
    const p = m.plan;
    if (!p) return "";
    const lines = p.lines
      .map((l, i) => `<li><b>${i + 1}</b><div><strong>${esc(l.name)}</strong>${l.detail ? `<small>${esc(l.detail)}</small>` : ""}</div><em>${l.cost}</em></li>`)
      .join("");
    const buttons = p.buttons
      .map((b) => `<button type="button" class="gv-btn ${b.tone}" data-act="btn" data-id="${esc(b.id)}"${b.disabled ? " disabled" : ""}>${esc(b.label)}</button>`)
      .join("");
    return (
      `<section class="gv-panel gv-plan" aria-labelledby="gv-plan"><div class="gv-plan-head"><h2 id="gv-plan">${esc(p.title)}</h2><span>${esc(p.points)}</span></div>` +
      this.trackerHtml(m.tracker) +
      (lines ? `<ol>${lines}</ol>` : `<p class="gv-empty">${esc(p.empty)}</p>`) +
      (p.note ? `<p class="gv-note${p.warn ? " warn" : ""}">${esc(p.note)}</p>` : "") +
      `<div class="gv-buttons">${buttons}</div></section>`
    );
  }

  private handHtml(m: ShowdownModel): string {
    const h = m.hand;
    if (!h) return "";
    this.images.clear();
    const cards = h.cards
      .map((sides) => {
        const halves = sides
          .map((s) => {
            const key = `${s.card}${s.side}`;
            this.images.set(key, s.image);
            const disabled = s.state === "off" || s.state === "later";
            const title = s.state === "later" ? `${s.name}: not in the game yet` : s.state === "last" ? `${s.name}: click to take it back` : s.name;
            return (
              `<button type="button" class="gv-side ${s.state}" data-act="card" data-card="${s.card}" data-side="${s.side}" data-image="${key}"` +
              ` aria-pressed="${s.order > 0}"${disabled ? " disabled" : ""} title="${esc(title)}">` +
              (s.order > 0 ? `<i>#${s.order}</i>` : "") +
              `<small>${esc(s.tag)}</small><strong>${esc(s.name).replace(/\//g, "/<wbr>")}</strong><em>${s.cost}</em></button>`
            );
          })
          .join("");
        return `<div class="gv-card">${halves}</div>`;
      })
      .join("");
    return (
      `<div class="gv-hand-head"><h2>Your hand</h2><span>${esc(h.note)}</span></div>` +
      `<div class="gv-hand" style="--cards:${h.cards.length}">${cards}</div>`
    );
  }

  private logHtml(m: ShowdownModel): string {
    const r = m.replay!;
    const lines = r.log.map((l) => (l.startsWith("    ") ? `<li class="sub">${esc(l.trim())}</li>` : `<li>${esc(l)}</li>`)).join("");
    return `<section class="gv-panel gv-log" aria-labelledby="gv-log"><h2 id="gv-log">${esc(r.logTitle)}</h2><ol>${lines}</ol></section>`;
  }

  private replayHtml(m: ShowdownModel): string {
    const r = m.replay!;
    const heads = [1, 2, 3, 4, 5]
      .map((n) => `<button type="button" class="gv-head" data-act="seg" data-seg="${n}" aria-label="Show segment ${n}"${n === r.seg ? ' aria-current="step"' : ""}>${n === r.seg ? POINTER_SVG : ""}${n}</button>`)
      .join("");
    const rows = r.rows
      .map(
        (row) =>
          `<span class="gv-rowname">${tokenImg(row.charKey)}${esc(row.name)}</span>` +
          row.cells.map((c, i) => `<div class="gv-cell ${c.fill}${c.fill === "action" && !c.exec ? " prep" : ""}${i + 1 === r.seg ? " now" : ""}">${esc(c.label)}</div>`).join(""),
      )
      .join("");
    const dis = (on: boolean) => (on ? "" : " disabled");
    return (
      `<div class="gv-rp"><div class="gv-tl"><span></span>${heads}${rows}</div>` +
      '<div class="gv-ctl"><div class="gv-ctl-row">' +
      `<button type="button" class="gv-ghost" data-act="btn" data-id="prevTurn"${dis(r.prevTurn)}>◀ Turn</button>` +
      `<button type="button" class="gv-ghost" data-act="btn" data-id="nextTurn"${dis(r.nextTurn)}>Turn ▶</button>` +
      `<button type="button" class="gv-ghost" data-act="btn" data-id="close">${esc(r.closeLabel)}</button></div>` +
      '<div class="gv-ctl-row">' +
      `<button type="button" class="gv-icon" data-act="btn" data-id="prevSeg" aria-label="Previous segment"${dis(r.prevSeg)}><svg width="20" height="20" viewBox="0 0 24 24" fill="#2A1C14" aria-hidden="true"><path d="M17 5 L7 12 L17 19 Z"></path></svg></button>` +
      `<button type="button" class="gv-play" data-act="btn" data-id="play">${r.playing ? "PAUSE" : "PLAY"}</button>` +
      `<button type="button" class="gv-icon" data-act="btn" data-id="nextSeg" aria-label="Next segment"${dis(r.nextSeg)}><svg width="20" height="20" viewBox="0 0 24 24" fill="#2A1C14" aria-hidden="true"><path d="M7 5 L17 12 L7 19 Z"></path></svg></button>` +
      "</div></div></div>"
    );
  }

  private showPreview(el: HTMLElement) {
    const src = this.images.get(el.dataset.image ?? "");
    if (!src) return;
    const r = el.getBoundingClientRect();
    const top = this.bottom.getBoundingClientRect().top;
    const h = Math.min(440, top - 70);
    if (h < 120) return;
    const w = (h * 630) / 880;
    this.preview.src = src;
    Object.assign(this.preview.style, {
      display: "block",
      height: `${h}px`,
      width: `${w}px`,
      top: `${top - h - 8}px`,
      left: `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`,
    });
  }

  private hidePreview() {
    this.preview.style.display = "none";
  }
}
