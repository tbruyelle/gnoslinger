import { shortAddr, type GameSummary, type GamesView } from "../chain/types";
import { uprightTokenAngle } from "../rules";
import { charName, formatDuration, formatLeft, lobbySections, outcomeLine, runningOut, secondsLeft } from "../game/lobby";

/**
 * The lobby, an HTML overlay over the canvas (like the character sheet), from
 * the "Screen · Lobby" mockup of the Design canvas (AGENTS.md, Design): the top
 * bar with the account, then "Your move", the games waiting on someone else,
 * the open showdowns to join and the finished ones, beside the New showdown
 * form. The scene owns the state and renders it again on every change.
 */

export interface LobbyModel {
  status: "connecting" | "ready" | "error";
  error: string;
  chainId: string;
  /** My address, "" until connected. */
  address: string;
  /** "" while loading. */
  balance: string;
  locked: boolean;
  /** A wallet action is in flight: actions are disabled. */
  busy: boolean;
  games: GamesView | null;
  /** The character I play in a game I create / join. */
  creatorChar: string;
  joinerChar: string;
  turns: number;
  turnOptions: number[];
  timeoutIndex: number;
  timeoutOptions: { minutes: number; label: string }[];
}

export interface LobbyActions {
  retry(): void;
  quit(): void;
  copyAddress(): void;
  open(id: string): void;
  join(id: string): void;
  create(): void;
  setTurns(turns: number): void;
  setTimeout(index: number): void;
}

const CSS = `
.gl-root{position:fixed;inset:0;overflow-y:auto;z-index:400;background:#1E1618;font-family:'Zilla Slab',Rockwell,Georgia,serif;color:#2A1C14}
.gl-root *{box-sizing:border-box}
.gl-root button,.gl-root select{font-family:inherit}
.gl-root button:focus-visible,.gl-root select:focus-visible{outline:3px solid #F2B544;outline-offset:2px}
.gl-root button:disabled{opacity:.5;cursor:default}
.gl-top{background:#2A1C14;border-bottom:3px solid #5A4636;box-shadow:0 3px 0 #1E1618,0 5px 0 #5A4636}
.gl-top-in{max-width:80rem;margin:0 auto;padding:12px 24px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 28px}
.gl-mark{font-family:Rye,Georgia,serif;font-size:30px;letter-spacing:2px;color:#F3E7CE}
.gl-right{margin-left:auto;display:flex;flex-wrap:wrap;align-items:center;gap:12px;color:#F3E7CE}
.gl-net{font-size:15px;font-weight:700;border:2px solid #5A4636;border-radius:999px;padding:4px 12px}
.gl-locked{font-size:15px;font-weight:700;background:#B5482A;color:#FBF4E4;border-radius:999px;padding:4px 12px}
.gl-account{display:flex;align-items:center;gap:8px;background:#F3E7CE;color:#2A1C14;border-radius:12px;padding:4px 6px 4px 12px}
.gl-account-id{display:flex;flex-direction:column;line-height:1.15}
.gl-account-id b{font-size:16px}
.gl-account-id span{font-size:14px;color:#5A4636}
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
.gl-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;border-bottom:3px solid #2A1C14;padding-bottom:8px}
.gl-h2{margin:0;font-family:Rye,Georgia,serif;font-weight:400;font-size:26px}
.gl-h2.big{font-size:32px;color:#33307F}
.gl-count{font-size:17px;font-weight:700;color:#8E2F1A}
.gl-empty{margin:0;font-size:17px;font-style:italic;color:#5A4636}
.gl-card{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;background:#FBF4E4;border:2px solid #2A1C14;border-radius:12px;padding:12px 14px}
.gl-line{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;border-bottom:2px dashed #CBB892;padding:6px 4px 12px}
.gl-line:last-child{border-bottom:0;padding-bottom:4px}
.gl-token{width:44px;height:44px;flex-shrink:0}
.gl-card .gl-token{width:52px;height:52px}
.gl-what{flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:2px}
.gl-title{font-size:19px;font-weight:700}
.gl-card .gl-title{font-size:20px}
.gl-detail{font-size:16px;color:#5A4636}
.gl-pill{font-size:16px;font-weight:700;color:#2A1C14;border:2px solid #2A1C14;border-radius:999px;padding:3px 12px;white-space:nowrap}
.gl-pill.late{color:#8E2F1A;border-color:#8E2F1A}
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
`;

