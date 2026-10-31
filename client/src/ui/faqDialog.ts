/**
 * The FAQ, in a dialog over the page: the questions players run into with
 * the guns, the shots, the throws, the wounds and leaving the fight, each a
 * <details> that opens on a click, grouped under headings. Opened from the
 * lobby's top bar, the game header and its own address, #faq (BootScene);
 * the cross, a click outside or Esc closes it.
 */
export const FAQ_HASH = "#faq";

const STYLE_ID = "fq-style";

const CSS = `
.fq-back{position:fixed;inset:0;z-index:600;background:rgba(30,22,24,.85);display:flex;align-items:center;justify-content:center;padding:32px 16px}
.fq-dialog{position:relative;width:min(760px,100%);max-height:100%;display:flex;flex-direction:column;background:#F3E7CE;border:3px solid #2A1C14;border-radius:18px;box-shadow:inset 0 0 0 5px #F3E7CE,inset 0 0 0 7px #2A1C14,0 10px 0 #1E1618;padding:26px 14px 18px 26px;font-family:'Zilla Slab',Rockwell,Georgia,serif;color:#2A1C14}
.fq-title{margin:0 12px 12px 0;font-family:Rye,Georgia,serif;font-weight:400;font-size:30px;color:#33307F;border-bottom:3px solid #2A1C14;padding-bottom:8px}
.fq-body{overflow-y:auto;padding-right:12px}
.fq-body h3{margin:18px 0 6px;font-family:Rye,Georgia,serif;font-weight:400;font-size:20px;letter-spacing:1px;color:#8E2F1A}
.fq-body details{border-bottom:1px solid #5A4636}
.fq-body summary{cursor:pointer;padding:9px 0;font-size:18px;font-weight:700;list-style:none;display:flex;gap:10px}
.fq-body summary::-webkit-details-marker{display:none}
.fq-body summary::before{content:"▸";color:#B5482A;flex-shrink:0}
.fq-body details[open] summary::before{content:"▾"}
.fq-body summary:hover{color:#8E2F1A}
.fq-body summary:focus-visible{outline:3px solid #F2B544;outline-offset:2px}
.fq-body p,.fq-body ul{margin:0 0 10px 20px;font-size:17px;line-height:1.4}
.fq-body ul{padding-left:18px}
.fq-body b{color:#33307F}
.fq-close{position:absolute;top:-18px;right:-18px;width:44px;height:44px;border-radius:50%;background:#F3E7CE;color:#2A1C14;border:3px solid #2A1C14;font-family:'Zilla Slab',Rockwell,Georgia,serif;font-size:28px;line-height:1;cursor:pointer}
.fq-close:hover{background:#FFFFFF}
.fq-close:focus-visible{outline:3px solid #F2B544;outline-offset:2px}
@media (max-width:600px){.fq-close{top:6px;right:6px}}
`;

