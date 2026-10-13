import Phaser from "phaser";

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
    // Phaser draws a text once: the splash's web fonts (Google Fonts, linked
    // in index.html) must be there first, or it keeps the fallback. A slow
    // font server never holds the game more than FONTS_WAIT_MS.
    const fonts = Promise.all(["22px Rye", "bold 22px 'Zilla Slab'", "italic 18px 'Zilla Slab'"].map((f) => document.fonts.load(f)));
    const wait = new Promise((resolve) => setTimeout(resolve, FONTS_WAIT_MS));
    void Promise.race([fonts, wait])
      .catch(() => undefined)
      .then(() => this.scene.start("LobbyScene"));
  }
}
