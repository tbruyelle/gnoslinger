import Phaser from "phaser";
import { CHAR_ARROW_DIR } from "../rules";
import { CONFIG } from "../config";
import { initChain, resetChain, type Chain } from "../chain";
import { subscribeAccountChanged, subscribeNetworkChanged, subscribeWalletLocked, walletLocked } from "../chain/adena";
import { userMessage } from "../chain/errors";
import { formatCoins } from "../chain/rpc";
import type { GamesView } from "../chain/types";
import { SOUND_FILES, SOUND_VOLUME, soundKey } from "../game/sounds";
import { LobbyView } from "../ui/lobbyView";
import { showToast } from "../ui/toast";
import { installWalletNotices } from "../ui/walletNotices";

/** All character tokens, for the picker that will come back later. */
export const CHARACTERS = Object.keys(CHAR_ARROW_DIR);

/** Timeout choices for a new game, in minutes; the realm's default is 2 days. */
export const TIMEOUT_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 30, label: "30 min" },
  { minutes: 120, label: "2 hours" },
  { minutes: 12 * 60, label: "12 hours" },
  { minutes: 2 * 24 * 60, label: "2 days" },
  { minutes: 7 * 24 * 60, label: "7 days" },
];
const DEFAULT_TIMEOUT_INDEX = 3;
/** Game lengths offered for a new game (the realm takes 10 to 30). */
const TURN_OPTIONS = [10, 15, 20, 25, 30];
const DEFAULT_TURNS = 20;

/** Default characters until players can pick their own: creator and joiner. */
export const CREATOR_CHAR = "marshal";
export const JOINER_CHAR = "the_kid";

const SUBTITLE = "showdowns on the gno.land chain";
/** Shown under the splash: the cover art and the game are Avalon Hill's. */
const CREDIT =
  "Based on GUNSLINGER © 1982 The Avalon Hill Game Company, cover art included. " +
  "Gnoslinger is a fan project, not affiliated with Avalon Hill or Hasbro.";
/** The splash's palette and fonts, from the design canvas (AGENTS.md, Design). */
const SPLASH_GROUND = 0x1e1618;
const SPLASH_RULE = 0x5a4636;
const SPLASH_INK = 0x2a1c14;
const SPLASH_INK_STR = "#2A1C14";
const SPLASH_PAPER = 0xf3e7ce;
const SPLASH_PAPER_STR = "#F3E7CE";
const SPLASH_CREAM = 0xfbf4e4;
const SPLASH_RED = 0xb5482a;
const SPLASH_DARK_RED = 0x8e2f1a;
const RYE = "Rye, Georgia, serif";
const ZILLA = "'Zilla Slab', Rockwell, Georgia, serif";
const SPLASH_LINE = "Two gunfighters, five segments a turn, one hand of cards. Every turn is settled on chain.";
/** Room the lines under the cover need: tagline, the line on the game, the button, and a gap above the credit. */
const SPLASH_BELOW_COVER = 215;
/** Western music played once on entering the lobby (not on the splash), loaded on demand. */
const MUSIC_ENABLED = false; // off for now; flip to play it again
const MUSIC_KEY = "music_splash";
const MUSIC_FILE = "sounds/music-splash.mp3";
const MUSIC_VOLUME = 0.5;
const MUSIC_FADE_MS = 800;
/** After Connect with Adena, the music waits for the gunshot to ring out. */
const MUSIC_AFTER_SHOT_MS = 700;
/** Splash animation: the intro the first time, then the slow zoom and the dust. */
const SPLASH_INTRO_MS = 1400;
const SPLASH_ZOOM = 1.03;
const SPLASH_ZOOM_MS = 12000;
const DUST_KEY = "splash_dust";
const CLOUD_KEY = "splash_cloud";
/** The muzzle of the gunman's Colt in splash_screen.jpg (1200x1646), as fractions of the cover, and how high its smoke rises. */
const MUZZLE = { x: 446 / 1200, y: 744 / 1646, rise: 180 / 1646 };

