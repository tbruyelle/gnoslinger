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
  /** The status ribbon's strip, over the board. */
  ribbon: number;
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
  const ribbon = 48;
  const bottom = 268;
  // Both columns the same width; narrower in a small window, so the board keeps some room.
  const side = w < 1180 ? 255 : 296;
  const left = side;
  const right = side;
  const top = header + ribbon;
  return { header, ribbon, left, right, bottom, board: { x: left, y: top, w: Math.max(120, w - left - right), h: Math.max(120, h - top - bottom) } };
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
  /** The seat's colour (ui/seats.ts), the panel's rule. */
  color: string;
  name: string;
  charKey: string;
  you: boolean;
  /** Who plays it: the registered name, else the short address ("" for a free seat); addr the full address, on hover. */
  player: string;
  addr: string;
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
  /** Time points, in the circle on the right; none for a line that is not an action. */
  cost?: number;
  /** The character the action names ("aim at Reb"): its name in detail goes in its seat's colour. */
  target?: { name: string; color: string };
}

export interface Button {
  id: string;
  label: string;
  /** adena: the splash's Connect with Adena (paper in a red ring, the wallet's icon before the label). */
  tone: "primary" | "plain" | "danger" | "adena";
  disabled?: boolean;
}

/**
 * A seat in the header's line-up: its character's token ringed in the seat's
 * colour and its name, the player on hover, YOU after mine; an empty seat
 * has no character.
 */
export interface HeaderSeat {
  charKey: string;
  name: string;
  color: string;
  /** Who plays it (name or short address) and its address, for the hover; "" for an empty seat or one I am setting up in. */
  player: string;
  addr: string;
  you: boolean;
}

export interface TimelineRow {
  name: string;
  charKey: string;
  /** The seat's colour, as a dot before the name. */
  color: string;
  /** exec: the action executes on this segment (the others with it prepare it). */
  cells: { fill: SegFill; label: string; exec: boolean }[];
}

/** The tutorial's coach, at the top of the right column: the lesson and what to do now. */
export interface CoachModel {
  /** "Step 2 of 5". */
  step: string;
  title: string;
  text: string[];
  /** What to play or watch, "" for none. */
  todo: string;
  buttons: Button[];
}

export interface ShowdownModel {
  title: string;
  status: string;
  /** move: my move; wait: waiting; replay; over; info (loading, spectating). */
  statusTone: "move" | "wait" | "replay" | "over" | "info";
  /** The header's right end: the seats in order. */
  lineup: HeaderSeat[];
  /** The RPC error, shown there instead; "" when the chain answers. */
  error: string;
  /** The link to a GitHub issue about what the screen shows (game/bugReport.ts), at the header's end. */
  reportUrl: string;
  /** Share, before Report a bug: copies an invitation with the showdown's link; null without a game on the chain (calling one, the tutorial), "join" while a seat is free. */
  share: "join" | "watch" | null;
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
    /** The character the buttons' call gives me, its token over them (joining from the board, as the lobby's form shows the caller's). */
    you?: { charKey: string; name: string };
    buttons: Button[];
  } | null;
  hand: { cards: HandSide[][]; note: string } | null;
  replay: {
    logTitle: string;
    log: string[];
    /** Every seat's character name and colour: the names in the log show in their seat's colour. */
    names: { name: string; color: string }[];
    /** The segment shown, 0 for the turn start. */
    seg: number;
    rows: TimelineRow[];
    /** The turn shown, between the turn buttons: "3 / 7", or "3" for a live turn. */
    turnLabel: string;
    prevTurn: boolean;
    nextTurn: boolean;
    prevSeg: boolean;
    nextSeg: boolean;
    playing: boolean;
    /** Names the panel's close cross, what closing does; null: no cross (a finished game's replay). */
    closeLabel: string | null;
  } | null;
  /** The tutorial's coach, none outside it. */
  coach?: CoachModel | null;
}

