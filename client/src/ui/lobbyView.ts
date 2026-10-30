import { formatCoins } from "../chain/rpc";
import { spentNow, type SessionState } from "../chain/session";
import { reportUrl } from "../game/bugReport";
import { playerLabel, type GameSummary, type GamesView, type PlayersView, type Profile } from "../chain/types";
import { uprightTokenAngle } from "../rules";
import { charName, claimable, formatDuration, formatLeft, lobbySections, myResult, outcomeLine, runningOut, seatsTaken, secondsLeft, stillOffered } from "../game/lobby";
import { nextSeat, seatChar } from "../game/setup";
import { seatColor } from "./seats";
import { HOUSE_CUT_PERCENT, formatGnot, payoutLine, stakeLine, stakeOption, winnings } from "../game/stakes";

/**
 * The lobby, an HTML overlay over the canvas (like the character sheet), from
 * the "Screen · Lobby" mockup of the Design canvas (AGENTS.md, Design): the top
 * bar with the account, then "Your move", the games waiting on someone else,
 * the open showdowns to join and the finished ones, beside the New showdown
 * form, and under the form the top players. My address opens my profile, the
 * top players panel the whole ranking, a page at a time, in a dialog. The
 * scene owns the state and renders it again on every change.
 */

/** Players per page of the ranking dialog. */
export const PLAYERS_PAGE = 20;

/** The dialog over the lobby, if any. */
export type LobbyDialog =
  /** page: 0-based; players null while loading. */
  | { kind: "players"; page: number; players: PlayersView | null; error: string }
  /** This browser's session: what it is, and the terms of a new one. */
  | { kind: "session" };

/** Days a new session lasts. */
export const SESSION_DAYS = [1, 7, 30];
/** What a session may spend a day, in GNOT (fees and storage deposits: calling a showdown takes about 2.5). */
export const SESSION_LIMITS = [5, 10, 25];

export interface SessionModel {
  state: SessionState;
  /** Waiting on Adena or the chain for an enable or a revoke. */
  busy: boolean;
  error: string;
  daysIndex: number;
  limitIndex: number;
}

/** The browser notifications of my moves (game/notifications.ts). */
export interface NotificationsModel {
  /** Offered at all: a gnotif server is configured. */
  available: boolean;
  on: boolean;
  /** Waiting on the browser or the server for a change. */
  busy: boolean;
}

export interface LobbyModel {
  status: "connecting" | "ready" | "error";
  error: string;
  chainId: string;
  /** My address, "" until connected. */
  address: string;
  /** My registered name, "" if none. */
  name: string;
  /** "" while loading. */
  balance: string;
  locked: boolean;
  session: SessionModel;
  notifications: NotificationsModel;
  games: GamesView | null;
  /** The character I play in a game I create: the first seat's (joining, I play the next free seat's). */
  creatorChar: string;
  /** Seats of a new showdown, among seatOptions. */
  seats: number;
  seatOptions: number[];
  turns: number;
  turnOptions: number[];
  timeoutIndex: number;
  /** The stake of a new showdown, in ugnot, among stakeOptions (game/stakes.ts). */
  stake: number;
  stakeOptions: number[];
  timeoutOptions: { minutes: number; label: string }[];
  /** The first players of the ranking, null while loading. */
  topPlayers: PlayersView | null;
  /** Games whose plans are being revealed and where mine, held by this browser, waits for a click (auto-sign off). */
  revealIds: string[];
  /** Games with timelocked plans to open, their round out, waiting for a click (auto-sign off). */
  openIds: string[];
  /** The game whose reveal or opening the lobby is sending (auto-sign on), null if none. */
  revealingId: string | null;
  dialog: LobbyDialog | null;
  /** The welcome panel, until this browser closes it once (game/welcome.ts). */
  welcome: boolean;
}

export interface LobbyActions {
  retry(): void;
  quit(): void;
  /** How to play: the tutorial. */
  tutorial(): void;
  copyAddress(): void;
  open(id: string): void;
  join(id: string): void;
  create(): void;
  setSeats(seats: number): void;
  setTurns(turns: number): void;
  setTimeout(index: number): void;
  setStake(ugnot: number): void;
  openProfile(addr: string, fromPage: number | null): void;
  /** Opens the ranking dialog at a page (0-based). */
  openPlayers(page: number): void;
  openSession(): void;
  enableSession(): void;
  revokeSession(): void;
  setSessionDays(index: number): void;
  setSessionLimit(index: number): void;
  /** Turns the browser notifications of my moves on (the browser asks for permission) or off. */
  toggleNotifications(): void;
  closeDialog(): void;
  /** Closes the welcome panel for good. */
  closeWelcome(): void;
}