/** A group of questions under its heading; the answers are HTML. */
const FAQ: { title: string; items: [question: string, answer: string][] }[] = [
  {
    title: "Guns",
    items: [
      [
        "Why can't I shoot?",
        "<p>A gun fires from the <b>GUN HAND</b> or <b>BOTH HANDS</b> only, and it must be <b>cocked</b> and <b>loaded</b>. " +
          "Every character starts with a loaded Colt 45 in the holster, uncocked: play <b>Draw &amp; Cock</b> (3 points) to put it in a hand, cocked. " +
          "Draw &amp; Cock then Shoot fit in the same turn.</p>",
      ],
      [
        "I shot once, why can't I shoot again?",
        "<p>A gun uncocks when it fires. Cock it again with <b>Cock/Aim/Shoot</b> (2 points), picking <b>Cock</b> in its options, then shoot.</p>",
      ],
      [
        "My gun is empty, how do I load it?",
        "<p>The Colt holds 6 shells. To load it:</p>" +
          "<ul><li>it must be in <b>BOTH HANDS</b>: if it is not, play <b>Draw &amp; Cock</b> and drop it in the BOTH HANDS box;</li>" +
          "<li>each <b>Load</b> (3 points) puts one shell in, and leaves the gun uncocked: cock it again before shooting.</li></ul>" +
          "<p>From BOTH HANDS the gun fires as well, and moving it back to the GUN HAND is free (drag it on your sheet while planning).</p>",
      ],
      [
        "How do I pick up a gun lying on the ground?",
        "<p>Play <b>Draw &amp; Cock</b>: your sheet opens, and the guns lying in your hex are in its <b>GROUND</b> panel; drag one to a hand. " +
          "The gun only needs to be in your hex when the action comes up, so you may walk onto it earlier in the same plan. " +
          "When two characters go for the same gun, the first to act takes it.</p>" +
          "<p>To let go of a gun, drag it to the GROUND panel of your sheet while planning: it costs nothing.</p>",
      ],
      [
        "My gun is jammed, what now?",
        "<p>A second MALFUNCTION card jams the gun and empties it. It can neither shoot nor be cocked until it is <b>completely reloaded</b>: " +
          "six Loads, one a turn. Often better: throw it at someone, or pick up another gun.</p>",
      ],
      [
        "My gun exploded, what now?",
        "<p>An exploded gun (struck through in red) cannot be loaded, cocked or fired, ever. All it is good for is to be <b>thrown</b>, or dropped. Find another gun.</p>",
      ],
    ],
  },
  {
    title: "Shooting",
    items: [
      [
        "How does aiming change my chance to hit?",
        "<p>A shot draws a card, read with the <b>aim time</b> and the <b>range</b> (the hexes to the target): the more aim time and the closer, the better. " +
          "The aim time is the card's (Cock/Aim/Shoot 2, Shoot 1) plus your <b>AIM points</b>, minus your GUN ARM wounds.</p>" +
          "<p>Each <b>Aim</b> (Cock/Aim/Shoot) puts 2 AIM points on the target, up to 8. They stay while you only Turn, aim and shoot; " +
          "any other action, a shot, or the target getting more than one hex away from them, out of your aim zone or out of sight loses them.</p>" +
          "<p>While picking a shot's target, the hover shows the chance to hit and to hit the bullseye. " +
          "It leaves out the target's status: a target that moves or runs this turn is hit only on a bullseye, which then counts as the lesser hit; one lying DOWN only on a bullseye.</p>",
      ],
      [
        "My shot did nothing, why?",
        "<p>A shot is <b>held</b>, the gun still cocked and the aim kept, when nobody is in the hex you aimed at when it comes up, " +
          "when the target is out of sight, or when it is already out of the fight. A shot at someone outside your aim zone (your hex and the 120° cone ahead) is a miss, and spends the shell.</p>",
      ],
    ],
  },
  {
    title: "Throwing",
    items: [
      [
        "How does a throw work?",
        "<p><b>Throw</b> (2 points) hurls the weapon in your GUN HAND or BOTH HANDS, jammed and exploded guns too, at a target up to <b>4 hexes</b> away. " +
          "It hits with an aim time of 2 plus your AIM points, and hurts on the striking table. The weapon lands on the target, or next to it on a miss, where anyone may pick it up.</p>",
      ],
      [
        "What does Strength do?",
        "<p><b>Strength</b> (2 points) is played just before a Throw, and goes with it. Pick one:</p>" +
          "<ul><li><b>+2 to the penalties</b>: each wound the throw gives is 2 worse;</li><li><b>+4 hexes of range</b>: up to 8 hexes.</li></ul>" +
          "<p>Strength and Throw take 4 of your 5 points.</p>",
      ],
    ],
  },
  {
    title: "Wounds",
    items: [
      [
        "I have a SERIOUS wound, what does it do?",
        "<p>It stays for the whole showdown: at the start of <b>every turn</b>, each SERIOUS point draws a fatigue card, which crosses off endurance boxes and adds as much delay. " +
          "At the end of the showdown, a card is drawn: its delay plus your SERIOUS points reaching 4 kills you.</p>" +
          "<p>Delay eats into the points you can plan with, and with more delay than endurance left at the end of two turns in a row you pass out.</p>",
      ],
    ],
  },
  {
    title: "Leaving the fight",
    items: [
      [
        "Can I run away?",
        "<p>Yes: move off the edge of the board (Advance, Run, Back Up, Sprint, even crawling). When picking a move at the edge, a gold arrow offers it. " +
          "You are out of the fight, nobody can shoot you any more, and it costs <b>−2 VP</b>, " +
          "where being killed costs −8, and surrendering −2 and −4 more when captured.</p>",
      ],
    ],
  },
];

let open: { root: HTMLDivElement; onKey: (e: KeyboardEvent) => void } | null = null;

/** Closes the FAQ, if it shows. */
export function closeFaqDialog(): void {
  if (!open) return;
  open.root.remove();
  document.removeEventListener("keydown", open.onKey);
  open = null;
}

/** Shows the FAQ. */
export function openFaqDialog(): void {
  closeFaqDialog();
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const root = document.createElement("div");
  root.className = "fq-back";
  root.innerHTML =
    '<section class="fq-dialog" role="dialog" aria-modal="true" aria-labelledby="fq-title">' +
    '<button type="button" class="fq-close" data-act="close" aria-label="Close">×</button>' +
    '<h2 id="fq-title" class="fq-title">Questions &amp; answers</h2><div class="fq-body">' +
    FAQ.map((g) => `<h3>${g.title}</h3>` + g.items.map(([q, a]) => `<details><summary>${q}</summary>${a}</details>`).join("")).join("") +
    "</div></section>";
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeFaqDialog();
    }
  };
  document.addEventListener("keydown", onKey);
  root.addEventListener("click", (e) => {
    if (e.target === root || (e.target as Element).closest('[data-act="close"]')) closeFaqDialog();
  });
  // Keep every pointer event on the dialog away from the game canvas
  // (Phaser listens on the window too: a click would reach the splash's buttons under it).
  for (const type of ["pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "touchstart", "touchend", "wheel"]) {
    root.addEventListener(type, (e) => e.stopPropagation(), { passive: type === "wheel" });
  }
  document.body.appendChild(root);
  open = { root, onKey };
  root.querySelector<HTMLButtonElement>(".fq-close")?.focus();
}
