/**
 * Records the footage: the real client, served by `vite preview` against a
 * local gnodev of its own, driven by Playwright with a stand-in for Adena
 * that signs through gnokey (video/README.md). Two browser contexts, one
 * per player, each page recorded to footage/<clip>.webm, with the moments
 * worth cutting to in footage/marks.json (seconds from the clip's start).
 *
 *   RPC=http://127.0.0.1:36657 APP=http://localhost:5175/ KEYS=<keybase> npx tsx record/record.ts
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const exec = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const REPO = path.resolve(ROOT, "..");
const OUT = path.join(ROOT, "footage");
const RPC = process.env.RPC ?? "http://127.0.0.1:36657";
const APP = process.env.APP ?? "http://localhost:5175/";
const KEYS = process.env.KEYS ?? path.join(ROOT, "keys");
const CHAIN = process.env.CHAIN_ID ?? "dev";
const REALM = "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0";
const GAME = "0000001";
const W = 1920;
const H = 1080;
/** The players' keys in the keybase and the hexes they set up in (both in each other's aim zone, two hexes apart). */
const MARSHAL = { key: "video-marshal", hex: "A-E7" };
const KID = { key: "video-kid", hex: "A-G6" };

// ── The chain ────────────────────────────────────────────────────────────

async function gnokey(args: string[], stdin = ""): Promise<{ out: string; err: string; ok: boolean }> {
  try {
    const r = await exec("go", ["tool", "gnokey", ...args], { cwd: REPO, maxBuffer: 1 << 24 });
    return { out: r.stdout, err: r.stderr, ok: true };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    return { out: err.stdout ?? "", err: err.stderr ?? err.message, ok: false };
  }
}

async function keyAddress(name: string): Promise<string> {
  const { out, err } = await gnokey(["list", "-home", KEYS]);
  const m = new RegExp(`${name} \\(local\\) - addr: (g1[a-z0-9]+)`).exec(out + err);
  if (!m) throw new Error(`key ${name} not in ${KEYS}`);
  return m[1];
}

/** The stand-in Adena's DoContract: each /vm.m_call message signed by the key and broadcast with gnokey (commit mode: in a block when it answers). */
function signer(key: string) {
  return async (json: string): Promise<string> => {
    const params = JSON.parse(json) as { messages: { type: string; value: { pkg_path: string; func: string; args: string[]; send: string } }[] };
    let hash = "";
    for (const m of params.messages) {
      if (m.type !== "/vm.m_call") return JSON.stringify({ code: 4000, status: "failure", type: "UNSUPPORTED", message: `${m.type} is not signed here`, data: null });
      const v = m.value;
      const args = ["maketx", "call", "-pkgpath", v.pkg_path, "-func", v.func];
      for (const a of v.args) args.push("-args", a);
      if (v.send) args.push("-send", v.send);
      args.push("-gas-fee", "1000000ugnot", "-gas-wanted", "300000000", "-broadcast", "-chainid", CHAIN, "-remote", RPC, "-home", KEYS, "-insecure-password-stdin", key);
      const t0 = Date.now();
      const r = await execWithStdin(["tool", "gnokey", ...args], "\n");
      const h = /TX HASH:\s+(\S+)/.exec(r.out);
      const failed = !r.ok || !h || /panic|--= Error =--/.test(r.out + r.err);
      console.log(`  ${key}: ${v.func}(${v.args.join(", ")})${v.send ? ` +${v.send}` : ""} → ${failed ? "FAILED" : "ok"} in ${Date.now() - t0} ms`);
      if (failed) {
        const msg = (r.out + r.err).split("\n").find((l) => /gnoslinger:|error|panic/i.test(l)) ?? "transaction failed";
        console.log("   ", msg.trim());
        return JSON.stringify({ code: 4000, status: "failure", type: "TRANSACTION_FAILED", message: msg.trim(), data: null });
      }
      hash = h![1];
    }
    return JSON.stringify({ code: 0, status: "success", type: "TRANSACTION_SUCCESS", message: "", data: { hash } });
  };
}

function execWithStdin(args: string[], stdin: string): Promise<{ out: string; err: string; ok: boolean }> {
  return new Promise((resolve) => {
    const child = execFile("go", args, { cwd: REPO, maxBuffer: 1 << 24 }, (e, stdout, stderr) => resolve({ out: stdout, err: stderr, ok: !e }));
    child.stdin?.end(stdin);
  });
}

