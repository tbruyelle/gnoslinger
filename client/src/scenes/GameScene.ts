import Phaser from "phaser";
import type { CardNumber, CardSide, ChoiceType, RelativeDirection } from "../rules";
import { AHEAD_DIRS, BACK_DIRS, dirIndexToAngle, getActionCardAsset, getActionDef, relativeToAbsoluteDir, CHAR_ARROW_DIR } from "../rules";
import { BOARD_A } from "../board/boardA";
import { currentChain, initChain, resetChain, viewerChain, type Chain } from "../chain";
import { CONFIG } from "../config";
import { installWalletNotices } from "../ui/walletNotices";
import { subscribeAccountChanged, subscribeNetworkChanged } from "../chain/adena";
import { userMessage } from "../chain/errors";
import { GamePoller } from "../chain/poller";
import { playerLabel, seatOf, type GameView, type TurnResult, type PlayerStatus, type TurnEvent, type GunView, type GroundGunView } from "../chain/types";
import {
  describeEvents,
  endOfTurnEvents,
  eventsForSegment,
  snapshotAfterSegment,
  splitSteps,
  startOfTurn,
  stepBack,
  stepForward,
  type ReplayPos,
} from "../game/playback";
import { BURST_KEYS, hitBurst } from "../game/bursts";
import { HAND_GROUND, MAX_ACTION_POINTS, canPlay, drawDestinations, drawableGuns, encodePlan, moveDestinations, planCost, validatePlan, type GunMove, type PlanEntry, isEnabled, decodePlan } from "../game/plan";
import { firingGun, gunInHand, replayPlan, type CharView } from "../game/replay";
import { SEGMENTS, segmentFills, turnSegmentCells } from "../game/segments";
import { COCK_AIM_SHOOT_AIM_TIME, SHOOT_AIM_TIME, shotOdds } from "../game/shotOdds";
import { canSee, standingOn } from "../game/sight";
import { SOUND_FILES, SOUND_VOLUME, THROW_FLIGHT_MS, aimTaken, shotDelays, soundKey, soundsForDelay, soundsForEvents, soundsForPreview, throwLandings, variantIndex, woundDelays, type SoundCue, type SoundGroup } from "../game/sounds";
import { SHOOT_OPTIONS, STRENGTH_DAMAGE, STRENGTH_WIELD, TARGET_OPTIONS, isShooting, isStrength, planAllows, throwReach, type ShootOption, type StrengthOption } from "../game/plan";
import { closeCharacterSheet, openCharacterSheet, type GunPick } from "../ui/characterSheet";
import { ShowdownView, showdownLayout, type BoardRect, type CharPanel, type HandSide, type HeaderSeat, type ShowdownLayout, type ShowdownModel, type TimelineRow } from "../ui/showdownView";
import { showToast } from "../ui/toast";
import { CHAIN_CLOCK_MARGIN, charName, formatDuration, formatLeft, MAX_MISSED, missOutcome, pastTimeout, seatsTaken } from "../game/lobby";
import { defaultFacing, nextSeat, seatChar, setupZone, startingChar } from "../game/setup";
import { vpRecap, vpResult } from "../game/vp";
import { routeHash } from "../game/route";
import { loadPending, loadSeenTurn, saveSeenTurn, lockSealed, newSalt, planHash, prunePending, roundTime, savePending, type RevealScope, type Sealed } from "../game/commit";
import { DRAND_MARGIN, lastToCommit, openableSeats, ownRevealDue } from "../game/reveals";
import { openAndReveal } from "../game/opener";
import { seatColor, seatColorNum } from "../ui/seats";
import { TUTORIAL_GAME, TUTORIAL_HASH, tutorialChain, tutorialCoach } from "../tutorial/tutorial";
import { formatGnot, payoutLine } from "../game/stakes";

// ── Layout constants ────────────────────────────────────────────────────────

const TOKEN_SCALE_FACTOR = 1.7;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_FACTOR = 0.12;
const DRAG_THRESHOLD = 4;
const HEX_SPACING = 185; // approximate centre-to-centre distance in board pixels
const GOLD = 0xd4a044;

/** Screen angle (degrees) of each absolute direction, y down. */
const DIR_ANGLE = [270, 330, 30, 90, 150, 210];

type Mode = "sync" | "setup" | "select" | "submitting" | "waiting" | "playback" | "ended" | "spectate";

/**
 * What the lobby hands the scene to set a character up on the board before
 * signing (game/setup.ts): a showdown to call, with the form's options
 * (seats, turns, time), or one to join, in the seat the lobby saw free
 * (the board follows the chain: the seat moves on if someone takes it
 * first).
 */
/** stake: ugnot each player puts in (game/stakes.ts), sent with the call or the join. */
export type SetupRequest =
  | { kind: "create"; charKey: string; seats: number; turns: number; timeoutMinutes: number; stake: number }
  | { kind: "join"; seat: number; charKey: string; stake: number };

/**
 * Setting my character up before calling or joining (SetupRequest): the
 * seat it takes, the hex and facing picked so far, the highlights of the
 * hexes it may stand in, the ghost of my token on the one under the
 * pointer, and whether the call is being signed.
 */
type Setup = {
  req: SetupRequest;
  seat: number;
  hex: string | null;
  facing: number;
  zone: Phaser.GameObjects.GameObject[];
  ghost: Phaser.GameObjects.Image | null;
  busy: boolean;
};

/** A set up just begun: no position picked yet, the character facing its default way. */
function newSetup(req: SetupRequest): Setup {
  return { req, seat: req.kind === "create" ? 0 : req.seat, hex: null, facing: defaultFacing(req.charKey), zone: [], ghost: null, busy: false };
}

/** Depth of the setup zone's highlights: under the aim zone shown on token hover (0.5) and the tokens (from 1). */
const SETUP_ZONE_DEPTH = 0.3;
/** The ghost of my token on the set-up hex under the pointer: above the hovered highlight, under the tokens, see-through. */
const SETUP_GHOST_DEPTH = 0.9;
const SETUP_GHOST_ALPHA = 0.55;


/** Highest delay marker available (DEL 1 to DEL 8). */
const MAX_DELAY_MARKER = 8;

/**
 * Tokens sharing a hex are fanned out along a diagonal, as fractions of the
 * token diameter: a small shift at rest, so the one below peeks out, and a
 * full one while the pointer is over the stack, so each token is wholly
 * visible and clickable.
 */
/** The status overlays drawn over a token (assets/local/<key>.png). */
const STATE_OVERLAYS = ["state_down", "state_dead", "state_passed_out"];
/** The overlay a character shows: killed or passed out first, else down. */
function overlayKey(c: CharView): string | null {
  if (c.status === "killed") return "state_dead";
  if (c.status === "passed_out") return "state_passed_out";
  return c.down ? "state_down" : null;
}

/** The AIM markers available (assets/aimN.gif, from the VASSAL module): aim comes by 2 points, up to 8. */
const AIM_MARKERS = [2, 4, 6, 8];
/** The marker texture for n AIM points: the closest one at or above n. */
function aimMarkerKey(n: number): string {
  return `aim_${AIM_MARKERS.find((m) => m >= n) ?? 8}`;
}
/** Size of an AIM marker as a fraction of the token diameter. */
const AIM_SIZE = 0.42;
/** Endurance boxes a character starts with (rule 14.2); the health bar shows only below that. */
const MAX_ENDURANCE = 20;
/** Colour of the aim line and the shot tracer. */
const AIM_LINE_COLOR = 0xff2020;
/** How long a step of the replay takes to land: the tokens' move (refreshTokens). */
const STEP_MOVE_MS = 450;
/** The extra beat a step with shots takes for the bullets and their bursts. */
const STEP_SHOT_MS = 250;
/** The pause between segments in auto play. */
const AUTO_GAP_MS = 450;
/** How much bigger a token is drawn on an obstacle, where the character stands higher. */
const OBSTACLE_LIFT = 1.1;
/** How far a hex highlight's corners are pulled in from the hex's own, in screen pixels. */
const HEX_HIGHLIGHT_INSET = 4;
/** The aim zone shown while the pointer is on a token: the palette's brick for an enemy, its action green for mine. */
const ENEMY_ZONE_COLOR = 0xb5482a;
const MY_ZONE_COLOR = 0x4f7a3a;
/** A move choice off the map, which runs away (15.5): the palette's gold. */
const RUN_AWAY_COLOR = 0xf2b544;
/** How long a second click on Send plan confirms passing with an empty plan. */
const PASS_CONFIRM_MS = 5000;
/** A reveal or an opening whose transaction failed is not tried again by itself before this (auto-sign). */
const REVEAL_RETRY_MS = 20_000;
/** An opening that could not decrypt anything (drand's round not served yet) is tried again after this, quietly. */
const OPEN_RETRY_MS = 5_000;
/** The tracer a bullet leaves behind it. */
const SHOT_LINE_COLOR = 0xffffff;

/** How far from the hex centre the occupants of a shared hex sit, in token diameters: at rest, and spread under the pointer. */
const STACK_REST = 0.17;
const STACK_SPREAD = 0.6;
/** The room between two spread neighbours' centres, in token diameters, so they barely overlap. */
const STACK_GAP = 0.9;
const STACK_MS = 180;
/** The gold halo behind a token under the pointer: its diameter over the ring's. */
const HALO_SIZE = 1.3;
const HALO_TEXTURE = "token_halo";

/** The halo's texture, a gold disc fading out towards its rim, drawn once per game. */
function haloTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(HALO_TEXTURE)) return HALO_TEXTURE;
  const size = 128;
  const tex = scene.textures.createCanvas(HALO_TEXTURE, size, size);
  const ctx = tex?.getContext();
  if (!tex || !ctx) return HALO_TEXTURE;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // The ring sits at 1 / HALO_SIZE of the radius: full gold up to it, fading out beyond.
  g.addColorStop(0, "rgba(242,181,68,0.95)");
  g.addColorStop(0.7, "rgba(242,181,68,0.85)");
  g.addColorStop(1, "rgba(242,181,68,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
  return HALO_TEXTURE;
}

/**
 * Where occupant i of n sits around a shared hex's centre, in token
 * diameters: a star, the first one up-left and the others clockwise (two
 * make the down-right diagonal). Spread, the star widens with the count so
 * neighbours stay apart.
 */
function stackOffset(i: number, n: number, spread: boolean): { dx: number; dy: number } {
  const r = spread ? Math.max(STACK_SPREAD, STACK_GAP / 2 / Math.sin(Math.PI / n)) : STACK_REST;
  const a = (-3 * Math.PI) / 4 + (2 * Math.PI * i) / n;
  return { dx: r * Math.cos(a), dy: r * Math.sin(a) };
}

/**
 * What a step's refresh keeps as it is for a while: the tokens of the seats
 * named (ms before they show their new state: a character hit reacts when
 * its groan or death cry plays) and the guns, by ground id, they drop.
 */
interface Hold {
  seats: Map<number, number>;
  ground: Map<number, number>;
}

/** Paints a gun icon: full colour when cocked, greyed out when not, and a red dot per loaded chamber along the bottom edge (dark once spent). */
function paintGun(gun: GunView, img: Phaser.GameObjects.Image, dots: Phaser.GameObjects.Graphics, size: number): number {
  img.setDisplaySize(size, size);
  const alpha = gun.cocked ? 1 : 0.7;
  if (gun.cocked) img.clearTint();
  else img.setTint(0xb4b4b4);
  dots.clear();
  const n = Math.max(gun.capacity, gun.shells, 1);
  const step = size / (n + 1);
  const radius = Math.max(1.5, size * 0.055);
  for (let i = 0; i < n; i++) {
    const loaded = i < gun.shells;
    dots.fillStyle(loaded ? 0xd81818 : 0x3a2510, loaded ? 1 : 0.6);
    dots.fillCircle(-size / 2 + step * (i + 1), size * 0.4, radius);
  }
  if (gun.exploded) {
    // Blown up (13.31): a red strike across the icon, the gun is useless.
    const r = size * 0.45;
    dots.lineStyle(Math.max(2, size * 0.1), 0xd81818, 1);
    dots.lineBetween(-r, r, r, -r);
  }
  return alpha;
}

/** The option buttons offered for each gun action (uncocking stays possible in the plan string, not in the menu). */
const MENU_OPTIONS: Record<string, ShootOption[]> = { "Cock/Aim/Shoot": ["cock", "aim", "shoot"], Shoot: ["shoot"], Throw: ["throw"] };
/** Aim time printed on Throw for a one-handed weapon (17.3). */
const THROW_AIM_TIME = 2;

/** How far a gun on the ground lies from its hex centre toward the lower-right, as a fraction of the token diameter. */
const GROUND_ASIDE = 0.28;

/** Gun models with an icon in assets/guns/<type>.gif. */
const GUN_TYPES = ["colt45"];
/**
 * The gun-in-hand icon sits at the token's top-left or top-right corner, the
 * corner above the arrow once the figure stands upright (the art leans 30°
 * toward the arrow's side, see the sheet's SHEET_UPRIGHT_DEG): size and
 * distance from the centre as fractions of the token diameter.
 */
const GUN_SIZE = 0.4;
const GUN_RADIUS = 0.5;

/** Groups the display objects of one character token. */
class CharacterToken {
  private overlay: Phaser.GameObjects.Image | null = null;
  /** The "DEL n" marker at the bottom corner on the arrow's side (upright frame), when the character carries delay. */
  private badge: Phaser.GameObjects.Image | null = null;
  /** The icon of the gun held in a hand, at the token corner above the arrow, with its shells as red dots; greyed out while uncocked. */
  private gun: Phaser.GameObjects.Image | null = null;
  private shells: Phaser.GameObjects.Graphics | null = null;
  /** Progress of the gun icon's entrance (0 at the token centre, transparent and turning; 1 in place). */
  private gunIn = 1;
  /** The icon's opacity once in place (dimmed while uncocked). */
  private gunAlpha = 1;
  /** Extra rotation of the icon, for the recoil of a shot. */
  private recoil = 0;
  /** The AIM markers of the characters aiming at this one, by aimer seat: at the corner mirroring the gun icon, fanned along the rim, each framed in its aimer's colour. */
  private aims = new Map<number, { img: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Rectangle }>();
  /** The endurance bar above the token, shown once boxes are crossed off; shown is the value it displays (tweened). */
  private bar: { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle } | null = null;
  private shown = MAX_ENDURANCE;
  private barTween: Phaser.Tweens.Tween | null = null;
  /** The sprite's resting tint (grey once out of the fight), which a hurt flash fades back to. */
  private baseTint = 0xffffff;
  /** The sprite's scale as built, before any lift. */
  private readonly baseScale: number;
  /** How much bigger the token is drawn for standing higher (on an obstacle), and its tween. */
  private lift = 1;
  private liftTween: Phaser.Tweens.Tween | null = null;
  /** The size the gun icon's shells were painted at, so they can be rescaled with the token. */
  private gunPainted = 0;

  /** In-flight position tweens, retargeted by moveTo without touching the rotation. */
  private posTweens: Phaser.Tweens.Tween[] = [];
  /** The ring's breathing while the character awaits its player's move (setPulse), and its radius at rest. */
  private pulseTween: Phaser.Tweens.Tween | null = null;
  private readonly ringRadius: number;
  /** The gold halo behind the token while the pointer is on it (setHover), made on the first hover. */
  private halo: Phaser.GameObjects.Image | null = null;
  /** Hover handlers for the gun icon and the AIM markers (by aimer seat), set by the scene. */
  onGunHover: ((over: boolean) => void) | null = null;
  onAimHover: ((aimer: number, over: boolean) => void) | null = null;

  /**
   * Each token owns a band of 5 depths (sprite, ring, DOWN overlay, gun, DEL
   * badge), later seats above earlier ones, so stacked tokens layer as units
   * and a hidden token's badge never shows over the token covering it. The
   * ring, around the sprite, goes over it; the hover halo goes under both.
   */
  constructor(
    readonly charKey: string,
    readonly sprite: Phaser.GameObjects.Image,
    readonly highlight: Phaser.GameObjects.Arc,
    private readonly depth: number,
  ) {
    sprite.setDepth(depth);
    highlight.setDepth(depth + 1);
    this.baseScale = sprite.scaleX;
    this.ringRadius = highlight.radius;
  }

  /**
   * Draws the token lift times its size (on an obstacle it stands higher,
   * 36.5), growing or shrinking over duration ms along with its ring,
   * overlay and markers.
   */
  setLift(tweens: Phaser.Tweens.TweenManager, lift: number, duration: number) {
    if (lift === this.lift && !this.liftTween) return;
    this.liftTween?.stop();
    this.liftTween = null;
    if (duration <= 0) {
      this.lift = lift;
      this.applyLift();
      return;
    }
    this.liftTween = tweens.add({
      targets: this,
      lift,
      duration,
      ease: "Cubic.easeInOut",
      onUpdate: () => this.applyLift(),
      onComplete: () => (this.liftTween = null),
    });
  }

  private applyLift() {
    this.sprite.setScale(this.baseScale * this.lift);
    this.highlight.setScale(this.lift);
    this.sizeHalo();
    this.overlay?.setScale(this.sprite.scaleX);
    const d = this.sprite.displayWidth;
    this.badge?.setDisplaySize(d * 0.42, d * 0.42);
    for (const a of this.aims.values()) {
      a.img.setDisplaySize(d * AIM_SIZE, d * AIM_SIZE);
      a.ring.setSize(d * AIM_SIZE + 4, d * AIM_SIZE + 4);
    }
    if (this.gun && this.gunPainted > 0) {
      this.gun.setDisplaySize(d * GUN_SIZE, d * GUN_SIZE);
      this.shells?.setScale((d * GUN_SIZE) / this.gunPainted);
    }
    this.bar?.bg.setSize(d * 0.9, Math.max(6, d * 0.09));
    this.follow();
  }

  static depthFor(seat: number): number {
    return 1 + seat * 5;
  }

  private get parts(): Phaser.GameObjects.GameObject[] {
    const list: Phaser.GameObjects.GameObject[] = [this.sprite, this.highlight];
    if (this.overlay) list.push(this.overlay);
    if (this.halo) list.push(this.halo);
    if (this.badge) list.push(this.badge);
    if (this.gun) list.push(this.gun);
    if (this.shells) list.push(this.shells);
    for (const a of this.aims.values()) list.push(a.img, a.ring);
    if (this.bar) list.push(this.bar.bg, this.bar.fill);
    return list;
  }

  killTweens(tweens: Phaser.Tweens.TweenManager) {
    for (const p of this.parts) tweens.killTweensOf(p);
    this.posTweens = [];
    this.pulseTween = null;
    this.highlight.setRadius(this.ringRadius);
  }

