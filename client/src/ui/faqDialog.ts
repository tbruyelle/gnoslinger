/**
 * The FAQ, in a dialog over the page: the questions players run into with
 * moving, delay, the guns, the shots, the throws, the wounds, winning and
 * the transactions, each a
 * <details> that opens on a click, grouped under headings. Opened from the
 * bottom bar of the lobby and of the game screen and its own address, #faq (BootScene);
 * the cross, a click outside or Esc closes it.
 */
import { countView } from "../analytics";

export const FAQ_HASH = "#faq";

const STYLE_ID = "fq-style";

const CSS = `
.fq-back{position:fixed;inset:0;z-index:600;background:rgba(30,22,24,.85);display:flex;align-items:center;justify-content:center;padding:32px 16px}
.fq-dialog{position:relative;width:min(1000px,100%);max-height:100%;display:flex;flex-direction:column;background:#F3E7CE;border:3px solid #2A1C14;border-radius:18px;box-shadow:inset 0 0 0 5px #F3E7CE,inset 0 0 0 7px #2A1C14,0 10px 0 #1E1618;padding:26px 14px 18px 26px;font-family:'Zilla Slab',Rockwell,Georgia,serif;color:#2A1C14}
.fq-title{margin:0 12px 12px 0;font-family:Rye,Georgia,serif;font-weight:400;font-size:30px;color:#33307F;border-bottom:3px solid #2A1C14;padding-bottom:8px}
.fq-search{margin:0 12px 6px 0;width:calc(100% - 12px);min-height:36px;padding:4px 12px;background:#FBF4E4;color:#2A1C14;border:2px solid #2A1C14;border-radius:10px;font-family:inherit;font-size:16px}
.fq-search:focus-visible{outline:3px solid #F2B544;outline-offset:2px}
.fq-body mark{background:#F2B544;color:inherit;border-radius:3px;padding:0 1px}
.fq-none{margin:14px 0;font-size:17px;font-style:italic;color:#5A4636}
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
    title: "Moving",
    items: [
      [
        "How do I move?",
        "<p><b>Advance</b> (2 points) and <b>Run</b> (1) move one hex ahead, ahead left or ahead right; <b>Back Up</b> (3) one hex back, back left or back right. " +
          "Your character keeps facing the same way: <b>Turn</b> (1) faces ahead left or ahead right, <b>Spin Around</b> (2) back left, back or back right.</p>",
      ],
      [
        "Why can't I play Run?",
        "<p>Run is played only with an <b>Advance</b> in the same plan, in any order. Advance then Run moves two hexes for 3 points.</p>",
      ],
      [
        "Why can't I play Sprint?",
        "<p>You must build up speed first: Sprint needs <b>Advance and Run in the same plan</b>, and a <b>Run played the turn before</b>. " +
          "Run this turn, and next turn Advance, Run and Sprint, once or twice (there are two Sprint cards).</p>" +
          "<p>Sprint costs only 1 point, but it goes <b>straight ahead</b>, and each one draws a <b>delay card</b>.</p>",
      ],
      [
        "How do I go down, and get up again?",
        "<p>Two cards flip your character between upright and <b>DOWN</b>, facing the same way:</p>" +
          "<ul><li><b>Get Up/Down</b> (3 points): slow, but free of delay;</li>" +
          "<li><b>Leap/Drop</b> (1 point): fast, but it draws <b>two delay cards</b>.</li></ul>" +
          "<p>Lying DOWN, only a bullseye hits you, and lying next to the horse trough hides you from anyone on its other side.</p>",
      ],
      [
        "Can I move while DOWN?",
        "<p>Yes, you crawl: Advance, Run and Back Up move you as usual, but each hex crawled gives <b>2 delay points</b>.</p>",
      ],
      [
        "What else gives delay when moving?",
        "<ul><li>ending a segment in a hex someone else stands in: a delay card each;</li>" +
          "<li>crossing the corral fence, or climbing onto or off the horse trough: two delay cards;</li>" +
          "<li>a LEG wound: fatigue cards for each hex moved upright.</li></ul>" +
          "<p>What delay does is in Delay, below.</p>",
      ],
    ],
  },
  {
    title: "Delay",
    items: [
      [
        "Where does delay come from?",
        "<p>From the cards drawn: a <b>delay card</b> gives the number on its DELAY line (moves: Sprint, Leap/Drop, the fence, a shared hex), " +
          "a <b>wound card</b> or a <b>fatigue card</b> gives delay too and crosses off endurance boxes (hits, SERIOUS and LEG wounds); crawling gives 2. " +
          "Some delay cards say something else: DROP throws you DOWN and draws three more, WILD SHOT fires every cocked gun.</p>",
      ],
      [
        "How does delay change my plan?",
        "<p>Each action goes off once the segments have reached its cost, plus the cost of the actions before it, <b>plus your delay</b>. " +
          "Delay taken during the turn pushes every action left later, from the next segment: an action pushed past segment 5 is <b>cancelled</b>.</p>" +
          "<p>Delay left at the end of the turn takes points off the next plan: you plan with <b>5 points minus your delay</b>. With 5 or more you cannot play anything, and the turn is passed for you.</p>",
      ],
      [
        "How does delay go away?",
        "<p>At the end of every turn, <b>half your delay goes</b>, rounded up: 5 becomes 2, 3 becomes 1, 1 becomes 0. Nothing else takes it off: a quiet turn gives it time to drop.</p>",
      ],
      [
        "Can delay make me lose the fight?",
        "<p>Yes: with <b>more delay than endurance boxes left</b> at the end of <b>two turns in a row</b>, your character <b>passes out</b>. " +
          "It is out of the fight, the enemy who hurt it most scores Knock out +1, and if an enemy holds the field you are captured, −4 VP. " +
          "Watch it once wounds have eaten your endurance: each hit and each fatigue card both take boxes off and add delay.</p>",
      ],
    ],
  },
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
          "<p>While picking a shot's target, the hover shows the chance to hit and to hit the bullseye (BE). " +
          "It leaves out the target's status, next question.</p>",
      ],
      [
        "Is a moving or lying target harder to hit?",
        "<p>Yes, often. The hit chart gives a first hit, then the card drawn may list <b>Target Status</b> entries, " +
          "which change it when the target qualifies (not every card lists them, so it is never sure):</p>" +
          "<ul><li><b>Move</b>: the target's plan holds any foot action this turn (a move, a turn, going up or down), " +
          "<b>from the start of the turn</b>, even before it is played, or a DROP threw it down;</li>" +
          "<li><b>Run</b>: its plan holds a Run this turn;</li>" +
          "<li><b>Down</b>: it is lying DOWN.</li></ul>" +
          "<p>Against Move or Run, a bullseye becomes the card's lesser hit and any other hit a miss; a runner has both (Run comes with an Advance), and a card listing both makes even its bullseye a miss. " +
          "Against Down, any hit but a bullseye misses.</p>" +
          "<p>Throws are read the same way. The resolution log says so: \"BE → ARM hit (target moved)\". " +
          "Standing still to shoot makes you an easier target.</p>",
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
        "My gun hand was hit, what does it change?",
        "<p>A hit on the gun hand (GUN on the hit chart) makes you <b>drop the weapon</b> in that hand, in your hex (a cocked gun goes off harmlessly), " +
          "and leaves a <b>GUN ARM</b> wound: from then on, every shot or throw from the GUN HAND or BOTH HANDS has that much less aim time, so it hits less often. " +
          "It also stuns you and gives a SERIOUS point.</p>" +
          "<p>Pick the gun up again with <b>Draw &amp; Cock</b>, it lies in your hex. Aiming longer makes up for the lost aim time.</p>",
      ],
      [
        "My other arm was hit, what does it change?",
        "<p>An ARM hit makes you drop what the other hand holds, and leaves an <b>OTHER ARM</b> wound: less aim time for a gun held in BOTH HANDS. " +
          "It also stuns you and gives a SERIOUS point.</p>",
      ],
      [
        "My leg was hit, what does it change?",
        "<p>A LEG hit staggers you (thrown into a hex nearby, DOWN) and leaves a <b>LEG</b> wound: for <b>every hex you move upright</b>, you draw that many fatigue cards, " +
          "each crossing off endurance boxes and adding delay. Moving gets costly: stay put, or crawl while DOWN (2 delay a hex, no fatigue). " +
          "It also stuns you and gives two SERIOUS points.</p>",
      ],
      [
        "Where do I see my wounds?",
        "<p>On your character sheet (click your token or your panel): the endurance boxes crossed off, and the wounds that stay, SERIOUS, GUN ARM, OTHER ARM and LEG, with what they cost.</p>",
      ],
      [
        "I have a SERIOUS wound, what does it do?",
        "<p>It stays for the whole showdown: at the start of <b>every turn</b>, each SERIOUS point draws a fatigue card, which crosses off endurance boxes and adds as much delay. " +
          "At the end of the showdown, a card is drawn: its delay plus your SERIOUS points reaching 4 kills you.</p>" +
          "<p>Delay eats into the points you can plan with, and with more delay than endurance left at the end of two turns in a row you pass out.</p>",
      ],
    ],
  },
  {
    title: "Winning and losing",
    items: [
      [
        "When does a showdown end?",
        "<p>When <b>one character is left</b> in the fight (the others killed, passed out, run away or surrendered), or at the end of the <b>last turn</b> (10 to 30, set when the showdown is called), whoever is still standing.</p>",
      ],
      [
        "How do I win?",
        "<p>Not by being the last one standing, but with the <b>most victory points</b> (VP) at the end. A tie for the most is a draw. " +
          "With a stake, the winner takes the pot, less 5 % for the house; a draw splits it between the tied players.</p>" +
          "<p>Your VP also add up in the ranking, Top guns in the lobby.</p>",
      ],
      [
        "What gives victory points?",
        "<p>During the showdown, on the turn it happens:</p>" +
          "<ul><li><b>Killed</b>: −8; the enemy whose shot killed you: <b>Kill enemy +2</b>, or +1 each when several kill you in the same segment;</li>" +
          "<li><b>Passed out</b>: 0; the enemy who crossed off most of your endurance: <b>Knock out enemy +1</b>;</li>" +
          "<li><b>Run away</b>: −2.</li></ul>" +
          "<p>At the end of the showdown:</p>" +
          "<ul><li>still in the fight: <b>Survive +2</b>, and <b>Hold the field +2</b> more when you are the only one;</li>" +
          "<li>surrendered or out of time: <b>Surrender −2</b>, and Knock out enemy +1 to whoever hurt you most;</li>" +
          "<li>passed out or surrendered while an enemy holds the field: <b>Captured −4</b>;</li>" +
          "<li>a SERIOUS wound may still kill you then, the Kill going to the enemy who gave you the most SERIOUS points.</li></ul>" +
          "<p>The log of each turn lists the points scored, and the final replay ends with everyone's.</p>",
      ],
      [
        "Can I run away?",
        "<p>Yes: move off the edge of the board (Advance, Run, Back Up, Sprint, even crawling). When picking a move at the edge, a gold arrow offers it. " +
          "You are out of the fight, nobody can shoot you any more, and it costs <b>−2 VP</b>: " +
          "better than being killed (−8), or surrendering and being captured (−6).</p>",
      ],
      [
        "Can I surrender?",
        "<p>Yes, with <b>Surrender</b> under your plan, at the start of a turn (not once the plans are being revealed). Your character is out of the fight; it scores as above.</p>",
      ],
      [
        "What if I do not play in time?",
        "<p>Each turn has a time limit. Past it, anyone may <b>call time</b>: a player who sent no plan passes the turn, and is out of the fight after <b>three missed turns in a row</b>, which counts as surrendering. " +
          "If nobody plays any more, the showdown ends with every stake given back.</p>",
      ],
    ],
  },
  {
    title: "Playing on the chain",
    items: [
      [
        "What do I need to play?",
        "<p>The <b>Adena</b> wallet, and an account on the chain the site plays on (Onyx, a gno.land testnet) holding some <b>GNOT</b>, " +
          "to pay the transactions and, if you play for one, the stake. Every move is a transaction: there is no game server, the chain holds the showdowns and plays the turns.</p>",
      ],
      [
        "Which transactions do I sign?",
        "<ul><li><b>Calling</b> a showdown, or <b>joining</b> one: once, with the stake if there is one;</li>" +
          "<li>each turn, <b>sending your plan</b>, then <b>revealing</b> it once everyone has sent theirs (below); the last player to send a plan sends it in the clear, in one go;</li>" +
          "<li>now and then: <b>call time</b> on late players, <b>surrender</b>, <b>cancel</b> a showdown nobody joined yet.</li></ul>",
      ],
      [
        "Why send my plan, then reveal it?",
        "<p>So that nobody sees your plan before playing theirs. Sending it puts on the chain only a fingerprint (a hash) of your plan, and a copy locked until shortly after the turn's deadline. " +
          "Once every plan is in, each is revealed, checked against its fingerprint, and the last reveal plays the turn.</p>" +
          "<p>The site reveals your plan by itself with auto-sign on (else press REVEAL). If you are gone, anyone can open your locked copy once its time comes and reveal it: the turn goes on without you.</p>",
      ],
      [
        "What does it cost?",
        "<p>Each transaction pays a small <b>fee</b> (a plan, about 0.03 GNOT), and a <b>storage deposit</b> for what it stores on the chain, which comes back when that is deleted. Roughly:</p>" +
          "<ul><li>calling a showdown: about 2 GNOT (1.7 once you have played before); joining: 0.7 the first time, then nothing;</li>" +
          "<li>a turn: about 0.2 GNOT, paid by the reveal that plays it;</li>" +
          "<li>cancelling a showdown gives its caller the deposit back.</li></ul>" +
          "<p>A stake is not a cost: the realm holds it, and pays it back to the winner, or to everyone if the showdown is cancelled.</p>",
      ],
      [
        "Can I play without a wallet popup on every move?",
        "<p>Yes: turn on <b>Auto-sign</b> in the lobby's top bar. You sign once, in Adena, a session for 1, 7 or 30 days with a daily spending limit; " +
          "the site then signs your moves itself, with a key kept in this browser that can only play Gnoslinger. Turn it off there at any time. " +
          "Stakes always go through Adena.</p>",
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
  countView("/faq");
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
    '<h2 id="fq-title" class="fq-title">Questions &amp; answers</h2>' +
    '<input type="search" class="fq-search" placeholder="Search: sprint, jammed, delay…" aria-label="Search the questions">' +
    '<div class="fq-body">' +
    FAQ.map((g) => `<section><h3>${g.title}</h3>` + g.items.map(([q, a]) => `<details><summary>${q}</summary>${a}</details>`).join("") + "</section>").join("") +
    '<p class="fq-none" hidden>No question matches.</p></div></section>';
  const search = root.querySelector<HTMLInputElement>(".fq-search")!;
  search.addEventListener("input", () => filterFaq(root, search.value));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeFaqDialog();
    }
  };
  document.addEventListener("keydown", onKey);
  // The keys typed in the search stay there too (Phaser's keyboard listens on the window);
  // Esc still closes the dialog.
  for (const type of ["keydown", "keyup"]) {
    root.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === "keydown" && (e as KeyboardEvent).key === "Escape") closeFaqDialog();
    });
  }
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
  search.focus();
}

/**
 * Shows only the questions whose question or answer holds every word of the
 * query, opened, and the headings with one left; an empty query shows them
 * all, closed. The words found are marked in the questions shown.
 */
function filterFaq(root: HTMLElement, query: string): void {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  let any = false;
  for (const group of Array.from(root.querySelectorAll<HTMLElement>(".fq-body section"))) {
    let shown = 0;
    for (const item of Array.from(group.querySelectorAll<HTMLDetailsElement>("details"))) {
      // Back to the text as written, without the marks of the previous search.
      const html = (item.dataset.html ??= item.innerHTML);
      item.innerHTML = html;
      const text = (item.textContent ?? "").toLowerCase();
      const match = words.every((w) => text.includes(w));
      if (match && words.length) markWords(item, words);
      item.hidden = !match;
      item.open = match && words.length > 0;
      if (match) shown++;
    }
    group.hidden = shown === 0;
    if (shown) any = true;
  }
  root.querySelector<HTMLElement>(".fq-none")!.hidden = any;
}

/** Wraps every occurrence of the words in the element's text in a <mark>. */
function markWords(el: HTMLElement, words: string[]): void {
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const text = node.data;
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      frag.append(text.slice(last, m.index));
      const mark = document.createElement("mark");
      mark.textContent = m[0];
      frag.append(mark);
      last = m.index + m[0].length;
    }
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
}