interface View {
  phase: string;
  turn: number;
  players: { addr: string; committed: boolean; revealed: boolean; status: string }[];
  lastTurn: { turn: number } | null;
  winner: number;
}

async function gameView(): Promise<View> {
  const { out, err } = await gnokey(["query", "vm/qrender", "-remote", RPC, "-data", `${REALM}:json/game/${GAME}`]);
  const i = out.indexOf("{");
  if (i < 0) throw new Error(`no game view: ${err}`);
  return JSON.parse(out.slice(i)) as View;
}

async function waitChain(what: string, ok: (v: View) => boolean, timeoutMs = 60_000): Promise<View> {
  const t0 = Date.now();
  for (;;) {
    let v: View | null = null;
    try {
      v = await gameView();
    } catch {
      v = null;
    }
    if (v && ok(v)) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(500);
  }
}

// ── The board's geometry, as the game screen lays it out (ui/showdownView.ts showdownLayout, GameScene.baseTransform) ──

interface Board {
  w: number;
  h: number;
  hexes: Record<string, { x: number; y: number }>;
}
let board: Board;

function boardRect() {
  const side = W < 1180 ? 255 : 296;
  const top = 56 + 48;
  return { x: side, y: top, w: Math.max(120, W - 2 * side), h: Math.max(120, H - top - 268) };
}

function transform() {
  const b = boardRect();
  const scale = Math.min((b.h - 30) / board.h, (b.w - 30) / board.w);
  return { scale, ox: b.x + (b.w - board.w * scale) / 2, oy: b.y + (b.h - board.h * scale) / 2 };
}

/** A hex's centre on screen, at zoom 1 with no pan (a fresh page). */
function hex(id: string): { x: number; y: number } {
  const p = board.hexes[id];
  if (!p) throw new Error(`no hex ${id}`);
  const { scale, ox, oy } = transform();
  return { x: ox + p.x * scale, y: oy + p.y * scale };
}

/** The "Aim" button of the Cock/Aim/Shoot menu, which opens beside my token: a column Cock / Aim / Shoot centred on the token. */
function aimButton(myHex: string): { x: number; y: number } {
  const t = hex(myHex);
  const diameter = 95 * transform().scale * 1.7;
  return { x: t.x + diameter * 0.8 + 32, y: t.y };
}

// ── Recording ────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const marks: Record<string, Record<string, number>> = {};
/** Each player's context and where its storage is saved after every clip. */
const contexts = new Map<BrowserContext, string>();

class Clip {
  readonly t0 = Date.now();
  constructor(
    readonly name: string,
    readonly page: Page,
  ) {
    marks[name] = {};
  }
  /** Notes a moment worth cutting to, in seconds from the clip's start. */
  mark(what: string) {
    marks[this.name][what] = (Date.now() - this.t0) / 1000;
    console.log(`  [${this.name}] ${what} @ ${marks[this.name][what].toFixed(1)}s`);
  }
  async hover(x: number, y: number, ms = 700) {
    await this.page.mouse.move(x, y, { steps: 12 });
    await sleep(ms);
  }
  async click(x: number, y: number, ms = 600) {
    await this.page.mouse.move(x, y, { steps: 10 });
    await sleep(150);
    await this.page.mouse.click(x, y);
    await sleep(ms);
  }
  async tap(selector: string, ms = 600) {
    await this.page.hover(selector);
    await sleep(200);
    await this.page.click(selector);
    await sleep(ms);
  }
  /** Waits for the game screen's status line to say something. */
  async status(re: RegExp, timeoutMs = 90_000) {
    await this.page.waitForFunction((src) => new RegExp(src).test(document.querySelector(".gv-ribbon")?.textContent ?? ""), re.source, { timeout: timeoutMs });
  }
}

const FROM = process.env.FROM ?? "";

