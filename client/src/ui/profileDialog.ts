import { userMessage } from "../chain/errors";
import type { RealmClient } from "../chain/realm";
import type { Profile } from "../chain/types";
import { showToast } from "./toast";

/**
 * A player's profile in a dialog over the page: name, address (with a copy
 * button), rank, games played, victory points. Opened from the lobby (my
 * address, a line-up, the ranking) and from the game screen's header, so it
 * owns its markup, styles and loading; one shows at a time.
 */
export interface ProfileDialogOptions {
  realm: RealmClient;
  addr: string;
  /** My address, to say "My profile" ("" without a wallet). */
  me: string;
  /** Opened from the ranking: a "‹ All players" button goes back to it. */
  back?: () => void;
}

const STYLE_ID = "pd-style";

const CSS = `
.pd-back{position:fixed;inset:0;z-index:500;background:rgba(30,22,24,.72);display:flex;align-items:flex-start;justify-content:center;padding:72px 16px 24px;overflow-y:auto;font-family:'Zilla Slab',Rockwell,Georgia,serif;color:#2A1C14}
.pd-back *{box-sizing:border-box}
.pd-back button{font-family:inherit}
.pd-back button:focus-visible{outline:3px solid #F2B544;outline-offset:2px}
.pd-dialog{width:100%;max-width:34rem;background:#F3E7CE;border:3px solid #2A1C14;border-radius:18px;box-shadow:inset 0 0 0 5px #F3E7CE,inset 0 0 0 7px #2A1C14,0 10px 0 #1E1618;padding:22px 24px 24px;display:flex;flex-direction:column;gap:14px}
.pd-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:3px solid #2A1C14;padding-bottom:8px}
.pd-head h2{margin:0;font-family:Rye,Georgia,serif;font-weight:400;font-size:26px}
.pd-close{width:44px;height:44px;background:transparent;border:0;border-radius:8px;font-size:28px;line-height:1;color:#2A1C14;cursor:pointer}
.pd-close:hover,.pd-copy:hover{background:#E9DCC0}
.pd-addr-row{display:flex;align-items:center;gap:4px}
.pd-addr{font-size:15px;color:#5A4636;word-break:break-all}
.pd-copy{flex-shrink:0;width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:transparent;border:0;border-radius:8px;cursor:pointer;color:#2A1C14}
.pd-empty{margin:0;font-size:17px;font-style:italic;color:#5A4636}
.pd-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.pd-stat{background:#FBF4E4;border:2px solid #2A1C14;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}
.pd-stat b{font-family:Rye,Georgia,serif;font-weight:400;font-size:28px;color:#33307F}
.pd-stat span{font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#8E2F1A}
.pd-note{font-size:15px;font-style:italic;color:#5A4636}
.pd-pager{display:flex}
.pd-pager button{min-height:44px;padding:0 18px;background:#FBF4E4;color:#2A1C14;border:2px solid #2A1C14;border-radius:10px;font-size:17px;font-weight:700;cursor:pointer}
.pd-pager button:hover{background:#FFFFFF}
`;

const COPY_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15 V5 a1 1 0 0 1 1 -1 H15"></path></svg>';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

let open: { root: HTMLDivElement; onKey: (e: KeyboardEvent) => void } | null = null;

/** Closes the profile dialog, if one shows. */
export function closeProfileDialog(): void {
  if (!open) return;
  open.root.remove();
  document.removeEventListener("keydown", open.onKey);
  open = null;
}

/** Copies an address to the clipboard, saying so. */
export async function copyAddress(addr: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(addr);
    showToast(null, "Address copied", "info", 2000);
  } catch {
    showToast(null, "Could not copy: " + addr, "error", 6000);
  }
}

/** Shows a player's profile, loading it from the profiles realm. */
export async function openProfileDialog(o: ProfileDialogOptions): Promise<void> {
  closeProfileDialog();
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const root = document.createElement("div");
  root.className = "pd-back";
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeProfileDialog();
  };
  document.addEventListener("keydown", onKey);
  root.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<HTMLElement>("[data-act]");
    if (e.target === root || el?.dataset.act === "close") return closeProfileDialog();
    if (el?.dataset.act === "copy") return void copyAddress(o.addr);
    if (el?.dataset.act === "back") {
      closeProfileDialog();
      o.back?.();
    }
  });
  document.body.appendChild(root);
  const mine = open = { root, onKey };
  const render = (body: string, name = "") => {
    const title = name || (o.addr === o.me ? "My profile" : "Player");
    root.innerHTML =
      '<section class="pd-dialog" role="dialog" aria-modal="true" aria-labelledby="pd-title">' +
      `<div class="pd-head"><h2 id="pd-title">${esc(title)}</h2><button type="button" class="pd-close" data-act="close" aria-label="Close">×</button></div>` +
      `<div class="pd-addr-row"><span class="pd-addr">${esc(o.addr)}</span>` +
      `<button type="button" class="pd-copy" data-act="copy" aria-label="Copy the address" title="Copy the address">${COPY_ICON}</button></div>` +
      body +
      (o.back ? '<div class="pd-pager"><button type="button" data-act="back">‹ All players</button></div>' : "") +
      "</section>";
  };
  render('<p class="pd-empty">Loading…</p>');
  let p: Profile | null = null;
  try {
    p = await o.realm.getProfile(o.addr);
  } catch (e) {
    if (open === mine) render(`<p class="pd-empty">${esc(userMessage(e))}</p>`);
    return;
  }
  if (open !== mine) return;
  if (!p) {
    render(`<p class="pd-empty">No profile yet: it comes with the first showdown ${o.addr === o.me ? "you call or join" : "this player calls or joins"}.</p>`);
    return;
  }
  const since = new Date(p.createdAt * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  render(
    '<div class="pd-stats">' +
      `<div class="pd-stat"><b>#${p.rank}</b><span>Rank</span></div>` +
      `<div class="pd-stat"><b>${p.gamesPlayed}</b><span>Games played</span></div>` +
      `<div class="pd-stat"><b>${p.victoryPoints}</b><span>Victory points</span></div>` +
      `</div><span class="pd-note">Riding since ${esc(since)}.</span>`,
    p.name,
  );
}
