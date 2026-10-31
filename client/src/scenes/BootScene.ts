import Phaser from "phaser";
import { connectIfAllowed } from "../chain";
import { TRAILER_HASH } from "../links";
import { openTrailerDialog } from "../ui/trailerDialog";
import { FAQ_HASH, openFaqDialog } from "../ui/faqDialog";
import { parseRoute } from "../game/route";
import { installWalletNotices } from "../ui/walletNotices";
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
      // How to play and the games (game/route.ts) have addresses of their
      // own: a game opens as its player when Adena has the site connected
      // already (a page reloaded, say), else with no wallet, watched.
      .then(async () => {
        const route = parseRoute(location.hash);
        if (location.hash === TUTORIAL_HASH) return this.scene.start("GameScene", { tutorial: true });
        // The trailer's address: the splash with the trailer over it (the README's link).
        if (location.hash === TRAILER_HASH) {
          this.scene.start("LobbyScene");
          return openTrailerDialog();
        }
        // The FAQ's address: the splash with the FAQ over it.
        if (location.hash === FAQ_HASH) {
          this.scene.start("LobbyScene");
          return openFaqDialog();
        }
        if (!route) return this.scene.start("LobbyScene");
        if (await connectIfAllowed()) installWalletNotices();
        this.scene.start("GameScene", { gameID: route.gameID, turn: route.turn });
      });
    // The address edited to another game while the app runs: open that one.
    // (The app's own changes, history.replaceState, fire no hashchange.)
    window.addEventListener("hashchange", () => {
      if (parseRoute(location.hash)) location.reload();
    });
  }
}