  /** Makes the ring breathe, growing and shrinking around the token, while the character awaits its player's move; off stops it. */
  setPulse(tweens: Phaser.Tweens.TweenManager, on: boolean) {
    if (on === (this.pulseTween !== null)) return;
    if (!on) {
      this.pulseTween?.stop();
      this.pulseTween = null;
      this.highlight.setRadius(this.ringRadius);
      return;
    }
    const r = this.ringRadius;
    this.pulseTween = tweens.add({ targets: this.highlight, radius: { from: r, to: r * 1.055 }, duration: 750, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  /** Tweens the sprite; the other parts follow it every frame. */
  moveTo(tweens: Phaser.Tweens.TweenManager, sx: number, sy: number, duration: number) {
    for (const tw of this.posTweens) tw.stop();
    this.posTweens = [tweens.add({ targets: this.sprite, x: sx, y: sy, duration, ease: "Cubic.easeInOut", onUpdate: () => this.follow() })];
  }

  setPosition(sx: number, sy: number) {
    this.sprite.setPosition(sx, sy);
    this.follow();
  }

  rotateTo(tweens: Phaser.Tweens.TweenManager, targetAngle: number, duration: number) {
    let diff = targetAngle - this.sprite.angle;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (Math.abs(diff) > 0.5) {
      tweens.add({ targets: this.sprite, angle: this.sprite.angle + diff, duration, ease: "Cubic.easeInOut", onUpdate: () => this.follow() });
    }
  }

  setAngle(angle: number) {
    this.sprite.setAngle(angle);
    this.follow();
  }

  /** Places the ring, overlay, badge and gun icon relative to the sprite. */
  private follow() {
    const { x, y } = this.sprite;
    this.highlight.setPosition(x, y);
    this.halo?.setPosition(x, y);
    this.overlay?.setPosition(x, y);
    if (this.badge) {
      const a = Phaser.Math.DegToRad(this.badgeAngle());
      const r = this.sprite.displayWidth * GUN_RADIUS;
      this.badge.setPosition(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    if (this.gun) {
      const a = Phaser.Math.DegToRad(this.gunAngle());
      const r = this.sprite.displayWidth * GUN_RADIUS * this.gunIn; // slides out from the centre on entrance
      this.gun
        .setPosition(x + Math.cos(a) * r, y + Math.sin(a) * r)
        .setAlpha(this.gunAlpha * this.gunIn)
        .setAngle((1 - this.gunIn) * 360 + this.recoil);
      this.shells?.setPosition(this.gun.x, this.gun.y).setAlpha(this.gunIn).setAngle(this.gun.angle);
    }
    let k = 0;
    for (const marker of this.aims.values()) {
      const a = Phaser.Math.DegToRad(this.aimAngle(k++));
      const r = this.sprite.displayWidth * GUN_RADIUS;
      marker.img.setPosition(x + Math.cos(a) * r, y + Math.sin(a) * r);
      marker.ring.setPosition(marker.img.x, marker.img.y);
    }
    if (this.bar) {
      const d = this.sprite.displayWidth;
      const w = d * 0.9;
      const by = y - d * 0.66;
      this.bar.bg.setPosition(x - w / 2, by);
      const ratio = Phaser.Math.Clamp(this.shown / MAX_ENDURANCE, 0, 1);
      this.bar.fill.setPosition(x - w / 2 + 1, by + 1).setSize(Math.max(0, (w - 2) * ratio), this.bar.bg.height - 2);
      this.bar.fill.setFillStyle(Phaser.Display.Color.GetColor(Math.round(220 * (1 - ratio) + 40 * ratio), Math.round(190 * ratio + 30), 30), 1);
    }
  }

  /** Shows the endurance bar once boxes are crossed off (none at full endurance), shrinking it smoothly when it drops; animate off sets it outright. */
  setEndurance(scene: Phaser.Scene, n: number, mask: Phaser.Display.Masks.GeometryMask, animate = true) {
    if (n >= MAX_ENDURANCE) {
      this.bar?.bg.destroy();
      this.bar?.fill.destroy();
      this.bar = null;
      this.shown = n;
      return;
    }
    const d = this.sprite.displayWidth;
    const hurt = animate && this.bar !== null && n < this.shown; // a drop seen on screen, not the first display
    if (!this.bar) {
      this.bar = {
        bg: scene.add.rectangle(0, 0, d * 0.9, Math.max(6, d * 0.09), 0x1a0f07, 0.9).setOrigin(0, 0.5).setStrokeStyle(1, 0xffe2a0, 0.9).setMask(mask).setDepth(this.depth + 4),
        fill: scene.add.rectangle(0, 0, 1, 1, 0x40c040, 1).setOrigin(0, 0.5).setMask(mask).setDepth(this.depth + 4),
      };
      if (this.shown >= MAX_ENDURANCE) this.shown = MAX_ENDURANCE; // first drop: shrink from full
    }
    this.bar.bg.setSize(d * 0.9, Math.max(6, d * 0.09));
    this.barTween?.stop();
    if (animate) {
      this.barTween = scene.tweens.add({ targets: this, shown: n, duration: n < this.shown ? 500 : 250, ease: "Cubic.easeOut", onUpdate: () => this.follow() });
    } else {
      this.shown = n;
    }
    if (hurt) this.hurtFlash(scene);
    this.follow();
  }

  /** Flashes the token red, fading back to its resting tint: when endurance drops, and when a bullet lands. */
  hurtFlash(scene: Phaser.Scene) {
    const red = Phaser.Display.Color.ValueToColor(0x7a0c0a); // the blood stains' dark red
    const base = Phaser.Display.Color.ValueToColor(this.baseTint);
    const flash = { t: 0 };
    scene.tweens.add({
      targets: flash,
      t: 1,
      duration: 650,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(red, base, 100, flash.t * 100);
        this.sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
      onComplete: () => this.applyBaseTint(),
    });
  }

  private applyBaseTint() {
    if (this.baseTint === 0xffffff) this.sprite.clearTint();
    else this.sprite.setTint(this.baseTint);
  }

  /**
   * Screen angle of the gun corner's mirror image across the vertical axis
   * of the upright figure: the other top corner, 135° from the arrow
   * toward the figure's head. The k-th marker goes further round the rim,
   * away from the gun and the badge, 40° a step.
   */
  private aimAngle(k = 0): number {
    const side = CHAR_ARROW_DIR[this.charKey] === 5 ? 1 : -1;
    return this.arrowAngle() + side * (135 + 40 * k);
  }

  /** Screen angle of the bottom corner below the gun corner in the upright frame: 45° from the arrow toward the feet. */
  private badgeAngle(): number {
    return this.arrowAngle() + (CHAR_ARROW_DIR[this.charKey] === 5 ? -45 : 45);
  }

  /** Shows the AIM markers of the points held on this character, one per aimer (seat and points), in seat order; none for nobody. */
  setTargetAims(scene: Phaser.Scene, aims: { seat: number; n: number }[], mask: Phaser.Display.Masks.GeometryMask) {
    const keep = new Set(aims.filter((a) => a.n > 0 && scene.textures.exists(aimMarkerKey(a.n))).map((a) => a.seat));
    for (const [seat, a] of this.aims) {
      if (keep.has(seat)) continue;
      a.img.destroy();
      a.ring.destroy();
      this.aims.delete(seat);
    }
    const size = this.sprite.displayWidth * AIM_SIZE;
    for (const { seat, n } of aims) {
      if (!keep.has(seat)) continue;
      const key = aimMarkerKey(n);
      let a = this.aims.get(seat);
      if (!a) {
        // The frame: a square outline in the aimer's colour, just outside the marker, under every marker so none covers another's.
        const ring = scene.add.rectangle(this.sprite.x, this.sprite.y, size + 4, size + 4).setStrokeStyle(3, seatColorNum(seat), 1).setMask(mask).setDepth(this.depth + 4);
        const img = scene.add.image(this.sprite.x, this.sprite.y, key).setOrigin(0.5).setMask(mask).setDepth(this.depth + 4.5).setInteractive();
        img.on("pointerover", () => this.onAimHover?.(seat, true));
        img.on("pointerout", () => this.onAimHover?.(seat, false));
        a = { img, ring };
        this.aims.set(seat, a);
      } else if (a.img.texture.key !== key) {
        a.img.setTexture(key);
      }
      a.img.setDisplaySize(size, size).setAlpha(1); // undo a fade-out if the aim came back
      a.ring.setSize(size + 4, size + 4).setAlpha(1);
    }
    this.follow();
  }

  /** Drifts an aimer's AIM marker up and fades it away, when that aim is lost. */
  fadeAim(seat: number, tweens: Phaser.Tweens.TweenManager, duration: number) {
    const a = this.aims.get(seat);
    if (!a) return;
    tweens.add({ targets: [a.img, a.ring], y: a.img.y - this.sprite.displayWidth * 0.5, alpha: 0, duration, ease: "Cubic.easeIn" });
  }

  /** Drifts the DEL badge up and fades it away, when the delay is gone. */
  fadeBadge(tweens: Phaser.Tweens.TweenManager, duration: number) {
    if (!this.badge) return;
    tweens.add({ targets: this.badge, y: this.badge.y - this.sprite.displayWidth * 0.5, alpha: 0, duration, ease: "Cubic.easeIn" });
  }

  /** Zooms the DEL badge in and out once, when the delay changes. */
  pulseBadge(tweens: Phaser.Tweens.TweenManager) {
    if (!this.badge) return;
    const { scaleX, scaleY } = this.badge;
    tweens.add({ targets: this.badge, scaleX: scaleX * 1.35, scaleY: scaleY * 1.35, duration: 170, yoyo: true, ease: "Quad.easeOut" });
  }

  /** Zooms an aimer's AIM marker in and out once, when that aim grows. */
  pulseAim(seat: number, tweens: Phaser.Tweens.TweenManager) {
    const a = this.aims.get(seat);
    if (!a) return;
    const { scaleX, scaleY } = a.img;
    tweens.add({ targets: a.img, scaleX: scaleX * 1.35, scaleY: scaleY * 1.35, duration: 170, yoyo: true, ease: "Quad.easeOut" });
    tweens.add({ targets: a.ring, scaleX: 1.35, scaleY: 1.35, duration: 170, yoyo: true, ease: "Quad.easeOut" });
  }

  /** Greys out a character that is out of the fight. */
  /** Whether the token is on the board (not gone off the map). */
  onBoard(): boolean {
    return this.sprite.visible;
  }

  /**
   * Walks the token off the map to (sx, sy), its ring with it, fading out;
   * what it carries goes at once. setStatus brings it all back.
   */
  leave(tweens: Phaser.Tweens.TweenManager, sx: number, sy: number) {
    for (const tw of this.posTweens) tw.stop();
    this.posTweens = [];
    for (const p of this.parts) if (p !== this.sprite && p !== this.highlight) (p as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);
    this.posTweens = [tweens.add({ targets: this.sprite, x: sx, y: sy, duration: 700, ease: "Cubic.easeIn", onUpdate: () => this.follow() })];
    tweens.add({
      targets: [this.sprite, this.highlight],
      alpha: 0,
      duration: 700,
      ease: "Cubic.easeIn",
      onComplete: () => {
        this.sprite.setVisible(false);
        this.highlight.setVisible(false).setAlpha(1);
      },
    });
  }

  setStatus(status: PlayerStatus) {
    const out = status !== "alive";
    this.sprite.setAlpha(out ? 0.75 : 1);
    this.baseTint = out ? 0x808080 : 0xffffff;
    this.applyBaseTint();
    // Off the map (15.5): the token and all it carries leave the board.
    const gone = status === "ran_away";
    for (const p of this.parts) (p as unknown as Phaser.GameObjects.Components.Visible).setVisible(!gone);
    this.highlight.setAlpha(1); // back from an exit cut short (leave)
  }

  /** The flinch of a hit: the token rocks quickly back and forth around its facing. */
  flinch(tweens: Phaser.Tweens.TweenManager) {
    const base = this.sprite.angle;
    tweens.add({
      targets: this.sprite,
      angle: base + 14,
      duration: 55,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
      onUpdate: () => this.follow(),
      onComplete: () => {
        this.sprite.setAngle(base);
        this.follow();
      },
    });
  }

  /** The recoil of a shot: a quick small kick of the gun icon. */
  kickGun(tweens: Phaser.Tweens.TweenManager) {
    if (!this.gun) return;
    tweens.add({ targets: this, recoil: -28, duration: 70, yoyo: true, ease: "Quad.easeOut", onUpdate: () => this.follow() });
  }

  /** Cocking the gun: the same swing as the recoil, slower. */
  cockGun(tweens: Phaser.Tweens.TweenManager) {
    if (!this.gun) return;
    tweens.add({ targets: this, recoil: -28, duration: 260, yoyo: true, ease: "Sine.easeInOut", onUpdate: () => this.follow() });
  }

  /** Where the gun icon sits, or the token centre without one. */
  gunCentre(): { x: number; y: number } {
    return this.gun ? { x: this.gun.x, y: this.gun.y } : { x: this.sprite.x, y: this.sprite.y };
  }

  /** Screen angle (degrees, clockwise from east) the token's baked-in arrow points at. */
  private arrowAngle(): number {
    return this.sprite.angle + 60 * (CHAR_ARROW_DIR[this.charKey] ?? 1) - 90;
  }

  /**
   * Screen angle of the corner above the arrow in the figure's upright
   * frame: 45° toward the figure's head from the arrow, which points to its
   * right (NE tokens) or its left (NW tokens).
   */
  private gunAngle(): number {
    return this.arrowAngle() + (CHAR_ARROW_DIR[this.charKey] === 5 ? 45 : -45);
  }

  private delay = 0;

  /** The delay points the badge shows (0 without a badge). */
  delayShown(): number {
    return this.delay;
  }

  /** Shows the delay marker for n points (none for 0), sized relative to the token. */
  setDelay(scene: Phaser.Scene, n: number, mask: Phaser.Display.Masks.GeometryMask) {
    this.delay = Math.max(0, n);
    if (n <= 0) {
      this.badge?.destroy();
      this.badge = null;
      return;
    }
    const key = `delay_${Math.min(n, MAX_DELAY_MARKER)}`;
    if (!scene.textures.exists(key)) return;
    const size = this.sprite.displayWidth * 0.42;
    if (!this.badge) {
      this.badge = scene.add.image(this.sprite.x, this.sprite.y, key).setOrigin(0.5).setMask(mask).setDepth(this.depth + 4);
    } else if (this.badge.texture.key !== key) {
      this.badge.setTexture(key);
    }
    this.badge.setDisplaySize(size, size).setAlpha(1); // undo a fade-out if delay came back
    this.follow();
  }

  /** Shows the icon of the gun held in a hand (none when every gun is holstered), its shells as red dots along the bottom; animate plays the entrance of a new icon. */
  setGun(scene: Phaser.Scene, gun: GunView | null, mask: Phaser.Display.Masks.GeometryMask, animate = true) {
    const key = `gun_${gun?.type}`;
    if (!gun || !scene.textures.exists(key)) {
      this.gun?.destroy();
      this.shells?.destroy();
      this.gun = this.shells = null;
      return;
    }
    const size = this.sprite.displayWidth * GUN_SIZE;
    if (!this.gun) {
      this.gun = scene.add.image(this.sprite.x, this.sprite.y, key).setOrigin(0.5).setMask(mask).setDepth(this.depth + 3).setInteractive();
      this.gun.on("pointerover", () => this.onGunHover?.(true));
      this.gun.on("pointerout", () => this.onGunHover?.(false));
      this.shells = scene.add.graphics().setMask(mask).setDepth(this.depth + 3);
      // Entrance: fades in while sliding and spinning from the token centre to its corner.
      this.gunIn = animate ? 0 : 1;
      if (animate) scene.tweens.add({ targets: this, gunIn: 1, duration: 450, ease: "Cubic.easeOut", onUpdate: () => this.follow() });
    } else if (this.gun.texture.key !== key) {
      this.gun.setTexture(key);
    }
    this.gunAlpha = paintGun(gun, this.gun, this.shells!, size);
    this.gunPainted = size;
    this.shells?.setScale(1);
    this.follow();
  }

  /** Shows the status overlay (DOWN, DEAD, PASSED OUT), or none. */
  setOverlay(scene: Phaser.Scene, key: string | null, mask: Phaser.Display.Masks.GeometryMask) {
    if (!key || !scene.textures.exists(key)) {
      this.overlay?.destroy();
      this.overlay = null;
      return;
    }
    if (!this.overlay) {
      this.overlay = scene.add
        .image(this.sprite.x, this.sprite.y, key)
        .setScale(this.sprite.scaleX)
        .setOrigin(0.5)
        .setMask(mask)
        .setDepth(this.depth + 2);
    } else if (this.overlay.texture.key !== key) {
      this.overlay.setTexture(key);
    }
  }

  setHighlight(color: number, alpha: number, width = 3) {
    this.highlight.setStrokeStyle(width, color, alpha);
  }

  /** Fades a gold halo in behind the token while the pointer is on it, out when it leaves; the ring keeps its seat colour. */
  setHover(scene: Phaser.Scene, on: boolean, mask: Phaser.Display.Masks.GeometryMask) {
    if (on && !this.halo) {
      this.halo = scene.add.image(this.sprite.x, this.sprite.y, haloTexture(scene)).setAlpha(0).setMask(mask).setDepth(this.depth - 0.25); // over the aim zone shown on hover (0.5)
      this.sizeHalo();
    }
    if (!this.halo) return;
    scene.tweens.killTweensOf(this.halo);
    scene.tweens.add({ targets: this.halo, alpha: on ? 1 : 0, duration: on ? 120 : 180, ease: "Sine.easeOut" });
  }

  dropHalo() {
    this.halo?.destroy();
    this.halo = null;
  }

  private sizeHalo() {
    const d = 2 * this.ringRadius * this.lift * HALO_SIZE;
    this.halo?.setDisplaySize(d, d);
  }
}

/**
 * The game board: renders the state the realm holds, lets the player build a
 * plan with a live preview, submits it through Adena, and replays the
 * resolution log segment by segment when a turn resolves.
 */
/**
 * A pick among count (0 to count − 1) for what a resolved turn's event
 * shows or sounds: from the turn's seed (variantIndex), so the turn plays
 * the same on every playback; at random for anything else.
 */
function turnPick(turn: TurnResult | undefined, e: TurnEvent | undefined, what: string, count: number): number {
  const at = turn && e ? turn.events.indexOf(e) : -1;
  return at >= 0 ? variantIndex(turn!.seed, `${at}/${what}`, count) : Math.floor(Math.random() * count);
}

export class GameScene extends Phaser.Scene {
  private gameID = "";
  /** How to play: the scripted showdown against the Kid (tutorial/), no chain or wallet behind it. */
  private tutorial = false;
  private chain!: Chain;
  private poller: GamePoller | null = null;
  private unsubscribe: (() => void)[] = [];

  // Chain state
  private view: GameView | null = null;
  private myIndex = -1;
  private renderedTurn = -1;
  private shownResultTurn = 0;
  private committed: CharView[] = [];
  private mode: Mode = "sync";
  private netError: string | null = null;

  // Plan being built
  private selectionOrder: PlanEntry[] = [];
  private pendingChoices: Map<number, RelativeDirection> = new Map();
  /** Gun id and destination hand chosen for cards that draw a gun (Draw & Cock). */
  private pendingGuns: Map<number, { gun?: number; ground?: number; hand: number }> = new Map();
  /** Shoot option picked for Cock/Aim/Shoot and Shoot cards. */
  private pendingOpts: Map<number, ShootOption | StrengthOption> = new Map();
  /** The option buttons shown while a gun action waits for its option. */
  private optMenu: { card: CardNumber; side: CardSide; objects: Phaser.GameObjects.GameObject[] } | null = null;
  /** The target picked for each aim (a hex, or the seat of a character standing on the clicked hex); the pick overlays while one is pending. */
  private pendingAims: Map<number, { hex?: string; target?: number }> = new Map();
  /** The gun moves (10.22) each card's action does as it is revealed, dragged on my sheet before picking it. */
  private movesByCard: Map<number, GunMove[]> = new Map();
  /** Gun moves dragged since the last card picked: they go with the next one. */
  private looseMoves: GunMove[] = [];
  /** menuHex: the hex whose target menu is open (several characters in it), "" for none. */
  private aimMode: { card: CardNumber; side: CardSide; objects: Phaser.GameObjects.GameObject[]; menuHex: string; menu: Phaser.GameObjects.GameObject[] } | null = null;
  /** The AIM markers on hexes, by the seat holding the aim. */
  private aimMarkers: Map<number, Phaser.GameObjects.Image> = new Map();
  /** The guns lying in hexes, as drawn (index = position in displayGround(); null while one waits to be shown). */
  private groundIcons: ({ img: Phaser.GameObjects.Image; dots: Phaser.GameObjects.Graphics } | null)[] = [];
  /** The animated dotted line shown while hovering an AIM marker or an aiming gun, with its ends. */
  private aimLine: Phaser.GameObjects.Graphics | null = null;
  /** The aim zone of the character under the pointer, drawn under the tokens. */
  private hoverZone: Phaser.GameObjects.GameObject[] = [];
  private aimLineEnds: { from: { x: number; y: number }; to: { x: number; y: number } } | null = null;
  private preview: CharView | null = null;
  /** The encoded plan the preview was last computed for. */
  private previewPlan = "";
  private choiceMode: {
    card: CardNumber;
    side: CardSide;
    choiceType: ChoiceType;
    options: { rel: RelativeDirection; hex: string | null; x: number; y: number }[];
    /** Where the character moving stands (board pixels). */
    from: { x: number; y: number };
  } | null = null;
  private choiceOverlays: Phaser.GameObjects.GameObject[] = [];

  // Playback of the last resolved turn
  // Replay of resolved turns: a turn that just resolved (live) or the history.
  // cut: an index into the turn's events where the shown state stops (a
  // segment shown up to one of its steps), null for the whole segment;
  // anim counts the positions shown, so a step left over from one stops.
  private playback: { turns: TurnResult[]; index: number; seg: number; cut: number | null; anim: number; live: boolean; auto: Phaser.Time.TimerEvent | null } | null = null;
  /** The game is over and its whole history was asked for: the replay stays on screen, with no way to close it. */
  private finalReplay = false;
  /** The turn whose replay the page's address asked for (game/route.ts), until the game is first shown. */
  private routeTurn: number | null = null;
  /** The plan sent this turn, shown while waiting: known from sending it, else read back from the chain. */
  private sentPlan: { turn: number; plan: string } | null = null;
  /** My character's set up before calling or joining, while it lasts. */
  private setup: Setup | null = null;
  /** Adena being connected from this screen (a viewer without a wallet): its popups are up. */
  private connecting = false;

  // Zoom & pan
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;

  // Display objects
  private boardImage: Phaser.GameObjects.Image | null = null;
  private tokens: (CharacterToken | null)[] = [];
  /** The hex whose stacked tokens are fanned out under the pointer, if any. */
  private spreadHex: string | null = null;
  private arrMask!: Phaser.Display.Masks.GeometryMask;
  private arrMaskGfx!: Phaser.GameObjects.Graphics;
  /** When Send plan last warned about an empty plan: a second click within PASS_CONFIRM_MS passes. */
  private passWarnedAt = 0;
  /** A reveal or an opening in flight, and when each kind last failed (it is not retried at once). */
  private revealing = false;
  private revealFailedAt = { own: 0 };
  /** When the screen may try opening again: soon after drand did not answer, later after a refused transaction. */
  private openRetryAt = 0;
  /** The seats whose timelocked plan this screen tried to open this turn: past the reveals' grace they are left to the claim. */
  private openTried: { turn: number; seats: Set<number> } = { turn: 0, seats: new Set() };
  /** The screen around the board: header, side columns, hand or replay controls (an HTML overlay). */
  private showdown: ShowdownView | null = null;

  constructor() {
    super({ key: "GameScene" });
  }

  /** A game to show, or a set up: calling a showdown has no game yet, joining one has the game it joins. */
  init(data: { gameID?: string; setup?: SetupRequest; tutorial?: boolean; turn?: number | null }) {
    this.tutorial = !!data.tutorial;
    this.routeTurn = data.turn ?? null;
    this.gameID = this.tutorial ? TUTORIAL_GAME : (data.gameID ?? "");
    this.setup = data.setup ? newSetup(data.setup) : null;
    this.view = null;
    this.myIndex = -1;
    this.renderedTurn = -1;
    this.shownResultTurn = 0;
    this.committed = [];
    this.mode = "sync";
    this.netError = null;
    this.clearSelection();
    this.playback = null;
    this.finalReplay = false;
    // The scene object outlives a game (Phaser starts the same one again):
    // what this screen knew of a turn, by turn number, belongs to the game
    // and account it showed (the other account's plan once showed as mine
    // after switching accounts in Adena).
    this.sentPlan = null;
    this.openTried = { turn: 0, seats: new Set() };
    this.revealing = false;
    this.revealFailedAt = { own: 0 };
    this.openRetryAt = 0;
    this.passWarnedAt = 0;
    this.connecting = false;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.tokens = [];
    this.spreadHex = null;
  }

  // ── Dimensions ────────────────────────────────────────────────────────────

  private get cw() {
    return this.scale.width;
  }
  private get ch() {
    return this.scale.height;
  }
  /** The overlay's grid for the window (ui/showdownView.ts). */
  private get layout(): ShowdownLayout {
    return showdownLayout(this.cw, this.ch);
  }
  /** Where the board is drawn: the centre cell the overlay leaves free. */
  private get board(): BoardRect {
    return this.layout.board;
  }
  private inBoard(x: number, y: number): boolean {
    const b = this.board;
    return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
  }

  // ── Preload / create ──────────────────────────────────────────────────────

  preload() {
    if (!this.textures.exists("board_A")) this.load.image("board_A", "board_A.png");
    for (let i = 1; i <= 12; i++) {
      const n = i as CardNumber;
      const fKey = `action_card_a${n}`;
      const bKey = `action_card_a${n}_back`;
      if (!this.textures.exists(fKey)) this.load.image(fKey, getActionCardAsset(n, "front"));
      if (!this.textures.exists(bKey)) this.load.image(bKey, getActionCardAsset(n, "back"));
    }
    for (const key of STATE_OVERLAYS) {
      if (!this.textures.exists(key)) this.load.image(key, `local/${key}.png`);
    }
    for (let i = 1; i <= MAX_DELAY_MARKER; i++) {
      if (!this.textures.exists(`delay_${i}`)) this.load.image(`delay_${i}`, `del${i}.gif`);
    }
    for (const t of GUN_TYPES) {
      if (!this.textures.exists(`gun_${t}`)) this.load.image(`gun_${t}`, `guns/${t}.gif`);
    }
    for (const n of AIM_MARKERS) {
      if (!this.textures.exists(`aim_${n}`)) this.load.image(`aim_${n}`, `aim${n}.gif`);
    }
    for (const key of BURST_KEYS) {
      if (!this.textures.exists(key)) this.load.image(key, `${key}.png`);
    }
    for (const [group, files] of Object.entries(SOUND_FILES)) {
      files.forEach((file, i) => {
        const key = soundKey(group as SoundGroup, i);
        if (!this.cache.audio.exists(key)) this.load.audio(key, `sounds/${file}`);
      });
    }
  }

  create() {
    // No wallet connected (a game's address opened in a fresh page): watched, read-only.
    this.chain = this.tutorial ? tutorialChain() : (currentChain() ?? viewerChain());
    this.showdown = new ShowdownView({
      button: (id) => this.onButton(id),
      card: (card, side) => {
        if (this.mode === "select") this.toggleCard(card as CardNumber, side);
      },
      sheet: (seat) => this.openSeatSheet(seat),
      segment: (seg) => {
        if (this.playback) this.stepTo({ index: this.playback.index, seg });
      },
    });
    this.buildAll();
    this.setupInput();

    const onResize = () => this.buildAll();
    this.scale.on("resize", onResize);
    // The turn's deadline can pass while the screen is open: look again now and then.
    this.time.addEvent({ delay: 15_000, loop: true, callback: () => this.mode !== "playback" && this.renderView() });
    // The timelocked plans become openable at their drand round with no change on chain to poll: look for it.
    this.time.addEvent({
      delay: 3_000,
      loop: true,
      callback: () => {
        // A playback of the last turn does not hold the reveals back.
        if ((this.mode !== "waiting" && this.mode !== "playback") || this.view?.phase !== "revealing") return;
        this.revealDue();
        if (this.mode === "waiting") this.renderView();
      },
    });

    if (this.gameID) {
      this.poller = new GamePoller(
        this.chain.realm,
        this.gameID,
        (v) => void this.onGame(v),
        (e) => this.onPollError(e),
        this.chain.config.pollMs,
      );
      this.poller.start();
    } else if (this.setup) {
      void this.beginCreate();
    }

    const leave = (why: string) => {
      if (!this.scene.isActive()) return;
      showToast(this, why, "info");
      this.scene.start("LobbyScene", { splash: false });
    };
    // Watched without a wallet (viewerChain), no account to follow.
    if (!this.tutorial && currentChain()) {
      this.unsubscribe.push(
        subscribeAccountChanged(() => leave("Account changed")),
        subscribeNetworkChanged(() => leave("Network changed")),
      );
    }

    // The page's address names what is shown (game/route.ts), to reopen or share it.
    if (this.tutorial) history.replaceState(null, "", TUTORIAL_HASH);
    else if (this.gameID) history.replaceState(null, "", routeHash(this.gameID));
    this.events.once("shutdown", () => {
      if (this.tutorial || this.gameID) history.replaceState(null, "", location.pathname + location.search);
      closeCharacterSheet();
      this.showdown?.destroy();
      this.showdown = null;
      this.scale.off("resize", onResize);
      this.poller?.stop();
      this.poller = null;
      for (const u of this.unsubscribe) u();
      this.unsubscribe = [];
    });
  }

  // ── Chain sync ────────────────────────────────────────────────────────────

  private async onGame(view: GameView) {
    if (!this.scene.isActive()) return;
    const first = this.view === null;
    this.view = view;
    this.netError = null;
    if (this.setup?.req.kind === "join" && view.phase === "waiting") this.syncJoinSeat(view);
    this.myIndex = this.setup ? this.setup.seat : seatOf(view, this.chain.wallet.address);
    await this.ensureTextures([...view.players.map((p) => p.char), ...(this.setup ? [this.setup.req.charKey] : [])]);
    if (!this.scene.isActive()) return;

    if (first) {
      this.shownResultTurn = view.lastTurn?.turn ?? 0;
      this.applyState(true);
      // Opened at a turn's address: its replay, once that turn resolved.
      const turn = this.routeTurn;
      this.routeTurn = null;
      if (turn !== null && !this.setup) {
        if (turn <= this.resolvedTurns()) {
          void (view.phase === "finished" ? this.showFinalReplay(false, turn) : this.openReplay(turn));
          return;
        }
        showToast(this, `Turn ${turn} is not played yet`, "info");
        history.replaceState(null, "", routeHash(this.gameID));
      }
      // A game over: its whole replay, from the final turn when this browser has not played it back yet.
      if (view.phase === "finished") void this.showFinalReplay(!!view.lastTurn && view.lastTurn.turn > loadSeenTurn(this.revealScope(), this.gameID, this.chain.wallet.address, view.createdAt));
      // A turn that resolved while this browser was elsewhere (in the lobby,
      // which reveals by itself with auto-sign, or on another account): play it back.
      else if (view.lastTurn && !this.setup && view.lastTurn.turn > loadSeenTurn(this.revealScope(), this.gameID, this.chain.wallet.address, view.createdAt)) this.startPlayback([view.lastTurn], true);
      return;
    }
    // The game just ended: its whole history replaces the board, from the
    // final turn when one just resolved.
    if (view.phase === "finished" && !this.finalReplay) {
      const resolved = !!view.lastTurn && view.lastTurn.turn !== this.shownResultTurn;
      if (!this.playback) this.applyState(false);
      void this.showFinalReplay(resolved);
      return;
    }
    // A turn we have not shown yet resolved: replay it from the positions we
    // were showing before the change.
    if (view.lastTurn && view.lastTurn.turn !== this.shownResultTurn && this.committed.length > 0 && !this.playback) {
      this.startPlayback([view.lastTurn], true);
      return;
    }
    if (!this.playback) this.applyState(false);
  }

  private onPollError(e: unknown) {
    const msg = userMessage(e);
    if (msg !== this.netError) {
      this.netError = msg;
      if (this.scene.isActive()) {
        showToast(this, msg, "error");
        if (/game not found|invalid game id/.test(msg)) this.scene.start("LobbyScene", { splash: false });
      }
    }
    this.renderView();
  }

  private ensureTextures(chars: string[]): Promise<void> {
    const missing = [...new Set(chars)].filter((c) => c && !this.textures.exists(`char_${c}`));
    if (missing.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      for (const c of missing) this.load.image(`char_${c}`, `char_${c}.png`);
      this.load.once("complete", () => resolve());
      this.load.start();
    });
  }

  /** Makes the scene reflect the chain state; the plan in progress survives unless the turn changed. */
  private applyState(reset: boolean) {
    const view = this.view;
    if (!view) return;
    // Joining: I set my character up in the next free seat while the
    // showdown waits for players; once it went on without me, I only
    // watch; once the chain shows me seated, the set up is over.
    // Seated first: my own join may be what took the last seat.
    if (this.setup?.req.kind === "join" && seatOf(view, this.chain.wallet.address) >= 0) {
      this.endSetup();
    } else if (this.setup?.req.kind === "join" && view.phase !== "waiting") {
      showToast(this, view.phase === "planning" ? "The seats filled up without you" : "This showdown is over", "info");
      this.endSetup();
    }
    const turnChanged = view.turn !== this.renderedTurn;
    this.committed = view.players.map((p) => ({
      hex: p.hex, facing: p.facing, down: p.down, delay: p.delay, status: p.status,
      aim: p.aim, aimAt: p.aimAt ?? -1, aimHex: p.aimHex, endurance: p.endurance, serious: p.serious, gunArm: p.gunArm, otherArm: p.otherArm, leg: p.leg,
      guns: p.guns.map((g) => ({ ...g })),
    }));
    this.renderedTurn = view.turn;
    this.shownResultTurn = view.lastTurn?.turn ?? 0;

    if (reset || turnChanged || this.mode === "waiting" || this.mode === "playback") {
      this.clearSelection();
    }
    const me = this.myIndex >= 0 && view.players[this.myIndex]?.addr ? view.players[this.myIndex] : null;
    if (this.setup) this.mode = "setup";
    else if (view.phase === "finished") this.mode = "ended";
    else if (!me) this.mode = "spectate";
    else if (view.phase === "waiting") this.mode = "waiting";
    else if (me.committed || view.phase === "revealing") this.mode = "waiting";
    else if (this.mode !== "submitting") this.mode = "select";
    if (this.mode !== "select") this.clearSelection();

    this.buildTokens();
    this.refreshTokens(!reset);
    this.showSetupZone();
    this.renderView();
    if (this.mode === "waiting" && (view.phase === "planning" || view.phase === "revealing")) void this.loadSentPlan();
    this.revealDue();
  }

  /**
   * Calling a showdown: nothing is on the chain yet, the board shows my
   * character alone, where I put it, until the call is signed.
   */
  private async beginCreate() {
    const setup = this.setup;
    if (!setup) return;
    await this.ensureTextures([setup.req.charKey]);
    if (!this.scene.isActive() || this.setup !== setup) return;
    const seats = setup.req.kind === "create" ? setup.req.seats : 2;
    this.committed = Array.from({ length: seats }, (_, i) => startingChar("", i === setup.seat ? setup.facing : 0));
    this.myIndex = setup.seat;
    this.mode = "setup";
    this.buildTokens();
    this.refreshTokens(false);
    this.showSetupZone();
    this.renderView();
  }

  /**
   * Watching an open showdown with a wallet: takes its next free seat and
   * sets up there, as the lobby's Join does (the seat follows the chain the
   * same way, syncJoinSeat).
   */
  private beginJoin() {
    const view = this.view;
    if (!view || this.setup || view.phase !== "waiting" || !this.canJoin()) return;
    const seat = nextSeat(view.players);
    if (seat < 0) return;
    this.setup = newSetup({ kind: "join", seat, charKey: seatChar(seat), stake: view.stake });
    void this.onGame(view);
  }

  /** Whether this screen can join the showdown watched: an account signs here (not the tutorial's, not a viewer without a wallet). */
  private canJoin(): boolean {
    return !this.tutorial && !!currentChain();
  }

  /**
   * A viewer without a wallet (a game opened at its address) connects Adena
   * from the board, as the lobby does: the chain shared by the scenes is set
   * up, then the scene starts over on the game as the account's player.
   */
  private async connectAdena() {
    if (this.connecting || this.tutorial || currentChain()) return;
    this.connecting = true;
    this.renderView();
    try {
      resetChain();
      await initChain(CONFIG);
      if (!this.scene.isActive()) return;
      installWalletNotices();
      this.scene.restart({ gameID: this.gameID });
    } catch (e) {
      this.connecting = false;
      if (!this.scene.isActive()) return;
      showToast(this, userMessage(e), "error");
      this.renderView();
    }
  }

  /** Leaves the set up: its highlights and ghost go, my seat is whatever the chain says. */
  private endSetup() {
    for (const o of this.setup?.zone ?? []) o.destroy();
    this.setup?.ghost?.destroy();
    this.setup = null;
    if (this.view) this.myIndex = seatOf(this.view, this.chain.wallet.address);
  }

  /**
   * Joining: my seat is the first the chain shows free. When someone took
   * the one I was setting up in, I move on to the next and its character,
   * as the realm will seat me, and set up again in its hexes.
   */
  private syncJoinSeat(view: GameView) {
    const setup = this.setup;
    if (!setup || setup.req.kind !== "join" || setup.busy) return;
    setup.req.stake = view.stake; // the join sends the stake the chain asks for
    const seat = nextSeat(view.players);
    if (seat < 0 || seat === setup.seat) return;
    const charKey = seatChar(seat);
    const taken = view.players[setup.seat];
    if (setup.hex && taken?.addr) showToast(this, `${charName(taken.char)} was taken first: you play ${charName(charKey)}, take position again`, "info");
    setup.req = { kind: "join", seat, charKey, stake: setup.req.stake };
    setup.seat = seat;
    setup.hex = null;
    setup.facing = defaultFacing(charKey);
  }

  /** The character token of a seat: the chain's, or the one I am setting up in it. */
  private charOf(seat: number): string {
    if (this.setup && seat === this.setup.seat) return this.setup.req.charKey;
    return this.view?.players[seat]?.char ?? "";
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private buildAll() {
    this.children.removeAll(true);
    this.tokens = [];
    this.choiceOverlays = [];
    // Everything above was destroyed with the children: drop the stale handles
    // (a destroyed Graphics would silently swallow the aim line).
    this.aimLine = null;
    this.hoverZone = [];
    this.aimLineEnds = null;
    this.aimMarkers = new Map();
    this.groundIcons = [];
    if (this.optMenu) this.optMenu.objects = [];
    if (this.aimMode) {
      this.aimMode.objects = [];
      this.aimMode.menu = [];
    }
    if (this.setup) {
      this.setup.zone = [];
      this.setup.ghost = null;
    }

    const b = this.board;
    this.add.rectangle(0, 0, this.cw, this.ch, 0x1e1618).setOrigin(0);
    this.add.rectangle(b.x, b.y, b.w, b.h, 0x120b04).setOrigin(0);

    if (this.arrMaskGfx) this.arrMaskGfx.destroy();
    this.arrMaskGfx = this.make.graphics();
    this.arrMaskGfx.fillRect(b.x, b.y, b.w, b.h);
    this.arrMask = this.arrMaskGfx.createGeometryMask();

    this.buildBoard();
    this.buildTokens();
    this.refreshTokens(false);
    this.showSetupZone();
    this.renderView();
    if (this.choiceMode) this.showChoiceOverlays();
    if (this.optMenu) this.openOptMenu(this.optMenu.card, this.optMenu.side);
    if (this.aimMode) this.enterAimMode(this.aimMode.card, this.aimMode.side, this.aimMode.menuHex);
    this.input.mouse?.disableContextMenu();
  }

  // ── Board & tokens ────────────────────────────────────────────────────────

  private baseTransform(): { scale: number; ox: number; oy: number } {
    const lw = BOARD_A.w;
    const lh = BOARD_A.h;
    const b = this.board;
    const scale = Math.min((b.h - 30) / lh, (b.w - 30) / lw);
    return { scale, ox: b.x + (b.w - lw * scale) / 2, oy: b.y + (b.h - lh * scale) / 2 };
  }

  private displayTransform(): { scale: number; ox: number; oy: number } {
    const base = this.baseTransform();
    const cx = this.board.x + this.board.w / 2;
    const cy = this.board.y + this.board.h / 2;
    return {
      scale: base.scale * this.zoom,
      ox: cx + (base.ox - cx) * this.zoom + this.panX,
      oy: cy + (base.oy - cy) * this.zoom + this.panY,
    };
  }

  private boardToScreen(x: number, y: number): { sx: number; sy: number } {
    const { scale, ox, oy } = this.displayTransform();
    return { sx: ox + x * scale, sy: oy + y * scale };
  }

  private hexToScreen(hex: string): { sx: number; sy: number } {
    const p = BOARD_A.hexPos(hex);
    return this.boardToScreen(p.x, p.y);
  }

  private buildBoard() {
    this.boardImage?.destroy();
    const { scale, ox, oy } = this.displayTransform();
    this.boardImage = this.add
      .image(ox + (BOARD_A.w / 2) * scale, oy + (BOARD_A.h / 2) * scale, "board_A")
      .setScale(scale)
      .setMask(this.arrMask);
  }

  /** The guns lying in hexes as they should be drawn right now: the chain's, or those dropped by the segment shown. */
  private displayGround(): GroundGunView[] {
    const view = this.view;
    if (!view) return [];
    const pb = this.playback;
    if (!pb) {
      // A pick-up planned this turn lifts the gun off the ground in the preview, a gun move drops one there.
      const picked = new Set(this.preview ? this.currentPlan().map((e) => e.groundGun) : []);
      const dropped = (this.preview?.dropped ?? []).map((d, i) => ({ id: -(i + 1), hex: d.hex, guns: [d.gun] }));
      return [...(view.ground ?? []).filter((g) => !picked.has(g.id)), ...dropped];
    }
    const t = pb.turns[pb.index];
    const ground = this.groundBefore();
    snapshotAfterSegment(startOfTurn(t), t.events, pb.seg, ground, pb.cut ?? undefined);
    return ground;
  }

  /** The guns lying in hexes when the replayed turn began, as the turn recorded them (a fresh copy). */
  private groundBefore(): GroundGunView[] {
    const pb = this.playback;
    if (!pb) return [];
    return pb.turns[pb.index].ground.map((g) => ({ id: g.id, hex: g.hex, guns: g.guns.map((x) => ({ ...x })) }));
  }

  /** The characters as they should be drawn right now. */
  private displayChars(): CharView[] {
    if (this.playback) {
      const t = this.playback.turns[this.playback.index];
      return snapshotAfterSegment(startOfTurn(t), t.events, this.playback.seg, this.groundBefore(), this.playback.cut ?? undefined);
    }
    return this.committed.map((c, i) => {
      if (this.setup && i === this.setup.seat) return { ...c, hex: this.setup.hex ?? "", facing: this.setup.facing, down: false };
      return i === this.myIndex && this.preview ? this.preview : c;
    });
  }

  private buildTokens() {
    this.showdown?.highlightSeat(-1); // a rebuilt token never gets the pointerout
    for (const t of this.tokens) {
      if (t) {
        t.killTweens(this.tweens);
        t.sprite.destroy();
        t.highlight.destroy();
        t.dropHalo();
        t.setOverlay(this, null, this.arrMask);
        t.setDelay(this, 0, this.arrMask);
        t.setGun(this, null, this.arrMask);
        t.setEndurance(this, MAX_ENDURANCE, this.arrMask);
        t.setTargetAims(this, [], this.arrMask);
      }
    }
    this.tokens = [];
    const { scale } = this.displayTransform();
    const tokenScale = scale * TOKEN_SCALE_FACTOR;
    const chars = this.displayChars();
    chars.forEach((c, i) => {
      const charKey = this.charOf(i);
      // No token for an empty seat, nor for a character standing nowhere yet (setting up).
      if (!charKey || !c?.hex || !this.textures.exists(`char_${charKey}`)) {
        this.tokens.push(null);
        return;
      }
      const { sx, sy } = this.tokenScreenPos(chars, i);
      const hl = this.add
        .circle(sx, sy, (95 * tokenScale) / 2 + 4, GOLD, 0)
        .setStrokeStyle(3, GOLD, 0)
        .setMask(this.arrMask);
      const img = this.add
        .image(sx, sy, `char_${charKey}`)
        .setScale(tokenScale)
        .setAngle(dirIndexToAngle(c.facing, charKey))
        .setOrigin(0.5)
        .setMask(this.arrMask)
        .setInteractive({ useHandCursor: true });
      img.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (this.isDragging) return;
        // Setting up, my token turns under the clicks: clockwise, the other way with the right button.
        if (this.setup && i === this.setup.seat) return this.turnSetup(pointer.rightButtonReleased() ? -1 : 1);
        if (pointer.rightButtonReleased()) return;
        this.openSeatSheet(i);
      });
      img.on("pointerover", () => {
        this.tokens[i]?.setHover(this, true, this.arrMask);
        this.showdown?.highlightSeat(i);
        if (!this.playback) this.showAimZone(i); // not in a replay
      });
      img.on("pointerout", () => {
        this.tokens[i]?.setHover(this, false, this.arrMask);
        this.showdown?.highlightSeat(-1);
        this.hideAimZone();
      });
      const token = new CharacterToken(charKey, img, hl, CharacterToken.depthFor(i));
      // An AIM marker on this token belongs to another character: the line runs from that aimer to here.
      token.onAimHover = (aimer, over) => (over ? this.showAimLine(this.gunCentre(aimer), this.tokenCentre(i)) : this.hideAimLine());
      // The gun of an aiming character: the line runs from the aimer to its target.
      token.onGunHover = (over) => {
        const chars = this.displayChars();
        const c = chars[i];
        if (!over || !c || c.aim <= 0) return this.hideAimLine();
        const target = this.aimOnToken(chars, i) ? this.tokenCentre(c.aimAt) : this.hexCentre(c.aimHex);
        this.showAimLine(this.gunCentre(i), target);
      };
      token.setOverlay(this, overlayKey(c), this.arrMask);
      token.setDelay(this, c.delay, this.arrMask);
      token.setGun(this, gunInHand(c.guns), this.arrMask, false); // built in place: no entrance
      token.setEndurance(this, c.endurance, this.arrMask, false);
      token.setTargetAims(this, this.aimersOn(chars, i), this.arrMask);
      token.setStatus(c.status);
      this.tokens.push(token);
    });
  }

  /**
   * Moves the tokens to the current display state, animated or not. With
   * hold, the tokens of the seats named (and the guns they drop) keep their
   * old look for that many ms, then show the new state: a character hit
   * falls, bleeds and greys out as its groan or death cry plays, its DEL
   * badge pulsing then. A hold is dropped if the board is rebuilt or the
   * replay moves on meanwhile.
   */
  private refreshTokens(animate: boolean, hold?: Hold) {
    const chars = this.displayChars();
    this.hideAimLine();
    this.refreshAimMarkers(chars);
    this.refreshGround(chars, this.displayGround(), hold);
    const pb = this.playback;
    const gen = pb?.anim;
    this.tokens.forEach((t, i) => {
      if (!t || !chars[i]) return;
      const c = chars[i];
      const apply = () => {
        const { sx, sy } = this.tokenScreenPos(chars, i);
        const angle = dirIndexToAngle(c.facing, t.charKey);
        const had = t.delayShown();
        t.killTweens(this.tweens);
        // Status, delay and gun first, so new markers travel with the token.
        t.setOverlay(this, overlayKey(c), this.arrMask);
        t.setDelay(this, c.delay, this.arrMask);
        t.setGun(this, gunInHand(c.guns), this.arrMask);
        t.setEndurance(this, c.endurance, this.arrMask);
        t.setTargetAims(this, this.aimersOn(chars, i), this.arrMask);
        // Running away (15.5): the token walks off the map one hex that way and fades out.
        if (animate && c.status === "ran_away" && c.away !== undefined && t.onBoard()) {
          const from = BOARD_A.hexPos(c.hex);
          const a = (DIR_ANGLE[c.away] * Math.PI) / 180;
          const to = this.boardToScreen(from.x + Math.cos(a) * HEX_SPACING, from.y + Math.sin(a) * HEX_SPACING);
          t.leave(this.tweens, to.sx, to.sy);
          return had;
        }
        t.setStatus(c.status);
        // Standing on an obstacle raises the character (36.5): drawn a bit bigger.
        t.setLift(this.tweens, BOARD_A.obstacle(c.hex) ? OBSTACLE_LIFT : 1, animate ? 450 : 0);
        if (animate) {
          t.moveTo(this.tweens, sx, sy, 450);
          t.rotateTo(this.tweens, angle, 300);
        } else {
          t.setPosition(sx, sy);
          t.setAngle(angle);
        }
        this.applyTokenHighlight(i);
        return had;
      };
      const wait = animate ? (hold?.seats.get(i) ?? 0) : 0;
      if (wait <= 0) {
        apply();
        return;
      }
      this.time.delayedCall(wait, () => {
        if (this.tokens[i] !== t || this.playback !== pb || (pb && pb.anim !== gen)) return;
        const had = apply();
        if (c.delay !== had && c.delay > 0) t.pulseBadge(this.tweens);
        this.playCues(soundsForDelay([had], [c]));
      });
    });
  }

  // ── Stacked tokens (several characters in one hex) ────────────────────────

  private tokenDiameter(): number {
    return 95 * this.displayTransform().scale * TOKEN_SCALE_FACTOR;
  }

  /** The seats drawn in the same hex as seat i (including i), in seat order. */
  /**
   * What shares a hex, in stacking order: the tokens (by seat), then the
   * guns lying there (by their index in the ground list). Each occupant is
   * keyed "s<seat>" or "g<index>".
   */
  private occupantsAt(chars: CharView[], ground: GroundGunView[], hex: string): string[] {
    const out: string[] = [];
    chars.forEach((c, j) => {
      if (c && c.hex && c.status !== "ran_away" && this.charOf(j) && c.hex === hex) out.push(`s${j}`);
    });
    ground.forEach((g, j) => {
      if (g.hex === hex) out.push(`g${j}`);
    });
    return out;
  }

  /** The seats drawn in the same hex as seat i (including i), in seat order. */
  private stackMates(chars: CharView[], i: number): number[] {
    return this.occupantsAt(chars, this.displayGround(), chars[i].hex)
      .filter((k) => k[0] === "s")
      .map((k) => Number(k.slice(1)));
  }

  /**
   * Where an occupant of a hex goes: the hex centre, or a point of a star
   * around it when the hex is shared (stackOffset); a gun on the ground also lies off to
   * the lower-right side of the hex rather than in its middle. At rest,
   * characters sharing the hex fan out among themselves, whatever lies
   * there (a gun dropped by one killed there would otherwise push it back
   * to the centre); spread under the pointer, every occupant takes its own
   * place so each can be told apart.
   */
  private occupantScreenPos(chars: CharView[], ground: GroundGunView[], hex: string, key: string): { sx: number; sy: number } {
    const { sx, sy } = this.hexToScreen(hex);
    const d = this.tokenDiameter();
    const aside = key[0] === "g" ? d * GROUND_ASIDE : 0;
    const all = this.occupantsAt(chars, ground, hex);
    if (all.length < 2) return { sx: sx + aside, sy: sy + aside };
    const spread = this.spreadHex === hex;
    const seats = all.filter((k) => k[0] === "s");
    const row = !spread && key[0] === "s" && seats.length > 1 ? seats : all;
    const { dx, dy } = stackOffset(row.indexOf(key), row.length, spread);
    return { sx: sx + d * dx + aside, sy: sy + d * dy + aside };
  }

  /** Where seat i's token goes: its hex centre, on a star around it when it shares the hex. */
  private tokenScreenPos(chars: CharView[], i: number): { sx: number; sy: number } {
    return this.occupantScreenPos(chars, this.displayGround(), chars[i].hex, `s${i}`);
  }

  /**
   * Draws the guns lying in hexes, below the tokens, with the token icon's
   * rendering, stacked like a character sharing the hex; a gun a held seat
   * drops this step (hold.ground, by ground id) shows up when its owner
   * falls.
   */
  private refreshGround(chars: CharView[], ground: GroundGunView[], hold?: Hold) {
    for (const o of this.groundIcons) {
      o?.img.destroy();
      o?.dots.destroy();
    }
    const icons: typeof this.groundIcons = ground.map(() => null);
    this.groundIcons = icons;
    const size = this.tokenDiameter() * GUN_SIZE;
    ground.forEach((g, j) => {
      const gun = g.guns[0];
      const key = `gun_${gun?.type}`;
      if (!gun || !this.textures.exists(key)) return;
      const draw = () => {
        if (this.groundIcons !== icons) return; // redrawn meanwhile
        const { sx, sy } = this.occupantScreenPos(chars, ground, g.hex, `g${j}`);
        const img = this.add.image(sx, sy, key).setOrigin(0.5).setMask(this.arrMask).setDepth(0.8);
        const dots = this.add.graphics({ x: sx, y: sy }).setMask(this.arrMask).setDepth(0.8);
        img.setAlpha(paintGun(gun, img, dots, size));
        icons[j] = { img, dots };
      };
      const wait = hold?.ground.get(g.id) ?? 0;
      if (wait > 0) this.time.delayedCall(wait, draw);
      else draw();
    });
  }

  /** Where the gun lying with ground id id is drawn, null if it is not. */
  private groundGunPos(id: number): { sx: number; sy: number } | null {
    const j = this.displayGround().findIndex((g) => g.id === id);
    const img = j >= 0 ? this.groundIcons[j]?.img : undefined;
    return img ? { sx: img.x, sy: img.y } : null;
  }

  /** Fans out the stack under the pointer, within the disc the spread tokens cover. */
  private updateStackHover(pointer: Phaser.Input.Pointer) {
    if (this.isDragging || !this.inBoard(pointer.x, pointer.y)) {
      this.setSpreadHex(null);
      return;
    }
    const chars = this.displayChars();
    const ground = this.displayGround();
    let hit: string | null = null;
    const hexes = new Set<string>([...chars.filter((c) => c && c.hex).map((c) => c.hex), ...ground.map((g) => g.hex)]);
    for (const hex of hexes) {
      const n = this.occupantsAt(chars, ground, hex).length;
      if (n < 2) continue;
      const { dx, dy } = stackOffset(0, n, true);
      const radius = this.tokenDiameter() * (0.5 + Math.hypot(dx, dy));
      const { sx, sy } = this.hexToScreen(hex);
      if (Phaser.Math.Distance.Between(pointer.x, pointer.y, sx, sy) <= radius) {
        hit = hex;
        break;
      }
    }
    this.setSpreadHex(hit);
  }

  private setSpreadHex(hex: string | null) {
    if (hex === this.spreadHex) return;
    this.spreadHex = hex;
    const chars = this.displayChars();
    const ground = this.displayGround();
    this.tokens.forEach((t, i) => {
      if (!t || !chars[i] || this.occupantsAt(chars, ground, chars[i].hex).length < 2) return;
      const { sx, sy } = this.occupantScreenPos(chars, ground, chars[i].hex, `s${i}`);
      t.moveTo(this.tweens, sx, sy, STACK_MS);
    });
    ground.forEach((g, j) => {
      const icon = this.groundIcons[j];
      if (!icon || this.occupantsAt(chars, ground, g.hex).length < 2) return;
      const { sx, sy } = this.occupantScreenPos(chars, ground, g.hex, `g${j}`);
      this.tweens.add({ targets: [icon.img, icon.dots], x: sx, y: sy, duration: STACK_MS, ease: "Cubic.easeInOut" });
    });
  }

  /** The resting highlight of a token: a ring in its seat's colour (the colour the AIM markers' frames use too), wider and breathing on my character while it is my move. */
  private applyTokenHighlight(i: number) {
    const t = this.tokens[i];
    if (!t) return;
    const mine = i === this.myIndex && (this.mode === "select" || this.mode === "setup");
    t.setHighlight(seatColorNum(i), 0.9, mine ? 5 : 3);
    t.setPulse(this.tweens, mine);
  }

  private refreshView() {
    this.buildBoard();
    this.buildTokens();
    this.refreshTokens(false);
    this.showSetupZone();
    this.clearChoiceOverlays();
    if (this.choiceMode) this.showChoiceOverlays();
    if (this.optMenu) this.openOptMenu(this.optMenu.card, this.optMenu.side); // follows the token on zoom and pan
    if (this.aimMode) this.enterAimMode(this.aimMode.card, this.aimMode.side, this.aimMode.menuHex);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private statusLine(): string {
    if (this.mode === "setup") {
      if (this.setup?.busy) return "Signing in Adena…";
      return this.setup?.req.kind === "create" ? "Take position to call the showdown" : "Take position to join the showdown";
    }
    const view = this.view!;
    switch (this.mode) {
      case "sync":
        return "Loading…";
      case "select": {
        if (!this.outOfTime()) return "Your move: pick your action cards";
        const sent = view.players.some((p, i) => i !== this.myIndex && p.addr && p.committed);
        return sent ? "Out of time: your plan did not come in, call time" : "Out of time: nobody played, call time";
      }
      case "submitting":
        return "Signing your plan…";
      case "waiting": {
        if (view.phase === "waiting") return `Waiting for players (${seatsTaken(view)})…`;
        const me = this.myIndex >= 0 ? view.players[this.myIndex] : null;
        const pending = this.pendingNames();
        if (view.phase === "revealing") {
          if (this.outOfTime() && !this.openWaits()) return `No plan from ${pending}: call time`;
          if (this.ownRevealWaits()) return "Every plan is in: reveal your plan";
          if (this.openWaits()) return "Plans left unrevealed: open them";
          return `Revealing the plans: waiting for ${pending}…`;
        }
        if (this.outOfTime()) return `Out of time for ${pending}: call time`;
        if (me && me.delay >= MAX_ACTION_POINTS) return `Too much delay to act this turn (${me.delay}): you pass, waiting for ${pending}…`;
        return `Plan sent, waiting for ${pending}…`;
      }
      case "playback": {
        const pb = this.playback;
        if (!pb) return "Replay";
        const t = pb.turns[pb.index];
        const where = pb.seg === 0 ? "start" : `segment ${pb.seg} of ${SEGMENTS}`;
        if (pb.live) return `Turn ${t.turn} resolution · ${where}`;
        return this.finalReplay ? `${this.overLine()} · turn ${t.turn}, ${where}` : `Replay · turn ${t.turn}, ${where}`;
      }
      case "spectate":
        return view.phase === "waiting" ? `Open showdown, waiting for players (${seatsTaken(view)})…` : "Spectating";
      case "ended":
        return this.overLine();
    }
  }

  /** The characters whose plan (its commit, or its reveal once all are committed) the turn still waits for, "the others" when there are none to name. */
  private pendingNames(): string {
    const revealing = this.view?.phase === "revealing";
    const names = (this.view?.players ?? [])
      .filter((p, i) => i !== this.myIndex && p.addr && p.status === "alive" && !(revealing ? p.revealed : p.committed))
      .map((p) => charName(p.char));
    return names.join(", ") || "the others";
  }

  /** How the game ended: the reason, the winner and the victory points. */
  private overLine(): string {
    const view = this.view;
    if (!view) return "Game over";
    const names = view.players.map((p) => charName(p.char));
    const result = vpResult(view.winner, view.vp, view.awards, names) || (view.winner >= 0 ? `${names[view.winner]} wins` : "no winner");
    return `Game over (${view.endReason.replace(/_/g, " ")}): ${result}`;
  }

  // ── Bottom panels ─────────────────────────────────────────────────────────

  /** Renders the screen around the board (ui/showdownView.ts) from the scene's state. */
  private renderView() {
    const m = this.viewModel();
    this.showdown?.render(this.tutorial ? this.tutorialModel(m) : m, this.layout);
  }

  /** How to play: the coach over the right column, and none of the buttons that would leave the lesson's path. */
  private tutorialModel(m: ShowdownModel): ShowdownModel {
    const view = this.view;
    const pb = this.playback;
    const atEnd = !!pb && pb.index === pb.turns.length - 1 && pb.seg === SEGMENTS;
    const coach = view ? tutorialCoach({ turn: view.turn, phase: view.phase, playbackTurn: pb ? pb.turns[pb.index].turn : null, atEnd }) : null;
    const over = view?.phase === "finished" && (!pb || atEnd);
    return {
      ...m,
      title: view ? `How to play · Turn ${view.turn}` : "How to play",
      plan: m.plan && { ...m.plan, buttons: m.plan.buttons.filter((b) => !["surrender", "claim", "cancel"].includes(b.id)) },
      coach: coach && {
        ...coach,
        buttons: over
          ? [
              { id: "tutorialAgain", label: "Play it again", tone: "plain" },
              { id: "lobby", label: "To the lobby", tone: "primary" },
            ]
          : [],
      },
    };
  }

  /** The overlay's buttons. */
  private onButton(id: string) {
    const pb = this.playback;
    switch (id) {
      case "lobby":
        // Out of the tutorial, or of a game watched without a wallet: back to the splash unless Adena is connected already.
        return this.scene.start("LobbyScene", { splash: currentChain() ? false : undefined });
      case "tutorialAgain":
        return this.scene.restart({ tutorial: true });
      case "send":
        return void this.sendPlan();
      case "clear":
        if (this.mode !== "select") return;
        this.clearSelection();
        this.updatePreview(false);
        this.refreshTokens(true);
        return this.renderView();
      case "replay":
        return void this.openReplay();
      case "surrender":
        return void this.surrender();
      case "claim":
        return void this.claimTimeout();
      case "reveal":
        return void this.revealOwn();
      case "open":
        return void this.openPlans();
      case "cancel":
        return void this.cancelGame();
      case "setup":
        return void this.sendSetup();
      case "join":
        return this.beginJoin();
      case "connect":
        return void this.connectAdena();
      case "turnLeft":
        return this.turnSetup(-1);
      case "turnRight":
        return this.turnSetup(1);
      case "prevTurn":
        return this.jumpTurn(-1);
      case "nextTurn":
        return this.jumpTurn(1);
      case "prevSeg":
        return this.stepPlayback(-1);
      case "nextSeg":
        return this.stepPlayback(1);
      case "play":
        return this.toggleAuto();
      case "close":
        if (pb && !this.finalReplay) this.finishPlayback();
        return;
    }
  }

  /** A character as the side panels show it. */
  private charPanel(seat: number, c: CharView, badge: string): CharPanel {
    const charKey = this.charOf(seat);
    const p = this.view?.players[seat];
    return {
      seat,
      color: seatColor(seat),
      name: charName(charKey),
      charKey,
      you: seat === this.myIndex,
      player: p?.addr ? playerLabel(p) : "",
      addr: p?.addr ?? "",
      where: c.hex ? `${c.hex} · facing ${DIR_NAMES[c.facing] ?? "?"}${c.down ? " · down" : ""}` : "nowhere yet: pick a hex",
      out: c.status === "killed" ? "DEAD" : c.status === "passed_out" ? "PASSED OUT" : c.status === "ran_away" ? "RAN AWAY" : "",
      endurance: c.endurance,
      maxEndurance: MAX_ENDURANCE,
      delay: c.delay,
      aim: c.aim,
      wounds: c.serious + c.gunArm + c.otherArm + c.leg,
      guns: c.guns.map((g) => ({ type: g.type, name: g.name, state: gunState(g), shells: g.shells, capacity: g.capacity, broken: g.exploded })),
      badge,
    };
  }

  /** The turn's time is up: the game takes no more plans, it can only be claimed (the realm's assertInTime). */
  private outOfTime(): boolean {
    return pastTimeout(this.view?.timeoutAt ?? 0, Date.now() / 1000);
  }

  /** Everything the overlay shows, from the scene's state. */
  private viewModel(): ShowdownModel {
    const view = this.view;
    const players = view?.players ?? [];
    const names = players.map((p) => charName(p.char));
    const tone: ShowdownModel["statusTone"] =
      this.mode === "select" ||
      this.mode === "submitting" ||
      this.mode === "setup" ||
      (this.mode === "waiting" && (view?.phase === "planning" || view?.phase === "revealing") && (this.outOfTime() || this.ownRevealWaits() || this.openWaits()))
        ? "move"
        : this.mode === "playback" ? "replay" : this.mode === "ended" ? "over" : this.mode === "waiting" ? "wait" : "info";
    const calling = this.setup?.req.kind === "create" ? this.setup.req : null;
    const base = {
      title: view
        ? `Game ${view.id} · Turn ${view.turn} of ${view.maxTurns}${view.pot ? ` · ${formatGnot(view.pot)} pot` : ""}`
        : calling
          ? `New showdown · ${calling.seats} players · ${calling.turns} turns · ${formatDuration(calling.timeoutMinutes * 60)} per turn`
          : `Game ${this.gameID}`,
      status: view || this.mode === "setup" ? this.statusLine() : "Loading…",
      statusTone: tone,
      lineup: this.headerLineup(),
      error: this.netError ? `RPC offline: ${this.netError}` : "",
    };

    // Replay: every character as the segment shown leaves it, the log, the timeline.
    const pb = this.playback;
    if (this.mode === "playback" && pb && view) {
      const t = pb.turns[pb.index];
      const chars = this.displayChars();
      const rows: TimelineRow[] = players.map((p, seat) => {
        let entries: PlanEntry[] = [];
        try {
          entries = decodePlan(t.plans[seat] ?? "");
        } catch {
          entries = [];
        }
        const cells = turnSegmentCells(entries.map((e) => getActionDef(e).cost), t.start[seat]?.delay ?? 0, t.events, seat);
        return {
          name: names[seat],
          charKey: p.char,
          color: seatColor(seat),
          cells: cells.map((c) => ({ fill: c.fill, exec: c.exec, label: c.fill === "delay" ? "delay" : c.action >= 0 ? shortAction(entries[c.action]) : "" })),
        };
      });
      const pos = { index: pb.index, seg: pb.seg };
      return {
        ...base,
        left: players.flatMap((_, i) => (chars[i] ? [this.charPanel(i, chars[i], "")] : [])),
        tracker: null,
        others: [],
        plan: null,
        hand: null,
        replay: {
          logTitle: pb.seg === 0 ? `Turn ${t.turn}: the plans` : `Segment ${pb.seg}`,
          log: this.logLines(),
          names: (this.view?.players ?? []).map((p, i) => ({ name: charName(p.char), color: seatColor(i) })),
          seg: pb.seg,
          rows,
          turnLabel: pb.turns.length > 1 ? `${t.turn} / ${pb.turns[pb.turns.length - 1].turn}` : String(t.turn),
          prevTurn: pb.index > 0,
          nextTurn: pb.index < pb.turns.length - 1,
          prevSeg: !!stepBack(pos),
          nextSeg: !!stepForward(pos, pb.turns.length),
          playing: !!pb.auto,
          closeLabel: this.finalReplay ? null : pb.live ? "End turn" : "Close",
        },
      };
    }

    // Planning layout: my character (or everyone, for a spectator) on the left, the others and my plan on the right, the hand below.
    const committed = this.setup ? this.displayChars() : this.committed; // setting up, my panel shows the position picked
    const planning = view?.phase === "planning" || view?.phase === "revealing";
    const badge = (i: number) => {
      const p = players[i];
      if (!p?.addr || p.status !== "alive") return "";
      if (view?.phase === "planning") return p.committed ? "PLAN SENT" : "PLANNING";
      if (view?.phase === "revealing") return p.revealed ? "REVEALED" : "REVEALING";
      return "";
    };
    const mine = this.myIndex >= 0 && committed[this.myIndex] ? this.charPanel(this.myIndex, committed[this.myIndex], "") : null;
    const everyone = players.flatMap((p, i) => (p.addr && committed[i] ? [this.charPanel(i, committed[i], badge(i))] : []));
    const left = mine ? [mine] : everyone;
    const others = mine ? everyone.filter((c) => c.seat !== this.myIndex) : [];

    const me = this.myIndex >= 0 ? players[this.myIndex] : null;
    let trackerPlan: PlanEntry[] | null = null;
    if (this.mode === "select" || this.mode === "submitting") trackerPlan = this.currentPlan();
    else if (this.mode === "waiting" && planning) {
      const sent = this.sentPlanString();
      if (sent !== null) {
        try {
          trackerPlan = decodePlan(sent);
        } catch {
          trackerPlan = null;
        }
      }
    }
    const tracker = me && trackerPlan ? segmentFills(trackerPlan.map((e) => getActionDef(e).cost), me.delay) : null;

    return { ...base, left, tracker, others, plan: this.planPanel(names), hand: this.handModel(), replay: null };
  }

  /** The header's line-up: who sits in each seat (me by my character, a seat I am setting up in included). */
  private headerLineup(): HeaderSeat[] {
    const seats = this.view ? this.view.players.length : this.setup?.req.kind === "create" ? this.setup.req.seats : 0;
    const lineup: HeaderSeat[] = [];
    for (let i = 0; i < seats; i++) {
      const p = this.view?.players[i];
      const color = seatColor(i);
      if (p?.addr) lineup.push({ charKey: p.char, name: charName(p.char), color, player: playerLabel(p), addr: p.addr, you: i === this.myIndex });
      else if (this.setup && i === this.setup.seat) lineup.push({ charKey: this.setup.req.charKey, name: charName(this.setup.req.charKey), color, player: "", addr: "", you: true });
      else lineup.push({ charKey: "", name: "Empty seat", color, player: "", addr: "", you: false });
    }
    return lineup;
  }

  /** The right column's plan panel: my plan while I pick it, the plan sent, or what the game waits for. */
  private planPanel(names: string[]): ShowdownModel["plan"] {
    const view = this.view;
    const lobby = { id: "lobby", label: "Lobby", tone: "plain" as const };
    if (this.mode === "setup" && this.setup) {
      const s = this.setup;
      const zone = setupZone(s.req.charKey);
      const off = s.busy || !s.hex;
      return {
        title: "Take position",
        points: zone.length ? `${zone[0]} to ${zone[zone.length - 1]}` : "",
        lines: s.hex ? [{ name: s.hex, detail: `facing ${DIR_NAMES[s.facing]}` }] : [],
        empty: `Click one of the green hexes, where ${charName(s.req.charKey)} sets up, to stand there.`,
        note: s.busy
          ? "Signing in Adena…"
          : s.hex
            ? "Click your token to turn it (the right button turns it the other way), or click another green hex to move. Hover your token to see where you could aim." +
              (s.req.stake ? ` Adena then asks you to sign the ${formatGnot(s.req.stake)} stake.` : "")
            : `You start upright, your Colt 45 holstered, facing ${DIR_NAMES[s.facing]} unless you turn.`,
        warn: false,
        buttons: [
          {
            id: "setup",
            label: s.busy ? "SIGNING…" : (s.req.kind === "create" ? "CALL THE SHOWDOWN" : "JOIN THE SHOWDOWN") + (s.req.stake ? `\n${formatGnot(s.req.stake)}` : ""),
            tone: "primary",
            disabled: off,
          },
          { id: "turnLeft", label: "↶ Turn left", tone: "plain", disabled: off },
          { id: "turnRight", label: "Turn right ↷", tone: "plain", disabled: off },
          lobby,
        ],
      };
    }
    if (!view) return { title: "Loading", points: "", lines: [], empty: "Reading the showdown from the chain…", note: "", warn: false, buttons: [] };
    // A gun move (10.22) shows before its action, free; loose ones last, waiting for an action.
    const moveLine = (m: GunMove, loose: boolean) => {
      const gun = this.gunName(m.gun);
      return {
        name: m.to === HAND_GROUND ? `Drop the ${gun}` : `${gun} to the ${m.to === 0 ? "gun hand" : "other hand"}`,
        detail: loose ? "pick an action: done as it comes up" : "free, as the next action comes up",
      };
    };
    const lines = (plan: PlanEntry[], loose: GunMove[] = []) => [
      ...plan.flatMap((e) => [
        ...(e.moves ?? []).map((m) => moveLine(m, false)),
        {
          name: getActionDef(e).name,
          detail: planDetail(e, names),
          cost: getActionDef(e).cost,
          target: e.target !== undefined && names[e.target] ? { name: names[e.target], color: seatColor(e.target) } : undefined,
        },
      ]),
      ...loose.map((m) => moveLine(m, true)),
    ];
    const replay = { id: "replay", label: "Replay", tone: "plain" as const, disabled: !view.lastTurn };
    const me = this.myIndex >= 0 ? view.players[this.myIndex] : null;
    const pending = this.pendingNames();

    if (this.mode === "select" && this.outOfTime()) {
      const sentBy = view.players.filter((p, i) => i !== this.myIndex && p.addr && p.committed).map((p) => charName(p.char));
      const out = !!me && missOutcome(me) === "out";
      const missed = (me?.missed ?? 0) + 1;
      return {
        title: "Out of time",
        points: "",
        lines: [],
        empty: "Your plan did not come in time: the turn takes no more plans.",
        // Nobody's plan in, the turn is passed for everyone late and resolves empty.
        note:
          `${sentBy.length ? `${sentBy.join(", ")} sent a plan` : "Nobody sent a plan"}: calling time ` +
          (out
            ? `puts you out of the fight, ${MAX_MISSED} missed turns in a row${view.players.length > 2 ? "; the others fight on" : ""}.`
            : `passes the turn for you${sentBy.length ? "" : " and the others"}, missed turn ${missed} of ${MAX_MISSED} in a row (at ${MAX_MISSED}, you are out of the fight).`),
        warn: true,
        buttons: [
          { id: "claim", label: "CALL TIME", tone: out ? "danger" : "primary" },
          replay,
          lobby,
        ],
      };
    }
    if (this.mode === "select" || this.mode === "submitting") {
      const plan = this.currentPlan();
      const budget = this.budget();
      const problem = this.planProblem(plan);
      const listed = plan.length + this.looseMoves.length > 0;
      const pending = this.choiceMode
        ? choicePrompt(this.choiceMode.choiceType)
        : this.optMenu
          ? isStrength(this.optMenu)
            ? "Choose what the strength adds to the throw, beside your token."
            : "Choose what to do with the gun, beside your token."
          : this.aimMode
            ? `Click the hex to ${this.pendingOpts.get(this.aimMode.card) === "shoot" ? "shoot at (chance of hitting, bullseye in red)" : this.pendingOpts.get(this.aimMode.card) === "throw" ? "throw the gun at (chance of hitting, bullseye in red)" : "aim at"}.`
            : plan.length > 0 && isStrength(plan[plan.length - 1])
              ? "Pick Throw: the strength goes with the throw played right after it."
              : "";
      const carried = [
        me && me.delay > 0 ? `${me.delay} delay carried from last turn: ${budget} of your ${MAX_ACTION_POINTS} points are left to plan.` : "",
        me?.missed ? `You let ${me.missed} turn${me.missed > 1 ? "s" : ""} in a row time out: at ${MAX_MISSED}, you are out of the fight.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const submitting = this.mode === "submitting";
      return {
        title: "Your plan",
        points: `${planCost(plan)} / ${budget} points`,
        lines: lines(plan, this.looseMoves),
        empty: "Pick action cards in your hand, or send an empty plan to pass. Your sheet (click your panel) drops or moves a gun in hand, for free.",
        note: submitting ? "Signing your plan in Adena…" : pending || (listed && problem ? problem : carried),
        warn: !submitting && (!!pending || (listed && !!problem)),
        buttons: [
          { id: "send", label: submitting ? "SIGNING…" : plan.length === 0 ? "PASS THE TURN" : "SEND PLAN", tone: "primary", disabled: submitting || !!pending || !!problem },
          { id: "clear", label: "Clear", tone: "plain", disabled: submitting || !listed },
          replay,
          { id: "surrender", label: "Surrender", tone: "danger", disabled: submitting },
        ],
      };
    }
    if (this.mode === "waiting" && view.phase === "waiting") {
      const left = view.players.length - view.players.filter((p) => p.addr).length;
      return {
        title: "Waiting for players",
        points: seatsTaken(view),
        lines: [],
        empty: `The showdown is open: it starts once ${left > 1 ? `${left} more players join` : "one more player joins"}.`,
        note: this.myIndex === 0 ? "" : "Only the player who called the showdown can cancel it.",
        warn: false,
        buttons: this.myIndex === 0 ? [{ id: "cancel", label: view.stake ? "Cancel the showdown · stakes back" : "Cancel the showdown", tone: "danger" as const }] : [],
      };
    }
    if (this.mode === "waiting") {
      let plan: PlanEntry[] = [];
      const sent = this.sentPlanString();
      try {
        plan = sent ? decodePlan(sent) : [];
      } catch {
        plan = [];
      }
      const due = pastTimeout(view.timeoutAt, Date.now() / 1000);
      const passed = me && me.delay >= MAX_ACTION_POINTS;
      if (view.phase === "revealing") return this.revealPanel(lines(plan), sent, !!passed, due, replay);
      const late = view.players.filter((p, i) => i !== this.myIndex && p.addr && p.status === "alive" && !p.committed);
      const lateNames = (outcome: "pass" | "out") => late.filter((p) => missOutcome(p) === outcome).map((p) => charName(p.char)).join(", ");
      const claimed = [
        lateNames("pass") && `passes the turn for ${lateNames("pass")}`,
        lateNames("out") && `puts ${lateNames("out")} out of the fight (${MAX_MISSED} missed turns in a row)`,
      ]
        .filter(Boolean)
        .join(" and ");
      const note = due
        ? `Out of time for ${pending}: calling time ${claimed || "moves the showdown on"}.`
        : `Waiting for ${pending}. ${view.timeoutAt > 0 ? `You may call time in ${formatLeft(Math.max(0, view.timeoutAt + CHAIN_CLOCK_MARGIN - Date.now() / 1000))}.` : ""}`;
      return {
        title: "Your plan",
        points: "sent",
        lines: lines(plan),
        empty: passed ? `Too much delay to act this turn (${me!.delay}): you pass.` : sent === "" ? "You pass this turn." : "Your plan is in.",
        note,
        warn: due,
        buttons: [
          ...(due ? [{ id: "claim", label: "CALL TIME", tone: "primary" as const }] : []),
          replay,
          { id: "surrender", label: "Surrender", tone: "danger" },
        ],
      };
    }
    if (this.mode === "ended") {
      return { title: "Game over", points: "", lines: [], empty: this.statusLine(), note: payoutLine(view, this.myIndex), warn: false, buttons: [replay, lobby] };
    }
    // An open showdown watched: join it from here, in its next free seat (the lobby's Join, from the board).
    if (this.mode === "spectate" && view.phase === "waiting") {
      const left = view.players.length - view.players.filter((p) => p.addr).length;
      const seat = nextSeat(view.players);
      const join = seat >= 0 && this.canJoin() ? charName(seatChar(seat)) : "";
      // Without a wallet, Adena is connected from here (a link shared by the caller, say).
      const connect = seat >= 0 && !this.tutorial && !currentChain();
      return {
        title: "Waiting for players",
        points: seatsTaken(view),
        lines: [],
        empty: `The showdown is open: it starts once ${left > 1 ? `${left} more players join` : "one more player joins"}.`,
        note: join
          ? `Join it: you take position on the board first${view.stake ? `, and put in the ${formatGnot(view.stake)} stake` : ""}.`
          : connect
            ? "Connect with Adena to join it."
            : "",
        warn: false,
        you: join ? { charKey: seatChar(seat), name: join } : undefined,
        buttons: [
          ...(join ? [{ id: "join", label: `JOIN AS\n${join.toUpperCase()}${view.stake ? `\n${formatGnot(view.stake)}` : ""}`, tone: "primary" as const }] : []),
          ...(connect ? [{ id: "connect", label: this.connecting ? "Connecting…" : "Connect with Adena", tone: "adena" as const, disabled: this.connecting }] : []),
          lobby,
        ],
      };
    }
    return { title: this.mode === "spectate" ? "Spectating" : "Loading", points: "", lines: [], empty: this.statusLine(), note: "", warn: false, buttons: [replay, lobby] };
  }

  /** The hand: each card's two sides, as they can be played right now. */
  private handModel(): ShowdownModel["hand"] {
    const selecting = this.mode === "select" && !this.outOfTime();
    const plan = this.currentPlan();
    const cost = planCost(plan);
    const budget = this.budget();
    const last = this.selectionOrder[this.selectionOrder.length - 1];
    const pendingCard = this.choiceMode ?? this.optMenu ?? this.aimMode;
    const cards: HandSide[][] = [];
    for (let n = 1; n <= 12; n++) {
      const card = n as CardNumber;
      // Cards with no side in the game yet (brawling) are left out of the hand.
      if (!isEnabled({ card, side: "front" }) && !isEnabled({ card, side: "back" })) continue;
      cards.push(
        (["front", "back"] as CardSide[]).map((side) => {
          const def = getActionDef({ card, side });
          const order = this.selectionOrder.findIndex((e) => e.card === card && e.side === side) + 1;
          let state: HandSide["state"];
          if (!isEnabled({ card, side })) state = "later";
          else if (order > 0) {
            const needsChoice =
              def.choiceType !== "none" &&
              !this.pendingChoices.has(card) &&
              !this.pendingGuns.has(card) &&
              !(this.pendingOpts.has(card) && (!TARGET_OPTIONS.has(this.pendingOpts.get(card) ?? "") || this.pendingAims.has(card)));
            const isLast = !!last && last.card === card && last.side === side;
            state = needsChoice ? "choice" : isLast && selecting ? "last" : "picked";
          } else {
            const blocked = !!pendingCard || this.isSelected(card, side === "front" ? "back" : "front");
            const usable = selecting && !blocked && cost + def.cost <= budget && canPlay({ card, side }, this.ranLastTurn(), this.plannedGuns(), this.groundHere()) && planAllows(plan, { card, side }, budget);
            state = usable ? "open" : "off";
          }
          return { card, side, name: def.name, cost: def.cost, tag: CATEGORY_TAGS[def.category], state, order, image: getActionCardAsset(card, side) };
        }),
      );
    }
    const note =
      this.mode === "select"
        ? selecting
          ? "Play the top or the bottom of a card. Hover a side to see the whole card."
          : "Out of time: the turn takes no more plans."
        : this.mode === "submitting"
          ? "Signing your plan in Adena…"
          : this.mode === "waiting" || this.mode === "setup"
            ? this.view?.phase === "waiting" || this.mode === "setup"
              ? "Your hand, for when the showdown starts."
              : "Your plan is sent."
            : this.mode === "ended"
              ? "The showdown is over."
              : this.mode === "spectate"
                ? "Spectating."
                : "";
    return { cards, note };
  }

  // ── Card strip ────────────────────────────────────────────────────────────

  private isSelected(card: CardNumber, side: CardSide): boolean {
    return this.selectionOrder.some((e) => e.card === card && e.side === side);
  }

  /** The plan in selection order, with the committed directions. */
  private currentPlan(): PlanEntry[] {
    return this.selectionOrder.map((e) => {
      const entry: PlanEntry = { card: e.card, side: e.side };
      const dir = this.pendingChoices.get(e.card);
      if (dir) entry.dir = dir;
      const pick = this.pendingGuns.get(e.card);
      if (pick) {
        if (pick.ground !== undefined) entry.groundGun = pick.ground;
        else entry.gun = pick.gun;
        entry.hand = pick.hand;
      }
      const opt = this.pendingOpts.get(e.card);
      if (opt) entry.opt = opt;
      const aim = this.pendingAims.get(e.card);
      if (aim?.hex) entry.hex = aim.hex;
      if (aim?.target !== undefined) entry.target = aim.target;
      const moves = this.movesByCard.get(e.card);
      if (moves?.length) entry.moves = moves;
      return entry;
    });
  }

  /** What stops the plan from being sent, as the realm would refuse it, or a gun move with no action after it. */
  private planProblem(plan: PlanEntry[]): string | null {
    const problem = validatePlan(plan, this.budget(), this.ranLastTurn(), this.myGuns(), this.groundHere());
    if (problem) return problem;
    return this.looseMoves.length ? "Pick an action after the gun move: it is done when that action comes up." : null;
  }

  /**
   * The free gun moves my sheet offers while I plan (10.22): the gun in both
   * hands to a hand or the ground, a gun in a hand to the ground. A move
   * goes with the next card picked, done as that action comes up; none when
   * no gun can move.
   */
  private gunMovePick(): GunPick | undefined {
    if (this.mode !== "select" || this.choiceMode || this.optMenu || this.aimMode || this.outOfTime()) return undefined;
    const planned = this.plannedGuns();
    if (!planned.some((g) => moveDestinations(g).length > 0)) return undefined;
    return {
      prompt: "Free gun move: drop a gun in hand, or move it from both hands to the gun hand",
      destinations: (pick) => (pick.gun === undefined ? [] : moveDestinations(planned.find((g) => g.id === pick.gun))),
      onPick: (pick, to) => {
        if (pick.gun === undefined) return;
        this.looseMoves = [...this.looseMoves, { gun: pick.gun, to }];
        // The plan string does not change before the next card, so the preview plays nothing.
        if (to === HAND_GROUND) this.playCues([{ group: "thud", delayMs: 0 }]);
        this.updatePreview();
        this.renderView();
      },
    };
  }

  /**
   * A card taken out of the plan takes its gun moves with it, and the loose
   * ones made after it, which may need it (a gun it picked up).
   */
  private releaseMoves(card: number) {
    this.movesByCard.delete(card);
    this.looseMoves = [];
  }

  /** A gun's name, from the sheet or the plan's preview (a gun picked up this turn, or one it drops). */
  private gunName(id: number): string {
    const guns = [...this.myGuns(), ...(this.preview?.guns ?? []), ...(this.preview?.dropped ?? []).map((d) => d.gun)];
    return guns.find((g) => g.id === id)?.name ?? "gun";
  }

  /** My character's guns as the plan leaves them before the next card (the chain's when nothing is planned). */
  private plannedGuns() {
    return this.preview?.guns ?? this.myGuns();
  }

  /**
   * The weapons lying in my character's hex, where the plan leaves it, as
   * the chain has them (a pick-up planned this turn must still find its gun
   * here, so the preview's lifting of it does not apply).
   */
  private groundHere(): GroundGunView[] {
    const me = this.preview ?? (this.myIndex >= 0 ? this.committed[this.myIndex] : null);
    return me ? (this.view?.ground ?? []).filter((g) => g.hex === me.hex) : [];
  }

  /** My character's guns, as the chain shows them. */
  private myGuns() {
    return (this.myIndex >= 0 ? this.view?.players[this.myIndex]?.guns : undefined) ?? [];
  }

  /** A seat's sheet, from its panel or its token: my own, while I plan, takes the free gun moves (10.22). */
  private openSeatSheet(seat: number) {
    this.openSheet(seat, seat === this.myIndex ? this.gunMovePick() : undefined);
  }

  /** Shows the character sheet of a seat, with what the board currently displays for it. */
  private openSheet(seat: number, pick?: GunPick, onClosed?: () => void) {
    const view = this.view;
    const p = view?.players[seat];
    const c = this.displayChars()[seat];
    const charKey = this.charOf(seat);
    if (!view || !p || !c || !charKey || !c.hex) return;
    // The overlay owns the pointer while it is open: no card or token reacts underneath.
    this.input.enabled = false;
    openCharacterSheet(
      {
      name: charName(charKey),
      player: p.name,
      addr: p.addr,
      charKey,
      seat,
      hex: c.hex,
      facing: c.facing,
      down: c.down,
      delay: c.delay,
      status: c.status,
      committed: p.committed,
      revealed: p.revealed,
      missed: p.missed,
      phase: view.phase,
      isMe: seat === this.myIndex,
      guns: c.guns,
      ground: this.displayGround().filter((g) => g.hex === c.hex),
      aim: c.aim,
      aimHex: c.aimHex,
      aimTarget: c.aim > 0 && c.aimAt >= 0 ? charName(this.charOf(c.aimAt)) : "",
      aimedBy: this.aimersOn(this.displayChars(), seat).map((a) => `${charName(this.charOf(a.seat))} ${a.n}`),
      endurance: c.endurance,
      serious: c.serious,
      gunArm: c.gunArm,
      otherArm: c.otherArm,
      leg: c.leg,
      },
      () => {
        if (this.scene.isActive()) this.input.enabled = true;
        onClosed?.();
      },
      pick,
    );
  }

  /** Whether my character played a Run on the previous turn (needed to Sprint). */
  private ranLastTurn(): boolean {
    const me = this.myIndex >= 0 ? this.view?.players[this.myIndex] : null;
    return !!me?.ranLastTurn;
  }

  private budget(): number {
    const me = this.myIndex >= 0 ? this.committed[this.myIndex] : null;
    return Math.max(0, MAX_ACTION_POINTS - (me?.delay ?? 0));
  }

  private clearSelection() {
    this.selectionOrder = [];
    this.pendingChoices.clear();
    this.pendingGuns.clear();
    this.pendingOpts.clear();
    this.pendingAims.clear();
    this.movesByCard.clear();
    this.looseMoves = [];
    this.preview = null;
    this.previewPlan = "";
    this.choiceMode = null;
    this.clearChoiceOverlays();
    this.closeOptMenu();
    this.closeAimMode();
  }

  private toggleCard(card: CardNumber, side: CardSide) {
    if (this.outOfTime()) return this.renderView();
    // While a choice is pending, only that card can be touched (to deselect it).
    if (this.choiceMode && !(card === this.choiceMode.card && side === this.choiceMode.side)) return;
    if (this.optMenu && !(card === this.optMenu.card && side === this.optMenu.side)) return;
    if (this.aimMode && !(card === this.aimMode.card && side === this.aimMode.side)) return;
    const def = getActionDef({ card, side });
    const wasSelected = this.isSelected(card, side);
    const otherSelected = this.isSelected(card, side === "front" ? "back" : "front");
    if (!wasSelected) {
      if (otherSelected || !canPlay({ card, side }, this.ranLastTurn(), this.plannedGuns(), this.groundHere())) return;
      if (!planAllows(this.currentPlan(), { card, side }, this.budget())) return;
      if (planCost(this.currentPlan()) + def.cost > this.budget()) return;
    }
    this.exitChoiceMode();

    if (wasSelected) {
      // Only the last selected card can be deselected: choices are relative to the state before it.
      const last = this.selectionOrder[this.selectionOrder.length - 1];
      if (!last || last.card !== card || last.side !== side) return;
      this.selectionOrder.pop();
      this.playCues([{ group: "unpickCard", delayMs: 0 }]);
      this.releaseMoves(card);
      this.pendingChoices.delete(card);
      this.pendingGuns.delete(card);
      this.pendingOpts.delete(card);
      this.pendingAims.delete(card);
    } else {
      this.selectionOrder.push({ card, side });
      if (this.looseMoves.length) this.movesByCard.set(card, this.looseMoves); // done as this action comes up
      this.looseMoves = [];
      this.playCues([{ group: "pickCard", delayMs: 0 }]);
      if (isShooting({ card, side }) || isStrength({ card, side })) this.openOptMenu(card, side);
      else if (def.choiceType === "gun") this.enterGunChoice(card, side);
      else if (def.choiceType !== "none") this.enterChoiceMode(card, side, def.choiceType);
    }
    this.updatePreview();
    this.renderView();
  }

  // ── Choice mode ───────────────────────────────────────────────────────────

  /**
   * Draw & Cock: the player picks the gun on the character sheet by dragging
   * it from the holster to the gun hand. Closing the sheet without a pick
   * drops the card again.
   */
  private enterGunChoice(card: CardNumber, side: CardSide) {
    if (this.myIndex < 0) return;
    const guns = drawableGuns(this.plannedGuns());
    const ground = this.groundHere();
    if (guns.length === 0 && ground.length === 0) return;
    let picked = false;
    this.input.enabled = false;
    const planned = this.plannedGuns();
    const what = guns.length > 0 && ground.length > 0 ? "your gun or the one on the ground" : guns.length > 0 ? "your gun" : "the gun from the ground";
    this.openSheet(
      this.myIndex,
      {
        prompt: `Draw & Cock: drag ${what} to the gun hand, or to both hands to load it`,
        destinations: (pick) => {
          if (pick.ground !== undefined) return ground.some((g) => g.id === pick.ground) ? drawDestinations(planned) : [];
          const gun = planned.find((g) => g.id === pick.gun);
          return gun ? drawDestinations(planned, gun) : [];
        },
        onPick: (pick, hand) => {
          picked = true;
          this.pendingGuns.set(card, { ...pick, hand });
          this.updatePreview(); // the gun icon joins the token right away
          this.renderView();
        },
      },
      () => {
        if (!picked && this.isSelected(card, side)) {
          const last = this.selectionOrder[this.selectionOrder.length - 1];
          if (last && last.card === card && last.side === side) {
            this.selectionOrder.pop();
            this.releaseMoves(card);
            this.playCues([{ group: "unpickCard", delayMs: 0 }]);
            this.updatePreview(false);
          }
          this.renderView();
        }
      },
    );
  }

  private enterChoiceMode(card: CardNumber, side: CardSide, choiceType: ChoiceType) {
    this.exitChoiceMode();
    const me = this.preview ?? (this.myIndex >= 0 ? this.committed[this.myIndex] : null);
    if (!me) return;
    const rels = choiceType === "move_ahead" || choiceType === "turn_ahead" ? AHEAD_DIRS : BACK_DIRS;
    const isTurn = choiceType === "turn_ahead" || choiceType === "turn_back";
    const from = BOARD_A.hexPos(me.hex);
    const options = rels
      .map((rel) => {
        const abs = relativeToAbsoluteDir(me.facing, rel);
        const hex = BOARD_A.neighbor(me.hex, abs);
        const a = (DIR_ANGLE[abs] * Math.PI) / 180;
        const pos = hex ? BOARD_A.hexPos(hex) : { x: from.x + Math.cos(a) * HEX_SPACING, y: from.y + Math.sin(a) * HEX_SPACING };
        return { rel, hex, x: pos.x, y: pos.y };
      })
      // Moves: one option per hex (two directions can lead to the same half-hex);
      // a direction off the map is kept: moving there runs away (15.5).
      .filter((o, i, all) => isTurn || o.hex === null || all.findIndex((x) => x.hex === o.hex) === i);
    this.choiceMode = { card, side, choiceType, options, from };
    this.showChoiceOverlays();
  }

  private showChoiceOverlays() {
    this.clearChoiceOverlays();
    if (!this.choiceMode) return;
    const isTurn = this.choiceMode.choiceType === "turn_ahead" || this.choiceMode.choiceType === "turn_back";
    // Running away (15.5) shows as one arrow, however many ways lead off the
    // map: straight on, the way the character faces (or backs), when that
    // leaves the map, else the one way that does.
    const away = isTurn ? [] : this.choiceMode.options.filter((o) => !o.hex);
    const out = away.find((o) => o.rel === "ahead" || o.rel === "back") ?? away[0];
    if (out) this.runAwayArrow(out.rel, this.choiceMode.from, out);
    for (const opt of this.choiceMode.options) {
      if (!isTurn && !opt.hex) continue;
      const { sx, sy } = this.boardToScreen(opt.x, opt.y);
      // A move highlights the hex it goes to; a turn, the hex-sized spot that way (always six apart).
      const outline = opt.hex && !isTurn ? BOARD_A.outline(opt.hex) : BOARD_A.regularOutline(opt.x, opt.y);
      const circle = this.hexHighlight(outline, sx, sy, 0x44cc44, 0.35, 0x44cc44);
      const label = this.add
        .text(sx, sy, opt.rel.replace(/_/g, "\n"), { fontSize: "10px", color: "#fff", align: "center" })
        .setOrigin(0.5)
        .setMask(this.arrMask)
        .setDepth(501);
      circle.on("pointerup", () => this.resolveChoice(opt.rel));
      this.choiceOverlays.push(circle, label);
    }
  }

  /**
   * A move off the map, which runs away (15.5): a gold arrow pointing the
   * way out, on the board's side of the edge. The hex out there lies
   * beyond the board's image (the edge hexes are centred on its edges),
   * which the view cuts off however its window is shaped, so the arrow
   * stands for it, kept inside what the view shows.
   */
  private runAwayArrow(rel: RelativeDirection, from: { x: number; y: number }, to: { x: number; y: number }) {
    const r = BOARD_A.hexRadius * this.displayTransform().scale;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const size = r * 0.5;
    const start = this.boardToScreen(from.x, from.y);
    // Most of the way to the edge hex's side that way, kept inside the board's image and its cell.
    const topLeft = this.boardToScreen(0, 0);
    const bottomRight = this.boardToScreen(BOARD_A.w, BOARD_A.h);
    const b = this.board;
    const keep = (v: number, lo: number, hi: number) => (lo > hi ? v : Phaser.Math.Clamp(v, lo, hi));
    const cx = keep(start.sx + Math.cos(angle) * r * 0.6, Math.max(topLeft.sx, b.x) + size, Math.min(bottomRight.sx, b.x + b.w) - size);
    const cy = keep(start.sy + Math.sin(angle) * r * 0.6, Math.max(topLeft.sy, b.y) + size, Math.min(bottomRight.sy, b.y + b.h) - size);
    // A block arrow pointing right, turned the way out.
    const shape: [number, number][] = [[-1, -0.4], [0.1, -0.4], [0.1, -0.85], [1, 0], [0.1, 0.85], [0.1, 0.4], [-1, 0.4]];
    const points = shape.map(([x, y]) => new Phaser.Math.Vector2(x * size, y * size).rotate(angle));
    const arrow = this.add
      .polygon(cx, cy, points, RUN_AWAY_COLOR, 0.9)
      .setOrigin(0)
      .setStrokeStyle(2, 0x2a1c14, 1)
      .setMask(this.arrMask)
      .setInteractive({ hitArea: new Phaser.Geom.Polygon(points), hitAreaCallback: Phaser.Geom.Polygon.Contains, useHandCursor: true })
      .setDepth(501);
    let detail: Phaser.GameObjects.Text | null = null;
    arrow.on("pointerover", () => {
      arrow.setFillStyle(RUN_AWAY_COLOR, 1).setStrokeStyle(3, 0xffffff, 1);
      detail = this.hoverDetail(cx, cy, size, ["Run away: off the map, your character leaves", "the showdown (Run away −2 VP)"]);
      this.choiceOverlays.push(detail);
    });
    arrow.on("pointerout", () => {
      arrow.setFillStyle(RUN_AWAY_COLOR, 0.9).setStrokeStyle(2, 0x2a1c14, 1);
      detail?.destroy();
      detail = null;
    });
    arrow.on("pointerup", () => this.resolveChoice(rel));
    this.choiceOverlays.push(arrow);
  }

  /**
   * A hex to pick: its outline (board pixels) filled and stroked, around
   * the screen point (sx, sy), clickable inside the outline only; it lights
   * up while the pointer is over it.
   */
  private hexHighlight(outline: { x: number; y: number }[], sx: number, sy: number, fill: number, alpha: number, stroke: number, depth = 500): Phaser.GameObjects.Polygon {
    const points = this.insetOutline(outline, sx, sy);
    const hex = this.add
      .polygon(sx, sy, points, fill, alpha)
      .setOrigin(0)
      .setStrokeStyle(2, stroke, 0.9)
      .setMask(this.arrMask)
      .setInteractive({ hitArea: new Phaser.Geom.Polygon(points), hitAreaCallback: Phaser.Geom.Polygon.Contains, useHandCursor: true })
      .setDepth(depth);
    // Above its neighbours while hovered, so its whole outline shows (labels stay above at 501).
    hex.on("pointerover", () => hex.setFillStyle(fill, Math.min(1, alpha * 2)).setStrokeStyle(4, 0xffffff, 1).setDepth(depth + 0.5));
    hex.on("pointerout", () => hex.setFillStyle(fill, alpha).setStrokeStyle(2, stroke, 0.9).setDepth(depth));
    return hex;
  }

  // ── Setting up ────────────────────────────────────────────────────────────

  /**
   * Highlights the hexes my character may set up in (game/setup.ts), under
   * the tokens: a click stands it there. The hex picked shows darker;
   * nothing shows while the call is being signed.
   */
  private showSetupZone() {
    const setup = this.setup;
    if (!setup) return;
    for (const o of setup.zone) o.destroy();
    setup.zone = [];
    this.hideSetupGhost();
    if (setup.busy) return;
    for (const hex of setupZone(setup.req.charKey)) {
      const { sx, sy } = this.hexToScreen(hex);
      const h = this.hexHighlight(BOARD_A.outline(hex), sx, sy, MY_ZONE_COLOR, hex === setup.hex ? 0.5 : 0.22, MY_ZONE_COLOR, SETUP_ZONE_DEPTH);
      h.on("pointerover", () => this.showSetupGhost(hex));
      h.on("pointerout", () => this.hideSetupGhost());
      h.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (this.isDragging || pointer.rightButtonReleased()) return;
        this.placeSetup(hex);
      });
      setup.zone.push(h);
    }
  }

  /** Shows my token, see-through, on a hex of my zone under the pointer, the way it would stand there (not where it already stands). */
  private showSetupGhost(hex: string) {
    this.hideSetupGhost();
    const setup = this.setup;
    if (!setup || setup.busy || hex === setup.hex || !this.textures.exists(`char_${setup.req.charKey}`)) return;
    const { sx, sy } = this.hexToScreen(hex);
    setup.ghost = this.add
      .image(sx, sy, `char_${setup.req.charKey}`)
      .setScale(this.displayTransform().scale * TOKEN_SCALE_FACTOR)
      .setAngle(dirIndexToAngle(setup.facing, setup.req.charKey))
      .setAlpha(SETUP_GHOST_ALPHA)
      .setMask(this.arrMask)
      .setDepth(SETUP_GHOST_DEPTH);
  }

  private hideSetupGhost() {
    if (!this.setup) return;
    this.setup.ghost?.destroy();
    this.setup.ghost = null;
  }

  /** Stands my character in one of its hexes, keeping the way it faces. */
  private placeSetup(hex: string) {
    const setup = this.setup;
    if (!setup || setup.busy || hex === setup.hex) return;
    setup.hex = hex;
    this.hideSetupGhost(); // the token itself comes here
    this.playCues([{ group: "step", delayMs: 0 }]);
    if (!this.tokens[setup.seat]) this.buildTokens(); // the token appears with the first pick
    this.refreshTokens(true);
    this.showSetupZone();
    this.renderView();
  }

  /** Turns my character one direction clockwise (1) or counter-clockwise (-1) while setting up. */
  private turnSetup(delta: 1 | -1) {
    const setup = this.setup;
    if (!setup || setup.busy || !setup.hex) return;
    setup.facing = (setup.facing + delta + 6) % 6;
    this.playCues([{ group: "turn", delayMs: 0 }]);
    setup.ghost?.setAngle(dirIndexToAngle(setup.facing, setup.req.charKey));
    this.refreshTokens(true);
    if (this.hoverZone.length > 0) this.showAimZone(setup.seat); // the pointer is on the token: its aim zone turns with it
    this.renderView();
  }

  /**
   * Signs the call or the join with the position picked. A showdown called
   * reopens as the game it became; a join hands the board back to the poll.
   */
  private async sendSetup() {
    const setup = this.setup;
    if (!setup || setup.busy || !setup.hex) return;
    setup.busy = true;
    this.showSetupZone();
    this.renderView();
    try {
      if (setup.req.kind === "create") {
        const chain = this.chain;
        const r = await chain.realm.createGame(setup.req.seats, setup.req.turns, setup.req.timeoutMinutes, setup.hex, setup.facing, setup.req.stake);
        // The tx result was not indexed in time: the game is the newest of ours.
        const id = r.gameID ?? (await chain.realm.listGames(chain.wallet.address)).mine[0]?.id ?? null;
        if (!this.scene.isActive()) return;
        if (!id) {
          showToast(this, "The showdown was called; find it in the lobby", "info");
          this.scene.start("LobbyScene", { splash: false });
          return;
        }
        this.scene.restart({ gameID: id });
      } else {
        await this.chain.realm.joinGame(this.gameID, setup.hex, setup.facing, setup.req.stake);
        if (!this.scene.isActive()) return;
        this.endSetup();
        // The poll may have seen the join land first (a stake waits for
        // Adena's popup): then the view is current and no new revision
        // will come to move on from "sync".
        if (this.view && seatOf(this.view, this.chain.wallet.address) >= 0) {
          this.applyState(false);
        } else {
          this.mode = "sync";
          this.renderView();
        }
        await this.poller?.pokeNow();
      }
    } catch (e) {
      if (!this.scene.isActive()) return;
      showToast(this, userMessage(e), "error");
      if (this.setup) {
        this.setup.busy = false;
        this.showSetupZone();
        this.renderView();
      }
    }
  }

  /**
   * A hex outline (board pixels) as screen points around (sx, sy), pulled in
   * a few pixels towards the centre so the grid lines show between highlights.
   */
  private insetOutline(outline: { x: number; y: number }[], sx: number, sy: number): Phaser.Math.Vector2[] {
    return outline.map((p) => {
      const s = this.boardToScreen(p.x, p.y);
      const v = new Phaser.Math.Vector2(s.sx - sx, s.sy - sy);
      return v.setLength(Math.max(0, v.length() - HEX_HIGHLIGHT_INSET));
    });
  }

  /**
   * Shows where a character can aim and shoot from where the board shows
   * it: the hexes of its aim zone (8.32) it has a line of sight to (31),
   * brick red for an enemy, green for mine, under the tokens and not
   * clickable, so the pointer stays on the token.
   */
  private showAimZone(seat: number) {
    this.hideAimZone();
    const color = seat === this.myIndex ? MY_ZONE_COLOR : ENEMY_ZONE_COLOR;
    const chars = this.displayChars();
    const c = chars[seat];
    if (!c || c.status !== "alive") return;
    for (const hex of BOARD_A.aimZone(c.hex, c.facing)) {
      // A hex out of sight (rule 31) is left out: no aim or shot can go there.
      if (!canSee(BOARD_A, c, hex, standingOn(chars, hex, seat)).clear) continue;
      const { sx, sy } = this.hexToScreen(hex);
      const points = this.insetOutline(BOARD_A.outline(hex), sx, sy);
      this.hoverZone.push(this.add.polygon(sx, sy, points, color, 0.28).setOrigin(0).setStrokeStyle(2, color, 0.8).setMask(this.arrMask).setDepth(0.5));
    }
  }

  /** The lines shown above a hovered hex of the aim zone (below it when there is no room above). */
  private hoverDetail(sx: number, sy: number, r: number, lines: string[]): Phaser.GameObjects.Text {
    const detail = this.add
      .text(sx, sy - r - 6, lines.join("\n"), { fontSize: "13px", color: "#f3e7ce", backgroundColor: "#0d0704", padding: { x: 8, y: 5 }, align: "center" })
      .setOrigin(0.5, 1)
      .setDepth(502);
    // Kept inside the board's cell: the side columns and the header cover the rest of the canvas.
    const b = this.board;
    detail.setX(Phaser.Math.Clamp(sx, b.x + detail.width / 2 + 8, b.x + b.w - detail.width / 2 - 8));
    if (detail.y - detail.height < b.y + 4) detail.setOrigin(0.5, 0).setY(sy + r + 6);
    return detail;
  }

  private hideAimZone() {
    for (const o of this.hoverZone) o.destroy();
    this.hoverZone = [];
  }

  private clearChoiceOverlays() {
    for (const o of this.choiceOverlays) o.destroy();
    this.choiceOverlays = [];
  }

  private resolveChoice(rel: RelativeDirection) {
    if (!this.choiceMode) return;
    this.pendingChoices.set(this.choiceMode.card, rel);
    this.exitChoiceMode();
    this.updatePreview();
    this.renderView();
  }

  private exitChoiceMode() {
    this.choiceMode = null;
    this.clearChoiceOverlays();
    this.closeOptMenu();
    this.closeAimMode();
  }

  /**
   * Highlights every hex of my aim zone; clicking one is where the aim or the
   * shot goes. menuHex reopens the target menu of that hex (zoom, pan, rebuild).
   */
  private enterAimMode(card: CardNumber, side: CardSide, menuHex = "") {
    this.closeAimMode();
    const chars = this.displayChars();
    const me = this.myIndex >= 0 ? chars[this.myIndex] : null;
    if (!me) return;
    const r = (BOARD_A.hexRadius * this.displayTransform().scale * Math.sqrt(3)) / 2; // centre to side
    const objects: Phaser.GameObjects.GameObject[] = [];
    // When shooting or throwing, the chance of hitting each hex; a throw
    // reaches no farther than the weapon's wielding factor, plus the
    // Strength played on top of it (17.2, 20.22).
    const throwing = this.pendingOpts.get(card) === "throw";
    const shooting = this.pendingOpts.get(card) === "shoot" || throwing;
    const name = getActionDef({ card, side }).name;
    const cardAimTime = throwing ? THROW_AIM_TIME : name === "Shoot" ? SHOOT_AIM_TIME : COCK_AIM_SHOOT_AIM_TIME;
    const plan = this.currentPlan();
    const reach = throwing ? throwReach(plan, plan.findIndex((e) => e.card === card && e.side === side)) : Infinity;
    // Where my AIM markers sit: on the character they follow, or on a hex.
    const markersHex = me.aim > 0 && me.aimAt >= 0 ? (chars[me.aimAt]?.hex ?? "") : me.aimHex;
    const fontPx = Math.round(Phaser.Math.Clamp(r * 0.62, 10, 22));
    for (const hex of BOARD_A.aimZone(me.hex, me.facing)) {
      const { sx, sy } = this.hexToScreen(hex);
      // The sight (rule 31) goes to the character standing there, else to
      // the hex, which counts as upright (31.3).
      // The first character in sight there, else the first standing there.
      const seen = this.aimTargets(chars, hex)[0];
      const standing = seen !== undefined ? chars[seen] : standingOn(chars, hex, this.myIndex);
      const sight = canSee(BOARD_A, me, hex, standing);
      const hexSight = standing ? canSee(BOARD_A, me, hex) : sight;
      // The hex itself out of sight: nothing can go there (an aim is
      // cancelled, a shot held for good), so it is left out, as on token
      // hover. The occupant out of sight but the hex in sight: the pick
      // names the hex, not the seat; an aim covers the spot for when the
      // occupant gets up, a shot is held until someone in sight stands
      // there (the odds read 0).
      if (!hexSight.clear) continue;
      if (BOARD_A.distance(me.hex, hex) > reach) continue;
      const hexOnly = !!standing && !sight.clear;
      const odds = shooting ? shotOdds(me, cardAimTime, hex, markersHex, BOARD_A, standing) : null;
      const who = standing ? charName(this.view?.players[chars.indexOf(standing)]?.char) : "";
      const circle = this.hexHighlight(BOARD_A.outline(hex), sx, sy, 0xb01010, 0.3, 0xff6040);
      // The chance shows on the hovered hex only.
      const labels: Phaser.GameObjects.Text[] = [];
      if (odds) {
        const pct = this.add
          .text(sx, sy, `${odds.hit}%`, { fontSize: `${fontPx}px`, color: "#ffffff", fontStyle: "bold", stroke: "#000000", strokeThickness: 3 })
          .setOrigin(0.5)
          .setMask(this.arrMask)
          .setDepth(501);
        labels.push(pct);
        if (odds.bullseye > 0) {
          labels.push(
            this.add
              .text(sx + pct.width / 2, sy - pct.height / 2, `${odds.bullseye}`, { fontSize: `${Math.round(fontPx * 0.7)}px`, color: "#ff4030", fontStyle: "bold", stroke: "#000000", strokeThickness: 3 })
              .setOrigin(0.2, 0.6)
              .setMask(this.arrMask)
              .setDepth(501),
          );
        }
        for (const l of labels) l.setVisible(false);
        objects.push(...labels);
      }
      let detail: Phaser.GameObjects.Text | null = null;
      circle.on("pointerover", () => {
        this.showAimLine(this.gunCentre(this.myIndex), { x: sx, y: sy }); // where the aim would go
        for (const l of labels) l.setVisible(true);
        if (hexOnly && !shooting) {
          detail = this.hoverDetail(sx, sy, r, [`${who} is out of sight (${sight.blocker} in the way)`, `aiming at the hex ${hex}`]);
          objects.push(detail);
          return;
        }
        if (!odds) return;
        const lines: string[] = [];
        if (!odds.los) lines.push(`${standing ? who : hex} is out of sight (${odds.blocker} in the way)`);
        lines.push(`Hit ${odds.hit}%  ·  bullseye ${odds.bullseye}%`, `range ${odds.range}${throwing ? ` of ${reach}` : ""}  ·  aim time ${odds.aimTime}`);
        // A shot at a hex is held when nobody stands there as it comes up, or when whoever does is out of sight.
        if (!standing) lines.push("held if nobody stands there when it comes up");
        else if (throwing) lines.push("the gun lands there on a hit, next to it on a miss");
        else if (hexOnly) lines.push(`held while ${who} lies hidden, or if nobody is there`);
        detail = this.hoverDetail(sx, sy, r, lines);
        objects.push(detail);
      });
      circle.on("pointerout", () => {
        this.hideAimLine();
        for (const l of labels) l.setVisible(false);
        detail?.destroy();
        detail = null;
      });
      circle.on("pointerup", () => this.resolveAim(hex));
      objects.push(circle);
    }
    this.aimMode = { card, side, objects, menuHex: "", menu: [] };
    if (menuHex) this.resolveAim(menuHex);
  }

  private closeAimMode() {
    if (!this.aimMode) return;
    for (const o of [...this.aimMode.objects, ...this.aimMode.menu]) o.destroy();
    this.aimMode = null;
  }

  /** The seats an aim or a shot can name in a hex: the enemies alive there that I can see (31.1). */
  private aimTargets(chars: CharView[], hex: string): number[] {
    const me = this.myIndex >= 0 ? chars[this.myIndex] : null;
    if (!me) return [];
    return chars.flatMap((c, i) => (c && i !== this.myIndex && c.status === "alive" && c.hex === hex && canSee(BOARD_A, me, hex, c).clear ? [i] : []));
  }

  /**
   * A click on a hex with a character in sight on it targets the character,
   * else the hex (nobody there, or an aim over an occupant out of sight,
   * 31.3); with several in sight, a menu next to the hex names them.
   */
  private resolveAim(hex: string) {
    if (!this.aimMode) return;
    const targets = this.aimTargets(this.displayChars(), hex);
    if (targets.length < 2) return this.finishAim(targets.length ? { target: targets[0] } : { hex });
    this.closeTargetMenu();
    const items = targets.map((seat) => ({ label: charName(this.view?.players[seat]?.char), enabled: true, pick: () => this.finishAim({ target: seat }) }));
    const { sx, sy } = this.hexToScreen(hex);
    const r = (BOARD_A.hexRadius * this.displayTransform().scale * Math.sqrt(3)) / 2;
    this.aimMode.menu = this.menuButtons(sx + r, sy, items);
    this.aimMode.menuHex = hex;
  }

  private closeTargetMenu() {
    if (!this.aimMode) return;
    for (const o of this.aimMode.menu) o.destroy();
    this.aimMode.menu = [];
    this.aimMode.menuHex = "";
  }

  private finishAim(aim: { hex?: string; target?: number }) {
    if (!this.aimMode) return;
    const chars = this.displayChars();
    this.pendingAims.set(this.aimMode.card, aim);
    if (this.pendingOpts.get(this.aimMode.card) === "throw") this.playCues([{ group: "select", delayMs: 0 }]);
    else if (this.pendingOpts.get(this.aimMode.card) === "shoot") {
      // The plan alone tells a gun with no shell left: the shot will only click.
      const gun = this.myIndex >= 0 ? firingGun(chars[this.myIndex]?.guns ?? []) : undefined;
      this.playCues([{ group: gun && gun.shells === 0 ? "emptyGun" : "planShoot", delayMs: 0 }]);
    }
    this.closeAimMode();
    this.updatePreview();
    this.renderView();
  }

  /** Draws the AIM markers on aimed hexes; markers following a character ride on its token (setTargetAims). */
  private refreshAimMarkers(chars: CharView[]) {
    for (const o of this.aimMarkers.values()) o.destroy();
    this.aimMarkers = new Map();
    const size = this.tokenDiameter() * AIM_SIZE;
    chars.forEach((c, seat) => {
      if (!c || c.aim <= 0 || this.aimOnToken(chars, seat) || !this.textures.exists(aimMarkerKey(c.aim))) return;
      const { sx, sy } = this.hexToScreen(c.aimHex);
      const marker = this.add.image(sx, sy, aimMarkerKey(c.aim)).setOrigin(0.5).setDisplaySize(size, size).setMask(this.arrMask).setDepth(30).setInteractive();
      marker.on("pointerover", () => this.showAimLine(this.gunCentre(seat), { x: sx, y: sy }));
      marker.on("pointerout", () => this.hideAimLine());
      this.aimMarkers.set(seat, marker);
    });
  }

  /** Drifts seat's AIM marker up and fades it away, wherever it sits: on a hex, or on the token it follows. */
  private fadeAim(seat: number, duration: number) {
    const marker = this.aimMarkers.get(seat);
    if (marker) {
      this.tweens.add({ targets: marker, y: marker.y - this.tokenDiameter() * 0.5, alpha: 0, duration, ease: "Cubic.easeIn" });
      return;
    }
    for (const t of this.tokens) t?.fadeAim(seat, this.tweens, duration);
  }

  /** Zooms seat's AIM marker in and out once, wherever it sits. */
  private pulseAim(seat: number) {
    const marker = this.aimMarkers.get(seat);
    if (marker) {
      const { scaleX, scaleY } = marker;
      this.tweens.add({ targets: marker, scaleX: scaleX * 1.35, scaleY: scaleY * 1.35, duration: 170, yoyo: true, ease: "Quad.easeOut" });
      return;
    }
    for (const t of this.tokens) t?.pulseAim(seat, this.tweens);
  }

  /**
   * Blood squirting from the impact point, sprayed onward along the bullet's
   * path with a little gravity, plus a few stains that linger on the board
   * under the tokens before fading.
   */
  /**
   * Gun smoke at the muzzle: a random handful of soft grey puffs, blown
   * out along the shot's direction, drifting up as they swell and fade.
   */
  private puffSmoke(at: { sx: number; sy: number }, along: { x: number; y: number }) {
    if (!this.textures.exists("smoke")) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      for (let r = 16; r > 0; r -= 2) g.fillStyle(0xffffff, 0.12).fillCircle(16, 16, r);
      g.generateTexture("smoke", 32, 32);
      g.destroy();
    }
    const d = this.tokenDiameter();
    const dir = Phaser.Math.RadToDeg(Math.atan2(along.y, along.x)) + Phaser.Math.Between(-15, 15);
    const size = Math.max(0.4, d / 70);
    const emitter = this.add
      .particles(at.sx, at.sy, "smoke", {
        angle: { min: dir - 40, max: dir + 40 },
        speed: { min: d * 0.15, max: d * 0.8 },
        lifespan: { min: 700, max: 1600 },
        scale: { start: size * Phaser.Math.FloatBetween(0.4, 0.7), end: size * Phaser.Math.FloatBetween(1.4, 2.4) },
        alpha: { start: Phaser.Math.FloatBetween(0.6, 0.9), end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [0xd8d4cc, 0xbdb8ae, 0xa49f96, 0xe8e4dc],
        gravityY: -d * 0.25,
        x: { min: -d * 0.05, max: d * 0.05 },
        y: { min: -d * 0.05, max: d * 0.05 },
        emitting: false,
      })
      .setMask(this.arrMask)
      .setDepth(36);
    emitter.explode(Phaser.Math.Between(5, 10));
    this.time.delayedCall(1800, () => emitter.destroy());
  }

  /**
   * A bullet's blood: a jet spurting out of the target along the bullet's
   * line, in a narrow cone, and the spray it leaves on the board, streaks
   * aligned with the line that thin out and spread with the distance.
   */
  private sprayBlood(at: { sx: number; sy: number }, along: { x: number; y: number }) {
    if (!this.textures.exists("blood_streak")) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xb0120e, 1).fillEllipse(8, 2, 16, 4);
      g.generateTexture("blood_streak", 16, 4);
      g.destroy();
    }
    const d = this.tokenDiameter();
    const rad = Math.atan2(along.y, along.x);
    const dir = Phaser.Math.RadToDeg(rad);
    const emitter = this.add
      .particles(at.sx, at.sy, "blood_streak", {
        angle: { min: dir - 10, max: dir + 10 },
        rotate: dir,
        speed: { min: d * 3, max: d * 6 },
        lifespan: { min: 180, max: 420 },
        scaleX: { start: Math.max(0.6, d / 70), end: 0.3 },
        scaleY: { start: Math.max(0.5, d / 110), end: 0.2 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setMask(this.arrMask)
      .setDepth(35);
    emitter.explode(40);
    this.time.delayedCall(1000, () => emitter.destroy());
    // The spray on the ground, past the target.
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    for (let i = 0; i < 12; i++) {
      const ahead = d * (0.3 + Math.random() * 1.5);
      const spread = (Math.random() - 0.5) * ahead * 0.35;
      const x = at.sx + ux * ahead - uy * spread;
      const y = at.sy + uy * ahead + ux * spread;
      const size = d * (0.16 - (ahead / d) * 0.06) * (0.6 + Math.random() * 0.6);
      const streak = this.add
        .ellipse(x, y, size, size * 0.3, 0x7a0c0a, 0.85)
        .setRotation(rad)
        .setMask(this.arrMask)
        .setDepth(0.6);
      this.tweens.add({ targets: streak, alpha: 0, duration: 5000, delay: 2500 + Math.random() * 1500, onComplete: () => streak.destroy() });
    }
  }

  /** A thrown weapon's blood: drops splashing round the point it strikes, and stains past it. */
  private spurtBlood(at: { sx: number; sy: number }, along: { x: number; y: number }) {
    if (!this.textures.exists("blood")) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xb0120e, 1).fillCircle(4, 4, 4);
      g.generateTexture("blood", 8, 8);
      g.destroy();
    }
    const d = this.tokenDiameter();
    const dir = Phaser.Math.RadToDeg(Math.atan2(along.y, along.x));
    const emitter = this.add
      .particles(at.sx, at.sy, "blood", {
        angle: { min: dir - 35, max: dir + 35 },
        speed: { min: d * 1.2, max: d * 3.5 },
        lifespan: { min: 250, max: 650 },
        scale: { start: Math.max(0.5, d / 110), end: 0.15 },
        alpha: { start: 1, end: 0 },
        gravityY: d * 2.5,
        emitting: false,
      })
      .setMask(this.arrMask)
      .setDepth(35);
    emitter.explode(30);
    this.time.delayedCall(1200, () => emitter.destroy());
    this.bloodStains(at, 7, along);
  }

  /**
   * Blood stains on the board under the tokens, fading slowly: splattered
   * a little past the point along a direction, or around it without one
   * (a wound bleeding where the character stands).
   */
  private bloodStains(at: { sx: number; sy: number }, count: number, along?: { x: number; y: number }) {
    const d = this.tokenDiameter();
    const len = along ? Math.hypot(along.x, along.y) || 1 : 1;
    for (let i = 0; i < count; i++) {
      let x: number;
      let y: number;
      if (along) {
        const spread = (Math.random() - 0.5) * d * 0.8;
        const ahead = Math.random() * d * 0.9;
        x = at.sx + (along.x / len) * ahead - (along.y / len) * spread;
        y = at.sy + (along.y / len) * ahead + (along.x / len) * spread;
      } else {
        // Around the token's rim, so the stains show beside the character rather than under it.
        const a = Math.random() * Math.PI * 2;
        const r = d * (0.4 + Math.random() * 0.4);
        x = at.sx + Math.cos(a) * r;
        y = at.sy + Math.sin(a) * r;
      }
      const stain = this.add.circle(x, y, d * (0.03 + Math.random() * 0.06), 0x7a0c0a, 0.85).setMask(this.arrMask).setDepth(0.6);
      this.tweens.add({ targets: stain, alpha: 0, duration: 5000, delay: 2500 + Math.random() * 1500, onComplete: () => stain.destroy() });
    }
  }

  /**
   * A burst (a hit location's "VITAL HIT!", "MISSED!", "JAMMED!" or
   * "EXPLODED!", one of BURST_KEYS) beside a token, off to the side of the
   * bullet's path (perpendicular to it, on whichever side has more room):
   * pops up, holds, fades.
   */
  private popBurst(key: string, at: { sx: number; sy: number }, along: { x: number; y: number }) {
    if (!this.textures.exists(key)) return;
    const d = this.tokenDiameter();
    const len = Math.hypot(along.x, along.y) || 1;
    const nx = -along.y / len;
    const ny = along.x / len;
    const b = this.board;
    const room = (x: number, y: number) => Math.min(x - b.x, b.x + b.w - x, y - b.y, b.y + b.h - y);
    const side = room(at.sx + nx * d, at.sy + ny * d) >= room(at.sx - nx * d, at.sy - ny * d) ? 1 : -1;
    const img = this.add
      .image(at.sx + nx * d * 1.1 * side, at.sy + ny * d * 1.1 * side, key)
      .setOrigin(0.5)
      .setScale(0)
      .setMask(this.arrMask)
      .setDepth(40);
    const scale = (d * 1.8) / img.width;
    this.tweens.add({ targets: img, scale, duration: 260, ease: "Back.easeOut" });
    this.tweens.add({ targets: img, alpha: 0, y: img.y - d * 0.3, duration: 450, delay: 900, ease: "Cubic.easeIn", onComplete: () => img.destroy() });
  }

  /** Where the ray from one point through another leaves the board area (the overlay's centre cell). */
  private beyondTheBoard(from: { sx: number; sy: number }, through: { sx: number; sy: number }): { sx: number; sy: number } {
    const dx = through.sx - from.sx;
    const dy = through.sy - from.sy;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return through;
    const b = this.board;
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (b.x + b.w - from.sx) / dx);
    if (dx < 0) t = Math.min(t, (b.x - from.sx) / dx);
    if (dy > 0) t = Math.min(t, (b.y + b.h - from.sy) / dy);
    if (dy < 0) t = Math.min(t, (b.y - from.sy) / dy);
    if (!Number.isFinite(t) || t < 1) return through;
    return { sx: from.sx + dx * t, sy: from.sy + dy * t };
  }

  private tokenCentre(seat: number): { x: number; y: number } {
    const { sx, sy } = this.tokenScreenPos(this.displayChars(), seat);
    return { x: sx, y: sy };
  }

  /** The aim line starts at the aimer's gun icon. */
  private gunCentre(seat: number): { x: number; y: number } {
    return this.tokens[seat]?.gunCentre() ?? this.tokenCentre(seat);
  }

  private hexCentre(hex: string): { x: number; y: number } {
    const { sx, sy } = this.hexToScreen(hex);
    return { x: sx, y: sy };
  }

  /** A red dotted line whose dashes march from one end to the other, redrawn every frame. */
  private showAimLine(from: { x: number; y: number }, to: { x: number; y: number }) {
    this.aimLineEnds = { from, to };
    if (!this.aimLine) this.aimLine = this.add.graphics().setMask(this.arrMask);
    this.aimLine.setDepth(this.lineDepth(from, to));
    this.drawAimLine(this.time.now);
  }

  /**
   * Lines between characters go under the tokens (their depth bands start
   * at 1), except when the ends are so close that the tokens would hide
   * the whole line: adjacent or shared hexes get it drawn on top.
   */
  private lineDepth(from: { x: number; y: number }, to: { x: number; y: number }): number {
    return Math.hypot(to.x - from.x, to.y - from.y) < this.tokenDiameter() * 1.4 ? 20 : 0.5;
  }

  private hideAimLine() {
    this.aimLineEnds = null;
    this.aimLine?.clear();
  }

  private drawAimLine(time: number) {
    const g = this.aimLine;
    const ends = this.aimLineEnds;
    if (!g || !ends) return;
    g.clear();
    const dx = ends.to.x - ends.from.x;
    const dy = ends.to.y - ends.from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    const dash = 10;
    const period = dash + 8;
    g.lineStyle(3, AIM_LINE_COLOR, 1);
    g.beginPath();
    for (let p = ((time / 20) % period) - period; p < len; p += period) {
      const a = Math.max(p, 0);
      const b = Math.min(p + dash, len);
      if (b <= a) continue;
      g.moveTo(ends.from.x + ux * a, ends.from.y + uy * a);
      g.lineTo(ends.from.x + ux * b, ends.from.y + uy * b);
    }
    g.strokePath();
  }

  update(time: number) {
    if (this.aimLineEnds) this.drawAimLine(time);
  }

  /** Whether seat i's AIM markers ride on another character's token (an aim at the character, no hex). */
  private aimOnToken(chars: CharView[], i: number): boolean {
    const c = chars[i];
    return !!c && c.aim > 0 && c.aimAt >= 0 && c.aimAt !== i && !!chars[c.aimAt];
  }

  /** The AIM points held on seat i's token, by the seats whose markers ride on it, in seat order. */
  private aimersOn(chars: CharView[], i: number): { seat: number; n: number }[] {
    return chars.flatMap((c, q) => (c && this.aimOnToken(chars, q) && c.aimAt === i ? [{ seat: q, n: c.aim }] : []));
  }

  /**
   * Buttons for the option of a gun action, in a column to the right of my
   * token: Cock / Aim / Shoot for Cock/Aim/Shoot; the Shoot card has a
   * single option and goes straight to its target. Aim is always enabled
   * (an aim serves a throw as well as a shot, so an uncocked or jammed gun
   * may aim); with the gun uncocked (as the plan leaves it before this
   * card) Cock is enabled and Shoot disabled, cocked the other way round.
   * A jammed gun cannot be cocked until completely reloaded (13.31).
   */
  private openOptMenu(card: CardNumber, side: CardSide) {
    this.closeOptMenu();
    const chars = this.displayChars();
    const me = this.myIndex >= 0 ? chars[this.myIndex] : null;
    const gun = me ? firingGun(me.guns) : undefined;
    const name = getActionDef({ card, side }).name;
    const center = me ? this.tokenScreenPos(chars, this.myIndex) : { sx: this.board.x + this.board.w / 2, sy: this.board.y + this.board.h / 2 };
    if (name === "Strength") {
      // What the Strength adds to the throw played right after it (20.2).
      const items = [
        { label: `+${STRENGTH_DAMAGE} to the penalties`, enabled: true, pick: () => this.resolveOpt("damage") },
        { label: `+${STRENGTH_WIELD} hexes of range`, enabled: true, pick: () => this.resolveOpt("wield") },
      ];
      this.optMenu = { card, side, objects: this.menuButtons(center.sx + this.tokenDiameter() * 0.8, center.sy, items) };
      return;
    }
    const opts = MENU_OPTIONS[name] ?? [];
    if (opts.length === 1) {
      // A single option (Shoot): straight to the target pick, no menu.
      this.optMenu = { card, side, objects: [] };
      this.resolveOpt(opts[0]);
      return;
    }
    const enabled = (o: ShootOption) => !gun || (o === "cock" ? !gun.cocked && !gun.jammed : o === "shoot" ? gun.cocked : true);
    const labels: Record<ShootOption, string> = { cock: "Cock", uncock: "Uncock", aim: "Aim", shoot: "Shoot", throw: "Throw", nothing: "Do nothing" };
    const items = opts.map((o) => ({ label: labels[o], enabled: enabled(o), pick: () => this.resolveOpt(o) }));
    this.optMenu = { card, side, objects: this.menuButtons(center.sx + this.tokenDiameter() * 0.8, center.sy, items) };
  }

  /** A column of buttons starting at x, centred on y; a disabled one is dimmed and does nothing. */
  private menuButtons(x: number, cy: number, items: { label: string; enabled: boolean; pick: () => void }[]): Phaser.GameObjects.GameObject[] {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const gap = 6;
    const texts = items.map((it) =>
      this.add
        .text(x, 0, it.label, { fontSize: "18px", fontStyle: "bold", color: "#F3E7CE", padding: { x: 14, y: 8 } })
        .setOrigin(0, 0.5)
        .setMask(this.arrMask)
        .setDepth(602),
    );
    const width = Math.max(...texts.map((t) => t.width));
    const total = texts.reduce((h, t) => h + t.height, 0) + gap * (texts.length - 1);
    let y = cy - total / 2;
    items.forEach((it, i) => {
      const text = texts[i];
      y += text.height / 2;
      text.setY(y);
      const box = this.add.rectangle(x, y, width, text.height, 0x8e2f1a, 1).setOrigin(0, 0.5).setStrokeStyle(3, GOLD, 1).setMask(this.arrMask).setDepth(601);
      y += text.height / 2 + gap;
      if (it.enabled) {
        box.setInteractive({ useHandCursor: true });
        box.on("pointerover", () => box.setFillStyle(0xb8442a, 1));
        box.on("pointerout", () => box.setFillStyle(0x8e2f1a, 1));
        box.on("pointerup", () => {
          this.playCues([{ group: "select", delayMs: 0 }]);
          it.pick();
        });
      } else {
        // Dimmed but opaque, so nothing on the board shows through it.
        box.setFillStyle(0x3a1d12, 1).setStrokeStyle(3, 0x6b5a3a, 1);
        text.setColor("#8a7a66");
      }
      objects.push(box, text);
    });
    return objects;
  }

  private closeOptMenu() {
    if (!this.optMenu) return;
    for (const o of this.optMenu.objects) o.destroy();
    this.optMenu = null;
  }

  private resolveOpt(opt: ShootOption | StrengthOption) {
    if (!this.optMenu) return;
    const { card, side } = this.optMenu;
    this.pendingOpts.set(card, opt);
    this.closeOptMenu();
    if (TARGET_OPTIONS.has(opt)) this.enterAimMode(card, side);
    this.updatePreview();
    if (opt === "cock") this.tokens[this.myIndex]?.cockGun(this.tweens);
    this.renderView();
  }

  /**
   * Recomputes where the plan leaves my character and animates the token
   * there; a plan that grows plays the sounds of the step added, and lands
   * an aim added with its line and pulse.
   */
  private updatePreview(withSounds = true) {
    if (this.myIndex < 0 || !this.committed[this.myIndex]) return;
    const me = this.committed[this.myIndex];
    const before = this.preview ?? me;
    const plan = this.currentPlan();
    // The chain's ground: the board's (displayGround) has the planned pick-up lifted off already.
    const seatHexes = this.committed.map((c) => c?.hex ?? "");
    this.preview = replayPlan(me, plan, BOARD_A, this.view?.ground ?? [], seatHexes, this.looseMoves);
    this.refreshTokens(true);
    const encoded = encodePlan(plan);
    const prev = this.previewPlan;
    this.previewPlan = encoded;
    if (!withSounds || encoded.length <= prev.length || !encoded.startsWith(prev)) return;
    this.playCues(soundsForPreview(before, this.preview, (from, to) => BOARD_A.crossesObstacle(from, to)));
    if (aimTaken(before, this.preview)) this.landPlannedAim();
  }

  /** An aim just added to the plan: the dotted line to its target, then the markers pulse, as in the playback. */
  private landPlannedAim() {
    const seat = this.myIndex;
    const chars = this.displayChars();
    const from = this.gunCentre(seat);
    const target = this.aimOnToken(chars, seat) ? this.tokenCentre(chars[seat].aimAt) : this.hexCentre(chars[seat].aimHex);
    this.showAimLine(from, target);
    this.pulseAim(seat);
    this.time.delayedCall(320, () => this.hideAimLine());
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private async sendPlan() {
    if (this.mode !== "select" || this.choiceMode || this.optMenu || this.aimMode || !this.view) return;
    if (this.outOfTime()) return this.renderView();
    const plan = this.currentPlan();
    const problem = this.planProblem(plan);
    if (problem) {
      showToast(this, problem, "error");
      return;
    }
    // An empty plan passes the turn: warn first, unless there is nothing to play.
    if (plan.length === 0 && this.budget() > 0 && Date.now() - this.passWarnedAt > PASS_CONFIRM_MS) {
      this.passWarnedAt = Date.now();
      showToast(this, "No action selected: click Send plan again to pass this turn", "info", PASS_CONFIRM_MS, { key: "pass-warning" });
      return;
    }
    this.passWarnedAt = 0;
    this.mode = "submitting";
    this.renderView();
    try {
      const encoded = encodePlan(plan);
      await this.sendHidden(this.view, encoded);
      if (!this.scene.isActive()) return;
      this.rememberSentPlan(encoded);
      // While the wallet was answering (its result screen stays open until
      // closed), the poll may already have seen the resolved turn and started
      // its playback: leave that alone.
      if (!this.playback) {
        this.clearSelection();
        this.mode = "waiting";
        this.refreshTokens(true);
        this.renderView();
      }
      await this.poller?.pokeNow();
    } catch (e) {
      if (!this.scene.isActive()) return;
      showToast(this, userMessage(e), "error");
      if (!this.playback) {
        this.mode = "select";
        this.renderView();
      }
      void this.poller?.pokeNow();
    }
  }

  private async surrender() {
    await this.act(() => this.chain.realm.surrender(this.gameID), "You surrendered");
  }

  private async claimTimeout() {
    await this.act(() => this.chain.realm.claimTimeout(this.gameID), "Time called");
  }

  /** The realm deletes a cancelled game, so there is nothing left to show: back to the lobby. */
  private async cancelGame() {
    try {
      await this.chain.realm.cancelGame(this.gameID);
    } catch (e) {
      if (this.scene.isActive()) showToast(this, userMessage(e), "error");
      return;
    }
    if (!this.scene.isActive()) return;
    showToast(this, "Showdown cancelled", "info");
    this.scene.start("LobbyScene", { splash: false });
  }

  private async act(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      if (this.scene.isActive()) showToast(this, done, "info");
    } catch (e) {
      if (this.scene.isActive()) showToast(this, userMessage(e), "error");
    }
    await this.poller?.pokeNow();
  }

  // ── Replay of resolved turns ──────────────────────────────────────────────

  /**
   * Shows the given turns from the start of the first one. live is a turn
   * that just resolved: closing it re-syncs the board and moves on.
   */
  private startPlayback(turns: TurnResult[], live: boolean, index = 0) {
    // A turn where nothing happened (nobody's plan in, time called) has nothing to show: say so and move on.
    const only = turns.length === 1 ? turns[0] : null;
    if (live && only && only.events.length === 0) {
      saveSeenTurn(this.revealScope(), this.gameID, this.chain.wallet.address, this.view?.createdAt ?? 0, only.turn);
      this.shownResultTurn = only.turn;
      showToast(this, `Turn ${only.turn} passed: nothing happened`, "info");
      this.applyState(false);
      return;
    }
    this.stopAuto();
    this.clearSelection();
    this.playback = { turns, index, seg: 0, cut: null, anim: 0, live, auto: null };
    // Seen from the moment it starts: leaving for the lobby during or after it does not replay it again.
    if (live) saveSeenTurn(this.revealScope(), this.gameID, this.chain.wallet.address, this.view?.createdAt ?? 0, turns[turns.length - 1].turn);
    this.hideAimZone();
    this.mode = "playback";
    // The tokens stand where the turn began at once (the board may show a
    // later state, opened from the lobby); then the turn start plays as a
    // step, its events (SERIOUS bleeding, an aim lost on the first reveal)
    // animated.
    const first = turns[index].events.findIndex((e) => e.seg === 0);
    this.playback.cut = first >= 0 ? first : null;
    this.refreshTokens(false);
    this.stepTo({ index, seg: 0 }, { stepwise: true });
  }

  /**
   * Shows the whole history of a finished game, from the first turn or the
   * last one; it is not closed. Without any resolved turn the board stays.
   */
  private async showFinalReplay(atLast: boolean, turn?: number) {
    this.finalReplay = true;
    try {
      const turns = await this.chain.realm.getTurns(this.gameID, this.resolvedTurns());
      if (!this.scene.isActive() || turns.length === 0) return;
      const last = turns.length - 1;
      this.shownResultTurn = turns[last].turn;
      if (atLast) saveSeenTurn(this.revealScope(), this.gameID, this.chain.wallet.address, this.view?.createdAt ?? 0, this.shownResultTurn);
      this.startPlayback(turns, false, turn ? turn - 1 : atLast ? last : 0);
    } catch (e) {
      // Let a later poll try again.
      this.finalReplay = false;
      if (this.scene.isActive()) showToast(this, userMessage(e), "error");
    }
  }

  /** The turns resolved so far: every turn up to the last one is kept. */
  private resolvedTurns(): number {
    return this.view?.lastTurn?.turn ?? 0;
  }

  /** Replays the whole showdown so far, from the chain's turns, from the first or from turn. */
  private async openReplay(turn?: number) {
    if (!this.view || this.mode === "playback" || this.mode === "submitting") return;
    const count = this.resolvedTurns();
    if (count === 0) {
      showToast(this, "No turn has been played yet", "info");
      return;
    }
    try {
      const turns = await this.chain.realm.getTurns(this.gameID, count);
      if (!this.scene.isActive() || this.playback) return;
      this.startPlayback(turns, false, turn ? turn - 1 : 0);
    } catch (e) {
      if (this.scene.isActive()) showToast(this, userMessage(e), "error");
    }
  }

  /**
   * Shows a segment of the replay. Moving forward, its steps play one after
   * the other, as they resolved: the shots, each seat's action in seat
   * order, then the end of the segment (penalties, aims lost); otherwise it
   * lands in one go. done runs once the last step has played, unless
   * another position was shown meanwhile.
   */
  private stepTo(pos: ReplayPos | null, opts: { stepwise?: boolean; done?: () => void } = {}) {
    const pb = this.playback;
    if (!pb || !pos) return;
    pb.index = pos.index;
    pb.seg = pos.seg;
    // The replay's address names the turn shown (a live turn's playback keeps the game's).
    if (!pb.live && !this.tutorial) history.replaceState(null, "", routeHash(this.gameID, pb.turns[pos.index].turn));
    const gen = ++pb.anim;
    const same = () => this.playback === pb && pb.anim === gen;
    const all = pb.turns[pos.index].events;
    // Segment 5 ends the turn: its end-of-turn events (passing out, the
    // SERIOUS check) play after it, as a last step.
    const events = pos.seg === SEGMENTS ? [...eventsForSegment(all, pos.seg), ...endOfTurnEvents(all)] : eventsForSegment(all, pos.seg);
    const parts = opts.stepwise && events.length > 0 ? splitSteps(events) : [events];
    this.renderView();
    const play = (k: number) => {
      if (!same()) return;
      // Shown up to this step: the next one's first event and all that follows wait.
      pb.cut = k + 1 < parts.length ? all.indexOf(parts[k + 1][0]) : null;
      const ms = this.animateStep(parts[k], same);
      this.time.delayedCall(ms, () => {
        if (!same()) return;
        if (k + 1 < parts.length) play(k + 1);
        else opts.done?.();
      });
    };
    play(0);
  }

  /**
   * Animates one step of a segment from what the tokens show to the state
   * after it, and returns how long that takes in ms.
   */
  private animateStep(events: TurnEvent[], same: () => boolean): number {
    const after = this.displayChars();
    // DEL badges: one that goes away drifts up and fades first; one that
    // appears or changes pulses once the new state is shown.
    const vanishing = this.tokens.filter((t, i) => t && t.delayShown() > 0 && (after[i]?.delay ?? 0) === 0);
    for (const t of vanishing) t?.fadeBadge(this.tweens, 400);
    // A character hit reacts when its groan or death cry plays (woundDelays):
    // its token, and the guns it drops, wait for that.
    const reacts = woundDelays(events);
    // A thrown weapon shows on the ground once it lands there.
    const landings = throwLandings(events);
    const hold: Hold = {
      seats: reacts,
      ground: new Map([...events.flatMap((e) => (e.kind === "drop_gun" && reacts.has(e.p) ? [[e.n, reacts.get(e.p)!] as const] : [])), ...landings]),
    };
    const settle = () => {
      const before = this.tokens.map((t) => t?.delayShown() ?? 0);
      this.refreshTokens(true, hold);
      const now = this.displayChars();
      now.forEach((c, i) => {
        if (c && !reacts.has(i) && c.delay !== before[i] && c.delay > 0) this.tokens[i]?.pulseBadge(this.tweens);
      });
      // The held seats' DEL badges sound when they change (refreshTokens).
      this.playCues(soundsForDelay(before.map((b, i) => (reacts.has(i) ? (now[i]?.delay ?? b) : b)), now));
      for (const e of events) {
        if (e.kind === "cock") this.tokens[e.p]?.cockGun(this.tweens);
      }
    };
    // An aim lost this step: its marker drifts up and fades before the state moves on.
    const lost = events.filter((e) => e.kind === "lose_aim");
    const fade = lost.length > 0 || vanishing.length > 0 ? 400 : 0;
    for (const e of lost) this.fadeAim(e.p, fade);
    // An aim taken this step gets its line and pulse, unless the same
    // step takes it away again: nothing to land then.
    const aim = events.find((e) => e.kind === "aim" && (after[e.p]?.aim ?? 0) > 0);
    const land = () => {
      if (!same()) return;
      if (!aim) {
        settle();
        return;
      }
      // The dotted line shows where the aim goes, from where the tokens
      // stand; a beat later the markers land there with a zoom pulse while
      // the line is still on, then the line clears.
      // Both ends are fixed up front: the gun may be gone from the token by the
      // end of the step (dropped by a hit), which would jump the line.
      const from = this.gunCentre(aim.p);
      const sprite = aim.target >= 0 ? this.tokens[aim.target]?.sprite : undefined;
      const target = sprite ? { x: sprite.x, y: sprite.y } : aim.target >= 0 ? this.tokenCentre(aim.target) : this.hexCentre(aim.to);
      this.showAimLine(from, target);
      this.time.delayedCall(150, () => {
        if (!same()) return;
        settle();
        this.showAimLine(from, target); // refreshTokens cleared it
        this.pulseAim(aim.p);
      });
      this.time.delayedCall(470, () => {
        if (same()) this.hideAimLine();
      });
    };
    if (fade > 0) this.time.delayedCall(fade, land);
    else land();
    const turn = this.playback?.turns[this.playback.index];
    this.flashShots(events, turn, same);
    this.playSounds(events, turn);
    // SERIOUS wounds bleed where the character stands as their fatigue cards cost endurance.
    const chars = this.displayChars();
    for (const e of events) {
      if (e.kind === "delay" && e.reason === "serious" && e.endurance > 0 && chars[e.p]) this.bloodStains(this.tokenScreenPos(chars, e.p), 2 * e.endurance);
    }
    // The tokens move in 450 ms once settled, the characters hit once they
    // react (woundDelays); the guns going off one after the other
    // (shotDelays), their bullets and bursts need a beat more.
    const lastShot = Math.max(-1, ...shotDelays(events).filter((d): d is number => d !== undefined), ...landings.values());
    const lastReact = Math.max(0, ...reacts.values());
    return fade + (aim ? 150 : 0) + lastReact + STEP_MOVE_MS + (lastShot >= 0 ? lastShot + STEP_SHOT_MS : 0);
  }

  /**
   * A bullet flying from the shooter to the target for each shot of the
   * step, and off in a random direction for each wild shot: a tracer grows
   * from the gun with a bright head, then fades out. Drawn under the tokens
   * like the aim line, a miss above them. The guns go off one after the
   * other, when their sounds play (shotDelays); each bullet is aimed from
   * where the tokens stand as the step begins. same tells whether the
   * replay is still on this step when a delayed gun's turn comes.
   */
  private flashShots(events: TurnEvent[], turn: TurnResult | undefined, same: () => boolean = () => true) {
    const chars = this.displayChars();
    const delays = shotDelays(events);
    const later = (ms: number, fire: () => void) => {
      if (ms > 0) this.time.delayedCall(ms, () => same() && fire());
      else fire();
    };
    events.forEach((e, i) => {
      const at = delays[i] ?? 0;
      if (e.kind === "malfunction" && (e.result === "jams" || e.result === "explodes") && chars[e.p]) {
        // A jam or an explosion: no bullet, the "JAMMED!" or "EXPLODED!"
        // burst pops beside the shooter, off the line towards what it shot at.
        const shot = events.find((x) => x.kind === "shot" && x.p === e.p);
        const at = this.tokenScreenPos(chars, e.p);
        const aimAt = shot ? (shot.target >= 0 && chars[shot.target] ? this.tokenScreenPos(chars, shot.target) : this.hexToScreen(shot.to)) : null;
        const along = aimAt && (aimAt.sx !== at.sx || aimAt.sy !== at.sy) ? { x: aimAt.sx - at.sx, y: aimAt.sy - at.sy } : { x: 1, y: 0 };
        this.popBurst(e.result === "jams" ? "jammed" : "exploded", at, along);
        return;
      }
      if (e.kind === "wild_shot" && chars[e.p]) {
        // A gun going off by itself (a WILD SHOT penalty): the bullet flies
        // off in a direction picked from the turn's seed, past the board's
        // edge, hitting nothing. A gun let go goes off where it lies, as it
        // lands (GUN_FALL_MS).
        const gun = this.gunCentre(e.p);
        const dropped = events.find((x) => x.kind === "drop_gun" && x.reason === "gun_move" && x.p === e.p && x.gunId === e.gunId);
        const angle = (turnPick(turn, e, "wild_shot", 3600) / 3600) * Math.PI * 2;
        later(at, () => {
          const from = (dropped && this.groundGunPos(dropped.n)) || { sx: gun.x, sy: gun.y };
          const to = this.beyondTheBoard(from, { sx: from.sx + Math.cos(angle), sy: from.sy + Math.sin(angle) });
          this.flyTracer(from, to, 20);
          this.puffSmoke(from, { x: Math.cos(angle), y: Math.sin(angle) });
          if (!dropped) this.tokens[e.p]?.kickGun(this.tweens);
          this.cameras.main.shake(120, 0.0025);
        });
        return;
      }
      if (e.kind === "throw" && chars[e.p]) {
        this.flyThrow(e, events, chars, at, later, same);
        return;
      }
      if (e.kind !== "shot" || !chars[e.p]) return;
      // A misfire shows as a missed shot, unless the second card jams or blows
      // up the gun: then no bullet, the jam has its own burst.
      if (delays[i] === undefined) return;
      // The bullet leaves the shooter's gun icon, like the aim line.
      const gun = this.gunCentre(e.p);
      const from = { sx: gun.x, sy: gun.y };
      // The bullet lands somewhere on the target's token, not dead centre;
      // a shot at an empty hex goes for the hex. Shots resolve before the
      // segment's moves (4.4, 7.52): it goes where the token still stands,
      // not where a move of the same segment takes it.
      const atToken = e.target >= 0 && !!chars[e.target];
      const sprite = atToken ? this.tokens[e.target]?.sprite : undefined;
      const centre = sprite ? { sx: sprite.x, sy: sprite.y } : atToken ? this.tokenScreenPos(chars, e.target) : this.hexToScreen(e.to);
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.random() * this.tokenDiameter() * 0.4;
      const hit = e.hit !== "-";
      const near = { sx: centre.sx + Math.cos(angle) * spread, sy: centre.sy + Math.sin(angle) * spread };
      let to = near;
      if (!hit) to = this.beyondTheBoard(from, near); // a miss flies on past the target and off the board
      const length = Math.hypot(to.sx - from.sx, to.sy - from.sy);
      const passing = length > 0 ? Math.hypot(near.sx - from.sx, near.sy - from.sy) / length : 1;
      const along = { x: to.sx - from.sx, y: to.sy - from.sy };
      later(at, () => {
        // A miss flies over the target, so its tracer is drawn above the tokens.
        const flight = this.flyTracer(from, to, hit ? this.lineDepth({ x: from.sx, y: from.sy }, { x: to.sx, y: to.sy }) : 20);
        // The gunshot kicks the gun and shakes the view as the bullet leaves, harder on a hit.
        if (e.reason !== "misfire") this.puffSmoke(from, along);
        this.tokens[e.p]?.kickGun(this.tweens);
        this.cameras.main.shake(hit ? 250 : 120, hit ? 0.006 : 0.0025);
        // The hit location's burst ("VITAL HIT!"...) or "MISSED!" beside the target as the bullet reaches it; a hit bleeds.
        this.time.delayedCall(flight * passing, () => {
          if (!same()) return;
          this.popBurst(hit ? hitBurst(e.hit) : "missed", centre, along);
          if (hit) {
            this.sprayBlood(near, along);
            if (atToken) {
              this.tokens[e.target]?.flinch(this.tweens);
              this.tokens[e.target]?.hurtFlash(this);
            }
          }
        });
      });
    });
  }

  /**
   * A thrown weapon (17.4) hurled spinning straight from the thrower's hand: onto
   * the target on a hit, where it strikes with the hit location's burst and
   * some blood, as a bullet does; past it to the hex where it lands on a
   * miss ("MISSED!" beside the target as it goes by). It lands
   * THROW_FLIGHT_MS after it leaves, when the impact sounds and the gun
   * shows on the ground (throwLandings).
   */
  private flyThrow(e: TurnEvent, events: TurnEvent[], chars: CharView[], at: number, later: (ms: number, fire: () => void) => void, same: () => boolean) {
    const gun = this.gunCentre(e.p);
    const from = { sx: gun.x, sy: gun.y };
    const atToken = e.target >= 0 && !!chars[e.target];
    const sprite = atToken ? this.tokens[e.target]?.sprite : undefined;
    const centre = sprite ? { sx: sprite.x, sy: sprite.y } : atToken ? this.tokenScreenPos(chars, e.target) : this.hexToScreen(e.to);
    const hit = e.hit !== "-";
    const angle = Math.random() * Math.PI * 2;
    const spread = Math.random() * this.tokenDiameter() * 0.3;
    const near = { sx: centre.sx + Math.cos(angle) * spread, sy: centre.sy + Math.sin(angle) * spread };
    const lands = events.find((x) => x.kind === "drop_gun" && x.p === e.p && x.reason === "throw");
    const to = hit || !lands ? near : this.hexToScreen(lands.to);
    const along = { x: centre.sx - from.sx, y: centre.sy - from.sy };
    const key = `gun_${e.gun}`;
    later(at, () => {
      const size = this.tokenDiameter() * GUN_SIZE * 1.3;
      const icon = this.textures.exists(key) ? this.add.image(from.sx, from.sy, key).setDisplaySize(size, size) : this.add.rectangle(from.sx, from.sy, size, size / 2, 0x2a1c14);
      icon.setMask(this.arrMask).setDepth(25);
      const length = Math.hypot(to.sx - from.sx, to.sy - from.sy);
      const flight = { t: 0 };
      const spin = (Math.random() < 0.5 ? -1 : 1) * 720;
      // On a miss the weapon passes the target about when it is nearest to it.
      const passing = hit || length === 0 ? 1 : Math.min(1, Math.hypot(centre.sx - from.sx, centre.sy - from.sy) / length);
      let struck = false;
      this.tweens.add({
        targets: flight,
        t: 1,
        duration: THROW_FLIGHT_MS,
        ease: "Linear",
        onUpdate: () => {
          const t = flight.t;
          icon.setPosition(from.sx + (to.sx - from.sx) * t, from.sy + (to.sy - from.sy) * t);
          icon.setAngle(spin * t);
          if (!struck && t >= passing) {
            struck = true;
            if (!same()) return;
            this.popBurst(hit ? hitBurst(e.hit) : "missed", centre, along);
            if (hit) {
              this.spurtBlood(near, along);
              this.cameras.main.shake(200, 0.005);
              if (atToken) {
                this.tokens[e.target]?.flinch(this.tweens);
                this.tokens[e.target]?.hurtFlash(this);
              }
            }
          }
        },
        onComplete: () => icon.destroy(),
      });
    });
  }

  /**
   * A bullet's tracer growing from from to to with a bright head, then
   * fading out; returns the flight time in ms.
   */
  private flyTracer(from: { sx: number; sy: number }, to: { sx: number; sy: number }, depth: number): number {
    const g = this.add.graphics().setMask(this.arrMask).setDepth(depth);
    const bullet = { t: 0 };
    const draw = () => {
      const x = from.sx + (to.sx - from.sx) * bullet.t;
      const y = from.sy + (to.sy - from.sy) * bullet.t;
      g.clear();
      g.lineStyle(2, SHOT_LINE_COLOR, 1);
      g.beginPath();
      g.moveTo(from.sx, from.sy);
      g.lineTo(x, y);
      g.strokePath();
      g.fillStyle(0xffd860, 1);
      g.fillCircle(x, y, 5);
    };
    const flight = Math.min(175, 15 + Math.hypot(to.sx - from.sx, to.sy - from.sy) / 16);
    this.tweens.add({
      targets: bullet,
      t: 1,
      duration: flight,
      ease: "Linear",
      onUpdate: draw,
      onComplete: () => this.tweens.add({ targets: g, alpha: 0, duration: 600, delay: 150, ease: "Cubic.easeIn", onComplete: () => g.destroy() }),
    });
    return flight;
  }

  /** The segment's sound effects, each a random variant of its group. */
  /** A resolved turn's sounds, their variants picked from its seed. */
  private playSounds(events: TurnEvent[], turn?: TurnResult) {
    this.playCues(soundsForEvents(events), turn);
  }

  private playCues(cues: SoundCue[], turn?: TurnResult) {
    for (const cue of cues) {
      const key = soundKey(cue.group, turnPick(turn, cue.event, cue.group, SOUND_FILES[cue.group].length));
      const play = () => this.sound.play(key, { volume: SOUND_VOLUME[cue.group] });
      if (cue.delayMs > 0) this.time.delayedCall(cue.delayMs, play);
      else play();
    }
  }

  private stepPlayback(delta: 1 | -1) {
    const pb = this.playback;
    if (!pb) return;
    this.stopAuto(); // a manual step pauses the auto play
    const pos = { index: pb.index, seg: pb.seg };
    const to = delta > 0 ? stepForward(pos, pb.turns.length) : stepBack(pos);
    if (to) this.stepTo(to, { stepwise: delta > 0 });
    else this.renderView();
  }

  private jumpTurn(delta: 1 | -1) {
    const pb = this.playback;
    if (!pb) return;
    const index = Phaser.Math.Clamp(pb.index + delta, 0, pb.turns.length - 1);
    if (index === pb.index) return;
    this.stopAuto();
    this.stepTo({ index, seg: 0 });
  }

  private toggleAuto() {
    const pb = this.playback;
    if (!pb) return;
    if (pb.auto) {
      this.stopAuto();
    } else {
      pb.auto = this.time.delayedCall(AUTO_GAP_MS, () => this.autoStep(pb));
    }
    this.renderView();
  }

  /** Auto play: the next segment, then a pause once all its steps have played. */
  private autoStep(pb: NonNullable<GameScene["playback"]>) {
    if (this.playback !== pb || !pb.auto) return;
    const timer = pb.auto;
    const next = stepForward({ index: pb.index, seg: pb.seg }, pb.turns.length);
    if (!next) {
      this.stopAuto();
      this.renderView();
      return;
    }
    this.stepTo(next, {
      stepwise: true,
      done: () => {
        if (this.playback === pb && pb.auto === timer) pb.auto = this.time.delayedCall(AUTO_GAP_MS, () => this.autoStep(pb));
      },
    });
  }

  private stopAuto() {
    if (this.playback?.auto) {
      this.playback.auto.remove();
      this.playback.auto = null;
    }
  }

  // ── Hidden plans ──────────────────────────────────────────────────────────

  /** Where this browser keeps its pending reveals: game ids restart on each chain and realm. */
  private revealScope(): RevealScope {
    return { chainId: this.chain.config.chainId, realmPath: this.chain.config.realmPath };
  }

  /** Auto-sign is on: reveals and openings go out by themselves, else they wait for a click (an Adena popup each). */
  private autoSign(): boolean {
    return this.chain.wallet.state.kind === "active";
  }

  /**
   * Sends my plan for the turn: in clear when every other character in the
   * fight committed (theirs are fixed by their hashes), else as a commit,
   * its salt and plan kept in this browser for the reveal and timelocked
   * (offline) to the turn's drand round for anyone to open if I vanish.
   */
  private async sendHidden(view: GameView, plan: string) {
    const turn = view.turn;
    const seat = this.myIndex;
    if (lastToCommit(view, seat)) {
      await this.chain.realm.reveal(this.gameID, turn, seat, newSalt(), plan);
      return;
    }
    const sealed: Sealed = { salt: newSalt(), plan };
    const locked = await lockSealed(view.lockRound, sealed);
    savePending(this.revealScope(), this.gameID, turn, seat, sealed);
    await this.chain.realm.commit(this.gameID, turn, planHash(this.gameID, turn, seat, sealed.salt, sealed.plan), locked);
  }

  /** My committed plan, held by this browser, waits for its reveal (auto-sign off: a click). */
  private ownRevealWaits(): boolean {
    const view = this.view;
    if (!view || this.myIndex < 0 || !ownRevealDue(view, this.myIndex)) return false;
    return !!loadPending(this.revealScope(), this.gameID, view.turn, this.myIndex);
  }

  /**
   * The timelocked plans to open now: their drand round is out and nobody
   * revealed them. Tried ones are tried again until the reveals' grace is
   * over (drand may have been out of reach), then left to the claim.
   */
  private toOpen(): number[] {
    const view = this.view;
    if (!view) return [];
    const now = Date.now() / 1000;
    const seats = openableSeats(view, now);
    if (!pastTimeout(view.revealUntil, now)) return seats;
    const tried = this.openTried.turn === view.turn ? this.openTried.seats : new Set<number>();
    return seats.filter((s) => !tried.has(s));
  }

  private openWaits(): boolean {
    return this.toOpen().length > 0;
  }

  /** On every poll: with auto-sign on, sends my due reveal, then opens the plans left unrevealed past their round. */
  private revealDue() {
    const view = this.view;
    if (!view || this.revealing || this.myIndex < 0 || !this.autoSign()) return;
    if (view.phase === "planning" || view.phase === "revealing") prunePending(this.revealScope(), this.gameID, view.turn);
    const now = Date.now();
    if (this.ownRevealWaits() && now - this.revealFailedAt.own > REVEAL_RETRY_MS) void this.revealOwn();
    else if (this.openWaits() && now >= this.openRetryAt) void this.openPlans();
  }

  /** Reveals my committed plan from this browser's copy, with any timelocked plan already open. */
  private async revealOwn() {
    const view = this.view;
    if (!view || this.revealing || !this.ownRevealWaits()) return;
    const sealed = loadPending(this.revealScope(), this.gameID, view.turn, this.myIndex)!;
    this.revealing = true;
    this.renderView();
    try {
      await this.chain.realm.reveal(this.gameID, view.turn, this.myIndex, sealed.salt, sealed.plan);
    } catch (e) {
      this.revealFailedAt.own = Date.now();
      if (this.scene.isActive()) showToast(this, userMessage(e), "error");
    } finally {
      this.revealing = false;
    }
    await this.poller?.pokeNow();
  }

  /**
   * Opens every timelocked plan left unrevealed past its drand round, and
   * reveals them in one transaction, mine too if it is still pending: one
   * round opens them all. A plan that does not open is left out, and the
   * realm skips one that does not match its commit: once the reveals'
   * grace is over, the claim passes that seat's turn (a missed one).
   */
  private async openPlans() {
    const view = this.view;
    if (!view || this.revealing) return;
    const seats = this.toOpen();
    if (seats.length === 0) return;
    if (this.openTried.turn !== view.turn) this.openTried = { turn: view.turn, seats: new Set() };
    for (const seat of seats) this.openTried.seats.add(seat);
    this.revealing = true;
    this.renderView();
    try {
      const pending = this.myIndex >= 0 && ownRevealDue(view, this.myIndex) ? loadPending(this.revealScope(), this.gameID, view.turn, this.myIndex) : null;
      const revealed = await openAndReveal(this.chain.realm, view, seats, pending ? { seat: this.myIndex, ...pending } : null);
      if (revealed.length === 0) {
        // drand's round is not served yet (or the copies are broken): try
        // again shortly, quietly, until the reveals' grace is over.
        this.openRetryAt = Date.now() + OPEN_RETRY_MS;
        if (this.scene.isActive() && pastTimeout(view.revealUntil, Date.now() / 1000)) showToast(this, "No timelocked plan could be opened", "error");
        return;
      }
      if (this.scene.isActive()) {
        const names = revealed.filter((seat) => seat !== this.myIndex).map((seat) => charName(view.players[seat].char));
        if (names.length) showToast(this, `${names.join(", ")}: plan opened at the deadline`, "info");
      }
    } catch (e) {
      this.openRetryAt = Date.now() + REVEAL_RETRY_MS;
      if (this.scene.isActive()) showToast(this, userMessage(e), "error");
    } finally {
      this.revealing = false;
    }
    await this.poller?.pokeNow();
  }

  /** The plan panel while the plans are revealed: mine, and what the turn waits for. */
  private revealPanel(lines: NonNullable<ShowdownModel["plan"]>["lines"], sent: string | null, passed: boolean, due: boolean, replay: { id: string; label: string; tone: "plain"; disabled: boolean }): ShowdownModel["plan"] {
    const view = this.view!;
    const pending = this.pendingNames();
    const own = this.ownRevealWaits();
    const open = this.openWaits();
    const auto = this.autoSign();
    const lockAt = view.lockRound ? roundTime(view.lockRound) + DRAND_MARGIN : 0;
    const left = (t: number) => formatLeft(Math.max(0, t + CHAIN_CLOCK_MARGIN - Date.now() / 1000));
    let note: string;
    if (due && !open) note = `${pending}: no plan came in, nor opened from its timelocked copy. Calling time passes it for them, a missed turn (out of the fight at ${MAX_MISSED} in a row).`;
    else if (this.revealing) note = "Revealing…";
    else if (own) note = auto ? "Revealing your plan…" : "Every plan is committed: reveal yours (one Adena signature).";
    else if (open) note = auto ? "Opening the plans left unrevealed…" : "Some plans were not revealed: their timelocked copies can be opened now.";
    else if (lockAt) note = `Waiting for ${pending} to reveal. Their timelocked plans open in ${left(lockAt)}; time can be called in ${left(view.revealUntil)}.`;
    else note = `Waiting for ${pending} to reveal.`;
    return {
      title: "Your plan",
      points: "revealing",
      lines,
      empty: passed ? `Too much delay to act this turn: you pass.` : sent === "" ? "You pass this turn." : "Your plan is in.",
      note,
      warn: (due && !open) || ((own || open) && !auto),
      buttons: [
        ...(own && !auto ? [{ id: "reveal", label: "REVEAL", tone: "primary" as const, disabled: this.revealing }] : []),
        ...(open && !auto ? [{ id: "open", label: "OPEN THE PLANS", tone: "primary" as const, disabled: this.revealing }] : []),
        ...(due && !open ? [{ id: "claim", label: "CALL TIME", tone: "primary" as const }] : []),
        replay,
      ],
    };
  }

  private rememberSentPlan(plan: string) {
    this.sentPlan = { turn: this.view?.turn ?? 0, plan };
  }

  /** The plan sent for the current turn, or null while it is not known yet. */
  private sentPlanString(): string | null {
    const sent = this.sentPlan;
    return sent && sent.turn === this.view?.turn ? sent.plan : null;
  }

  /**
   * My plan for the turn in progress, when the chain says I sent one this
   * session does not know: from this browser's pending reveal, else from
   * the chain once it is revealed.
   */
  private async loadSentPlan() {
    const view = this.view;
    if (!view || this.myIndex < 0 || !view.players[this.myIndex]?.committed || this.sentPlan?.turn === view.turn) return;
    const turn = view.turn;
    const pending = loadPending(this.revealScope(), this.gameID, turn, this.myIndex);
    if (pending) {
      this.sentPlan = { turn, plan: pending.plan };
      return;
    }
    if (!view.players[this.myIndex].revealed) return;
    const game = this.gameID;
    const seat = this.myIndex;
    try {
      const p = await this.chain.realm.getPlan(game, this.chain.wallet.address);
      // Still this game, turn and seat: the screen may have been left and opened again meanwhile.
      if (!this.scene.isActive() || !p.revealed || p.turn !== turn || this.view?.turn !== turn || this.gameID !== game || this.myIndex !== seat || p.seat !== seat) return;
      this.sentPlan = { turn, plan: p.plan };
      if (this.mode === "waiting") this.renderView();
    } catch {
      // the status stays plain text
    }
  }

  /** The lines of the resolution log for the segment shown: the plans and turn-start events at segment 0, else the segment's events. */
  private logLines(): string[] {
    const pb = this.playback;
    if (!pb) return [];
    const t = pb.turns[pb.index];
    const names = this.view?.players.map((p) => charName(p.char)) ?? [];
    if (pb.seg === 0) {
      // Each plan in words, as the "Plan sent" popup words it: the player,
      // then one indented line per action.
      const lines = t.plans.flatMap((p, i) => {
        const who = names[i] ?? `seat ${i}`;
        if (!p) return [`${who} passes.`];
        try {
          return [`${who}:`, ...decodePlan(p).map((e, k) => `    ${k + 1}. ${describePlanEntry(e, names)}`)];
        } catch {
          return [`${who}: ${p}`];
        }
      });
      lines.push(...describeEvents(eventsForSegment(t.events, 0), names));
      return lines;
    }
    let lines = describeEvents(eventsForSegment(t.events, pb.seg), names);
    if (pb.seg === SEGMENTS) lines.push(...describeEvents(endOfTurnEvents(t.events), names));
    if (lines.length === 0) lines = ["Nothing happens."];
    if (pb.seg === SEGMENTS && t.cards?.length) lines.push(`Result cards drawn: ${t.cards.join(", ")}`);
    // The showdown ends after the last turn: the recap of its victory points closes the log.
    if (this.finalReplay && pb.seg === SEGMENTS && pb.index === pb.turns.length - 1 && this.view) {
      lines.push(...vpRecap(this.view.awards, this.view.vp, names));
    }
    return lines;
  }

  /** Leaves the replay: a live turn is marked as shown, then the board re-syncs. */
  private finishPlayback() {
    const pb = this.playback;
    if (!pb) return;
    this.stopAuto();
    if (pb.live) this.shownResultTurn = pb.turns[pb.turns.length - 1].turn;
    // The end of turn halves the delay: the re-synced board shows it.
    const delays = this.displayChars().map((c) => c?.delay ?? 0);
    this.playback = null;
    if (!this.tutorial) history.replaceState(null, "", routeHash(this.gameID));
    const view = this.view;
    // A turn resolved while the history was open: show it live now.
    if (!pb.live && view?.lastTurn && view.lastTurn.turn !== this.shownResultTurn) {
      this.startPlayback([view.lastTurn], true);
      return;
    }
    this.applyState(false);
    if (pb.live) this.playCues(soundsForDelay(delays, this.displayChars()));
  }

  // ── Input (zoom, pan) ─────────────────────────────────────────────────────

  private setupInput() {
    this.input.on("wheel", (pointer: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (!this.inBoard(pointer.x, pointer.y)) return;
      const dir = dy > 0 ? -1 : 1;
      const oldZoom = this.zoom;
      this.zoom = Phaser.Math.Clamp(this.zoom * (1 + dir * ZOOM_FACTOR), MIN_ZOOM, MAX_ZOOM);
      const factor = this.zoom / oldZoom;
      const cx = this.board.x + this.board.w / 2;
      const cy = this.board.y + this.board.h / 2;
      if (this.zoom <= MIN_ZOOM) {
        this.panX = 0;
        this.panY = 0;
      } else {
        this.panX = (pointer.x - cx - this.panX) * (1 - factor) + this.panX;
        this.panY = (pointer.y - cy - this.panY) * (1 - factor) + this.panY;
      }
      this.refreshView();
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.updateStackHover(pointer);
      if (this.zoom > MIN_ZOOM && pointer.isDown && this.inBoard(pointer.x, pointer.y)) {
        const dx = pointer.x - this.dragStartX;
        const dy = pointer.y - this.dragStartY;
        if (!this.isDragging && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) this.isDragging = true;
        if (this.isDragging) {
          this.panX = this.panStartX + dx;
          this.panY = this.panStartY + dy;
          this.refreshView();
        }
      }
    });
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.inBoard(pointer.x, pointer.y)) {
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
        this.panStartX = this.panX;
        this.panStartY = this.panY;
        this.isDragging = false;
      }
    });
    this.input.on("pointerup", () => {
      this.isDragging = false;
    });
    this.input.on("gameout", () => this.setSpreadHex(null));
  }
}

const DIR_NAMES = ["N", "NE", "SE", "S", "SW", "NW"];

/** The tag printed on a card side's half in the hand. */
const CATEGORY_TAGS: Record<string, string> = { foot: "FOOT", hand: "GUN", attack: "BRAWL", defense: "BRAWL", strength: "STRENGTH" };

const LOCATION_NAMES: Record<string, string> = { holstered: "holstered", gun_hand: "gun hand", other_hand: "other hand", both_hands: "both hands" };

/** Where a gun is and its state, for the character panels: "gun hand · cocked". */
function gunState(g: GunView): string {
  const where = LOCATION_NAMES[g.location] ?? g.location;
  if (g.exploded) return `${where} · exploded`;
  if (g.jammed) return `${where} · jammed`;
  return g.location === "holstered" ? where : `${where} · ${g.cocked ? "cocked" : "uncocked"}`;
}

/** What an entry of the plan does, beside its name in the plan panel ("" when the name says it all). */
function planDetail(e: PlanEntry, names: string[]): string {
  const def = getActionDef(e);
  const target = e.target !== undefined ? (names[e.target] ?? `seat ${e.target}`) : (e.hex ?? "");
  if (def.name === "Draw & Cock") {
    if (e.groundGun === undefined && e.gun === undefined) return "pick the gun…";
    return e.groundGun !== undefined ? `from the ground to the ${HAND_NAMES[e.hand ?? 0]}` : `gun ${e.gun} to the ${HAND_NAMES[e.hand ?? 0]}`;
  }
  if (def.name === "Strength") return e.opt === "wield" ? `+${STRENGTH_WIELD} range to the throw` : e.opt ? `+${STRENGTH_DAMAGE} to the throw's penalties` : "choose…";
  if (e.opt && TARGET_OPTIONS.has(e.opt)) return target ? `${e.opt} at ${target}` : `${e.opt} at…`;
  if (e.opt === "nothing") return "do nothing";
  if (e.opt) return `${e.opt} the gun`;
  if (def.choiceType !== "none" && def.choiceType !== "gun" && !e.dir && !isShooting(e)) return "choose…";
  if (isShooting(e)) return "choose…";
  return e.dir ? e.dir.replace(/_/g, " ") : "";
}

/** An action's name in a replay timeline cell: the gun option for Cock/Aim/Shoot and Shoot. */
function shortAction(e: PlanEntry | undefined): string {
  if (!e) return "";
  const def = getActionDef(e);
  if (isShooting(e)) return e.opt === "nothing" ? "Nothing" : e.opt ? e.opt.charAt(0).toUpperCase() + e.opt.slice(1) : def.name;
  if (def.name === "Draw & Cock") return "Draw";
  if (def.name === "Strength") return e.opt === "wield" ? `+${STRENGTH_WIELD} range` : `+${STRENGTH_DAMAGE} dmg`;
  return def.name;
}

/** One plan entry in words, for the replay log of the plans. */
function describePlanEntry(e: PlanEntry, names: string[]): string {
  const def = getActionDef(e);
  const target = e.target !== undefined ? (names[e.target] ?? `seat ${e.target}`) : e.hex ?? "";
  switch (def.name) {
    case "Draw & Cock":
      return e.groundGun !== undefined ? `Draw & Cock: pick up the gun from the ground into the ${HAND_NAMES[e.hand ?? 0]}` : `Draw & Cock: gun ${e.gun ?? "?"} to the ${HAND_NAMES[e.hand ?? 0]}`;
    case "Cock/Aim/Shoot":
      if (e.opt === "aim") return `Cock/Aim/Shoot: aim at ${target}`;
      if (e.opt === "shoot") return `Cock/Aim/Shoot: shoot at ${target}`;
      return `Cock/Aim/Shoot: ${e.opt ?? "?"} the gun`;
    case "Shoot":
      return e.opt === "shoot" ? `Shoot at ${target}` : "Shoot: do nothing";
    case "Throw":
      return e.opt === "throw" ? `Throw the gun at ${target}` : "Throw: do nothing";
    case "Strength":
      return e.opt === "wield" ? `Strength: +${STRENGTH_WIELD} to the throw's range` : `Strength: +${STRENGTH_DAMAGE} to the throw's penalties`;
    default:
      return e.dir ? `${def.name} ${e.dir.replace(/_/g, " ")}` : def.name;
  }
}

const HAND_NAMES = ["gun hand", "other hand", "both hands"];

function choicePrompt(ct: ChoiceType): string {
  switch (ct) {
    case "move_ahead":
      return "click a highlighted hex to move to";
    case "move_back":
      return "click a highlighted hex to back up to";
    case "turn_ahead":
    case "turn_back":
      return "click a highlighted hex to face toward";
    default:
      return "choose a target";
  }
}
