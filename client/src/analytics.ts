/**
 * Page views counted by GoatCounter (https://www.goatcounter.com), on the
 * site VITE_GOATCOUNTER names (https://gnoslinger.goatcounter.com/count in
 * the production build; none in development, nothing loaded nor counted).
 * The app changes screens without loading a page, and its addresses are
 * hashes that GoatCounter would not tell apart, so each screen counts itself
 * once when it opens, under a path of its own without the game's id or turn:
 * "/" the splash, "/lobby", "/game", "/call" and "/join" (the set up),
 * "/how-to-play", and the dialogs "/faq" and "/trailer". GoatCounter sets
 * no cookie; it ignores localhost by itself.
 */
import { CONFIG } from "./config";

interface GoatCounter {
  count(vars: { path: string; title?: string; event?: boolean }): void;
}

declare global {
  interface Window {
    goatcounter?: GoatCounter;
  }
}

const SCRIPT_URL = "https://gc.zgo.at/count.js";

/** The views counted before the script loaded, sent once it has. */
let queued: string[] | null = null;

function load(): void {
  queued = [];
  const script = document.createElement("script");
  script.async = true;
  script.src = SCRIPT_URL;
  script.dataset.goatcounter = CONFIG.goatcounter;
  // The screens count themselves: not the page load as well.
  script.dataset.goatcounterSettings = JSON.stringify({ no_onload: true });
  script.addEventListener("load", () => {
    const paths = queued ?? [];
    queued = [];
    for (const p of paths) send(p);
  });
  document.head.appendChild(script);
}

function send(path: string): void {
  try {
    window.goatcounter?.count({ path, title: document.title });
  } catch {
    // Counting never gets in the way of the game (a blocker, say).
  }
}

/** Counts a view of a screen, e.g. "/lobby". */
export function countView(path: string): void {
  if (!CONFIG.goatcounter) return;
  if (queued === null) load();
  if (window.goatcounter) send(path);
  else queued?.push(path);
}