/**
 * Lobby: shows the splash screen, then connects Adena, lists open games to
 * join and the player's own games to resume, and creates a game.
 */
export class LobbyScene extends Phaser.Scene {
  private screen: "splash" | "lobby" = "splash";
  private chain: Chain | null = null;
  private status: "connecting" | "ready" | "error" = "connecting";
  private errorMsg = "";
  private games: GamesView | null = null;
  private gamesKey = "";
  private busy = false;
  private balance: string | null = null;
  private turns = DEFAULT_TURNS;
  private timeoutIndex = DEFAULT_TIMEOUT_INDEX;
  /** The lobby screen, an HTML overlay (the splash stays on the canvas). */
  private view: LobbyView | null = null;
  private refreshTimer: Phaser.Time.TimerEvent | null = null;
  private unsubscribe: (() => void)[] = [];
  private splashIntroPlayed = false;
  private shutDown = false;
  /** Tweens and the mask of the splash, which children.removeAll does not clean up. */
  private splashFx: { remove(): void }[] = [];
  private music: Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound | null = null;

  constructor() {
    super({ key: "LobbyScene" });
  }

  /** Coming back from a game passes { splash: false } to land on the lists directly. */
  init(data?: { splash?: boolean }) {
    this.screen = data?.splash === false ? "lobby" : "splash";
    this.chain = null;
    this.status = "connecting";
    this.games = null;
    this.gamesKey = "";
    this.busy = false;
  }

  create() {
    this.shutDown = false;
    this.view = new LobbyView({
      retry: () => void this.connect(),
      quit: () => this.quit(),
      copyAddress: () => {
        if (this.chain) void this.copyAddress(this.chain.wallet.address);
      },
      open: (id) => this.scene.start("GameScene", { gameID: id }),
      join: (id) => this.joinGame(id),
      create: () => {
        if (!this.busy) this.createGame();
      },
      setTurns: (turns) => (this.turns = turns),
      setTimeout: (index) => (this.timeoutIndex = index),
    });
    if (this.screen === "lobby") this.playMusic();
    this.loadGunshots();
    this.buildAll();
    const onResize = () => this.buildAll();
    this.scale.on("resize", onResize);
    this.refreshTimer = this.time.addEvent({ delay: 5000, loop: true, callback: () => void this.refreshGames() });
    // The time left to play each game counts down.
    this.time.addEvent({ delay: 30_000, loop: true, callback: () => this.screen === "lobby" && this.renderView() });
    this.events.once("shutdown", () => {
      this.scale.off("resize", onResize);
      this.refreshTimer?.remove();
      for (const u of this.unsubscribe) u();
      this.unsubscribe = [];
      this.shutDown = true;
      this.fadeOutMusic();
      this.view?.destroy();
      this.view = null;
    });
    if (this.screen === "lobby") void this.connect();
  }

  private enter() {
    this.playGunshot();
    this.time.delayedCall(MUSIC_AFTER_SHOT_MS, () => this.screen === "lobby" && this.playMusic());
    this.screen = "lobby";
    void this.connect();
  }

  /** Loads the gunshots in the background, for the splash's Connect button (the game scene then finds them loaded). */
  private loadGunshots() {
    const missing = SOUND_FILES.gunshot.map((file, i) => ({ key: soundKey("gunshot", i), file })).filter((s) => !this.cache.audio.exists(s.key));
    if (missing.length === 0 || this.load.isLoading()) return;
    for (const s of missing) this.load.audio(s.key, `sounds/${s.file}`);
    this.load.start();
  }

  /** A random gunshot, if one is loaded yet. */
  private playGunshot() {
    const keys = SOUND_FILES.gunshot.map((_, i) => soundKey("gunshot", i)).filter((k) => this.cache.audio.exists(k));
    if (keys.length > 0) this.sound.play(Phaser.Utils.Array.GetRandom(keys), { volume: SOUND_VOLUME.gunshot });
  }

