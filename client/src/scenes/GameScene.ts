import Phaser from "phaser";
import type { CardNumber, CardSide, ChoiceType, RelativeDirection } from "../rules";
import { AHEAD_DIRS, BACK_DIRS, dirIndexToAngle, getActionCardAsset, getActionDef, relativeToAbsoluteDir, CHAR_ARROW_DIR } from "../rules";
import { BOARD_A } from "../board/boardA";
import { getChain, type Chain } from "../chain";
import { subscribeAccountChanged, subscribeNetworkChanged } from "../chain/adena";
import { userMessage } from "../chain/errors";
import { GamePoller } from "../chain/poller";
import { seatOf, shortAddr, type GameView, type TurnResult, type PlayerStatus, type TurnEvent, type GunView, type GroundGunView } from "../chain/types";
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
import { MAX_ACTION_POINTS, canPlay, drawDestinations, drawableGuns, encodePlan, planCost, validatePlan, type PlanEntry, isEnabled, decodePlan } from "../game/plan";
import { firingGun, gunInHand, replayPlan, type CharView } from "../game/replay";
import { SEGMENTS, segmentFills, turnSegmentCells } from "../game/segments";
import { COCK_AIM_SHOOT_AIM_TIME, SHOOT_AIM_TIME, shotOdds } from "../game/shotOdds";
import { SOUND_FILES, SOUND_VOLUME, soundKey, soundsForDelay, soundsForEvents, soundsForPreview, type SoundCue, type SoundGroup } from "../game/sounds";
import { SHOOT_OPTIONS, isShooting, type ShootOption } from "../game/plan";
import { closeCharacterSheet, openCharacterSheet, type GunPick } from "../ui/characterSheet";
import { ShowdownView, showdownLayout, type BoardRect, type CharPanel, type HandSide, type ShowdownLayout, type ShowdownModel, type TimelineRow } from "../ui/showdownView";
import { showToast } from "../ui/toast";
import { charName } from "../game/lobby";

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

type Mode = "sync" | "select" | "submitting" | "waiting" | "playback" | "ended" | "spectate";


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
/** How long a second click on Send plan confirms passing with an empty plan. */
const PASS_CONFIRM_MS = 5000;
/** The tracer a bullet leaves behind it. */
const SHOT_LINE_COLOR = 0xffffff;

