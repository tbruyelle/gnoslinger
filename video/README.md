# The marketing video

The footage is the real app, recorded with Playwright on a local gno chain.
The captions, the cards and the cut are code, in Remotion. The voice is
Kokoro, an open-source text-to-speech model run on the CPU. Nothing is
staged by hand: a run records a whole showdown, from the splash to the
ranking, and the cut follows what the cards decided.

```
npm install --ignore-scripts   # sharp (pulled in by Kokoro) fails its install script on this Node; it still loads
npx playwright install chromium
./record.sh        # a gnodev on :36657, the client built against it on :5175, Playwright: footage/, public/clips/
npm run voice      # Kokoro says script.ts into public/voice/, durations in src/voice.json
npm run studio     # Remotion Studio, to look at the cut
npm run render     # out/gnoslinger.mp4
```

`make video-record`, `make video-voice` and `make video-render` at the
repository's root do the same.

## How it is made

- **`record/record.ts`** drives the client in two browser contexts, one per
  player, each recorded to `footage/<clip>.webm`, and notes the moments
  worth cutting to in `footage/marks.json` (seconds from the clip's start).
  The wallet is a stand-in for Adena injected in the page: every
  `DoContract` goes through `gnokey maketx call`, signed by the player's
  key of `keys/` (two keys the script makes, with an empty password) and
  broadcast to the recording's own chain. The splash's button is found on a
  screenshot (the only wide run of parchment low on the page), the board's
  hexes by the game screen's own layout maths, and everything else by the
  overlays' `data-` attributes. The plans are in `TURNS`: both draw and
  aim, then the Marshal aims twice and shoots while the Kid holds, then the
  Kid shoots back; the clips follow whatever the result deck draws (a game
  over ends the loop, else the Kid surrenders), so the cut in
  `src/scenes.ts` is written for one recording and looked at again after
  another. `FROM=<clip>` resumes a run from a clip on a chain left as it
  was: the browsers' storage (the pending reveals' salts, the turns played
  back) is saved after every clip in `footage/state-<key>.json`.
- **`script.ts`** is the narration, one line per scene; **`voice/say.ts`**
  has Kokoro say it (`am_michael`; the model, 82M parameters, is fetched
  from Hugging Face on first use).
- **`src/scenes.ts`** is the cut: each scene a span of a clip, its caption
  and its line; a line longer than its footage stretches the scene, the
  clip playing on, and the next scene of the same clip starts where it
  ended instead of jumping back. **`src/Video.tsx`** draws it: the
  footage, the caption band in the game's palette and fonts, the voice,
  the splash's music low under it, a gunshot at the shot, the last card.

The footage, the voice and the render are not committed (`.gitignore`):
they are made again by the three commands.