  /** Forgets the connection in the app (Adena itself stays connected to the site) and shows the splash again. */
  private quit() {
    resetChain();
    this.chain = null;
    this.status = "connecting";
    this.games = null;
    this.gamesKey = "";
    this.screen = "splash";
    this.fadeOutMusic();
    this.buildAll();
  }

  private async loadBalance(addr: string) {
    this.balance = null;
    try {
      const coins = await this.chain!.rpc.balance(addr);
      this.balance = formatCoins(coins);
    } catch (e) {
      this.balance = `balance unavailable (${userMessage(e)})`;
    }
    if (this.scene.isActive() && this.screen === "lobby") this.renderView();
  }

  private async copyAddress(addr: string) {
    try {
      await navigator.clipboard.writeText(addr);
      showToast(this, "Address copied", "info", 2000);
    } catch {
      showToast(this, "Could not copy: " + addr, "error", 6000);
    }
  }

  // ── Chain ─────────────────────────────────────────────────────────────────

  private async connect() {
    this.status = "connecting";
    this.errorMsg = "";
    this.chain = null;
    this.buildAll();
    try {
      resetChain();
      this.chain = await initChain(CONFIG);
      this.status = "ready";
      void this.loadBalance(this.chain.wallet.address);
      installWalletNotices();
      if (this.unsubscribe.length === 0) {
        this.unsubscribe.push(
          subscribeWalletLocked(() => {
            if (this.scene.isActive() && this.screen === "lobby") this.buildAll();
          }),
          subscribeAccountChanged(() => {
            if (this.scene.isActive() && this.screen === "lobby") void this.connect();
          }),
          subscribeNetworkChanged(() => {
            if (this.scene.isActive() && this.screen === "lobby") void this.connect();
          }),
        );
      }
      this.buildAll();
      await this.refreshGames();
    } catch (e) {
      this.status = "error";
      this.errorMsg = userMessage(e);
      this.buildAll();
    }
  }

  private async refreshGames() {
    if (!this.chain || !this.scene.isActive()) return;
    try {
      const games = await this.chain.realm.listGames(this.chain.wallet.address);
      const key = JSON.stringify(games);
      if (key !== this.gamesKey) {
        this.gamesKey = key;
        this.games = games;
        this.buildAll();
      }
    } catch (e) {
      showToast(this, userMessage(e), "error");
    }
  }

  /** Runs a wallet action; a returned game id opens the game. */
  private async run(action: () => Promise<string | null>) {
    if (this.busy || !this.chain) return;
    this.busy = true;
    this.buildAll();
    try {
      const id = await action();
      if (id) {
        this.scene.start("GameScene", { gameID: id });
        return;
      }
    } catch (e) {
      showToast(this, userMessage(e), "error");
    } finally {
      this.busy = false;
      if (this.scene.isActive()) {
        this.buildAll();
        void this.refreshGames();
      }
    }
  }

  private createGame() {
    void this.run(async () => {
      const chain = this.chain!;
      const r = await chain.realm.createGame(CREATOR_CHAR, this.turns, TIMEOUT_OPTIONS[this.timeoutIndex].minutes);
      if (r.gameID) return r.gameID;
      // The tx result was not indexed in time: the game is the newest of ours.
      const games = await chain.realm.listGames(chain.wallet.address);
      return games.mine[0]?.id ?? null;
    });
  }

