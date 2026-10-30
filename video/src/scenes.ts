import voice from "./voice.json";

/**
 * The cut: each scene a span of a recorded clip (public/clips, seconds, the
 * moments from footage/marks.json), its caption, and the narration line
 * that starts with it (script.ts), spoken from voiceAt seconds into the
 * scene. A line longer than the scenes it covers (voiceScenes, 1 by
 * default) stretches the last of them, the clip playing on.
 */
export interface Scene {
  id: string;
  clip?: string;
  from: number;
  to: number;
  caption: string;
  voice?: string;
  voiceAt?: number;
  voiceScenes?: number;
  /** Sound effects: a file of public/ at a second of the scene. */
  sfx?: { file: string; at: number; volume?: number }[];
  /** The footage's speed (1 by default): a long span over a short line. */
  rate?: number;
  /** Where the caption band's centre sits, in px from the top; at the bottom by default (over the hand on the game screen: the planning scenes put it on the board's empty lower part). */
  captionY?: number;
}

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
/** Silence after a line before the next scene. */
const TAIL = 0.6;

export const SCENES: Scene[] = [
  { id: "intro", clip: "01-call", from: 0, to: 10.2, voice: "intro", voiceAt: 1.2, caption: "The 1982 Avalon Hill gunfight, on the gno.land chain" },
  { id: "lobby", clip: "01-call", from: 10.2, to: 19.9, voice: "lobby", caption: "Call a showdown: players, turns, time per turn, a stake" },
  { id: "setup", clip: "01-call", from: 19.9, to: 32.5, voice: "setup", rate: 1.25, caption: "Take position, sign with Adena" },
  { id: "join", clip: "02-join", from: 0, to: 15.5, voice: "join", rate: 1.4, caption: "A friend joins from the link" },
  { id: "cards", clip: "03-plan-1", from: 3.0, to: 15.8, voice: "cards", caption: "Five segments a turn: pick your action cards", captionY: 740 },
  { id: "send", clip: "03-plan-1", from: 15.8, to: 22.0, voice: "hidden", voiceScenes: 2, caption: "Plans are hidden: a hash on chain, revealed together", captionY: 740 },
  { id: "reveal", clip: "05-reveal-1", from: 0, to: 4.3, caption: "Plans are hidden: a hash on chain, revealed together", captionY: 740 },
  { id: "turn", clip: "05-reveal-1", from: 4.3, to: 16.5, voice: "turn", caption: "The turn plays out, segment by segment" },
  { id: "shots", clip: "08-reveal-2", from: 4.3, to: 21.5, voice: "shots", voiceAt: 8.0, caption: "Aim time 7, range 2: a VITAL hit", sfx: [{ file: "gunshot.wav", at: 10.4, volume: 0.9 }] },
  { id: "end", clip: "09-end", from: 0, to: 18.0, voice: "end", rate: 1.4, caption: "Victory points, the pot, the ranking, the replay" },
  { id: "outro", from: 0, to: 6.5, voice: "outro", voiceAt: 0.8, caption: "" },
];

export interface Cut extends Scene {
  /** Where the scene starts on the timeline and how long it lasts, in frames. */
  start: number;
  frames: number;
}

/** The scenes laid end to end, stretched to their narration. */
export function timeline(): Cut[] {
  const spans = SCENES.map((s) => ({ from: s.from, to: s.to }));
  const length = (i: number) => (spans[i].to - spans[i].from) / (SCENES[i].rate ?? 1);
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i];
    if (!s.voice) continue;
    const n = s.voiceScenes ?? 1;
    const group = Array.from({ length: n }, (_, k) => length(i + k)).reduce((sum, g) => sum + g, 0);
    const want = (s.voiceAt ?? 0) + (voice as Record<string, number>)[s.voice] + TAIL;
    if (want <= group) continue;
    // The last scene of the group takes the time the line needs beyond the footage, its clip playing on;
    // the next scene, when it carries that clip on, starts where this one now ends rather than jumping back.
    const last = i + n - 1;
    const extra = (want - group) * (SCENES[last].rate ?? 1);
    spans[last].to += extra;
    const next = last + 1;
    if (next < SCENES.length && SCENES[next].clip === SCENES[last].clip && SCENES[next].from === SCENES[last].to) {
      spans[next].from = Math.min(spans[last].to, spans[next].to - 1);
    }
  }
  const cuts: Cut[] = [];
  let start = 0;
  SCENES.forEach((s, i) => {
    const frames = Math.round(length(i) * FPS);
    cuts.push({ ...s, from: spans[i].from, to: spans[i].to, start, frames });
    start += frames;
  });
  return cuts;
}

export function totalFrames(): number {
  const cuts = timeline();
  const last = cuts[cuts.length - 1];
  return last.start + last.frames;
}
