import Phaser from "phaser";
import { TUTORIAL_HASH } from "../tutorial/tutorial";

/** The longest the boot waits for the web fonts. */
const FONTS_WAIT_MS = 2000;

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    this.load.image("splash", "splash_screen.jpg");
    this.load.image("adena_icon", "adena_icon.png");
  }

  create() {
    // Phaser pauses every sound when the page loses focus, which Adena's
    // popup takes: the music stopped while the wallet was open. Pause only
    // when the tab is hidden (another tab, the window minimised).
    const sound = this.sound;
    sound.pauseOnBlur = false;
    this.game.events.on(Phaser.Core.Events.HIDDEN, () => sound.pauseAll());
    this.game.events.on(Phaser.Core.Events.VISIBLE, () => sound.resumeAll());

    // Phaser draws a text once: the splash's web fonts (Google Fonts, linked
    // in index.html) must be there first, or it keeps the fallback. A slow
    // font server never holds the game more than FONTS_WAIT_MS.
    const fonts = Promise.all(["22px Rye", "bold 22px 'Zilla Slab'", "italic 18px 'Zilla Slab'"].map((f) => document.fonts.load(f)));
    const wait = new Promise((resolve) => setTimeout(resolve, FONTS_WAIT_MS));
    void Promise.race([fonts, wait])
      .catch(() => undefined)
      // How to play has an address of its own, opened with no wallet.
      .then(() => (location.hash === TUTORIAL_HASH ? this.scene.start("GameScene", { tutorial: true }) : this.scene.start("LobbyScene")));
  }
}