  private joinGame(id: string) {
    void this.run(async () => {
      await this.chain!.realm.joinGame(id, JOINER_CHAR);
      return id;
    });
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private buildAll() {
    for (const fx of this.splashFx) fx.remove();
    this.splashFx = [];
    this.children.removeAll(true);
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(0, 0, w, h, SPLASH_GROUND).setOrigin(0);
    if (this.screen === "splash") {
      this.view?.hide();
      this.buildSplash();
      return;
    }
    this.renderView();
  }

  /** Shows the lobby screen with the scene's current state. */
  private renderView() {
    this.view?.render({
      status: this.status,
      error: this.errorMsg,
      chainId: this.chain?.config.chainId ?? "",
      address: this.chain?.wallet.address ?? "",
      balance: this.balance ?? "",
      locked: walletLocked(),
      busy: this.busy,
      games: this.games,
      creatorChar: CREATOR_CHAR,
      joinerChar: JOINER_CHAR,
      turns: this.turns,
      turnOptions: TURN_OPTIONS,
      timeoutIndex: this.timeoutIndex,
      timeoutOptions: TIMEOUT_OPTIONS,
    });
  }

  /**
   * Plays the western music in the lobby, fading in once loaded. The lobby is
   * reached by a click (Connect with Adena) or from a game, so the browser
   * already lets the page play sound.
   */
  private playMusic() {
    if (!MUSIC_ENABLED || this.music || this.shutDown || this.screen !== "lobby") return;
    if (!this.cache.audio.exists(MUSIC_KEY)) {
      if (this.load.isLoading()) {
        // The gunshots are still loading: the music comes once they are in.
        this.load.once("complete", () => this.playMusic());
        return;
      }
      this.load.audio(MUSIC_KEY, MUSIC_FILE);
      this.load.once(`filecomplete-audio-${MUSIC_KEY}`, () => this.playMusic());
      this.load.start();
      return;
    }
    const music = this.sound.add(MUSIC_KEY, { volume: 0 });
    this.music = music;
    // Played once, not looped.
    music.once("complete", () => {
      if (this.music === music) this.music = null;
      music.destroy();
    });
    music.play();
    this.tweens.add({ targets: music, volume: MUSIC_VOLUME, duration: MUSIC_FADE_MS });
  }

  /** Fades the music out when a game opens or on Quit back to the splash; plain timers, as the scene's tweens stop when a game opens. */
  private fadeOutMusic() {
    const music = this.music;
    if (!music) return;
    this.music = null;
    const from = music.volume;
    const start = performance.now();
    const step = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / MUSIC_FADE_MS);
      music.volume = from * (1 - t);
      if (t < 1) return;
      window.clearInterval(step);
      music.destroy();
    }, 30);
  }

  /**
   * The splash, after the design canvas (AGENTS.md, Design): on dark ink in a
   * double-ruled frame, the cover framed like an action card, the tagline, a
   * line on the game, the Connect button and the credit.
   */
  private buildSplash() {
    const w = this.scale.width;
    const h = this.scale.height;
    const intro = !this.splashIntroPlayed;
    this.splashIntroPlayed = true;
    this.add.rectangle(0, 0, w, h, SPLASH_GROUND).setOrigin(0);
    this.add
      .graphics()
      .lineStyle(2, SPLASH_RULE)
      .strokeRoundedRect(18, 18, w - 36, h - 36, 22)
      .strokeRoundedRect(26, 26, w - 52, h - 52, 16);

    const creditY = h - 40;
    let y = 64;
    if (this.textures.exists("splash")) {
      const src = this.textures.get("splash").getSourceImage() as { width: number; height: number };
      const pad = 12;
      // The cover takes the height left by the lines below it, within the frame's width.
      const room = Math.max(180, creditY - 30 - SPLASH_BELOW_COVER - y - 2 * pad);
      const scale = Math.min(room / src.height, (w - 100 - 2 * pad) / src.width);
      const cw = src.width * scale;
      const ch = src.height * scale;
      const box = this.add.graphics();
      box.fillStyle(0x000000, 0.45).fillRoundedRect(w / 2 - cw / 2 - pad - 4, y + 14, cw + 2 * pad + 8, ch + 2 * pad + 8, 28);
      box.fillStyle(SPLASH_RULE).fillRoundedRect(w / 2 - cw / 2 - pad - 3, y - 3, cw + 2 * pad + 6, ch + 2 * pad + 6, 28);
      box.fillStyle(SPLASH_INK).fillRoundedRect(w / 2 - cw / 2 - pad, y, cw + 2 * pad, ch + 2 * pad, 26);
      const img = this.add.image(w / 2, y + pad + ch / 2, "splash").setScale(scale);
      if (intro) this.splashFx.push(this.tweens.add({ targets: box, alpha: { from: 0, to: 1 }, duration: SPLASH_INTRO_MS * 0.6 }));
      this.animateCover(img, scale, intro);
      y += ch + 2 * pad;
    } else {
      this.add.text(w / 2, y, "GNOSLINGER", { fontFamily: RYE, fontSize: "56px", color: SPLASH_PAPER_STR }).setOrigin(0.5, 0);
      y += 80;
    }

    const first = this.children.length;
    const tagline = this.add
      .text(w / 2, y + 26, SUBTITLE.toUpperCase(), { fontFamily: RYE, fontSize: "22px", color: SPLASH_PAPER_STR, letterSpacing: 6 })
      .setOrigin(0.5, 0);
    const line = this.add
      .text(w / 2, tagline.y + tagline.height + 8, SPLASH_LINE, {
        fontFamily: ZILLA,
        fontStyle: "italic",
        fontSize: "18px",
        color: "#D9C9A8",
        align: "center",
        wordWrap: { width: w - 100 },
      })
      .setOrigin(0.5, 0);
    this.makeSplashButton(w / 2, line.y + line.height + 26 + 29, "Connect with Adena", () => this.enter());
    this.add
      .text(w / 2, creditY, CREDIT, { fontFamily: ZILLA, fontSize: "14px", color: "#B9A88A", align: "center", lineSpacing: 4, wordWrap: { width: Math.min(832, w - 100) } })
      .setOrigin(0.5, 1);
    if (intro) {
      const rest = this.children.list.slice(first);
      this.splashFx.push(this.tweens.add({ targets: rest, alpha: { from: 0, to: 1 }, delay: SPLASH_INTRO_MS * 0.7, duration: 600 }));
    }
  }

  /** The splash's big button: parchment ringed in ink and brick red, sitting on a dark red edge; lighter under the pointer. */
  private makeSplashButton(cx: number, cy: number, label: string, onClick: () => void) {
    const text = this.add.text(0, 0, label, { fontFamily: ZILLA, fontStyle: "bold", fontSize: "22px", color: SPLASH_INK_STR }).setOrigin(0, 0.5);
    const icon = this.textures.exists("adena_icon") ? 30 : 0;
    const gap = icon ? 12 : 0;
    const bw = 28 + icon + gap + text.width + 28;
    const bh = 58;
    const x = cx - bw / 2;
    const y = cy - bh / 2;
    const bg = this.add.graphics();
    const draw = (fill: number) => {
      bg.clear();
      bg.fillStyle(SPLASH_DARK_RED).fillRoundedRect(x - 3, y - 3, bw + 6, bh + 12, 14); // the edge below
      bg.fillStyle(SPLASH_RED).fillRoundedRect(x - 3, y - 3, bw + 6, bh + 6, 14); // the red ring
      bg.fillStyle(fill).fillRoundedRect(x, y, bw, bh, 12);
      bg.lineStyle(3, SPLASH_INK).strokeRoundedRect(x + 1.5, y + 1.5, bw - 3, bh - 3, 11);
    };
    draw(SPLASH_PAPER);
    bg.setDepth(1);
    text.setPosition(x + 28 + icon + gap, cy).setDepth(2);
    if (icon) this.add.image(x + 28 + icon / 2, cy, "adena_icon").setDisplaySize(icon, icon).setDepth(2);
    const zone = this.add.zone(cx, cy, bw, bh).setInteractive({ useHandCursor: true }).setDepth(2);
    zone.on("pointerover", () => draw(SPLASH_CREAM));
    zone.on("pointerout", () => draw(SPLASH_PAPER));
    zone.on("pointerup", onClick);
  }


  /**
   * Smoke curling up from the gunman's muzzle to the porch roof, over the
   * painted smoke: wisps that grow, sway and fade, sized to the cover.
   */
  private gunSmoke(bounds: Phaser.Geom.Rectangle) {
    const k = bounds.height / 1646; // cover pixels -> screen pixels
    const lifespan = 3600;
    const rise = (MUZZLE.rise * bounds.height) / (lifespan / 1000);
    const drift = new DustDrift({ value: 1 }, 40);
    const smoke = this.add.particles(bounds.x + MUZZLE.x * bounds.width, bounds.y + MUZZLE.y * bounds.height, CLOUD_KEY, {
      x: { min: -4 * k, max: 4 * k },
      speedX: { min: -14 * k, max: 6 * k },
      speedY: { min: -rise * 1.15, max: -rise * 0.85 },
      scale: { start: (14 * k) / 70, end: (55 * k) / 70 },
      alpha: { onEmit: () => 0, onUpdate: (_p, _k, t) => 0.6 * (t < 0.15 ? t / 0.15 : (1 - t) / 0.85) },
      rotate: { onEmit: (p) => drift.start(p!), onUpdate: (p) => drift.angle(p) },
      tint: [0xece8e0, 0xdcd8d0],
      lifespan: { min: lifespan * 0.85, max: lifespan * 1.15 },
      frequency: 260,
    });
    smoke.addParticleProcessor(drift);
    return smoke;
  }

  /** A sand grain and a lumpy cloud of dust, white to be tinted; both irregular so their spin shows. */
  private makeDustTextures() {
    if (!this.textures.exists(DUST_KEY)) {
      const g = this.make.graphics({}, false);
      const grain = [[2, 4], [5, 1], [9, 3], [8, 7], [4, 9], [1, 7]].map(([x, y]) => new Phaser.Math.Vector2(x, y));
      g.fillStyle(0xffffff, 1).fillPoints(grain, true);
      g.generateTexture(DUST_KEY, 10, 10);
      g.destroy();
    }
    if (!this.textures.exists(CLOUD_KEY)) {
      const tex = this.textures.createCanvas(CLOUD_KEY, 96, 64)!;
      const ctx = tex.getContext();
      // Three soft blobs side by side, the middle one biggest.
      for (const [x, y, r] of [[30, 36, 24], [52, 30, 30], [72, 38, 20]]) {
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, "rgba(255,255,255,0.7)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 96, 64);
      }
      tex.refresh();
    }
  }

  /**
   * The cover fades in from black while settling from a slight zoom (first
   * time only), then keeps zooming slowly in and out, with dust blowing across
   * the street; both stay inside the cover's frame.
   */
  private animateCover(img: Phaser.GameObjects.Image, scale: number, intro: boolean) {
    const bounds = img.getBounds();
    const shape = this.make.graphics({}, false);
    shape.fillStyle(0xffffff).fillRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, 16);
    const mask = shape.createGeometryMask();
    img.setMask(mask);
    this.splashFx.push({ remove: () => { mask.destroy(); shape.destroy(); } });

    this.makeDustTextures();
    // The street: the lower 45% of the cover; the wind blows from the left,
    // carrying soft clouds of dust and specks of sand.
    const street = { min: bounds.y + bounds.height * 0.55, max: bounds.bottom };
    const wind = { value: 1 };
    const cloudDrift = new DustDrift(wind, 25);
    const speckDrift = new DustDrift(wind, 400);
    const clouds = this.add.particles(0, 0, CLOUD_KEY, {
      x: { min: bounds.x - 120, max: bounds.x },
      y: street,
      speedX: { min: 30, max: 70 },
      speedY: { min: -6, max: 2 },
      scale: { min: 1.5, max: 4 },
      alpha: { onEmit: () => 0, onUpdate: (_p, _k, t) => 0.3 * Math.sin(Math.PI * t) },
      rotate: { onEmit: (p) => cloudDrift.start(p!), onUpdate: (p) => cloudDrift.angle(p) },
      tint: [0xf0d8a8, 0xe0b880],
      lifespan: { min: 12000, max: 18000 },
      frequency: 1800,
    });
    const specks = this.add.particles(0, 0, DUST_KEY, {
      x: { min: bounds.x - 40, max: bounds.right },
      y: street,
      speedX: { min: 60, max: 160 },
      speedY: { min: -14, max: 4 },
      scale: { min: 0.5, max: 1.4 },
      alpha: { onEmit: () => 0, onUpdate: (_p, _k, t) => 0.9 * Math.sin(Math.PI * t) },
      rotate: { onEmit: (p) => speckDrift.start(p!), onUpdate: (p) => speckDrift.angle(p) },
      tint: [0xf8e8c8, 0xe8c48c, 0xffffff],
      lifespan: { min: 4000, max: 7000 },
      frequency: 160,
    });
    clouds.addParticleProcessor(cloudDrift);
    specks.addParticleProcessor(speckDrift);
    const smoke = this.gunSmoke(bounds);
    const dust = [clouds, specks, smoke];
    // Gusts: now and then the wind picks up or dies down.
    this.splashFx.push(
      this.time.addEvent({
        delay: 1500,
        loop: true,
        callback: () => {
          if (Math.random() < 0.4) return;
          this.tweens.add({ targets: wind, value: Phaser.Math.FloatBetween(0.4, 1.8), duration: Phaser.Math.Between(700, 2000), ease: "Sine.easeInOut" });
        },
      }),
    );
    for (const e of dust) {
      e.setMask(mask);
      e.fastForward(15000);
    }

    const zoom = () =>
      this.tweens.add({ targets: img, scale: scale * SPLASH_ZOOM, duration: SPLASH_ZOOM_MS, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });
    if (!intro) {
      this.splashFx.push(zoom());
      return;
    }
    for (const e of dust) e.setAlpha(0);
    this.splashFx.push(
      this.tweens.add({
        targets: img,
        alpha: { from: 0, to: 1 },
        scale: { from: scale * 1.08, to: scale },
        duration: SPLASH_INTRO_MS,
        ease: "Cubic.easeOut",
        onComplete: () => this.splashFx.push(zoom()),
      }),
      this.tweens.add({ targets: dust, alpha: 1, delay: SPLASH_INTRO_MS * 0.5, duration: 1500 }),
    );
  }

}