const CSS = `
.gl-root{position:fixed;inset:0;overflow-y:auto;z-index:400;background:#1E1618;font-family:'Zilla Slab',Rockwell,Georgia,serif;color:#2A1C14}
.gl-root *{box-sizing:border-box}
.gl-root button,.gl-root select{font-family:inherit}
.gl-root button:focus-visible,.gl-root select:focus-visible{outline:3px solid #F2B544;outline-offset:2px}
.gl-root button:disabled{opacity:.5;cursor:default}
.gl-top{background:#2A1C14;border-bottom:3px solid #5A4636;box-shadow:0 3px 0 #1E1618,0 5px 0 #5A4636}
.gl-top-in{max-width:80rem;margin:0 auto;padding:12px 24px;display:flex;align-items:center;gap:20px}
.gl-mark{flex-shrink:0;white-space:nowrap;font-family:Rye,Georgia,serif;font-size:30px;letter-spacing:2px;color:#F3E7CE}
.gl-nav{flex-shrink:0;white-space:nowrap;min-height:44px;padding:0 6px;background:transparent;border:0;color:#D9C9A8;font-size:18px;font-weight:700;cursor:pointer}
.gl-nav:hover{color:#F2B544}
.gl-report{display:flex;align-items:center;text-decoration:none}
.gl-right{margin-left:auto;min-width:0;display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:10px;color:#F3E7CE}
.gl-net{white-space:nowrap;font-size:15px;font-weight:700;border:2px solid #5A4636;border-radius:999px;padding:4px 12px}
.gl-session{white-space:nowrap;font-size:15px;font-weight:700;line-height:inherit;background:transparent;color:#F3E7CE;border:2px solid #5A4636;border-radius:999px;padding:4px 12px;cursor:pointer}
.gl-session:hover{border-color:#F3E7CE}
.gl-session.on{color:#F2B544;border-color:#F2B544}
.gl-session.on:hover{background:rgba(242,181,68,.12)}
.gl-session.ended{border-color:#B5482A}
.gl-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.gl-connect{display:flex;align-items:center;gap:10px;min-height:46px;margin:3px 3px 9px;padding:0 18px;background:#F3E7CE;color:#2A1C14;border:3px solid #2A1C14;border-radius:12px;box-shadow:0 0 0 3px #B5482A,0 6px 0 3px #8E2F1A;font-size:18px;font-weight:700;white-space:nowrap;cursor:pointer}
.gl-connect:hover{background:#FBF4E4}
.gl-connect img{width:28px;height:28px;flex-shrink:0}
.gl-account{display:flex;align-items:center;gap:8px;background:#F3E7CE;color:#2A1C14;border-radius:12px;padding:4px 6px 4px 12px}
.gl-icon{width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:transparent;border:0;border-radius:8px;cursor:pointer;color:#2A1C14}
.gl-icon:hover{background:#E9DCC0}
.gl-quit{min-height:44px;padding:0 14px;background:#2A1C14;color:#F3E7CE;border:0;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer}
.gl-quit:hover{background:#5A4636}
.gl-retry{min-height:44px;padding:0 16px;background:#F3E7CE;color:#2A1C14;border:2px solid #F3E7CE;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer}
.gl-error{color:#F2B544;font-size:16px;max-width:40rem}
.gl-main{max-width:80rem;margin:0 auto;padding:28px 24px 40px;display:flex;flex-wrap:wrap;align-items:flex-start;gap:24px}
.gl-col{flex:999 1 560px;min-width:0;display:flex;flex-direction:column;gap:24px}
.gl-panel{background:#F3E7CE;border:3px solid #2A1C14;border-radius:18px;box-shadow:inset 0 0 0 5px #F3E7CE,inset 0 0 0 7px #2A1C14;padding:22px 24px;display:flex;flex-direction:column;gap:14px}
.gl-panel.hot{box-shadow:inset 0 0 0 5px #F3E7CE,inset 0 0 0 7px #B5482A}
.gl-welcome .gl-head{align-items:center}
.gl-wl-lead{margin:0;font-size:18px;font-style:italic;color:#5A4636}
.gl-wl-sub{margin:-6px 0 0;font-size:16px;color:#2A1C14}
.gl-wl-tips{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:8px;font-size:17px;line-height:1.35}
.gl-wl-link{padding:0;background:transparent;border:0;color:#33307F;font-size:inherit;font-weight:700;text-decoration:underline;cursor:pointer}
.gl-wl-opts{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
.gl-wl-opts li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;background:#FBF4E4;border:2px solid #2A1C14;border-radius:12px;padding:10px 14px}
.gl-wl-opts li div{display:flex;flex-direction:column;gap:2px;flex:1 1 240px}
.gl-wl-opts b{font-size:18px}
.gl-wl-opts span{font-size:15px;color:#5A4636}
.gl-wl-on{font-weight:700;color:#4F7A3A !important;font-size:16px !important}
.gl-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;border-bottom:3px solid #2A1C14;padding-bottom:8px}
.gl-h2{margin:0;font-family:Rye,Georgia,serif;font-weight:400;font-size:26px}
.gl-h2.big{font-size:32px;color:#33307F}
.gl-count{font-size:17px;font-weight:700;color:#8E2F1A}
.gl-empty{margin:0;font-size:17px;font-style:italic;color:#5A4636}
.gl-card{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;background:#FBF4E4;border:2px solid #2A1C14;border-radius:12px;padding:12px 14px}
.gl-line{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;border-bottom:2px dashed #CBB892;padding:6px 4px 12px}
.gl-line:last-child{border-bottom:0;padding-bottom:4px}
.gl-crest{display:block;flex-shrink:0;width:44px;height:44px;border-radius:50%;background:#FBF4E4;box-shadow:0 0 0 3px var(--seat)}
.gl-card .gl-crest{width:52px;height:52px}
.gl-crest img{width:100%;height:100%}
.gl-what{flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:2px}
.gl-title{font-size:19px;font-weight:700;display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px}
.gl-vs{font-size:16px;font-style:italic;font-weight:400;color:#5A4636}
.gl-seat{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;background:transparent;border:0;border-radius:999px;padding:2px 8px 2px 2px;margin:-2px -8px -2px -2px;color:inherit;font:inherit;cursor:pointer}
.gl-seat:hover{background:#E9DCC0}
.gl-seat:hover b{text-decoration:underline}
.gl-seat img{width:28px;height:28px;border-radius:50%;background:#FBF4E4;box-shadow:0 0 0 2px var(--seat)}
.gl-seat small{font-size:15px;font-weight:400;color:#5A4636}
.gl-card .gl-title{font-size:20px}
.gl-detail{font-size:16px;color:#5A4636}
.gl-pill{font-size:16px;font-weight:700;color:#2A1C14;border:2px solid #2A1C14;border-radius:999px;padding:3px 12px;white-space:nowrap}
.gl-pill.late{color:#8E2F1A;border-color:#8E2F1A}
.gl-pill.over{color:#FBF4E4;background:#B5482A;border-color:#8E2F1A;font-family:Rye,Georgia,serif;font-weight:400;letter-spacing:1px}
.gl-pill.won,.gl-pill.lost,.gl-pill.draw{font-family:Rye,Georgia,serif;font-weight:400;letter-spacing:1px}
.gl-pill.won{color:#FBF4E4;background:#4F7A3A;border-color:#3A5C2B}
.gl-pill.lost{color:#FBF4E4;background:#B5482A;border-color:#8E2F1A}
.gl-card.over{border-color:#B5482A;box-shadow:inset 0 0 0 2px #B5482A;background:#F9E6D6}
.gl-play{min-height:46px;padding:0 22px;background:#B5482A;color:#FBF4E4;border:3px solid #2A1C14;border-radius:10px;box-shadow:0 4px 0 #2A1C14;font-family:Rye,Georgia,serif;font-size:18px;letter-spacing:1px;cursor:pointer}
.gl-play:hover:not(:disabled){background:#C65634}
.gl-open{min-height:44px;padding:0 18px;background:#FBF4E4;color:#2A1C14;border:2px solid #2A1C14;border-radius:10px;font-size:17px;font-weight:700;cursor:pointer}
.gl-open:hover:not(:disabled){background:#FFFFFF}
.gl-join{min-height:44px;padding:0 20px;background:#33307F;color:#FBF4E4;border:2px solid #2A1C14;border-radius:10px;box-shadow:0 4px 0 #2A1C14;font-size:17px;font-weight:700;cursor:pointer}
.gl-join:hover:not(:disabled){background:#403D96}
.gl-aside{flex:1 1 320px;min-width:0;margin-top:-12px;padding:12px;background:#2A1C14;border-radius:26px}
.gl-form{margin:0;background:#F3E7CE;border:3px solid #B5482A;border-radius:18px;box-shadow:inset 0 0 0 5px #F3E7CE,inset 0 0 0 7px #2A1C14;padding:24px 24px 26px;display:flex;flex-direction:column;gap:18px}
.gl-form .gl-h2{font-size:30px;color:#33307F;border-bottom:3px solid #2A1C14;padding-bottom:8px}
.gl-you{display:flex;align-items:center;gap:14px;background:#FBF4E4;border:2px solid #2A1C14;border-radius:12px;padding:10px 12px}
.gl-you img{width:56px;height:56px}
.gl-you small{display:block;font-size:14px;font-weight:700;letter-spacing:1.5px;color:#8E2F1A}
.gl-you span{font-family:Rye,Georgia,serif;font-size:22px}
.gl-field{display:flex;flex-direction:column;gap:6px}
.gl-field label{font-size:18px;font-weight:700}
.gl-field select{min-height:46px;padding:0 12px;background:#FBF4E4;color:#2A1C14;border:2px solid #2A1C14;border-radius:10px;font-size:18px}
.gl-note{font-size:15px;font-style:italic;color:#5A4636}
.gl-create{min-height:56px;background:#B5482A;color:#FBF4E4;border:3px solid #2A1C14;border-radius:12px;box-shadow:0 5px 0 #2A1C14;font-family:Rye,Georgia,serif;font-size:22px;letter-spacing:1.5px;cursor:pointer}
.gl-create:hover:not(:disabled){background:#C65634}
.gl-account-btn{display:flex;flex-direction:column;align-items:flex-start;line-height:1.15;background:transparent;border:0;border-radius:8px;padding:2px 6px;margin-left:-6px;color:inherit;text-align:left;cursor:pointer}
.gl-account-btn:hover{background:#E9DCC0}
.gl-account-btn b{font-size:16px}
.gl-account-btn span{font-size:14px;color:#5A4636}
.gl-ranks{margin-top:12px;background:#F3E7CE;border:3px solid #2A1C14;border-radius:18px;box-shadow:inset 0 0 0 5px #F3E7CE,inset 0 0 0 7px #2A1C14;padding:20px 22px 18px;display:flex;flex-direction:column;gap:10px;cursor:pointer}
.gl-ranks:hover{box-shadow:inset 0 0 0 5px #F3E7CE,inset 0 0 0 7px #B5482A}
.gl-ranks:focus-visible{outline:3px solid #F2B544;outline-offset:2px}
.gl-ranks .gl-h2{color:#33307F}
.gl-more{font-size:15px;font-style:italic;color:#5A4636;text-align:right}
.gl-table{width:100%;border-collapse:collapse;font-size:17px}
.gl-table th{font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#8E2F1A;text-align:right;padding:0 6px 4px;border-bottom:2px solid #2A1C14}
.gl-table th.l,.gl-table td.l{text-align:left}
.gl-table td{padding:7px 6px;text-align:right;border-bottom:2px dashed #CBB892;white-space:nowrap}
.gl-table tr:last-child td{border-bottom:0}
.gl-table td.who{max-width:0;width:100%;overflow:hidden;text-overflow:ellipsis;font-weight:700}
.gl-table td.rank{font-family:Rye,Georgia,serif;color:#5A4636;width:1%}
.gl-table tr.me td.who::after{content:" (you)";font-weight:400;font-style:italic;color:#5A4636}
.gl-table tbody tr[data-act]{cursor:pointer}
.gl-table tbody tr[data-act]:hover td{background:#FBF4E4}
.gl-back{position:fixed;inset:0;z-index:410;background:rgba(30,22,24,.72);display:flex;align-items:flex-start;justify-content:center;padding:72px 16px 24px;overflow-y:auto}
.gl-dialog{width:100%;max-width:34rem;background:#F3E7CE;border:3px solid #2A1C14;border-radius:18px;box-shadow:inset 0 0 0 5px #F3E7CE,inset 0 0 0 7px #2A1C14,0 10px 0 #1E1618;padding:22px 24px 24px;display:flex;flex-direction:column;gap:14px}
.gl-dialog .gl-head{align-items:center}
.gl-close{width:44px;height:44px;background:transparent;border:0;border-radius:8px;font-size:28px;line-height:1;color:#2A1C14;cursor:pointer}
.gl-close:hover{background:#E9DCC0}
.gl-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.gl-stat{background:#FBF4E4;border:2px solid #2A1C14;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}
.gl-stat b{font-family:Rye,Georgia,serif;font-weight:400;font-size:28px;color:#33307F}
.gl-stat span{font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#8E2F1A}
.gl-pager{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:16px;color:#5A4636}
`;