const COPY_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15 V5 a1 1 0 0 1 1 -1 H15"></path></svg>';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** A character's token, turned upright as on the character sheet. */
function tokenImg(char: string, cls = "gl-token"): string {
  return `<img class="${cls}" src="char_${esc(char)}.png" alt="" style="transform: rotate(${uprightTokenAngle(char)}deg)">`;
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
      switch (el.dataset.act) {
        case "retry":
          return this.actions.retry();
        case "quit":
          return this.actions.quit();
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
    this.root.addEventListener("change", (e) => {
      const el = e.target as HTMLSelectElement;
      if (el.id === "gl-turns") this.actions.setTurns(Number(el.value));
      if (el.id === "gl-timeout") this.actions.setTimeout(Number(el.value));
    });
    document.body.appendChild(this.root);
  }

  render(m: LobbyModel) {
    this.root.innerHTML = this.top(m) + `<main class="gl-main">${this.lists(m)}${this.form(m)}</main>`;
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
      right =
        `<span class="gl-net">${esc(m.chainId)} network</span>` +
        (m.locked ? '<span class="gl-locked">Adena locked</span>' : "") +
        `<div class="gl-account"><div class="gl-account-id"><b title="${esc(m.address)}">${esc(shortAddr(m.address))}</b>` +
        `<span>${esc(m.balance || "…")}</span></div>` +
        `<button type="button" class="gl-icon" data-act="copy" aria-label="Copy my address">${COPY_ICON}</button>` +
        '<button type="button" class="gl-quit" data-act="quit">Quit</button></div>';
    } else if (m.status === "connecting") {
      right = "<span>Connecting to Adena…</span>";
    } else {
      right = `<span class="gl-error">${esc(m.error)}</span><button type="button" class="gl-retry" data-act="retry">Retry</button>`;
    }
    return `<header class="gl-top"><div class="gl-top-in"><span class="gl-mark">GNOSLINGER</span><div class="gl-right">${right}</div></div></header>`;
  }

  private lists(m: LobbyModel): string {
    if (m.status !== "ready" || !m.games) {
      const msg = m.status === "error" ? "Connect Adena to see your showdowns." : "Loading your showdowns…";
      return `<div class="gl-col"><section class="gl-panel"><p class="gl-empty">${msg}</p></section></div>`;
    }
    const s = lobbySections(m.games, m.address);
    const now = Date.now() / 1000;
    const dis = m.busy ? " disabled" : "";
    const others = (g: GameSummary) => g.players.filter((p) => p.addr && p.addr !== m.address);
    // The creator holds seat 0.
    const gameLabel = (g: GameSummary) => `Game ${g.id} · created by ${g.players[0]?.addr === m.address ? "you" : charName(g.players[0]?.char)}`;
    const versus = (g: GameSummary) => {
      const o = others(g);
      return o.length === 0 ? "Waiting for a second player" : "vs " + o.map((p) => `${charName(p.char)} · ${shortAddr(p.addr)}`).join(", ");
    };
    const token = (g: GameSummary) => others(g)[0]?.char ?? g.players.find((p) => p.addr === m.address)?.char ?? m.creatorChar;
    const row = (cls: string, g: GameSummary, title: string, detail: string, extra: string) =>
      `<div class="${cls}">${tokenImg(token(g))}<div class="gl-what">` +
      `<span class="gl-title">${esc(title)}</span><span class="gl-detail">${esc(detail)}</span></div>${extra}</div>`;

    const yourMove = s.yourMove
      .map((g) => {
        const left = secondsLeft(g, now);
        const late = runningOut(left, g.timeout);
        const pill = `<span class="gl-pill${late ? " late" : ""}">${left > 0 ? esc(formatLeft(left)) + " left" : "out of time"}</span>`;
        return row("gl-card", g, versus(g), `${gameLabel(g)} · Turn ${g.turn} of ${g.maxTurns}`, pill + `<button type="button" class="gl-play" data-act="open" data-id="${esc(g.id)}"${dis}>${left > 0 ? "PLAY" : "OPEN"}</button>`);
      })
      .join("");
    const count = s.yourMove.length;
    const yourMovePanel =
      `<section class="gl-panel hot" aria-labelledby="gl-your-move"><div class="gl-head"><h2 id="gl-your-move" class="gl-h2 big">Your move</h2>` +
      (count ? `<span class="gl-count">${count} showdown${count > 1 ? "s wait" : " waits"} for your plan</span>` : "") +
      `</div>${yourMove || '<p class="gl-empty">No showdown waits for your plan.</p>'}</section>`;

    const openBtn = (g: GameSummary, label = "Open") => `<button type="button" class="gl-open" data-act="open" data-id="${esc(g.id)}"${dis}>${label}</button>`;
    const waiting = s.waiting
      .map((g) => {
        if (g.phase === "waiting") return row("gl-line", g, versus(g), `${gameLabel(g)} · ${g.maxTurns} turns · ${formatDuration(g.timeout)} per turn`, openBtn(g));
        const left = secondsLeft(g, now);
        const time = left > 0 ? `${formatLeft(left)} left to play` : "out of time: you may claim the game";
        return row("gl-line", g, versus(g), `${gameLabel(g)} · Turn ${g.turn} of ${g.maxTurns} · your plan is in · ${time}`, openBtn(g));
      })
      .join("");
    const panel = (id: string, title: string, body: string) =>
      `<section class="gl-panel" aria-labelledby="${id}"><div class="gl-head"><h2 id="${id}" class="gl-h2">${title}</h2></div>${body}</section>`;

    // A showdown nobody joined in time can only be claimed: not offered.
    const open = s.open
      .filter((g) => secondsLeft(g, now) > 0)
      .map((g) => {
        const c = g.players[0];
        return (
          `<div class="gl-line">${tokenImg(c?.char ?? "")}<div class="gl-what">` +
          `<span class="gl-title">${esc(`${charName(c?.char)} · ${shortAddr(c?.addr ?? "")}`)}</span>` +
          `<span class="gl-detail">${esc(`Game ${g.id} · ${g.maxTurns} turns · ${formatDuration(g.timeout)} per turn`)}</span></div>` +
          `<button type="button" class="gl-join" data-act="join" data-id="${esc(g.id)}"${dis}>Join as ${esc(charName(m.joinerChar))}</button></div>`
        );
      })
      .join("");

    const finished = s.finished
      .map((g) => row("gl-line", g, versus(g), `${gameLabel(g)} · ${outcomeLine(g, m.address)}`, openBtn(g, "Replay")))
      .join("");

    return (
      '<div class="gl-col">' +
      yourMovePanel +
      (waiting ? panel("gl-waiting", "Waiting on others", waiting) : "") +
      panel("gl-open-games", "Open showdowns", open || '<p class="gl-empty">No showdown is waiting for a player: call one.</p>') +
      (finished ? panel("gl-finished", "Finished", finished) : "") +
      "</div>"
    );
  }

  private form(m: LobbyModel): string {
    const turns = m.turnOptions.map((t) => `<option value="${t}"${t === m.turns ? " selected" : ""}>${t}</option>`).join("");
    const timeouts = m.timeoutOptions.map((o, i) => `<option value="${i}"${i === m.timeoutIndex ? " selected" : ""}>${esc(o.label)}</option>`).join("");
    const disabled = m.busy || m.status !== "ready" ? " disabled" : "";
    return (
      '<aside class="gl-aside" aria-labelledby="gl-new"><form class="gl-form">' +
      '<h2 id="gl-new" class="gl-h2">New showdown</h2>' +
      `<div class="gl-you">${tokenImg(m.creatorChar, "")}<div><small>YOU PLAY</small><span>${esc(charName(m.creatorChar))}</span></div></div>` +
      `<div class="gl-field"><label for="gl-turns">Turns</label><select id="gl-turns">${turns}</select></div>` +
      `<div class="gl-field"><label for="gl-timeout">Time to play each turn</label><select id="gl-timeout">${timeouts}</select>` +
      '<span class="gl-note">Past it, anyone may claim the game: the player who did not play forfeits.</span></div>' +
      `<button type="button" class="gl-create" data-act="create"${disabled}>${m.busy ? "SIGNING…" : "CALL A SHOWDOWN"}</button>` +
      "</form></aside>"
    );
  }
}