/** One particle's drift: its spin, and its own speed factor easing towards a target that keeps changing. */
interface Drift {
  angle: number;
  spin: number;
  base?: number;
  factor: number;
  target: number;
  wait: number;
}

/**
 * Splash dust motion: each particle spins at its own rate and keeps speeding
 * up and slowing down, on top of the wind's gusts (shared by every particle);
 * the faster it goes, the faster it spins.
 */
class DustDrift extends Phaser.GameObjects.Particles.ParticleProcessor {
  private drifts = new WeakMap<Phaser.GameObjects.Particles.Particle, Drift>();

  constructor(
    private wind: { value: number },
    private maxSpin: number,
  ) {
    super(0, 0, true);
  }

  /** Starts a particle's drift; returns its starting angle (rotate op onEmit). */
  start(p: Phaser.GameObjects.Particles.Particle): number {
    const angle = Phaser.Math.Between(0, 359);
    this.drifts.set(p, { angle, spin: Phaser.Math.FloatBetween(-this.maxSpin, this.maxSpin), factor: 1, target: 1, wait: 0 });
    return angle;
  }

  /** The particle's current angle (rotate op onUpdate). */
  angle(p: Phaser.GameObjects.Particles.Particle): number {
    return this.drifts.get(p)?.angle ?? 0;
  }

  update(p: Phaser.GameObjects.Particles.Particle, delta: number) {
    const d = this.drifts.get(p);
    if (!d) return;
    d.base ??= p.velocityX;
    d.wait -= delta;
    if (d.wait <= 0) {
      d.target = Phaser.Math.FloatBetween(0.3, 1.8);
      d.wait = Phaser.Math.Between(400, 2200);
    }
    d.factor += (d.target - d.factor) * Math.min(1, delta / 500);
    const speed = d.factor * this.wind.value;
    p.velocityX = d.base * speed;
    d.angle += d.spin * (delta / 1000) * (0.4 + 0.6 * speed);
  }
}