const COPY_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15 V5 a1 1 0 0 1 1 -1 H15"></path></svg>';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** A line's detail with the showdown's stake and pot, when it has one. */
function withStake(detail: string, g: GameSummary): string {
  const stake = stakeLine(g);
  return stake ? `${detail} · ${stake}` : detail;
}

/** A character's token, turned upright as on the character sheet. */
function tokenImg(char: string, cls = "gl-token"): string {
  return `<img class="${cls}" src="char_${esc(char)}.png" alt="" style="transform: rotate(${uprightTokenAngle(char)}deg)">`;
}

/** A showdown's line icon: the character I play (or would join as), ringed in its seat colour; the others are in the title's line-up. */
function crest(players: GameSummary["players"], seat: number): string {
  const char = players[seat]?.char || seatChar(seat);
  return `<span class="gl-crest" style="--seat:${seatColor(seat)}" title="${esc(charName(char))}">${tokenImg(char, "")}</span>`;
}

/** A word between the seats of a line-up ("vs", "With"), or a note after it. */
function vs(text: string): string {
  return `<em class="gl-vs">${esc(text)}</em>`;
}

/**
 * The seats given of a game, in a row's title: each character's token
 * ringed in its seat's colour and its name, the player's registered name
 * after it when it has one, the address on hover (an address on the line
 * was unreadable); a click opens the player's profile.
 */