const STACK_REST = 0.12;
const STACK_SPREAD = 0.42;
const STACK_MS = 180;

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
const MENU_OPTIONS: Record<string, ShootOption[]> = { "Cock/Aim/Shoot": ["cock", "aim", "shoot"], Shoot: ["shoot"] };

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
  /** The opponent's AIM marker when it follows this token, at the corner mirroring the gun icon. */
  private aim: Phaser.GameObjects.Image | null = null;
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
  /** Hover handlers for the gun icon and the AIM marker, set by the scene. */
  onGunHover: ((over: boolean) => void) | null = null;
  onAimHover: ((over: boolean) => void) | null = null;

  /**
   * Each token owns a band of 5 depths (ring, sprite, DOWN overlay, gun, DEL
   * badge), later seats above earlier ones, so stacked tokens layer as units
   * and a hidden token's badge never shows over the token covering it.
   */
  constructor(
    readonly charKey: string,
    readonly sprite: Phaser.GameObjects.Image,
    readonly highlight: Phaser.GameObjects.Arc,
    private readonly depth: number,
  ) {
    highlight.setDepth(depth);
    sprite.setDepth(depth + 1);
    this.baseScale = sprite.scaleX;
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
    this.overlay?.setScale(this.sprite.scaleX);
    const d = this.sprite.displayWidth;
    this.badge?.setDisplaySize(d * 0.42, d * 0.42);
    this.aim?.setDisplaySize(d * AIM_SIZE, d * AIM_SIZE);
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
    if (this.badge) list.push(this.badge);
    if (this.gun) list.push(this.gun);
    if (this.shells) list.push(this.shells);
    if (this.aim) list.push(this.aim);
    if (this.bar) list.push(this.bar.bg, this.bar.fill);
    return list;
  }

  killTweens(tweens: Phaser.Tweens.TweenManager) {
    for (const p of this.parts) tweens.killTweensOf(p);
    this.posTweens = [];
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
    if (this.aim) {
      const a = Phaser.Math.DegToRad(this.aimAngle());
      const r = this.sprite.displayWidth * GUN_RADIUS;
      this.aim.setPosition(x + Math.cos(a) * r, y + Math.sin(a) * r);
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
   * toward the figure's head.
   */
  private aimAngle(): number {
    return this.arrowAngle() + (CHAR_ARROW_DIR[this.charKey] === 5 ? 135 : -135);
  }

  /** Screen angle of the bottom corner below the gun corner in the upright frame: 45° from the arrow toward the feet. */
  private badgeAngle(): number {
    return this.arrowAngle() + (CHAR_ARROW_DIR[this.charKey] === 5 ? -45 : 45);
  }

  /** Shows the AIM marker of the points the opponent holds on this character (none for 0). */
  setTargetAim(scene: Phaser.Scene, n: number, mask: Phaser.Display.Masks.GeometryMask) {
    const key = aimMarkerKey(n);
    if (n <= 0 || !scene.textures.exists(key)) {
      this.aim?.destroy();
      this.aim = null;
      return;
    }
    const size = this.sprite.displayWidth * AIM_SIZE;
    if (!this.aim) {
      this.aim = scene.add.image(this.sprite.x, this.sprite.y, key).setOrigin(0.5).setMask(mask).setDepth(this.depth + 4).setInteractive();
      this.aim.on("pointerover", () => this.onAimHover?.(true));
      this.aim.on("pointerout", () => this.onAimHover?.(false));
    } else if (this.aim.texture.key !== key) {
      this.aim.setTexture(key);
    }
    this.aim.setDisplaySize(size, size).setAlpha(1); // undo a fade-out if the aim came back
    this.follow();
  }

  /** Drifts the AIM marker up and fades it away, when the aim is lost. */
  fadeAim(tweens: Phaser.Tweens.TweenManager, duration: number) {
    if (!this.aim) return;
    tweens.add({ targets: this.aim, y: this.aim.y - this.sprite.displayWidth * 0.5, alpha: 0, duration, ease: "Cubic.easeIn" });
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

  /** Zooms the AIM marker in and out once, when the aim grows. */
  pulseAim(tweens: Phaser.Tweens.TweenManager) {
    if (!this.aim) return;
    const { scaleX, scaleY } = this.aim;
    tweens.add({ targets: this.aim, scaleX: scaleX * 1.35, scaleY: scaleY * 1.35, duration: 170, yoyo: true, ease: "Quad.easeOut" });
  }

  /** Greys out a character that is out of the fight. */
  setStatus(status: PlayerStatus) {
    const out = status !== "alive";
    this.sprite.setAlpha(out ? 0.75 : 1);
    this.baseTint = out ? 0x808080 : 0xffffff;
    this.applyBaseTint();
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
}

/**
 * The game board: renders the state the realm holds, lets the player build a
 * plan with a live preview, submits it through Adena, and replays the
 * resolution log segment by segment when a turn resolves.
 */
export class GameScene extends Phaser.Scene {
  private gameID = "";
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
  private pendingOpts: Map<number, ShootOption> = new Map();
  /** The option buttons shown while a gun action waits for its option. */
  private optMenu: { card: CardNumber; side: CardSide; objects: Phaser.GameObjects.GameObject[] } | null = null;
  /** The target picked for each aim (a hex, or the seat of a character standing on the clicked hex); the pick overlays while one is pending. */
  private pendingAims: Map<number, { hex?: string; target?: number }> = new Map();
  private aimMode: { card: CardNumber; side: CardSide; objects: Phaser.GameObjects.GameObject[] } | null = null;
  /** The AIM markers on hexes, by the seat holding the aim. */
  private aimMarkers: Map<number, Phaser.GameObjects.Image> = new Map();
  /** The guns lying in hexes, as drawn (index = position in displayGround()). */
  private groundIcons: { img: Phaser.GameObjects.Image; dots: Phaser.GameObjects.Graphics }[] = [];
  /** The animated dotted line shown while hovering an AIM marker or an aiming gun, with its ends. */
  private aimLine: Phaser.GameObjects.Graphics | null = null;
  private aimLineEnds: { from: { x: number; y: number }; to: { x: number; y: number } } | null = null;
  private preview: CharView | null = null;
  /** The encoded plan the preview was last computed for. */
  private previewPlan = "";
  private choiceMode: {
    card: CardNumber;
    side: CardSide;
    choiceType: ChoiceType;
    options: { rel: RelativeDirection; hex: string | null; x: number; y: number }[];
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
  /** The plan sent this turn, shown while waiting: known from sending it, else read back from the chain. */
  private sentPlan: { turn: number; plan: string } | null = null;

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
  /** The screen around the board: header, side columns, hand or replay controls (an HTML overlay). */
  private showdown: ShowdownView | null = null;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { gameID: string }) {
    this.gameID = data.gameID;
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
    for (const key of ["missed", "hit", "jammed", "exploded"]) {
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
    this.chain = getChain();
    this.showdown = new ShowdownView({
      button: (id) => this.onButton(id),
      card: (card, side) => {
        if (this.mode === "select") this.toggleCard(card as CardNumber, side);
      },
      sheet: (seat) => this.openSheet(seat),
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

    this.poller = new GamePoller(
      this.chain.realm,
      this.gameID,
      (v) => void this.onGame(v),
      (e) => this.onPollError(e),
      this.chain.config.pollMs,
    );
    this.poller.start();

    const leave = (why: string) => {
      if (!this.scene.isActive()) return;
      showToast(this, why, "info");
      this.scene.start("LobbyScene", { splash: false });
    };
    this.unsubscribe.push(
      subscribeAccountChanged(() => leave("Account changed")),
      subscribeNetworkChanged(() => leave("Network changed")),
    );

    this.events.once("shutdown", () => {
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
    this.myIndex = seatOf(view, this.chain.wallet.address);
    await this.ensureTextures(view);
    if (!this.scene.isActive()) return;

    if (first) {
      this.shownResultTurn = view.lastTurn?.turn ?? 0;
      this.applyState(true);
      if (view.phase === "finished") void this.showFinalReplay(false);
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
    if (view.lastTurn && view.lastTurn.turn !== this.shownResultTurn && this.committed.length === 2 && !this.playback) {
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

  private ensureTextures(view: GameView): Promise<void> {
    const missing = view.players.map((p) => p.char).filter((c) => c && !this.textures.exists(`char_${c}`));
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
    const turnChanged = view.turn !== this.renderedTurn;
    this.committed = view.players.map((p) => ({
      hex: p.hex, facing: p.facing, down: p.down, delay: p.delay, status: p.status,
      aim: p.aim, aimHex: p.aimHex, endurance: p.endurance, serious: p.serious, gunArm: p.gunArm, otherArm: p.otherArm, leg: p.leg,
      guns: p.guns.map((g) => ({ ...g })),
    }));
    this.renderedTurn = view.turn;
    this.shownResultTurn = view.lastTurn?.turn ?? 0;

    if (reset || turnChanged || this.mode === "waiting" || this.mode === "playback") {
      this.clearSelection();
    }
    const me = this.myIndex >= 0 ? view.players[this.myIndex] : null;
    if (view.phase === "finished") this.mode = "ended";
    else if (!me) this.mode = "spectate";
    else if (view.phase === "waiting") this.mode = "waiting";
    else if (me.submitted) this.mode = "waiting";
    else if (this.mode !== "submitting") this.mode = "select";
    if (this.mode !== "select") this.clearSelection();

    this.buildTokens();
    this.refreshTokens(!reset);
    this.renderView();
    if (this.mode === "waiting" && view.phase === "planning") void this.loadSentPlan();
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private buildAll() {
    this.children.removeAll(true);
    this.tokens = [];
    this.choiceOverlays = [];
    // Everything above was destroyed with the children: drop the stale handles
    // (a destroyed Graphics would silently swallow the aim line).
    this.aimLine = null;
    this.aimLineEnds = null;
    this.aimMarkers = new Map();
    this.groundIcons = [];
    if (this.optMenu) this.optMenu.objects = [];
    if (this.aimMode) this.aimMode.objects = [];

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
    this.renderView();
    if (this.choiceMode) this.showChoiceOverlays();
    if (this.optMenu) this.openOptMenu(this.optMenu.card, this.optMenu.side);
    if (this.aimMode) this.enterAimMode(this.aimMode.card, this.aimMode.side);
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
      // A pick-up planned this turn lifts the gun off the ground in the preview.
      const picked = new Set(this.preview ? this.currentPlan().map((e) => e.groundGun) : []);
      return (view.ground ?? []).filter((g) => !picked.has(g.id));
    }
    const t = pb.turns[pb.index];
    const ground = this.groundBefore();
    snapshotAfterSegment(startOfTurn(t, this.committed), t.events, pb.seg, ground, pb.cut ?? undefined);
    return ground;
  }

  /** The guns lying in hexes when the replayed turn began (a fresh copy). */
  private groundBefore(): GroundGunView[] {
    const pb = this.playback;
    const view = this.view;
    if (!pb || !view) return [];
    const t = pb.turns[pb.index];
    let base: GroundGunView[];
    if (pb.live) {
      // The chain's ground, minus what this turn dropped, plus what it picked up.
      base = (view.ground ?? []).filter((g) => !t.events.some((e) => e.kind === "drop_gun" && e.n === g.id));
      for (const e of t.events) {
        if (e.kind !== "draw" || e.from !== "ground") continue;
        const owner = view.players[e.p]?.guns.find((x) => x.id === e.gunId);
        if (owner) base.push({ id: e.n, hex: t.start[e.p]?.hex ?? "", guns: [{ ...owner, location: "holstered", cocked: false }] });
      }
    } else {
      base = [];
      for (let i = 0; i < pb.index; i++) {
        const prev = pb.turns[i];
        snapshotAfterSegment(startOfTurn(prev, this.committed), prev.events, SEGMENTS, base);
      }
    }
    return base.map((g) => ({ id: g.id, hex: g.hex, guns: g.guns.map((x) => ({ ...x })) }));
  }

  /** The characters as they should be drawn right now. */
  private displayChars(): CharView[] {
    if (this.playback) {
      const t = this.playback.turns[this.playback.index];
      return snapshotAfterSegment(startOfTurn(t, this.committed), t.events, this.playback.seg, this.groundBefore(), this.playback.cut ?? undefined);
    }
    return this.committed.map((c, i) => (i === this.myIndex && this.preview ? this.preview : c));
  }

  private buildTokens() {
    for (const t of this.tokens) {
      if (t) {
        t.killTweens(this.tweens);
        t.sprite.destroy();
        t.highlight.destroy();
        t.setOverlay(this, null, this.arrMask);
        t.setDelay(this, 0, this.arrMask);
        t.setGun(this, null, this.arrMask);
        t.setEndurance(this, MAX_ENDURANCE, this.arrMask);
        t.setTargetAim(this, 0, this.arrMask);
      }
    }
    this.tokens = [];
    const view = this.view;
    if (!view) return;
    const { scale } = this.displayTransform();
    const tokenScale = scale * TOKEN_SCALE_FACTOR;
    const chars = this.displayChars();
    view.players.forEach((p, i) => {
      if (!p.char || !this.textures.exists(`char_${p.char}`)) {
        this.tokens.push(null);
        return;
      }
      const c = chars[i];
      const { sx, sy } = this.tokenScreenPos(chars, i);
      const hl = this.add
        .circle(sx, sy, (95 * tokenScale) / 2 + 4, GOLD, 0)
        .setStrokeStyle(3, GOLD, 0)
        .setMask(this.arrMask);
      const img = this.add
        .image(sx, sy, `char_${p.char}`)
        .setScale(tokenScale)
        .setAngle(dirIndexToAngle(c.facing, p.char))
        .setOrigin(0.5)
        .setMask(this.arrMask)
        .setInteractive({ useHandCursor: true });
      img.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (this.isDragging || pointer.rightButtonReleased()) return;
        this.openSheet(i);
      });
      img.on("pointerover", () => this.tokens[i]?.setHighlight(0xffe2a0, 1, 4));
      img.on("pointerout", () => this.applyTokenHighlight(i));
      const token = new CharacterToken(p.char, img, hl, CharacterToken.depthFor(i));
      // The AIM marker on this token belongs to the opponent: the line runs from the aimer to here.
      token.onAimHover = (over) => (over ? this.showAimLine(this.gunCentre(1 - i), this.tokenCentre(i)) : this.hideAimLine());
      // The gun of an aiming character: the line runs from the aimer to its target.
      token.onGunHover = (over) => {
        const chars = this.displayChars();
        const c = chars[i];
        if (!over || !c || c.aim <= 0) return this.hideAimLine();
        const target = this.aimOnToken(chars, i) ? this.tokenCentre(1 - i) : this.hexCentre(c.aimHex);
        this.showAimLine(this.gunCentre(i), target);
      };
      token.setOverlay(this, overlayKey(c), this.arrMask);
      token.setDelay(this, c.delay, this.arrMask);
      token.setGun(this, gunInHand(c.guns), this.arrMask, false); // built in place: no entrance
      token.setEndurance(this, c.endurance, this.arrMask, false);
      token.setTargetAim(this, this.incomingAim(chars, i), this.arrMask);
      token.setStatus(c.status);
      this.tokens.push(token);
    });
  }

  /** Moves the tokens to the current display state, animated or not. */
  private refreshTokens(animate: boolean) {
    const chars = this.displayChars();
    this.hideAimLine();
    this.refreshAimMarkers(chars);
    this.refreshGround(chars, this.displayGround());
    this.tokens.forEach((t, i) => {
      if (!t || !chars[i]) return;
      const c = chars[i];
      const { sx, sy } = this.tokenScreenPos(chars, i);
      const angle = dirIndexToAngle(c.facing, t.charKey);
      t.killTweens(this.tweens);
      // Status, delay and gun first, so new markers travel with the token.
      t.setOverlay(this, overlayKey(c), this.arrMask);
      t.setDelay(this, c.delay, this.arrMask);
      t.setGun(this, gunInHand(c.guns), this.arrMask);
      t.setEndurance(this, c.endurance, this.arrMask);
      t.setTargetAim(this, this.incomingAim(chars, i), this.arrMask);
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
    const players = this.view?.players ?? [];
    const out: string[] = [];
    chars.forEach((c, j) => {
      if (c && players[j]?.char && c.hex === hex) out.push(`s${j}`);
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
   * Where an occupant of a hex goes: the hex centre, shifted along the
   * diagonal when the hex is shared; a gun on the ground also lies off to
   * the lower-right side of the hex rather than in its middle.
   */
  private occupantScreenPos(chars: CharView[], ground: GroundGunView[], hex: string, key: string): { sx: number; sy: number } {
    const { sx, sy } = this.hexToScreen(hex);
    const d = this.tokenDiameter();
    const aside = key[0] === "g" ? d * GROUND_ASIDE : 0;
    const all = this.occupantsAt(chars, ground, hex);
    if (all.length < 2) return { sx: sx + aside, sy: sy + aside };
    const frac = this.spreadHex === hex ? STACK_SPREAD : STACK_REST;
    const shift = d * frac * ((2 * all.indexOf(key)) / (all.length - 1) - 1);
    return { sx: sx + shift + aside, sy: sy + shift + aside };
  }

  /** Where seat i's token goes: its hex centre, shifted along the diagonal when it shares the hex. */
  private tokenScreenPos(chars: CharView[], i: number): { sx: number; sy: number } {
    return this.occupantScreenPos(chars, this.displayGround(), chars[i].hex, `s${i}`);
  }

  /** Draws the guns lying in hexes, below the tokens, with the token icon's rendering, stacked like a character sharing the hex. */
  private refreshGround(chars: CharView[], ground: GroundGunView[]) {
    for (const o of this.groundIcons) {
      o.img.destroy();
      o.dots.destroy();
    }
    this.groundIcons = [];
    const size = this.tokenDiameter() * GUN_SIZE;
    ground.forEach((g, j) => {
      const gun = g.guns[0];
      const key = `gun_${gun?.type}`;
      if (!gun || !this.textures.exists(key)) return;
      const { sx, sy } = this.occupantScreenPos(chars, ground, g.hex, `g${j}`);
      const img = this.add.image(sx, sy, key).setOrigin(0.5).setMask(this.arrMask).setDepth(0.8);
      const dots = this.add.graphics({ x: sx, y: sy }).setMask(this.arrMask).setDepth(0.8);
      img.setAlpha(paintGun(gun, img, dots, size));
      this.groundIcons.push({ img, dots });
    });
  }

  /** Fans out the stack under the pointer, within the disc the spread tokens cover. */
  private updateStackHover(pointer: Phaser.Input.Pointer) {
    if (this.isDragging || !this.inBoard(pointer.x, pointer.y)) {
      this.setSpreadHex(null);
      return;
    }
    const chars = this.displayChars();
    const ground = this.displayGround();
    const radius = this.tokenDiameter() * (0.5 + STACK_SPREAD);
    let hit: string | null = null;
    const hexes = new Set<string>([...chars.filter((c) => c).map((c) => c.hex), ...ground.map((g) => g.hex)]);
    for (const hex of hexes) {
      if (this.occupantsAt(chars, ground, hex).length < 2) continue;
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

  /** The resting highlight of a token: a white ring on my character, none on the others. */
  private applyTokenHighlight(i: number) {
    const t = this.tokens[i];
    if (!t) return;
    if (i === this.myIndex) t.setHighlight(0xffffff, this.mode === "select" ? 0.9 : 0.4);
    else t.setHighlight(GOLD, 0);
  }

  private refreshView() {
    this.buildBoard();
    this.buildTokens();
    this.refreshTokens(false);
    this.clearChoiceOverlays();
    if (this.choiceMode) this.showChoiceOverlays();
    if (this.optMenu) this.openOptMenu(this.optMenu.card, this.optMenu.side); // follows the token on zoom and pan
    if (this.aimMode) this.enterAimMode(this.aimMode.card, this.aimMode.side);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private statusLine(): string {
    const view = this.view!;
    switch (this.mode) {
      case "sync":
        return "Loading…";
      case "select":
        return "Your move: pick your action cards";
      case "submitting":
        return "Signing your plan…";
      case "waiting": {
        if (view.phase === "waiting") return "Waiting for a second player…";
        const me = this.myIndex >= 0 ? view.players[this.myIndex] : null;
        if (me && me.delay >= MAX_ACTION_POINTS) return `Too much delay to act this turn (${me.delay}): you pass, waiting for the opponent…`;
        return "Plan sent, waiting for the opponent…";
      }
      case "playback": {
        const pb = this.playback;
        if (!pb) return "Replay";
        const t = pb.turns[pb.index];
        const where = pb.seg === 0 ? "start" : `segment ${pb.seg} of ${SEGMENTS}`;
        return pb.live ? `Turn ${t.turn} resolution · ${where}` : `Replay · turn ${t.turn}, ${where}`;
      }
      case "spectate":
        return "Spectating";
      case "ended": {
        const w = view.winner >= 0 ? `${charName(view.players[view.winner].char)} wins` : "no winner";
        return `Game over (${view.endReason.replace(/_/g, " ")}): ${w}`;
      }
    }
  }

  // ── Bottom panels ─────────────────────────────────────────────────────────

  /** Renders the screen around the board (ui/showdownView.ts) from the scene's state. */
  private renderView() {
    this.showdown?.render(this.viewModel(), this.layout);
  }

  /** The overlay's buttons. */
  private onButton(id: string) {
    const pb = this.playback;
    switch (id) {
      case "lobby":
        return this.scene.start("LobbyScene", { splash: false });
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
      case "resign":
        return void this.resign();
      case "claim":
        return void this.claimTimeout();
      case "cancel":
        return void this.cancelGame();
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
    const p = this.view!.players[seat];
    return {
      seat,
      name: charName(p.char),
      charKey: p.char,
      you: seat === this.myIndex,
      where: `${c.hex} · facing ${DIR_NAMES[c.facing] ?? "?"}${c.down ? " · down" : ""}`,
      out: c.status === "killed" ? "DEAD" : c.status === "passed_out" ? "PASSED OUT" : "",
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
    const at = this.view?.timeoutAt ?? 0;
    return at > 0 && Date.now() / 1000 >= at;
  }

  /** Everything the overlay shows, from the scene's state. */
  private viewModel(): ShowdownModel {
    const view = this.view;
    const players = view?.players ?? [];
    const names = players.map((p) => charName(p.char));
    const tone: ShowdownModel["statusTone"] =
      this.mode === "select" || this.mode === "submitting" ? "move" : this.mode === "playback" ? "replay" : this.mode === "ended" ? "over" : this.mode === "waiting" ? "wait" : "info";
    const base = {
      title: view ? `Game ${view.id} · Turn ${view.turn} of ${view.maxTurns}` : `Game ${this.gameID}`,
      status: view ? this.statusLine() : "Loading…",
      statusTone: tone,
      right: this.netError
        ? `RPC offline: ${this.netError}`
        : players.map((p, i) => (p.addr ? `${charName(p.char)} (${i === this.myIndex ? "you" : shortAddr(p.addr)})` : "empty seat")).join("  vs  "),
      rightError: !!this.netError,
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
          seg: pb.seg,
          rows,
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
    const committed = this.committed;
    const planning = view?.phase === "planning";
    const badge = (i: number) => (planning && players[i]?.addr ? (players[i].submitted ? "PLAN SENT" : "PLANNING") : "");
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

  /** The right column's plan panel: my plan while I pick it, the plan sent, or what the game waits for. */
  private planPanel(names: string[]): ShowdownModel["plan"] {
    const view = this.view;
    if (!view) return { title: "Loading", points: "", lines: [], empty: "Reading the showdown from the chain…", note: "", warn: false, buttons: [] };
    const lines = (plan: PlanEntry[]) => plan.map((e) => ({ name: getActionDef(e).name, detail: planDetail(e, names), cost: getActionDef(e).cost }));
    const lobby = { id: "lobby", label: "Lobby", tone: "plain" as const };
    const replay = { id: "replay", label: "Replay", tone: "plain" as const, disabled: !view.lastTurn };
    const me = this.myIndex >= 0 ? view.players[this.myIndex] : null;
    const opponents = view.players.filter((p, i) => i !== this.myIndex && p.addr).map((p) => charName(p.char)).join(", ") || "your opponent";

    if (this.mode === "select" && this.outOfTime()) {
      const sentBy = view.players.filter((p, i) => i !== this.myIndex && p.addr && p.submitted).map((p) => charName(p.char));
      return {
        title: "Out of time",
        points: "",
        lines: [],
        empty: "Your plan did not come in time: the turn takes no more plans.",
        note: sentBy.length
          ? `${sentBy.join(", ")} sent a plan: closing the showdown makes you lose it.`
          : "Nobody sent a plan: the showdown ends without a winner once closed.",
        warn: true,
        buttons: [{ id: "claim", label: "Close the showdown", tone: sentBy.length ? "danger" : "primary" }, replay, lobby],
      };
    }
    if (this.mode === "select" || this.mode === "submitting") {
      const plan = this.currentPlan();
      const budget = this.budget();
      const problem = validatePlan(plan, budget, this.ranLastTurn(), this.myGuns(), this.groundHere());
      const pending = this.choiceMode
        ? choicePrompt(this.choiceMode.choiceType)
        : this.optMenu
          ? "Choose what to do with the gun, beside your token."
          : this.aimMode
            ? `Click the hex to ${this.pendingOpts.get(this.aimMode.card) === "shoot" ? "shoot at (chance of hitting, bullseye in red)" : "aim at"}.`
            : "";
      const carried = me && me.delay > 0 ? `${me.delay} delay carried from last turn: ${budget} of your ${MAX_ACTION_POINTS} points are left to plan.` : "";
      const submitting = this.mode === "submitting";
      return {
        title: "Your plan",
        points: `${planCost(plan)} / ${budget} points`,
        lines: lines(plan),
        empty: "Pick action cards in your hand, or send an empty plan to pass.",
        note: submitting ? "Signing your plan in Adena…" : pending || (plan.length > 0 && problem ? problem : carried),
        warn: !submitting && (!!pending || (plan.length > 0 && !!problem)),
        buttons: [
          { id: "send", label: submitting ? "SIGNING…" : plan.length === 0 ? "PASS THE TURN" : "SEND PLAN", tone: "primary", disabled: submitting || !!pending || !!problem },
          { id: "clear", label: "Clear", tone: "plain", disabled: submitting || plan.length === 0 },
          replay,
          { id: "resign", label: "Resign", tone: "danger", disabled: submitting },
        ],
      };
    }
    if (this.mode === "waiting" && view.phase === "waiting") {
      return {
        title: "Waiting for a player",
        points: "",
        lines: [],
        empty: "Your showdown is open: it starts when a second player joins.",
        note: "",
        warn: false,
        buttons: [{ id: "cancel", label: "Cancel the showdown", tone: "danger" }, lobby],
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
      const due = view.timeoutAt > 0 && Date.now() / 1000 > view.timeoutAt;
      const passed = me && me.delay >= MAX_ACTION_POINTS;
      const note = due
        ? `Out of time for ${opponents}: you may claim the showdown.`
        : `Waiting for ${opponents}. ${view.timeoutAt > 0 ? `After ${new Date(view.timeoutAt * 1000).toLocaleString()}, you may claim the showdown.` : ""}`;
      return {
        title: "Your plan",
        points: "sent",
        lines: lines(plan),
        empty: passed ? `Too much delay to act this turn (${me!.delay}): you pass.` : sent === "" ? "You pass this turn." : "Your plan is in.",
        note,
        warn: due,
        buttons: [
          ...(due ? [{ id: "claim", label: "CLAIM THE SHOWDOWN", tone: "primary" as const }] : []),
          replay,
          { id: "resign", label: "Resign", tone: "danger" },
        ],
      };
    }
    if (this.mode === "ended") {
      return { title: "Game over", points: "", lines: [], empty: this.statusLine(), note: "", warn: false, buttons: [replay, lobby] };
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
              !(this.pendingOpts.has(card) && (!["aim", "shoot"].includes(this.pendingOpts.get(card) ?? "") || this.pendingAims.has(card)));
            const isLast = !!last && last.card === card && last.side === side;
            state = needsChoice ? "choice" : isLast && selecting ? "last" : "picked";
          } else {
            const blocked = !!pendingCard || this.isSelected(card, side === "front" ? "back" : "front");
            const usable = selecting && !blocked && cost + def.cost <= budget && canPlay({ card, side }, this.ranLastTurn(), this.plannedGuns(), this.groundHere());
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
          : this.mode === "waiting"
            ? this.view?.phase === "waiting"
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
      return entry;
    });
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

  /** Shows the character sheet of a seat, with what the board currently displays for it. */
  private openSheet(seat: number, pick?: GunPick, onClosed?: () => void) {
    const view = this.view;
    const p = view?.players[seat];
    const c = this.displayChars()[seat];
    if (!view || !p || !c) return;
    // The overlay owns the pointer while it is open: no card or token reacts underneath.
    this.input.enabled = false;
    openCharacterSheet(
      {
      name: charName(p.char),
      charKey: p.char,
      seat,
      hex: c.hex,
      facing: c.facing,
      down: c.down,
      delay: c.delay,
      status: c.status,
      submitted: p.submitted,
      phase: view.phase,
      isMe: seat === this.myIndex,
      guns: c.guns,
      ground: this.displayGround().filter((g) => g.hex === c.hex),
      aim: c.aim,
      aimHex: c.aimHex,
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
      if (planCost(this.currentPlan()) + def.cost > this.budget()) return;
    }
    this.exitChoiceMode();

    if (wasSelected) {
      // Only the last selected card can be deselected: choices are relative to the state before it.
      const last = this.selectionOrder[this.selectionOrder.length - 1];
      if (!last || last.card !== card || last.side !== side) return;
      this.selectionOrder.pop();
      this.playCues([{ group: "unpickCard", delayMs: 0 }]);
      this.pendingChoices.delete(card);
      this.pendingGuns.delete(card);
      this.pendingOpts.delete(card);
      this.pendingAims.delete(card);
    } else {
      this.selectionOrder.push({ card, side });
      this.playCues([{ group: "pickCard", delayMs: 0 }]);
      if (isShooting({ card, side })) this.openOptMenu(card, side);
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
            this.playCues([{ group: "unpickCard", delayMs: 0 }]);
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
      // Moves: one option per hex (two directions can lead to the same half-hex).
      .filter((o, i, all) => isTurn || (o.hex !== null && all.findIndex((x) => x.hex === o.hex) === i));
    this.choiceMode = { card, side, choiceType, options };
    this.showChoiceOverlays();
  }

  private showChoiceOverlays() {
    this.clearChoiceOverlays();
    if (!this.choiceMode) return;
    const isTurn = this.choiceMode.choiceType === "turn_ahead" || this.choiceMode.choiceType === "turn_back";
    for (const opt of this.choiceMode.options) {
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
   * A hex to pick: its outline (board pixels) filled and stroked, around
   * the screen point (sx, sy), clickable inside the outline only; it lights
   * up while the pointer is over it.
   */
  private hexHighlight(outline: { x: number; y: number }[], sx: number, sy: number, fill: number, alpha: number, stroke: number): Phaser.GameObjects.Polygon {
    // Pulled in a few pixels towards the centre, so the grid lines show between highlights.
    const points = outline.map((p) => {
      const s = this.boardToScreen(p.x, p.y);
      const v = new Phaser.Math.Vector2(s.sx - sx, s.sy - sy);
      return v.setLength(Math.max(0, v.length() - HEX_HIGHLIGHT_INSET));
    });
    const hex = this.add
      .polygon(sx, sy, points, fill, alpha)
      .setOrigin(0)
      .setStrokeStyle(2, stroke, 0.9)
      .setMask(this.arrMask)
      .setInteractive({ hitArea: new Phaser.Geom.Polygon(points), hitAreaCallback: Phaser.Geom.Polygon.Contains, useHandCursor: true })
      .setDepth(500);
    // Above its neighbours while hovered, so its whole outline shows (labels stay above at 501).
    hex.on("pointerover", () => hex.setFillStyle(fill, Math.min(1, alpha * 2)).setStrokeStyle(4, 0xffffff, 1).setDepth(500.5));
    hex.on("pointerout", () => hex.setFillStyle(fill, alpha).setStrokeStyle(2, stroke, 0.9).setDepth(500));
    return hex;
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

  /** Highlights every hex of my aim zone; clicking one is where the aim or the shot goes. */
  private enterAimMode(card: CardNumber, side: CardSide) {
    this.closeAimMode();
    const chars = this.displayChars();
    const me = this.myIndex >= 0 ? chars[this.myIndex] : null;
    if (!me) return;
    const r = (BOARD_A.hexRadius * this.displayTransform().scale * Math.sqrt(3)) / 2; // centre to side
    const objects: Phaser.GameObjects.GameObject[] = [];
    // When shooting, the chance of hitting each hex.
    const shooting = this.pendingOpts.get(card) === "shoot";
    const cardAimTime = getActionDef({ card, side }).name === "Shoot" ? SHOOT_AIM_TIME : COCK_AIM_SHOOT_AIM_TIME;
    const opp = chars[1 - this.myIndex];
    const markersHex = me.aimHex || (opp?.hex ?? "");
    const fontPx = Math.round(Phaser.Math.Clamp(r * 0.62, 10, 22));
    for (const hex of BOARD_A.aimZone(me.hex, me.facing)) {
      const { sx, sy } = this.hexToScreen(hex);
      const odds = shooting ? shotOdds(me, cardAimTime, hex, markersHex, BOARD_A) : null;
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
        if (!odds) return;
        const lines = [
          `Hit ${odds.hit}%  ·  bullseye ${odds.bullseye}%`,
          `range ${odds.range}  ·  aim time ${odds.aimTime}`,
        ];
        detail = this.add
          .text(sx, sy - r - 6, lines.join("\n"), { fontSize: "13px", color: "#f3e7ce", backgroundColor: "#0d0704", padding: { x: 8, y: 5 }, align: "center" })
          .setOrigin(0.5, 1)
          .setDepth(502);
        detail.setX(Phaser.Math.Clamp(sx, detail.width / 2 + 8, this.scale.width - detail.width / 2 - 8));
        if (detail.y - detail.height < 4) detail.setOrigin(0.5, 0).setY(sy + r + 6);
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
    this.aimMode = { card, side, objects };
  }

  private closeAimMode() {
    if (!this.aimMode) return;
    for (const o of this.aimMode.objects) o.destroy();
    this.aimMode = null;
  }

  /** A click on a hex with a character on it targets the character, else the hex. */
  private resolveAim(hex: string) {
    if (!this.aimMode) return;
    const chars = this.displayChars();
    const seat = chars.findIndex((c, i) => c && i !== this.myIndex && c.hex === hex && c.status === "alive");
    this.pendingAims.set(this.aimMode.card, seat >= 0 ? { target: seat } : { hex });
    if (this.pendingOpts.get(this.aimMode.card) === "shoot") this.playCues([{ group: "planShoot", delayMs: 0 }]);
    this.closeAimMode();
    this.updatePreview();
    this.renderView();
  }

  /** Draws the AIM markers on aimed hexes; markers following the opponent ride on its token (setTargetAim). */
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

  /** Drifts seat's AIM marker up and fades it away, wherever it sits. */
  private fadeAim(seat: number, duration: number) {
    const marker = this.aimMarkers.get(seat);
    if (marker) {
      this.tweens.add({ targets: marker, y: marker.y - this.tokenDiameter() * 0.5, alpha: 0, duration, ease: "Cubic.easeIn" });
      return;
    }
    this.tokens[1 - seat]?.fadeAim(this.tweens, duration);
  }

  /** Zooms seat's AIM marker in and out once, wherever it sits. */
  private pulseAim(seat: number) {
    const marker = this.aimMarkers.get(seat);
    if (marker) {
      const { scaleX, scaleY } = marker;
      this.tweens.add({ targets: marker, scaleX: scaleX * 1.35, scaleY: scaleY * 1.35, duration: 170, yoyo: true, ease: "Quad.easeOut" });
      return;
    }
    this.tokens[1 - seat]?.pulseAim(this.tweens);
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
   * A "HIT!", "MISSED!", "JAMMED!" or "EXPLODED!" burst beside a token, off to the side of the
   * bullet's path (perpendicular to it, on whichever side has more room):
   * pops up, holds, fades.
   */
  private popBurst(key: "hit" | "missed" | "jammed" | "exploded", at: { sx: number; sy: number }, along: { x: number; y: number }) {
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

  /** Whether seat i's AIM markers ride on the opponent's token (an aim at the character, no hex). */
  private aimOnToken(chars: CharView[], i: number): boolean {
    const c = chars[i];
    return !!c && c.aim > 0 && !c.aimHex && !!chars[1 - i];
  }

  /** The AIM points the opponent of seat i holds on seat i's token (markers that ride on it). */
  private incomingAim(chars: CharView[], i: number): number {
    return this.aimOnToken(chars, 1 - i) ? chars[1 - i].aim : 0;
  }

  /**
   * Buttons for the option of a gun action, in a column to the right of my
   * token: Cock / Aim / Shoot for Cock/Aim/Shoot; the Shoot card has a
   * single option and goes straight to its target. With the gun uncocked (as the plan leaves it before this card)
   * only Cock is enabled; cocked, Cock is disabled and the others enabled.
   */
  private openOptMenu(card: CardNumber, side: CardSide) {
    this.closeOptMenu();
    const chars = this.displayChars();
    const me = this.myIndex >= 0 ? chars[this.myIndex] : null;
    const gun = me ? firingGun(me.guns) : undefined;
    const name = getActionDef({ card, side }).name;
    const opts = MENU_OPTIONS[name] ?? [];
    if (opts.length === 1) {
      // A single option (Shoot): straight to the target pick, no menu.
      this.optMenu = { card, side, objects: [] };
      this.resolveOpt(opts[0]);
      return;
    }
    // A jammed gun cannot be cocked until completely reloaded (13.31).
    const enabled = (o: ShootOption) => !gun || (o === "cock" ? !gun.cocked && !gun.jammed : o === "nothing" ? true : gun.cocked);
    const labels: Record<ShootOption, string> = { cock: "Cock", uncock: "Uncock", aim: "Aim", shoot: "Shoot", nothing: "Do nothing" };
    const objects: Phaser.GameObjects.GameObject[] = [];
    const center = me ? this.tokenScreenPos(chars, this.myIndex) : { sx: this.board.x + this.board.w / 2, sy: this.board.y + this.board.h / 2 };
    const x = center.sx + this.tokenDiameter() * 0.8;
    const gap = 6;
    const texts = opts.map((o) =>
      this.add
        .text(x, 0, labels[o], { fontSize: "18px", fontStyle: "bold", color: "#F3E7CE", padding: { x: 14, y: 8 } })
        .setOrigin(0, 0.5)
        .setMask(this.arrMask)
        .setDepth(602),
    );
    const width = Math.max(...texts.map((t) => t.width));
    const total = texts.reduce((h, t) => h + t.height, 0) + gap * (texts.length - 1);
    let y = center.sy - total / 2;
    opts.forEach((o, i) => {
      const text = texts[i];
      y += text.height / 2;
      text.setY(y);
      const box = this.add.rectangle(x, y, width, text.height, 0x8e2f1a, 1).setOrigin(0, 0.5).setStrokeStyle(3, GOLD, 1).setMask(this.arrMask).setDepth(601);
      y += text.height / 2 + gap;
      if (enabled(o)) {
        box.setInteractive({ useHandCursor: true });
        box.on("pointerover", () => box.setFillStyle(0xb8442a, 1));
        box.on("pointerout", () => box.setFillStyle(0x8e2f1a, 1));
        box.on("pointerup", () => {
          this.playCues([{ group: "select", delayMs: 0 }]);
          this.resolveOpt(o);
        });
      } else {
        // Dimmed but opaque, so nothing on the board shows through it.
        box.setFillStyle(0x3a1d12, 1).setStrokeStyle(3, 0x6b5a3a, 1);
        text.setColor("#8a7a66");
      }
      objects.push(box, text);
    });
    this.optMenu = { card, side, objects };
  }

  private closeOptMenu() {
    if (!this.optMenu) return;
    for (const o of this.optMenu.objects) o.destroy();
    this.optMenu = null;
  }

  private resolveOpt(opt: ShootOption) {
    if (!this.optMenu) return;
    const { card, side } = this.optMenu;
    this.pendingOpts.set(card, opt);
    this.closeOptMenu();
    if (opt === "aim" || opt === "shoot") this.enterAimMode(card, side);
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
    this.preview = replayPlan(me, plan, BOARD_A, this.displayGround().filter((g) => g.hex === me.hex));
    this.refreshTokens(true);
    const encoded = encodePlan(plan);
    const prev = this.previewPlan;
    this.previewPlan = encoded;
    if (!withSounds || encoded.length <= prev.length || !encoded.startsWith(prev)) return;
    this.playCues(soundsForPreview(before, this.preview, (from, to) => BOARD_A.crossesObstacle(from, to)));
    if (this.preview.aim > before.aim) this.landPlannedAim();
  }

  /** An aim just added to the plan: the dotted line to its target, then the markers pulse, as in the playback. */
  private landPlannedAim() {
    const seat = this.myIndex;
    const chars = this.displayChars();
    const from = this.gunCentre(seat);
    const target = this.aimOnToken(chars, seat) ? this.tokenCentre(1 - seat) : this.hexCentre(chars[seat].aimHex);
    this.showAimLine(from, target);
    this.pulseAim(seat);
    this.time.delayedCall(320, () => this.hideAimLine());
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private async sendPlan() {
    if (this.mode !== "select" || this.choiceMode || this.optMenu || this.aimMode || !this.view) return;
    if (this.outOfTime()) return this.renderView();
    const plan = this.currentPlan();
    const problem = validatePlan(plan, this.budget(), this.ranLastTurn(), this.myGuns(), this.groundHere());
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
      await this.chain.realm.submitPlan(this.gameID, encoded);
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

  private async resign() {
    await this.act(() => this.chain.realm.resign(this.gameID), "Resigned");
  }

  private async claimTimeout() {
    await this.act(() => this.chain.realm.claimTimeout(this.gameID), "Timeout claimed");
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
    this.stopAuto();
    this.clearSelection();
    this.playback = { turns, index, seg: 0, cut: null, anim: 0, live, auto: null };
    this.mode = "playback";
    this.refreshTokens(true);
    this.renderView();
  }

  /**
   * Shows the whole history of a finished game, from the first turn or the
   * last one; it is not closed. Without any resolved turn the board stays.
   */
  private async showFinalReplay(atLast: boolean) {
    this.finalReplay = true;
    try {
      const history = await this.chain.realm.getHistory(this.gameID);
      if (!this.scene.isActive() || history.turns.length === 0) return;
      const last = history.turns.length - 1;
      this.shownResultTurn = history.turns[last].turn;
      this.startPlayback(history.turns, false, atLast ? last : 0);
    } catch (e) {
      // Let a later poll try again.
      this.finalReplay = false;
      if (this.scene.isActive()) showToast(this, userMessage(e), "error");
    }
  }

  /** Replays the whole showdown so far, from the chain's history. */
  private async openReplay() {
    if (!this.view || this.mode === "playback" || this.mode === "submitting") return;
    try {
      const history = await this.chain.realm.getHistory(this.gameID);
      if (!this.scene.isActive() || this.playback) return;
      if (history.turns.length === 0) {
        showToast(this, "No turn has been played yet", "info");
        return;
      }
      this.startPlayback(history.turns, false);
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
    const gen = ++pb.anim;
    const same = () => this.playback === pb && pb.anim === gen;
    const all = pb.turns[pos.index].events;
    const events = eventsForSegment(all, pos.seg);
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
    const settle = () => {
      const before = this.tokens.map((t) => t?.delayShown() ?? 0);
      this.refreshTokens(true);
      const now = this.displayChars();
      now.forEach((c, i) => {
        if (c && c.delay !== before[i] && c.delay > 0) this.tokens[i]?.pulseBadge(this.tweens);
      });
      this.playCues(soundsForDelay(before, now));
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
    this.flashShots(events);
    this.playSounds(events);
    // SERIOUS wounds bleed where the character stands as their fatigue cards cost endurance.
    const chars = this.displayChars();
    for (const e of events) {
      if (e.kind === "delay" && e.reason === "serious" && e.endurance > 0 && chars[e.p]) this.bloodStains(this.tokenScreenPos(chars, e.p), 2 * e.endurance);
    }
    // The tokens move in 450 ms once settled; a shot's bullet and burst need a beat more.
    const shots = events.some((e) => e.kind === "shot");
    return fade + (aim ? 150 : 0) + STEP_MOVE_MS + (shots ? STEP_SHOT_MS : 0);
  }

  /**
   * A bullet flying from the shooter to the target for each shot of the
   * step, and off in a random direction for each wild shot: a tracer grows
   * from the gun with a bright head, then fades out. Drawn under the tokens
   * like the aim line, a miss above them.
   */
  private flashShots(events: TurnEvent[]) {
    const chars = this.displayChars();
    for (const e of events) {
      if (e.kind === "malfunction" && (e.result === "jams" || e.result === "explodes") && chars[e.p]) {
        // A jam or an explosion: no bullet, the "JAMMED!" or "EXPLODED!"
        // burst pops beside the shooter, off the line towards what it shot at.
        const shot = events.find((x) => x.kind === "shot" && x.p === e.p);
        const at = this.tokenScreenPos(chars, e.p);
        const aimAt = shot ? (shot.target >= 0 && chars[shot.target] ? this.tokenScreenPos(chars, shot.target) : this.hexToScreen(shot.to)) : null;
        const along = aimAt && (aimAt.sx !== at.sx || aimAt.sy !== at.sy) ? { x: aimAt.sx - at.sx, y: aimAt.sy - at.sy } : { x: 1, y: 0 };
        this.popBurst(e.result === "jams" ? "jammed" : "exploded", at, along);
        continue;
      }
      if (e.kind === "wild_shot" && chars[e.p]) {
        // A gun going off by itself (a WILD SHOT penalty): the bullet flies
        // off in a random direction, past the board's edge, hitting nothing.
        const gun = this.gunCentre(e.p);
        const from = { sx: gun.x, sy: gun.y };
        const angle = Math.random() * Math.PI * 2;
        this.flyTracer(from, this.beyondTheBoard(from, { sx: from.sx + Math.cos(angle), sy: from.sy + Math.sin(angle) }), 20);
        this.puffSmoke(from, { x: Math.cos(angle), y: Math.sin(angle) });
        this.tokens[e.p]?.kickGun(this.tweens);
        this.cameras.main.shake(120, 0.0025);
        continue;
      }
      if (e.kind !== "shot" || !chars[e.p]) continue;
      // A misfire shows as a missed shot, unless the second card jams or blows
      // up the gun: then no bullet, the jam has its own burst.
      if (e.reason === "misfire" && events.some((x) => x.kind === "malfunction" && x.p === e.p && (x.result === "jams" || x.result === "explodes"))) continue;
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
      // A miss flies over the target, so its tracer is drawn above the tokens.
      const flight = this.flyTracer(from, to, hit ? this.lineDepth({ x: from.sx, y: from.sy }, { x: to.sx, y: to.sy }) : 20);
      const length = Math.hypot(to.sx - from.sx, to.sy - from.sy);
      // The gunshot kicks the gun and shakes the view as the bullet leaves, harder on a hit.
      if (e.reason !== "misfire") this.puffSmoke(from, { x: to.sx - from.sx, y: to.sy - from.sy });
      this.tokens[e.p]?.kickGun(this.tweens);
      this.cameras.main.shake(hit ? 250 : 120, hit ? 0.006 : 0.0025);
      // "HIT!" or "MISSED!" bursts beside the target as the bullet reaches it; a hit bleeds.
      const passing = length > 0 ? Math.hypot(near.sx - from.sx, near.sy - from.sy) / length : 1;
      const along = { x: to.sx - from.sx, y: to.sy - from.sy };
      this.time.delayedCall(flight * passing, () => {
        this.popBurst(hit ? "hit" : "missed", centre, along);
        if (hit) {
          this.spurtBlood(near, along);
          if (atToken) {
            this.tokens[e.target]?.flinch(this.tweens);
            this.tokens[e.target]?.hurtFlash(this);
          }
        }
      });
    }
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
  private playSounds(events: TurnEvent[]) {
    this.playCues(soundsForEvents(events));
  }

  private playCues(cues: SoundCue[]) {
    for (const cue of cues) {
      const key = soundKey(cue.group, Math.floor(Math.random() * SOUND_FILES[cue.group].length));
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

  private rememberSentPlan(plan: string) {
    this.sentPlan = { turn: this.view?.turn ?? 0, plan };
  }

  /** The plan sent for the current turn, or null while it is not known yet. */
  private sentPlanString(): string | null {
    const sent = this.sentPlan;
    return sent && sent.turn === this.view?.turn ? sent.plan : null;
  }

  /** Reads my plan for the turn in progress back from the chain, when the chain says I sent one this session does not know. */
  private async loadSentPlan() {
    const view = this.view;
    if (!view || this.myIndex < 0 || !view.players[this.myIndex]?.submitted || this.sentPlan?.turn === view.turn) return;
    const turn = view.turn;
    try {
      const p = await this.chain.realm.getPlan(this.gameID, this.chain.wallet.address);
      if (!this.scene.isActive() || !p.submitted || p.turn !== turn || this.view?.turn !== turn) return;
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
  if (e.opt === "aim" || e.opt === "shoot") return target ? `${e.opt} at ${target}` : `${e.opt} at…`;
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