export interface ShowdownActions {
  button(id: string): void;
  card(card: number, side: "front" | "back"): void;
  sheet(seat: number): void;
  segment(seg: number): void;
  /** A player's profile (a seat of the header's line-up). */
  profile(addr: string): void;
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
.gv-report{flex-shrink:0;background:transparent;font-family:inherit;cursor:pointer;white-space:nowrap;font-size:14px;font-weight:700;color:#D9C9A8;text-decoration:none;border:2px solid #5A4636;border-radius:999px;padding:3px 10px}
.gv-report:hover{color:#F2B544;border-color:#F2B544}
.gv-title{font-family:Rye,Georgia,serif;font-size:21px;letter-spacing:1px;white-space:nowrap}
.gv-ribbon{grid-area:ribbon;display:flex;align-items:center;padding:6px 12px 0;min-width:0}
.gv-status{flex:1;text-align:center;border:2px solid #F3E7CE;border-radius:999px;padding:6px 18px;font-size:18px;font-weight:700;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.gv-status.move{background:#B5482A;color:#FBF4E4}
.gv-status.replay{background:#33307F;color:#FBF4E4}
.gv-status.wait,.gv-status.info{background:transparent;color:#F3E7CE;border-color:#5A4636}
.gv-status.over{background:#F3E7CE;color:#2A1C14}
.gv-status.flash{animation:gv-flash 1.4s ease-out}
@keyframes gv-flash{0%{box-shadow:0 0 0 0 rgba(242,181,68,.9);border-color:#F2B544;transform:scale(1.03)}
25%{box-shadow:0 0 0 8px rgba(242,181,68,.45);border-color:#F2B544;transform:scale(1)}
100%{box-shadow:0 0 0 14px rgba(242,181,68,0)}}
@media (prefers-reduced-motion:reduce){.gv-status.flash{animation:none;border-color:#F2B544}}
.gv-herr{margin-left:auto;font-size:15px;color:#F2B544;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.gv-lineup{margin-left:auto;display:flex;align-items:center;gap:12px;min-width:0;overflow:hidden;white-space:nowrap}
.gv-vs{font-size:14px;font-style:italic;color:#8E7A5E}
.gv-seat{display:inline-flex;align-items:center;gap:8px;font-size:17px;font-weight:700;color:#F3E7CE;background:transparent;border:0;border-radius:999px;padding:2px 8px 2px 2px;margin:-2px -8px -2px -2px}
button.gv-seat{cursor:pointer}
button.gv-seat:hover{background:#3D2B20}
button.gv-seat:hover b{text-decoration:underline}
.gv-seat img{width:32px;height:32px;border-radius:50%;box-shadow:0 0 0 2px #2A1C14,0 0 0 4px var(--seat)}
.gv-free{width:32px;height:32px;border-radius:50%;border:2px dashed #8E7A5E}
.gv-seat small{font-size:11px;font-weight:700;letter-spacing:1.5px;color:#F2B544}
.gv-x{position:absolute;top:4px;right:6px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:transparent;border:0;border-radius:8px;color:#F2B544;cursor:pointer}
.gv-x:hover{color:#FBF4E4;background:#5A4636}
.gv-left,.gv-right{background:#1E1618;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:12px}
.gv-left{grid-area:left}
.gv-col-title{margin:0 0 -4px;font-family:Rye,Georgia,serif;font-weight:400;font-size:22px;letter-spacing:1px;color:#F3E7CE}
.gv-right{grid-area:right}
.gv-coach{--rule:#F2B544;flex-shrink:0}
.gv-coach small{font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8E2F1A}
.gv-coach h2{margin:-6px 0 0;font-family:Rye,Georgia,serif;font-weight:400;font-size:24px;color:#33307F;border-bottom:3px solid #2A1C14;padding-bottom:6px}
.gv-coach p{margin:0;font-size:15px;line-height:1.4}
.gv-coach .gv-todo{font-weight:700;color:#8E2F1A}
.gv-panel{background:#F3E7CE;border:3px solid #2A1C14;border-radius:16px;box-shadow:inset 0 0 0 4px #F3E7CE,inset 0 0 0 6px var(--rule,#2A1C14);padding:14px;display:flex;flex-direction:column;gap:10px}
.gv-char{cursor:pointer;text-align:left;width:100%;font:inherit;color:inherit}
.gv-char:hover{background:#FBF4E4}
.gv-char.hl{background:#FBF4E4;outline:4px solid var(--rule,#F2B544);outline-offset:2px}
.gv-me.hl{outline:4px solid var(--rule,#F2B544);outline-offset:2px}
.gv-char.out{filter:grayscale(.85);opacity:.75}
.gv-who{display:flex;align-items:center;gap:10px}
.gv-who img{width:52px;height:52px;flex-shrink:0}
.gv-who-txt{display:flex;flex-direction:column;min-width:0;flex:1}
.gv-kicker{font-size:12px;font-weight:700;letter-spacing:1.5px;color:#33307F}
.gv-name{font-family:Rye,Georgia,serif;font-size:21px;line-height:1.1}
.gv-where{font-size:14px;color:#5A4636}
.gv-player{font-size:14px;font-weight:700;color:#2A1C14;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
.gv-me{gap:12px}
.gv-bare{display:flex;flex-direction:column;gap:10px}
.gv-char.gv-bare{background:transparent;border:0;border-radius:10px;padding:6px;margin:-6px}
.gv-char.gv-bare:hover{background:#FBF4E4}
.gv-plan.gv-bare{border-top:3px double #5A4636;padding-top:12px}
.gv-plan-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;border-bottom:3px solid #2A1C14;padding-bottom:6px}
.gv-plan-head h2{margin:0;font-family:Rye,Georgia,serif;font-weight:400;font-size:24px;color:#33307F}
.gv-plan-head span{font-size:16px;font-weight:700}
.gv-plan ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px}
.gv-plan li{display:flex;align-items:center;gap:9px;background:#FBF4E4;border:2px solid #2A1C14;border-radius:9px;padding:7px 9px}
.gv-plan li b{width:28px;height:28px;flex-shrink:0;border-radius:50%;background:#33307F;color:#FBF4E4;display:flex;align-items:center;justify-content:center;font-family:Rye,Georgia,serif;font-weight:400;font-size:15px}
.gv-plan li div{flex:1;display:flex;flex-direction:column;min-width:0}
.gv-plan li strong{font-size:16px}
.gv-plan li small{font-size:14px;font-style:italic;color:#5A4636}
.gv-plan li small .gv-tgt{font-style:normal;font-weight:700}
.gv-plan li em{font-family:Rye,Georgia,serif;font-style:normal;font-size:17px;color:#8E2F1A}
.gv-empty{margin:0;font-size:15px;font-style:italic;color:#5A4636}
.gv-note{margin:0;font-size:15px;color:#5A4636}
.gv-note.warn{color:#8E2F1A;font-weight:700}
.gv-you{display:flex;align-items:center;gap:12px;background:#FBF4E4;border:2px solid #2A1C14;border-radius:12px;padding:8px 12px}
.gv-you img{width:56px;height:56px;flex-shrink:0}
.gv-you small{display:block;font-size:13px;font-weight:700;letter-spacing:1.5px;color:#8E2F1A}
.gv-you span{font-family:Rye,Georgia,serif;font-size:22px}
.gv-buttons{display:flex;flex-wrap:wrap;gap:8px}
.gv-btn{flex:1 1 auto;min-height:44px;white-space:pre-line;padding:0 12px;background:#FBF4E4;color:#2A1C14;border:2px solid #2A1C14;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer}
.gv-btn:hover:not(:disabled){background:#FFFFFF}
.gv-btn.danger{color:#8E2F1A;border-color:#8E2F1A}
.gv-btn.primary{flex:1 1 100%;min-height:54px;padding:8px 16px;margin-bottom:5px;background:#B5482A;color:#FBF4E4;border:3px solid #2A1C14;border-radius:12px;box-shadow:0 5px 0 #2A1C14;font-family:Rye,Georgia,serif;font-size:21px;font-weight:400;letter-spacing:1.5px}
.gv-btn.primary:hover:not(:disabled){background:#C65634}
.gv-btn.adena{flex:1 1 100%;display:flex;align-items:center;justify-content:center;gap:10px;min-height:54px;margin:3px 3px 11px;padding:6px 20px;background:#F3E7CE;border:3px solid #2A1C14;border-radius:12px;box-shadow:0 0 0 3px #B5482A,0 6px 0 3px #8E2F1A;font-family:'Zilla Slab',Rockwell,Georgia,serif;font-size:20px;font-weight:700}
.gv-btn.adena:hover:not(:disabled){background:#FBF4E4}
.gv-btn.adena img{width:28px;height:28px;flex-shrink:0}
.gv-bottom{grid-area:bottom;position:relative;background:#2A1C14;border-top:3px solid #5A4636;padding:8px 18px 12px;color:#F3E7CE;min-width:0;overflow:hidden;display:flex;flex-direction:column}
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
.gv-tl{--cell:54px;flex:999 1 520px;min-width:0;display:grid;grid-template-columns:9rem repeat(5,minmax(0,1fr));gap:8px 9px;align-items:center;align-content:center}
.gv-tl.compact{--cell:34px;gap:5px 9px}
.gv-tl.compact .gv-cell{font-size:14px}
.gv-tl.compact .gv-rowname{font-size:15px}
.gv-tl.compact .gv-rowname img{width:28px;height:28px}
.gv-dot{width:10px;height:10px;flex-shrink:0;border-radius:50%;border:2px solid #F3E7CE}
.gv-head{min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;background:transparent;border:0;color:#F3E7CE;font-family:Rye,Georgia,serif;font-size:18px;cursor:pointer}
.gv-head:hover{color:#F2B544}
.gv-start{align-self:flex-start;display:flex;transform:translateX(-50%)}
.gv-rowname{display:flex;align-items:center;gap:9px;font-size:17px;font-weight:700;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gv-rowname img{width:36px;height:36px;flex-shrink:0}
.gv-cell{height:var(--cell);border:2px solid #5A4636;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 6px;font-size:16px;font-weight:700;color:#F3E7CE;text-align:center;line-height:1.1;overflow:hidden}
.gv-cell.action{background:#4F7A3A;border-color:#F3E7CE}
.gv-cell.prep{background:#B7D3A3;color:#2A1C14;border-color:#F3E7CE;font-weight:500;font-style:italic}
.gv-cell.delay{background:#B5482A;border-color:#F3E7CE}
.gv-cell.now{outline:3px solid #F2B544;outline-offset:1px}
.gv-ctl{flex:1 1 280px;display:flex;flex-direction:column;justify-content:center;gap:8px}
.gv-ctl-row{display:flex;gap:8px}
.gv-turn{flex:0 0 auto;min-width:3.5em;display:flex;align-items:center;justify-content:center;font-family:Rye,Georgia,serif;font-size:18px;color:#F3E7CE;white-space:nowrap}
.gv-turn{background:transparent;border:0;padding:0 6px;cursor:pointer}
.gv-turn:hover{color:#F2B544}
.gv-ghost{flex:1;min-height:44px;background:transparent;color:#F3E7CE;border:2px solid #5A4636;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer}
.gv-ghost:hover:not(:disabled){border-color:#F3E7CE}
.gv-icon{width:50px;min-height:50px;background:#F3E7CE;border:3px solid #F3E7CE;border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.gv-play{flex:1;min-height:50px;background:#B5482A;color:#FBF4E4;border:3px solid #F3E7CE;border-radius:12px;font-family:Rye,Georgia,serif;font-size:19px;letter-spacing:1.5px;cursor:pointer}
.gv-log{--rule:#2A1C14;flex:1;min-height:0}
.gv-log h2{margin:0;font-family:Rye,Georgia,serif;font-weight:400;font-size:22px;color:#33307F;border-bottom:3px solid #2A1C14;padding-bottom:6px}
.gv-log ol{margin:0;padding:0 0 0 2px;list-style:none;display:flex;flex-direction:column;gap:7px;font-size:15px;line-height:1.35}
.gv-log li.sub{padding-left:18px}
.gv-log .gv-who-c{font-weight:700}
.gv-log[data-act]{cursor:pointer}
.gv-log[data-act]:hover{background:#FBF4E4}
.gv-log-head{display:flex;align-items:center;gap:8px;border-bottom:3px solid #2A1C14;padding-bottom:6px}
.gv-log-head h2{flex:1;border-bottom:0;padding-bottom:0}
.gv-grow{width:36px;height:36px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:transparent;border:2px solid #2A1C14;border-radius:8px;color:#2A1C14;cursor:pointer}
.gv-grow:hover{background:#2A1C14;color:#F3E7CE}
.gv-modal-back{position:fixed;inset:0;z-index:420;pointer-events:auto;background:rgba(30,22,24,.72);display:flex;align-items:flex-start;justify-content:center;padding:64px 16px 24px}
.gv-modal{position:relative;width:100%;max-width:56rem;max-height:calc(100vh - 88px);overflow-y:auto;padding:22px 64px 24px 28px}
.gv-modal ol{font-size:18px;gap:9px}
.gv-modal .gv-x{top:10px;right:10px;color:#2A1C14}
.gv-modal .gv-x:hover{color:#F3E7CE;background:#2A1C14}
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
/**
 * Escapes a log line with every character name in it bold, in its seat's
 * colour: whole words, case kept, the longest names tried first.
 */
export function colorNames(names: { name: string; color: string }[]): (line: string) => string {
  const byName = new Map(names.filter((n) => n.name).map((n) => [n.name, n.color]));
  if (byName.size === 0) return esc;
  const alts = [...byName.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(${alts.join("|")})\\b`, "g");
  return (line) => {
    let out = "";
    let last = 0;
    for (const m of line.matchAll(re)) {
      out += esc(line.slice(last, m.index)) + `<span class="gv-who-c" style="color:${esc(byName.get(m[1]) ?? "")}">${esc(m[1])}</span>`;
      last = (m.index ?? 0) + m[1].length;
    }
    return out + esc(line.slice(last));
  };
}

/** A plan line's detail, the target's name in its seat's colour. */
function detailHtml(l: PlanLine): string {
  const t = l.target;
  const at = t ? l.detail.lastIndexOf(t.name) : -1;
  if (!t || at < 0) return esc(l.detail);
  return esc(l.detail.slice(0, at)) + `<span class="gv-tgt" style="color:${esc(t.color)}">${esc(t.name)}</span>` + esc(l.detail.slice(at + t.name.length));
}

const GROW_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4 H20 V10"></path><path d="M20 4 L13 11"></path><path d="M10 20 H4 V14"></path><path d="M4 20 L11 13"></path></svg>';
const CLOSE_SVG =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18"></path></svg>';

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
  private ribbon: HTMLElement;
  /** The ribbon's text and tone on screen, so a change flashes it and a refresh does not. */
  private shownStatus: string | null = null;
  /** The seat whose panel is highlighted (a token hovered), -1 for none. */
  private hlSeat = -1;
  /** The resolution log read wide (a click on it during a replay), and the model it shows. */
  private logOpen = false;
  private logModal: HTMLElement | null = null;
  private last: ShowdownModel | null = null;
  private onKey: (e: KeyboardEvent) => void;
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
    this.ribbon = document.createElement("div");
    this.ribbon.className = "gv-ribbon";
    this.ribbon.setAttribute("role", "status");
    this.left = document.createElement("aside");
    this.left.className = "gv-left";
    this.right = document.createElement("aside");
    this.right.className = "gv-right";
    this.bottom = document.createElement("section");
    this.bottom.className = "gv-bottom";
    this.root.append(this.header, this.ribbon, this.left, this.right, this.bottom);
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
        case "profile":
          return this.actions.profile(d.addr ?? "");
        case "log":
          return this.setLogOpen(true);
        case "unlog":
          return this.setLogOpen(false);
      }
    });
    this.onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.logOpen) this.setLogOpen(false);
    };
    window.addEventListener("keydown", this.onKey);
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
      gridTemplateRows: `${layout.header}px ${layout.ribbon}px 1fr ${layout.bottom}px`,
      gridTemplateColumns: `${layout.left}px 1fr ${layout.right}px`,
      gridTemplateAreas: '"header header header" "left ribbon right" "left . right" "bottom bottom bottom"',
      display: "grid",
    });
    this.header.innerHTML = this.headerHtml(m);
    // Rewritten only when it changes (the animation would restart on every
    // refresh), then flashed to draw the eye, except when the screen opens.
    const status = `${m.statusTone}|${m.status}`;
    if (status !== this.shownStatus) {
      const flash = this.shownStatus !== null && m.status ? " flash" : "";
      this.ribbon.innerHTML = m.status ? `<span class="gv-status ${m.statusTone}${flash}">${esc(m.status)}</span>` : "";
      this.shownStatus = status;
    }
    const coach = this.coachHtml(m);
    if (m.replay) {
      this.left.innerHTML = m.left.map((c) => this.charHtml(c, true)).join("");
      this.right.innerHTML = coach + this.logHtml(m);
      this.bottom.innerHTML = this.replayHtml(m);
    } else {
      // My plan goes with my character and the segment tracker; the other characters fill the right, compact when they are several.
      // My character and my plan share one panel, in my seat's colour.
      const me = m.left.length === 1 && m.left[0].you && m.plan ? m.left[0] : null;
      this.left.innerHTML = me
        ? `<div class="gv-panel gv-me" style="--rule:${esc(me.color)}">${this.charHtml(me, false, true)}${this.planHtml(m, true)}</div>`
        : m.left.map((c) => this.charHtml(c, false)).join("") + this.planHtml(m);
      // Titled Opponents beside my own character, Characters for a spectator.
      const title = m.left.some((c) => c.you) ? (m.others.length > 1 ? "Opponents" : "Opponent") : "Characters";
      this.right.innerHTML =
        coach +
        (m.others.length ? `<h2 class="gv-col-title">${title}</h2>` : "") + m.others.map((c) => this.charHtml(c, m.others.length > 1)).join("");
      this.bottom.innerHTML = this.handHtml(m);
    }
    this.highlightSeat(this.hlSeat); // the panels were rebuilt
    this.last = m;
    this.renderLogModal();
  }

  private setLogOpen(open: boolean) {
    this.logOpen = open;
    this.renderLogModal();
  }

  /** The wide log while it is open and a replay shows; it closes by itself when the replay ends. */
  private renderLogModal() {
    if (!this.last?.replay) this.logOpen = false;
    if (!this.logOpen || !this.last) {
      this.logModal?.remove();
      this.logModal = null;
      return;
    }
    if (!this.logModal) {
      this.logModal = document.createElement("div");
      this.root.append(this.logModal);
    }
    // Redrawn on every step of the replay: keep where the reader scrolled to.
    const top = this.logModal.querySelector(".gv-modal")?.scrollTop ?? 0;
    this.logModal.innerHTML = this.logModalHtml(this.last);
    const box = this.logModal.querySelector(".gv-modal");
    if (box) box.scrollTop = top;
  }

  /** Marks the panel of the character whose token is under the pointer (-1: none), scrolling it into view. */
  highlightSeat(seat: number) {
    this.hlSeat = seat;
    for (const el of Array.from(this.root.querySelectorAll<HTMLElement>(".gv-char[data-seat]"))) {
      const on = Number(el.dataset.seat) === seat;
      // My character shares its panel with my plan: the whole panel is outlined.
      const panel = el.closest<HTMLElement>(".gv-me") ?? el;
      if (on && !panel.classList.contains("hl")) panel.scrollIntoView({ block: "nearest" });
      panel.classList.toggle("hl", on);
    }
  }

  destroy() {
    window.removeEventListener("keydown", this.onKey);
    this.root.remove();
    this.preview.remove();
  }

  private headerHtml(m: ShowdownModel): string {
    return (
      `<button type="button" class="gv-lobby" data-act="btn" data-id="lobby">${BACK_SVG}Lobby</button>` +
      `<span class="gv-title">${esc(m.title)}</span>` +
      (m.error ? `<span class="gv-herr">${esc(m.error)}</span>` : `<div class="gv-lineup">${this.lineupHtml(m.lineup)}</div>`) +
      (m.share
        ? `<button type="button" class="gv-report" data-act="btn" data-id="share" title="${m.share === "join" ? "Copy an invitation to join, with the showdown's link" : "Copy the showdown's link, to watch it"}">Share</button>`
        : "") +
      `<a class="gv-report" href="${esc(m.reportUrl)}" target="_blank" rel="noopener" title="Open a GitHub issue about this game and turn">Report a bug</a>`
    );
  }

  /** A character's panel; bare, its content only, to go inside another panel (gv-me). */
  private charHtml(c: CharPanel, small: boolean, bare = false): string {
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
    const rule = c.color;
    return (
      `<button type="button" class="${bare ? "gv-bare" : "gv-panel"} gv-char${small ? " gv-small" : ""}${c.out ? " out" : ""}" style="--rule:${rule}" data-act="sheet" data-seat="${c.seat}" aria-label="${esc(c.name)}: open the character sheet">` +
      `<div class="gv-who">${tokenImg(c.charKey)}<div class="gv-who-txt">${c.you ? '<span class="gv-kicker">YOUR CHARACTER</span>' : ""}` +
      `<span class="gv-name">${esc(c.name)}</span>` +
      (c.player ? `<span class="gv-player" title="${esc(c.addr)}">${esc(c.player)}</span>` : "") +
      `<span class="gv-where">${esc(c.where)}</span></div>${badge}</div>${detail}</button>`
    );
  }

  /** The header's line-up: the seats' tokens and names, "vs" between them. */
  private lineupHtml(seats: HeaderSeat[]): string {
    return seats
      .map((s) => {
        const inner = (s.charKey ? tokenImg(s.charKey) : '<i class="gv-free"></i>') + `<b>${esc(s.name)}</b>${s.you ? "<small>YOU</small>" : ""}`;
        // A seat with a player opens its profile; an empty one, or mine while I set up, is only shown.
        if (!s.addr) return `<span class="gv-seat" style="--seat:${esc(s.color)}" title="${esc(s.name)}">${inner}</span>`;
        return (
          `<button type="button" class="gv-seat" style="--seat:${esc(s.color)}" data-act="profile" data-addr="${esc(s.addr)}" ` +
          `title="${esc(`${s.name} · ${s.player} · ${s.addr} · open the player's profile`)}">${inner}</button>`
        );
      })
      .join('<em class="gv-vs">vs</em>');
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

  private coachHtml(m: ShowdownModel): string {
    const c = m.coach;
    if (!c) return "";
    const buttons = c.buttons
      .map((b) => `<button type="button" class="gv-btn ${b.tone}" data-act="btn" data-id="${esc(b.id)}"${b.disabled ? " disabled" : ""}>${esc(b.label)}</button>`)
      .join("");
    return (
      `<section class="gv-panel gv-coach" aria-labelledby="gv-coach"><small>${esc(c.step)}</small><h2 id="gv-coach">${esc(c.title)}</h2>` +
      c.text.map((t) => `<p>${esc(t)}</p>`).join("") +
      (c.todo ? `<p class="gv-todo">${esc(c.todo)}</p>` : "") +
      (buttons ? `<div class="gv-buttons">${buttons}</div>` : "") +
      "</section>"
    );
  }

  private planHtml(m: ShowdownModel, bare = false): string {
    const p = m.plan;
    if (!p) return "";
    const lines = p.lines
      .map((l, i) => `<li><b>${i + 1}</b><div><strong>${esc(l.name)}</strong>${l.detail ? `<small>${detailHtml(l)}</small>` : ""}</div>${l.cost === undefined ? "" : `<em>${l.cost}</em>`}</li>`)
      .join("");
    const buttons = p.buttons
      .map(
        (b) =>
          `<button type="button" class="gv-btn ${b.tone}" data-act="btn" data-id="${esc(b.id)}"${b.disabled ? " disabled" : ""}>` +
          `${b.tone === "adena" ? '<img src="adena_icon.png" alt="">' : ""}${esc(b.label)}</button>`,
      )
      .join("");
    return (
      `<section class="${bare ? "gv-bare" : "gv-panel"} gv-plan" aria-labelledby="gv-plan"><div class="gv-plan-head"><h2 id="gv-plan">${esc(p.title)}</h2><span>${esc(p.points)}</span></div>` +
      this.trackerHtml(m.tracker) +
      (lines ? `<ol>${lines}</ol>` : `<p class="gv-empty">${esc(p.empty)}</p>`) +
      (p.note ? `<p class="gv-note${p.warn ? " warn" : ""}">${esc(p.note)}</p>` : "") +
      (p.you ? `<div class="gv-you">${tokenImg(p.you.charKey)}<div><small>YOU PLAY</small><span>${esc(p.you.name)}</span></div></div>` : "") +
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

  private logLines(m: ShowdownModel): string {
    const color = colorNames(m.replay!.names);
    return m.replay!.log.map((l) => (l.startsWith("    ") ? `<li class="sub">${color(l.trim())}</li>` : `<li>${color(l)}</li>`)).join("");
  }

  /** The resolution log on the right; a click anywhere on it opens it wider (logModalHtml). */
  private logHtml(m: ShowdownModel): string {
    return (
      `<section class="gv-panel gv-log" aria-labelledby="gv-log" data-act="log" title="Click to read it wider">` +
      `<div class="gv-log-head"><h2 id="gv-log">${esc(m.replay!.logTitle)}</h2>` +
      `<button type="button" class="gv-grow" data-act="log" aria-label="Read the log wider">${GROW_SVG}</button></div>` +
      `<ol>${this.logLines(m)}</ol></section>`
    );
  }

  /** The same log in a wide dialog over the screen, kept up to date while the replay moves on. */
  private logModalHtml(m: ShowdownModel): string {
    return (
      '<div class="gv-modal-back" data-act="unlog">' +
      `<section class="gv-panel gv-log gv-modal" role="dialog" aria-modal="true" aria-labelledby="gv-log-wide" data-act="none">` +
      `<h2 id="gv-log-wide">${esc(m.replay!.logTitle)}</h2><ol>${this.logLines(m)}</ol>` +
      `<button type="button" class="gv-x" data-act="unlog" aria-label="Close the log">${CLOSE_SVG}</button></section></div>`
    );
  }

  private replayHtml(m: ShowdownModel): string {
    const r = m.replay!;
    const heads = [1, 2, 3, 4, 5]
      .map((n) => `<button type="button" class="gv-head" data-act="seg" data-seg="${n}" aria-label="Show segment ${n}"${n === r.seg ? ' aria-current="step"' : ""}>${n === r.seg ? POINTER_SVG : n === 1 && r.seg === 0 ? `<span class="gv-start">${POINTER_SVG}</span>` : ""}${n}</button>`)
      .join("");
    const rows = r.rows
      .map(
        (row) =>
          `<span class="gv-rowname"><i class="gv-dot" style="background:${esc(row.color)}"></i>${tokenImg(row.charKey)}${esc(row.name)}</span>` +
          row.cells.map((c, i) => `<div class="gv-cell ${c.fill}${c.fill === "action" && !c.exec ? " prep" : ""}${i + 1 === r.seg ? " now" : ""}">${esc(c.label)}</div>`).join(""),
      )
      .join("");
    const dis = (on: boolean) => (on ? "" : " disabled");
    return (
      `<div class="gv-rp"><div class="gv-tl${r.rows.length > 2 ? " compact" : ""}"><span></span>${heads}${rows}</div>` +
      '<div class="gv-ctl"><div class="gv-ctl-row">' +
      `<button type="button" class="gv-ghost" data-act="btn" data-id="prevTurn"${dis(r.prevTurn)}>◀ Turn</button>` +
      // The turn number stands for segment 0, the turn start (the plans, SERIOUS fatigue).
      `<button type="button" class="gv-turn" data-act="seg" data-seg="0" aria-label="Turn ${esc(r.turnLabel)}: show its start">${esc(r.turnLabel)}</button>` +
      `<button type="button" class="gv-ghost" data-act="btn" data-id="nextTurn"${dis(r.nextTurn)}>Turn ▶</button></div>` +
      '<div class="gv-ctl-row">' +
      `<button type="button" class="gv-icon" data-act="btn" data-id="prevSeg" aria-label="Previous segment"${dis(r.prevSeg)}><svg width="20" height="20" viewBox="0 0 24 24" fill="#2A1C14" aria-hidden="true"><path d="M17 5 L7 12 L17 19 Z"></path></svg></button>` +
      `<button type="button" class="gv-play" data-act="btn" data-id="play">${r.playing ? "PAUSE" : "PLAY"}</button>` +
      `<button type="button" class="gv-icon" data-act="btn" data-id="nextSeg" aria-label="Next segment"${dis(r.nextSeg)}><svg width="20" height="20" viewBox="0 0 24 24" fill="#2A1C14" aria-hidden="true"><path d="M7 5 L17 12 L7 19 Z"></path></svg></button>` +
      "</div></div></div>" +
      // The replay, or a turn's playback, closes from the panel's top-right cross.
      (r.closeLabel === null ? "" : `<button type="button" class="gv-x" data-act="btn" data-id="close" aria-label="${esc(r.closeLabel)}" title="${esc(r.closeLabel)}">${CLOSE_SVG}</button>`)
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
