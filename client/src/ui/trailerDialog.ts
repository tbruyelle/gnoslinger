import { TRAILER_EMBED_URL } from "../links";

/**
 * The trailer in a dialog over the page: the YouTube player in a parchment
 * frame, 16:9, as wide as the window allows; the cross, a click outside or
 * Esc closes it. Opened from the splash's Watch the trailer and the welcome
 * panel's link (links.ts).
 */
const STYLE_ID = "td-style";

const CSS = `
.td-back{position:fixed;inset:0;z-index:500;background:rgba(30,22,24,.85);display:flex;align-items:center;justify-content:center;padding:40px 24px}
.td-dialog{position:relative;width:min(1120px,100%);background:#F3E7CE;border:3px solid #2A1C14;border-radius:18px;box-shadow:inset 0 0 0 5px #F3E7CE,inset 0 0 0 7px #2A1C14,0 10px 0 #1E1618;padding:22px}
.td-frame{aspect-ratio:16/9;background:#000;border:2px solid #2A1C14;border-radius:8px;overflow:hidden}
.td-frame iframe{display:block;width:100%;height:100%;border:0}
.td-close{position:absolute;top:-18px;right:-18px;width:44px;height:44px;border-radius:50%;background:#F3E7CE;color:#2A1C14;border:3px solid #2A1C14;font-family:'Zilla Slab',Rockwell,Georgia,serif;font-size:28px;line-height:1;cursor:pointer}
.td-close:hover{background:#FFFFFF}
.td-close:focus-visible{outline:3px solid #F2B544;outline-offset:2px}
`;

let open: { root: HTMLDivElement; onKey: (e: KeyboardEvent) => void } | null = null;

/** Closes the trailer, if it shows. */
export function closeTrailerDialog(): void {
  if (!open) return;
  open.root.remove();
  document.removeEventListener("keydown", open.onKey);
  open = null;
}

/** Shows the trailer, playing. */
export function openTrailerDialog(): void {
  closeTrailerDialog();
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const root = document.createElement("div");
  root.className = "td-back";
  root.innerHTML =
    '<section class="td-dialog" role="dialog" aria-modal="true" aria-label="The trailer">' +
    '<button type="button" class="td-close" data-act="close" aria-label="Close">×</button>' +
    `<div class="td-frame"><iframe src="${TRAILER_EMBED_URL}" title="Gnoslinger, the trailer" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>` +
    "</section>";
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeTrailerDialog();
  };
  document.addEventListener("keydown", onKey);
  root.addEventListener("click", (e) => {
    if (e.target === root || (e.target as Element).closest('[data-act="close"]')) closeTrailerDialog();
  });
  document.body.appendChild(root);
  open = { root, onKey };
  root.querySelector<HTMLButtonElement>(".td-close")?.focus();
}
