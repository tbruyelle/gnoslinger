/**
 * The narration, one line per scene (src/scenes.ts names them): what Kokoro
 * says (voice/say.ts, into public/voice/<id>.wav and src/voice.json, the
 * durations the timeline is cut to).
 */
export interface Line {
  id: string;
  text: string;
}

export const LINES: Line[] = [
  { id: "intro", text: "Gnoslinger brings Gunslinger, the 1982 Avalon Hill gunfight, to the gno.land chain. No game server: a Gno realm holds every showdown and settles every turn." },
  { id: "lobby", text: "Call a showdown from the lobby: two to four players, ten to thirty turns, days to play each one, and a stake in GNOT if you dare." },
  { id: "setup", text: "Take position in the corral, and sign the call with your Adena wallet." },
  { id: "join", text: "Share the link. A friend opens it, connects, takes the other seat, and the showdown begins. The stakes wait in the pot." },
  { id: "cards", text: "Each turn is two seconds of the fight, in five segments. Pick up to five time points of action cards, in secret: draw and cock, aim, shoot, move, duck, throw." },
  { id: "hidden", text: "Your plan goes on chain as a hash, with a copy timelocked to drand. Once every plan is committed, they are revealed. Nobody plays with your cards in view." },
  { id: "turn", text: "Then the turn plays out, segment by segment: shots first, moves after, and the result deck decides every hit, every wound, every delay." },
  { id: "shots", text: "Aim time seven, range two. Fire! A vital hit. The Kid is down." },
  { id: "end", text: "Victory points, the pot paid to the winner, a ranking kept across showdowns, and a replay anyone can watch, forever." },
  { id: "outro", text: "Gnoslinger. Open source, live on Onyx. Draw, partner." },
];

/** The voice (kokoro-js names): an American male, for the Old West. */
export const VOICE = "am_michael";