async function clip(ctx: BrowserContext, name: string, run: (c: Clip) => Promise<void>): Promise<void> {
  if (FROM && name < FROM) return;
  console.log(`clip ${name}`);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [${name}] page error: ${e.message}`));
  const c = new Clip(name, page);
  try {
    await run(c);
  } finally {
    const video = page.video();
    await page.close();
    if (video) await video.saveAs(path.join(OUT, `${name}.webm`));
    if (video) await video.delete().catch(() => undefined);
    await ctx.storageState({ path: contexts.get(ctx) });
    await writeFile(path.join(OUT, "marks.json"), JSON.stringify(marks, null, 2));
  }
}

/** The splash's Connect with Adena button, found on a screenshot: the only wide run of parchment in the lower part of the screen. */
async function findSplashButton(page: Page): Promise<{ x: number; y: number }> {
  const png = await page.screenshot();
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const rows: { y: number; x0: number; x1: number }[] = [];
  for (let y = Math.floor(info.height * 0.6); y < info.height; y++) {
    let run = 0;
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const parchment = Math.abs(data[i] - 243) < 14 && Math.abs(data[i + 1] - 231) < 14 && Math.abs(data[i + 2] - 206) < 16;
      if (parchment) run++;
      else {
        if (run >= 160) rows.push({ y, x0: x - run, x1: x });
        run = 0;
      }
    }
  }
  if (rows.length === 0) throw new Error("splash button not found");
  const mid = rows[Math.floor(rows.length / 2)];
  return { x: (mid.x0 + mid.x1) / 2, y: (rows[0].y + rows[rows.length - 1].y) / 2 };
}

const adenaScript = (addr: string) => `
  (() => {
    const ok = (type, data) => ({ code: 0, status: "success", type, message: "", data });
    window.adena = {
      AddEstablish: async () => ok("CONNECTION_SUCCESS", null),
      GetAccount: async () => ok("GET_ACCOUNT", { address: ${JSON.stringify(addr)}, chainId: ${JSON.stringify(CHAIN)}, coins: "", status: "ACTIVE" }),
      GetNetwork: async () => ok("GET_NETWORK", { chainId: ${JSON.stringify(CHAIN)}, networkName: ${JSON.stringify(CHAIN)}, rpcUrl: ${JSON.stringify(RPC)} }),
      SwitchNetwork: async () => ok("SWITCH_NETWORK_SUCCESS", null),
      AddNetwork: async () => ok("ADD_NETWORK_SUCCESS", null),
      DoContract: async (params) => JSON.parse(await window.__gnoSign(JSON.stringify(params))),
      On: () => {},
    };
  })();
`;

async function playerContext(browser: Awaited<ReturnType<typeof chromium.launch>>, key: string): Promise<BrowserContext> {
  const addr = await keyAddress(key);
  // The browser's storage (the pending reveals' salts, the turns played back) outlives a run, so a recording can resume from a clip (FROM).
  const state = path.join(OUT, `state-${key}.json`);
  const storageState = FROM && (await readFile(state, "utf8").catch(() => "")) ? state : undefined;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, storageState, recordVideo: { dir: path.join(OUT, "raw"), size: { width: W, height: H } } });
  contexts.set(ctx, state);
  await ctx.exposeFunction("__gnoSign", signer(key));
  await ctx.addInitScript(adenaScript(addr));
  console.log(`${key}: ${addr}`);
  return ctx;
}

// ── The plans ────────────────────────────────────────────────────────────

const card = (n: number, side: "front" | "back") => `.gv-side[data-card="${n}"][data-side="${side}"]`;

/** draw: Draw & Cock, the Colt to the gun hand picked on the sheet (3); aim: Cock/Aim/Shoot's Aim at the other (2); shoot: Shoot at the other (1). */
type Action = "draw" | "aim" | "shoot";

/** Plans the actions in order, in the cards they take (the two Cock/Aim/Shoot cards for two aims), the hand shown off first when asked. */
async function plan(c: Clip, me: string, target: string, actions: Action[], showcase = false) {
  if (showcase) {
    for (const [n, side] of [[1, "front"], [2, "front"], [4, "back"], [6, "back"]] as const) {
      await c.page.hover(card(n, side));
      await sleep(650);
    }
  }
  let aimCard = 5;
  for (const a of actions) {
    if (a === "draw") {
      await c.tap(card(9, "front"), 900);
      c.mark("sheet");
      await c.tap("[data-drag-gun]", 900);
      await c.page.keyboard.press("Escape").catch(() => undefined);
      await sleep(400);
    } else if (a === "aim") {
      await c.tap(card(aimCard++, "front"), 700);
      const aim = aimButton(me);
      await c.click(aim.x, aim.y, 700);
      if (!marks[c.name]["aim-zone"]) c.mark("aim-zone");
      await c.click(hex(target).x, hex(target).y, 800);
    } else {
      await c.tap(card(7, "front"), 700);
      c.mark("shoot-zone");
      await c.click(hex(target).x, hex(target).y, 900);
    }
  }
  c.mark("planned");
}

/** A live turn's playback: PLAY, every segment to the end, then the cross (a game just over has none, its final replay staying). */
async function playback(c: Clip, before?: () => Promise<void>) {
  await c.status(/resolution|wins|draw/);
  c.mark("playback");
  await sleep(1500);
  if (before) await before();
  await c.tap('.gv-play[data-id="play"]', 300);
  // Auto play stops at the end: the button reads PLAY again.
  await c.page.waitForFunction(() => document.querySelector('.gv-play[data-id="play"]')?.textContent === "PLAY", undefined, { timeout: 180_000 });
  c.mark("played");
  await sleep(2500);
  const close = c.page.locator('.gv-x[data-id="close"]');
  if (await close.count()) await c.tap('.gv-x[data-id="close"]', 300);
}

/** A page opened on a turn this browser has not played back yet shows that playback first: closed with its cross. */
async function skipPlayback(c: Clip) {
  await c.status(/Your move|resolution/);
  if (/resolution/.test((await c.page.locator(".gv-ribbon").textContent()) ?? "")) {
    await sleep(800);
    await c.tap('.gv-x[data-id="close"]', 300);
  }
  await c.status(/Your move/, 30_000);
}

async function send(c: Clip) {
  await c.tap('.gv-btn[data-id="send"]', 300);
  c.mark("sent");
}

/** Zooms in on the fight, between the two tokens, with the wheel. */
async function zoomIn(c: Clip) {
  const a = hex(MARSHAL.hex);
  const b = hex(KID.hex);
  await c.page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2);
  for (let i = 0; i < 7; i++) {
    await c.page.mouse.wheel(0, -100);
    await sleep(120);
  }
  c.mark("zoomed");
  await sleep(800);
}

/**
 * The turns, the Marshal's actions and the Kid's: both draw and aim; then
 * the Marshal aims twice more and shoots (aim time 7 at range 2) while the
 * Kid only aims; then the Kid shoots back and the Marshal again. What the
 * cards decide is whatever the chain draws: the clips follow the outcome.
 */
const TURNS: { a: Action[]; b: Action[] }[] = [
  { a: ["draw", "aim"], b: ["draw", "aim"] },
  { a: ["aim", "aim", "shoot"], b: ["aim", "aim"] },
  { a: ["aim", "shoot", "aim"], b: ["shoot", "aim", "aim"] },
];

// ── The showdown, clip by clip ───────────────────────────────────────────

async function main() {
  board = JSON.parse(await readFile(path.join(REPO, "client/src/board/board_A.json"), "utf8")) as Board;
  await mkdir(path.join(OUT, "raw"), { recursive: true });
  if (FROM) Object.assign(marks, JSON.parse(await readFile(path.join(OUT, "marks.json"), "utf8").catch(() => "{}")));
  const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const A = await playerContext(browser, MARSHAL.key);
  const B = await playerContext(browser, KID.key);
  const game = `${APP}#game/${GAME}`;

  // The splash, the lobby and the call.
  await clip(A, "01-call", async (c) => {
    await c.page.goto(APP);
    await sleep(6500);
    const btn = await findSplashButton(c.page);
    await c.hover(btn.x, btn.y, 900);
    c.mark("connect");
    await c.page.mouse.click(btn.x, btn.y);
    await c.page.waitForSelector(".gl-welcome", { timeout: 20_000 });
    c.mark("lobby");
    await sleep(3500);
    await c.tap('.gl-welcome [data-act="welcome-close"].gl-open', 1200);
    c.mark("form");
    await c.page.hover("#gl-seats");
    await sleep(500);
    await c.page.selectOption("#gl-stake", { index: 2 });
    await sleep(900);
    await c.tap('[data-act="create"]', 2500);
    c.mark("setup");
    for (const h of ["A-D6", "A-E6", "A-D7", MARSHAL.hex]) await c.hover(hex(h).x, hex(h).y, 650);
    await c.click(hex(MARSHAL.hex).x, hex(MARSHAL.hex).y, 1200);
    await c.tap('.gv-btn[data-id="turnRight"]', 900);
    await c.tap('.gv-btn[data-id="turnLeft"]', 900);
    c.mark("call");
    await c.tap('.gv-btn[data-id="setup"]', 200);
    await waitChain("the game created", (v) => v.phase === "waiting");
    await c.status(/Waiting for players/);
    c.mark("waiting");
    await sleep(3500);
  });

  // The other player opens the link and joins.
  await clip(B, "02-join", async (c) => {
    await c.page.goto(game);
    await c.status(/waiting for players/);
    c.mark("open");
    await sleep(3000);
    await c.tap('.gv-btn[data-id="join"]', 1500);
    c.mark("setup");
    for (const h of ["A-H6", "A-G7", KID.hex]) await c.hover(hex(h).x, hex(h).y, 650);
    await c.click(hex(KID.hex).x, hex(KID.hex).y, 1200);
    c.mark("join");
    await c.tap('.gv-btn[data-id="setup"]', 200);
    await waitChain("the game started", (v) => v.phase === "planning");
    await c.status(/Your move/);
    c.mark("planning");
    await sleep(3500);
  });

  // The turns: the Marshal plans (the hand shown off on the first), the Kid plans
  // (its send reveals in clear), the Marshal reveals and the turn plays back.
  let n = 3;
  const two = (i: number) => String(i).padStart(2, "0");
  let over = false;
  for (let t = 1; t <= TURNS.length && !over; t++) {
    const { a, b } = TURNS[t - 1];
    await clip(A, `${two(n++)}-plan-${t}`, async (c) => {
      await c.page.goto(game);
      await c.status(/Your move/);
      await sleep(t === 1 ? 2500 : 1500);
      c.mark("hand");
      await plan(c, MARSHAL.hex, KID.hex, a, t === 1);
      await sleep(1200);
      await send(c);
      await waitChain("the Marshal's commit", (v) => v.turn === t && v.players[0].committed);
      await c.status(/Plan sent/);
      c.mark("waiting");
      await sleep(2500);
    });
    await clip(B, `${two(n++)}-plan-kid-${t}`, async (c) => {
      await c.page.goto(game);
      await skipPlayback(c);
      await sleep(1500);
      await plan(c, KID.hex, MARSHAL.hex, b);
      await send(c);
      await waitChain("the reveals", (v) => v.phase === "revealing" || v.phase === "finished");
      await sleep(2000);
    });
    await clip(A, `${two(n++)}-reveal-${t}`, async (c) => {
      await c.page.goto(game);
      await c.status(/reveal your plan/);
      await sleep(2000);
      c.mark("reveal");
      await c.tap('.gv-btn[data-id="reveal"]', 200);
      await playback(c, t >= 2 ? () => zoomIn(c) : undefined);
      await c.status(/Your move|wins|draw/, 30_000);
      c.mark("resolved");
      await sleep(3500);
    });
    over = (await gameView()).phase === "finished";
  }

  // The Kid gives up, unless the shots settled it.
  if (!over) {
    await clip(B, `${two(n++)}-surrender`, async (c) => {
      await c.page.goto(game);
      await skipPlayback(c);
      await sleep(2000);
      c.mark("surrender");
      await c.tap('.gv-btn[data-id="surrender"]', 200);
      await waitChain("the end", (v) => v.phase === "finished");
      await sleep(3000);
    });
  }

  // The end: the final replay, the winner, then the lobby's finished line and ranking.
  await clip(A, `${two(n++)}-end`, async (c) => {
    await c.page.goto(game);
    await c.status(/wins|draw/);
    c.mark("over");
    await sleep(9000);
    await c.tap(".gv-lobby", 300);
    await c.page.waitForSelector(".gl-main", { timeout: 20_000 });
    c.mark("lobby");
    await sleep(2500);
    await c.page.hover(".gl-ranks");
    await sleep(3000);
  });

  await writeFile(path.join(OUT, "marks.json"), JSON.stringify(marks, null, 2));
  await A.close();
  await B.close();
  await browser.close();
  console.log("done:", Object.keys(marks).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