function lineup(players: GameSummary["players"], seats: number[], sep = ""): string {
  return seats
    .map((i) => {
      const p = players[i];
      return (
        `<button type="button" class="gl-seat" style="--seat:${seatColor(i)}" data-act="profile" data-id="${esc(p.addr)}" title="${esc(`${charName(p.char)} · ${p.addr} · open the player's profile`)}">${tokenImg(p.char, "")}` +
        `<b>${esc(charName(p.char))}</b>${p.name ? `<small>${esc(p.name)}</small>` : ""}</button>`
      );
    })
    .join(sep);
}

export class LobbyView {
  private root: HTMLDivElement;

  constructor(private actions: LobbyActions) {
    if (!document.getElementById("gl-style")) {
      const style = document.createElement("style");
      style.id = "gl-style";
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = document.createElement("div");
    this.root.className = "gl-root";
    this.root.style.display = "none";
    this.root.addEventListener("click", (e) => {
      const el = (e.target as Element).closest<HTMLElement>("[data-act]");
      if (!el || (el as HTMLButtonElement).disabled) return;
      const id = el.dataset.id ?? "";
      const page = el.dataset.page === undefined ? null : Number(el.dataset.page);
      switch (el.dataset.act) {
        case "profile":
          return this.actions.openProfile(id, page);
        case "players":
          return this.actions.openPlayers(page ?? 0);
        case "session":
          return this.actions.openSession();
        case "session-on":
          return this.actions.enableSession();
        case "session-off":
          return this.actions.revokeSession();
        case "notif":
          return this.actions.toggleNotifications();
        case "close":
          return this.actions.closeDialog();
        case "welcome-close":
          return this.actions.closeWelcome();
        case "retry":
          return this.actions.retry();
        case "quit":
          return this.actions.quit();
        case "tutorial":
          return this.actions.tutorial();
        case "copy":
          return this.actions.copyAddress();
        case "open":
          return this.actions.open(id);
        case "join":
          return this.actions.join(id);
        case "create":
          return this.actions.create();
      }
    });
    this.root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.root.querySelector(".gl-back")) {
        this.actions.closeDialog();
        return;
      }
      // The top players panel is a button.
      if ((e.key === "Enter" || e.key === " ") && (e.target as Element).classList.contains("gl-ranks")) {
        e.preventDefault();
        this.actions.openPlayers(0);
      }
    });
    this.root.addEventListener("change", (e) => {
      const el = e.target as HTMLSelectElement;
      if (el.id === "gl-seats") this.actions.setSeats(Number(el.value));
      if (el.id === "gl-turns") this.actions.setTurns(Number(el.value));
      if (el.id === "gl-timeout") this.actions.setTimeout(Number(el.value));
      if (el.id === "gl-stake") this.actions.setStake(Number(el.value));
      if (el.id === "gl-session-days") this.actions.setSessionDays(Number(el.value));
      if (el.id === "gl-session-limit") this.actions.setSessionLimit(Number(el.value));
    });
    document.body.appendChild(this.root);
  }

  render(m: LobbyModel) {
    this.root.innerHTML = this.top(m) + `<main class="gl-main">${this.lists(m)}${this.form(m)}</main>` + this.dialog(m);
    this.root.style.display = "block";
  }

  hide() {
    this.root.style.display = "none";
  }

  destroy() {
    this.root.remove();
  }

  private top(m: LobbyModel): string {
    let right: string;
    if (m.status === "ready") {
      // Adena locked: the account box gives way to Connect with Adena (the splash's button), which connects again, through Adena's unlock.
      const account = m.locked
        ? '<button type="button" class="gl-connect" data-act="retry"><img src="adena_icon.png" alt="">Connect with Adena</button>'
        : `<div class="gl-account"><button type="button" class="gl-account-btn" data-act="profile" data-id="${esc(m.address)}" title="My profile · ${esc(m.address)}">` +
          `<b>${esc(playerLabel({ addr: m.address, name: m.name }))}</b><span>${esc(m.balance || "…")}</span></button>` +
          `<button type="button" class="gl-icon" data-act="copy" aria-label="Copy my address">${COPY_ICON}</button>` +
          '<button type="button" class="gl-quit" data-act="quit">Quit</button></div>';
      right = `<span class="gl-net">${esc(m.chainId)} network</span>` + this.sessionPill(m.session) + this.notifPill(m.notifications) + account;
    } else if (m.status === "connecting") {
      right = "<span>Connecting to Adena…</span>";
    } else {
      right = `<span class="gl-error">${esc(m.error)}</span><button type="button" class="gl-retry" data-act="retry">Retry</button>`;
    }
    const report = reportUrl({ shown: "lobby", address: m.address });
    return (
      `<header class="gl-top"><div class="gl-top-in"><span class="gl-mark">GNOSLINGER</span><button type="button" class="gl-nav" data-act="tutorial">How to play</button>` +
      `<a class="gl-nav gl-report" href="${esc(report)}" target="_blank" rel="noopener" title="Open a GitHub issue">Report a bug</a><div class="gl-right">${right}</div></div></header>`
    );
  }

  /** The session's pill in the top bar; it opens the session dialog. */
  private sessionPill(s: SessionModel): string {
    const st = s.state;
    if (st.kind === "active") {
      const left = st.info.expiresAt ? ` · ${formatLeft(Math.max(0, st.info.expiresAt - Date.now() / 1000))}` : "";
      return `<button type="button" class="gl-session on" data-act="session" title="Your moves are signed without Adena popups">Auto-sign on${esc(left)}</button>`;
    }
    const cls = st.kind === "ended" ? " ended" : "";
    return `<button type="button" class="gl-session${cls}" data-act="session" title="Sign your moves without Adena popups">Auto-sign off</button>`;
  }

  /** The notifications pill in the top bar: this browser told of my moves, or not. */
  private notifPill(n: NotificationsModel): string {
    if (!n.available) return "";
    const dis = n.busy ? " disabled" : "";
    if (n.on) {
      return `<button type="button" class="gl-session on" data-act="notif"${dis} title="This browser is told when it is your move, even with the game closed">Notifications on</button>`;
    }
    return `<button type="button" class="gl-session" data-act="notif"${dis} title="Be told when it is your move, even with the game closed">Notifications off</button>`;
  }

  /**
   * The first time this browser sees the lobby: how to start or join a
   * showdown, and an invitation to turn on auto-sign and notifications,
   * each with its button while it is off.
   */
  private welcomePanel(m: LobbyModel): string {
    const on = '<span class="gl-wl-on">✓ On</span>';
    const session = m.session.state.kind === "active" ? on : '<button type="button" class="gl-join" data-act="session">Turn on auto-sign</button>';
    const notif = !m.notifications.available
      ? ""
      : `<li><div><b>Notifications</b><span>Be told when it is your move, even with the game closed: showdowns last days.</span></div>` +
        (m.notifications.on ? on : `<button type="button" class="gl-join" data-act="notif"${m.notifications.busy ? " disabled" : ""}>Turn on notifications</button>`) +
        "</li>";
    return (
      '<section class="gl-panel hot gl-welcome" aria-labelledby="gl-welcome">' +
      '<div class="gl-head"><h2 id="gl-welcome" class="gl-h2 big">Welcome, stranger</h2>' +
      '<button type="button" class="gl-close" data-act="welcome-close" aria-label="Close the welcome">×</button></div>' +
      '<p class="gl-wl-lead">Gunfights in the Old West, five segments a turn, settled on the gno.land chain.</p>' +
      '<p class="gl-wl-sub">Each turn is two seconds of the fight: a gunfight played in slow motion, where every step, every draw and every shot counts. Twenty turns make forty seconds of lead, played over days.</p>' +
      '<ol class="gl-wl-tips">' +
      "<li><b>Call a showdown</b> with the form on the right: the number of players, the turns, the time per turn and a stake if you like. You take position on the board, then sign.</li>" +
      "<li><b>Or join one</b> under Open showdowns (Open shows it first), or open the link a friend shared with you.</li>" +
      "<li><b>Each turn</b> you pick up to 5 time points of action cards in secret. Once every plan is in, they are revealed and play out together.</li>" +
      '<li><b>New to the game?</b> <button type="button" class="gl-wl-link" data-act="tutorial">How to play</button> walks you through a duel against the Kid.</li>' +
      "</ol>" +
      '<ul class="gl-wl-opts">' +
      `<li><div><b>Auto-sign</b><span>Sign your moves without an Adena popup each time, within a daily spending limit.</span></div>${session}</li>` +
      notif +
      "</ul>" +
      '<div class="gl-actions"><button type="button" class="gl-open" data-act="welcome-close">Got it</button></div>' +
      "</section>"
    );
  }

  private lists(m: LobbyModel): string {
    if (m.status !== "ready" || !m.games) {
      const msg = m.status === "error" ? "Connect Adena to see your showdowns." : "Loading your showdowns…";
      return `<div class="gl-col"><section class="gl-panel"><p class="gl-empty">${msg}</p></section></div>`;
    }
    const now = Date.now() / 1000;
    const s = lobbySections(
      m.games,
      m.address,
      now,
      (g) => m.revealIds.includes(g.id),
      (g) => m.openIds.includes(g.id),
    );
    // The seats taken, mine aside or not.
    const seated = (g: GameSummary, mine: boolean) => g.players.map((p, i) => i).filter((i) => g.players[i].addr && (mine || g.players[i].addr !== m.address));
    // The creator holds seat 0.
    const gameLabel = (g: GameSummary) => `Game ${g.id} · created by ${g.players[0]?.addr === m.address ? "you" : charName(g.players[0]?.char)}`;
    // A row's title (HTML): the others in the showdown.
    const versus = (g: GameSummary) => {
      const o = seated(g, false);
      if (g.phase === "waiting") return (o.length === 0 ? vs("Waiting for players") : vs("With") + lineup(g.players, o)) + vs(`· ${seatsTaken(g)}`);
      return vs("vs") + lineup(g.players, o);
    };
    // The lobby lists my games: I hold a seat in each (seat 0 should I not).
    const mySeat = (g: GameSummary) => Math.max(0, g.players.findIndex((p) => p.addr === m.address));
    // A row's crest is the seat I hold; anyone's showdown has none, its line-up naming every seat.
    const row = (cls: string, g: GameSummary, title: string, detail: string, extra: string, seat: number | null = mySeat(g)) =>
      `<div class="${cls}">${seat === null ? "" : crest(g.players, seat)}<div class="gl-what">` +
      `<span class="gl-title">${title}</span><span class="gl-detail">${esc(detail)}</span></div>${extra}</div>`;

    const yourMove = s.yourMove
      .map((g) => {
        const left = secondsLeft(g, now);
        const turn = `${gameLabel(g)} · Turn ${g.turn} of ${g.maxTurns}`;
        const btn = (label: string) =>
          g.id === m.revealingId
            ? '<button type="button" class="gl-play" disabled>REVEALING…</button>'
            : `<button type="button" class="gl-play" data-act="open" data-id="${esc(g.id)}">${label}</button>`;
        if (g.phase === "revealing" && m.openIds.includes(g.id) && !m.revealIds.includes(g.id)) {
          return row("gl-card", g, versus(g), `${turn} · plans left unrevealed: open them from their timelocked copies`, btn("OPEN"));
        }
        if (g.phase === "revealing" && m.revealIds.includes(g.id)) return row("gl-card", g, versus(g), `${turn} · every plan is in: reveal yours`, btn("REVEAL"));
        if (claimable(g, now)) {
          const mine = g.players.find((p) => p.addr === m.address);
          // As the game screen puts it: the turn goes on without the late ones, an empty turn if nobody played.
          const why =
            g.phase === "revealing"
              ? "plans were not revealed in time"
              : !g.players.some((p) => p.committed)
                ? "nobody played in time"
                : mine && !mine.committed && mine.status === "alive"
                  ? "your plan did not come in time"
                  : "the others did not play in time";
          return row("gl-card over", g, versus(g), `${turn} · ${why}: call time to go on`, '<span class="gl-pill over">OUT OF TIME</span>' + btn("CALL TIME"));
        }
        const pill = `<span class="gl-pill${runningOut(left, g.timeout) ? " late" : ""}">${esc(formatLeft(left))} left</span>`;
        return row("gl-card", g, versus(g), withStake(turn, g), pill + btn("PLAY"));
      })
      .join("");
    const count = s.yourMove.length;
    const toReveal = (g: GameSummary) => g.phase === "revealing" && (m.revealIds.includes(g.id) || m.openIds.includes(g.id));
    const reveals = s.yourMove.filter(toReveal).length;
    const claims = s.yourMove.filter((g) => claimable(g, now) && !toReveal(g)).length;
    const plans = count - claims - reveals;
    const countLine = [
      plans ? `${plans} showdown${plans > 1 ? "s wait" : " waits"} for your plan` : "",
      reveals ? `${reveals} to reveal` : "",
      claims ? `${claims} out of time` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const yourMovePanel =
      `<section class="gl-panel hot" aria-labelledby="gl-your-move"><div class="gl-head"><h2 id="gl-your-move" class="gl-h2 big">Your move</h2>` +
      (countLine ? `<span class="gl-count">${countLine}</span>` : "") +
      `</div>${yourMove || '<p class="gl-empty">No showdown waits for your plan.</p>'}</section>`;

    const openBtn = (g: GameSummary, label = "Open") =>
      g.id === m.revealingId
        ? '<button type="button" class="gl-open" disabled>Revealing…</button>'
        : `<button type="button" class="gl-open" data-act="open" data-id="${esc(g.id)}">${label}</button>`;
    const waiting = s.waiting
      .map((g) => {
        if (g.phase === "waiting") return row("gl-line", g, versus(g), withStake(`${gameLabel(g)} · ${g.maxTurns} turns · ${formatDuration(g.timeout)} per turn`, g), openBtn(g));
        const where = g.phase === "revealing" ? "revealing the plans" : `your plan is in · ${formatLeft(secondsLeft(g, now))} left to play`;
        return row("gl-line", g, versus(g), `${gameLabel(g)} · Turn ${g.turn} of ${g.maxTurns} · ${where}`, openBtn(g));
      })
      .join("");
    const panel = (id: string, title: string, body: string) =>
      `<section class="gl-panel" aria-labelledby="${id}"><div class="gl-head"><h2 id="${id}" class="gl-h2">${title}</h2></div>${body}</section>`;

    // A showdown nobody joined for a week is no longer offered (the realm keeps
    // it open). Open shows it first, as a spectator, where Join is offered too.
    const open = s.open
      .filter((g) => stillOffered(g, now) && nextSeat(g.players) >= 0)
      .map((g) => {
        const seat = nextSeat(g.players);
        return (
          `<div class="gl-line">${crest(g.players, seat)}<div class="gl-what">` +
          `<span class="gl-title">${lineup(g.players, seated(g, true), vs("vs"))}</span>` +
          `<span class="gl-detail">${esc(withStake(`Game ${g.id} · ${seatsTaken(g)} · ${g.maxTurns} turns · ${formatDuration(g.timeout)} per turn`, g))}</span></div>` +
          openBtn(g) +
          `<button type="button" class="gl-join" data-act="join" data-id="${esc(g.id)}">Join as ${esc(charName(seatChar(seat)))}${g.stake ? ` · ${esc(formatGnot(g.stake))}` : ""}</button></div>`
        );
      })
      .join("");

    // Anyone's showdown being played, opened as a spectator.
    const live = s.live
      .map((g) => {
        const title = lineup(g.players, seated(g, true), vs("vs"));
        const where = g.phase === "revealing" ? "revealing the plans" : "planning";
        return row("gl-line", g, title, withStake(`Game ${g.id} · Turn ${g.turn} of ${g.maxTurns} · ${where}`, g), openBtn(g, "Watch"), null);
      })
      .join("");

    // Anyone's showdown finished lately, replayed as a spectator.
    const ended = s.ended
      .map((g) => {
        const title = lineup(g.players, seated(g, true), vs("vs"));
        return row("gl-line", g, title, withStake(`Game ${g.id} · ${outcomeLine(g, "")}`, g), openBtn(g, "Replay"), null);
      })
      .join("");

    const finished = s.finished
      .map((g) => {
        const paid = payoutLine(g, g.players.findIndex((p) => p.addr === m.address));
        const result = myResult(g, m.address);
        const pill = result ? `<span class="gl-pill ${result}">${result.toUpperCase()}</span>` : "";
        return row("gl-line", g, versus(g), `${gameLabel(g)} · ${outcomeLine(g, m.address)}${paid ? ` · ${paid}` : ""}`, pill + openBtn(g, "Replay"));
      })
      .join("");

    return (
      '<div class="gl-col">' +
      (m.welcome ? this.welcomePanel(m) : "") +
      yourMovePanel +
      (waiting ? panel("gl-waiting", "Waiting on others", waiting) : "") +
      panel("gl-open-games", "Open showdowns", open || '<p class="gl-empty">No showdown is waiting for a player: call one.</p>') +
      (live ? panel("gl-live", "Current showdowns", live) : "") +
      (ended ? panel("gl-ended", "Recently finished", ended) : "") +
      (finished ? panel("gl-finished", "Finished", finished) : "") +
      "</div>"
    );
  }

  private form(m: LobbyModel): string {
    const seats = m.seatOptions.map((n) => `<option value="${n}"${n === m.seats ? " selected" : ""}>${n}</option>`).join("");
    // Who sits where: the creator first, then the seats in the order the players join.
    const lineUp = Array.from({ length: m.seats }, (_, i) => `<span style="color:${seatColor(i)}">${esc(charName(seatChar(i)))}</span>`).join(", ");
    const turns = m.turnOptions.map((t) => `<option value="${t}"${t === m.turns ? " selected" : ""}>${t}</option>`).join("");
    const timeouts = m.timeoutOptions.map((o, i) => `<option value="${i}"${i === m.timeoutIndex ? " selected" : ""}>${esc(o.label)}</option>`).join("");
    const stakes = m.stakeOptions.map((s) => `<option value="${s}"${s === m.stake ? " selected" : ""}>${esc(stakeOption(s))}</option>`).join("");
    const stakeNote = m.stake
      ? `Every player puts ${formatGnot(m.stake)} in, signed in Adena. The winner takes ${formatGnot(winnings(m.stake, m.seats))}, the house keeping ${HOUSE_CUT_PERCENT}% for events; a draw splits it; a showdown cancelled, or that everyone lets run out of time, gives the stakes back.`
      : "Played for the glory and the ranking only.";
    const disabled = m.status !== "ready" ? " disabled" : "";
    return (
      '<aside class="gl-aside" aria-labelledby="gl-new"><form class="gl-form">' +
      '<h2 id="gl-new" class="gl-h2">New showdown</h2>' +
      `<div class="gl-you">${tokenImg(m.creatorChar, "")}<div><small>YOU PLAY</small><span>${esc(charName(m.creatorChar))}</span></div></div>` +
      `<div class="gl-field"><label for="gl-seats">Players</label><select id="gl-seats">${seats}</select>` +
      `<span class="gl-note">Each on their own, in the order they join: ${lineUp}.</span></div>` +
      `<div class="gl-field"><label for="gl-turns">Turns</label><select id="gl-turns">${turns}</select></div>` +
      `<div class="gl-field"><label for="gl-timeout">Time to play each turn</label><select id="gl-timeout">${timeouts}</select>` +
      '<span class="gl-note">Past it, anyone may call time: a player who did not play passes it, and is out of the fight at the third in a row.</span></div>' +
      `<div class="gl-field"><label for="gl-stake">Stake</label><select id="gl-stake">${stakes}</select>` +
      `<span class="gl-note">${esc(stakeNote)}</span></div>` +
      `<button type="button" class="gl-create" data-act="create"${disabled}>CALL A SHOWDOWN</button>` +
      '<span class="gl-note">Next you take position on the board, then sign the call.</span>' +
      "</form>" +
      this.topPlayers(m) +
      "</aside>"
    );
  }

  /** The first players of the ranking; a click anywhere on it opens the whole list. */
  private topPlayers(m: LobbyModel): string {
    if (m.status !== "ready") return "";
    const top = m.topPlayers;
    let body: string;
    if (!top) body = '<p class="gl-empty">Loading the players…</p>';
    else if (top.players.length === 0) body = '<p class="gl-empty">Nobody has drawn yet.</p>';
    else body = this.playersTable(top.players, m.address, null) + `<span class="gl-more">All ${top.total} player${top.total > 1 ? "s" : ""} ›</span>`;
    return (
      '<section class="gl-ranks" data-act="players" role="button" tabindex="0" aria-labelledby="gl-top-guns">' +
      `<div class="gl-head"><h2 id="gl-top-guns" class="gl-h2">Top guns</h2></div>${body}</section>`
    );
  }

  /** fromPage: each row opens its player's profile, which can go back to that page; null leaves the rows inert. */
  private playersTable(players: Profile[], me: string, fromPage: number | null): string {
    const rows = players
      .map((p) => {
        const act = fromPage === null ? "" : ` data-act="profile" data-id="${esc(p.addr)}" data-page="${fromPage}"`;
        return (
          `<tr${p.addr === me ? ' class="me"' : ""}${act}><td class="rank">${p.rank}</td>` +
          `<td class="who l" title="${esc(p.addr)}">${esc(playerLabel(p))}</td>` +
          `<td>${p.gamesPlayed}</td><td>${p.victoryPoints}</td></tr>`
        );
      })
      .join("");
    return `<table class="gl-table"><thead><tr><th>#</th><th class="l">Player</th><th>Games</th><th>VP</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private dialog(m: LobbyModel): string {
    const d = m.dialog;
    if (!d) return "";
    const title =
      d.kind === "players" ? "All players" : "Auto-sign";
    const body = d.kind === "players" ? this.playersBody(d, m.address) : this.sessionBody(m.session);
    return (
      '<div class="gl-back" data-act="close">' +
      '<section class="gl-dialog" role="dialog" aria-modal="true" aria-labelledby="gl-dialog-title" data-act="none">' +
      `<div class="gl-head"><h2 id="gl-dialog-title" class="gl-h2">${esc(title)}</h2>` +
      '<button type="button" class="gl-close" data-act="close" aria-label="Close">×</button></div>' +
      body +
      "</section></div>"
    );
  }

  private sessionBody(s: SessionModel): string {
    const st = s.state;
    const off = s.busy ? " disabled" : "";
    let body =
      '<span class="gl-note">A key kept in this browser signs your moves, so Adena asks only once, to create it. ' +
      "The chain lets it play Gnoslinger and nothing else, until it expires, and spend at most a limit a day from your account " +
      "(fees and storage deposits: calling a showdown takes about 2.5 GNOT, a turn about 0.3). Past the limit, Adena signs again.</span>";
    if (st.kind === "active") {
      const i = st.info;
      const now = Date.now() / 1000;
      const left = i.expiresAt ? formatLeft(Math.max(0, i.expiresAt - now)) : "never";
      body +=
        '<div class="gl-stats">' +
        `<div class="gl-stat"><b>${esc(left)}</b><span>Left</span></div>` +
        `<div class="gl-stat"><b>${esc(formatCoins(`${spentNow(i, now)}ugnot`))}</b><span>Spent of ${esc(formatCoins(`${i.spendLimit}ugnot`))} today</span></div>` +
        `</div><span class="gl-addr">Key ${esc(i.addr)}</span>` +
        `<div class="gl-actions"><button type="button" class="gl-open" data-act="session-off"${off}>Revoke</button>` +
        `<span class="gl-note">${s.busy ? "Waiting for Adena…" : "Revoking takes one Adena signature."}</span></div>`;
    } else {
      if (st.kind === "ended") body += `<p class="gl-empty">Your last key stopped working: ${esc(st.reason)}.</p>`;
      const days = SESSION_DAYS.map((d, i) => `<option value="${i}"${i === s.daysIndex ? " selected" : ""}>${d} day${d > 1 ? "s" : ""}</option>`).join("");
      const limits = SESSION_LIMITS.map((g, i) => `<option value="${i}"${i === s.limitIndex ? " selected" : ""}>${g} GNOT a day</option>`).join("");
      body +=
        `<div class="gl-field"><label for="gl-session-days">For</label><select id="gl-session-days"${off}>${days}</select></div>` +
        `<div class="gl-field"><label for="gl-session-limit">Spending at most</label><select id="gl-session-limit"${off}>${limits}</select></div>` +
        `<div class="gl-actions"><button type="button" class="gl-join" data-act="session-on"${off}>Turn on</button>` +
        `<span class="gl-note">${s.busy ? "Waiting for Adena…" : "One Adena signature."}</span></div>`;
    }
    if (s.error) body += `<p class="gl-empty">${esc(s.error)}</p>`;
    return body;
  }

  private playersBody(d: Extract<LobbyDialog, { kind: "players" }>, me: string): string {
    const v = d.players;
    if (d.error) return `<p class="gl-empty">${esc(d.error)}</p>`;
    if (!v) return '<p class="gl-empty">Loading…</p>';
    if (v.players.length === 0) return '<p class="gl-empty">Nobody has drawn yet.</p>';
    const pages = Math.max(1, Math.ceil(v.total / PLAYERS_PAGE));
    const btn = (page: number, label: string, off: boolean) =>
      `<button type="button" class="gl-open" data-act="players" data-page="${page}"${off ? " disabled" : ""}>${label}</button>`;
    return (
      this.playersTable(v.players, me, d.page) +
      `<div class="gl-pager">${btn(d.page - 1, "‹ Prev", d.page <= 0)}<span>Page ${d.page + 1} of ${pages}</span>${btn(d.page + 1, "Next ›", d.page + 1 >= pages)}</div>`
    );
  }
}
