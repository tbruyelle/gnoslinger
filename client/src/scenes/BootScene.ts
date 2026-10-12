import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    this.load.image("splash", "splash_screen.jpg");
    this.load.image("adena_icon", "adena_icon.png");
  }

  create() {
    this.scene.start("LobbyScene");
  }
}
