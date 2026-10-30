import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadRye } from "@remotion/google-fonts/Rye";
import { loadFont as loadZilla } from "@remotion/google-fonts/ZillaSlab";
import { FPS, timeline, totalFrames, type Cut } from "./scenes";

const rye = loadRye("normal", { weights: ["400"], subsets: ["latin"] });
const zilla = loadZilla("normal", { weights: ["500", "700"], subsets: ["latin"] });

// The game's palette (AGENTS.md, Design).
const GROUND = "#1E1618";
const INK = "#2A1C14";
const PARCHMENT = "#F3E7CE";
const CREAM = "#FBF4E4";
const BRICK = "#B5482A";
const GOLD = "#F2B544";

/** A scene's footage, fading in over its first frames. */
const Footage: React.FC<{ cut: Cut }> = ({ cut }) => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: GROUND, opacity: fade }}>
      {cut.clip ? <OffthreadVideo src={staticFile(`clips/${cut.clip}.mp4`)} startFrom={Math.round(cut.from * FPS)} playbackRate={cut.rate ?? 1} muted /> : null}
    </AbsoluteFill>
  );
};

/** The caption: a parchment band at the bottom, sliding up as the scene starts. */
const Caption: React.FC<{ text: string; y?: number }> = ({ text, y }) => {
  const frame = useCurrentFrame();
  const up = interpolate(frame, [4, 18], [40, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const alpha = interpolate(frame, [4, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (!text) return null;
  return (
    <AbsoluteFill style={y === undefined ? { justifyContent: "flex-end", alignItems: "center", paddingBottom: 54 } : { justifyContent: "flex-start", alignItems: "center", paddingTop: y - 40 }}>
      <div
        style={{
          transform: `translateY(${up}px)`,
          opacity: alpha,
          background: PARCHMENT,
          color: INK,
          border: `4px solid ${INK}`,
          boxShadow: `0 0 0 4px ${BRICK}, 0 10px 0 4px #8E2F1A`,
          borderRadius: 16,
          padding: "14px 34px",
          fontFamily: zilla.fontFamily,
          fontWeight: 700,
          fontSize: 40,
          letterSpacing: 0.3,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

/** The last card: the name, where to play, the icon. */
const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const inAlpha = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, 30], [0.92, 1], { extrapolateRight: "clamp" });
  const out = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ background: GROUND, justifyContent: "center", alignItems: "center", opacity: inAlpha * out }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, transform: `scale(${scale})` }}>
        <Img src={staticFile("icon.png")} style={{ width: 200, height: 200 }} />
        <div style={{ fontFamily: rye.fontFamily, fontSize: 120, color: PARCHMENT, letterSpacing: 6 }}>GNOSLINGER</div>
        <div style={{ fontFamily: zilla.fontFamily, fontWeight: 700, fontSize: 54, color: GOLD }}>gnoslinger.xyz</div>
        <div style={{ fontFamily: zilla.fontFamily, fontWeight: 500, fontStyle: "italic", fontSize: 34, color: CREAM, opacity: 0.85 }}>
          Open source · github.com/tbruyelle/gnoslinger · live on Onyx
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Video: React.FC = () => {
  const cuts = timeline();
  const total = totalFrames();
  const frame = useCurrentFrame();
  // The music under the voice, fading out at the end.
  const music = interpolate(frame, [0, 60, total - 90, total], [0, 0.14, 0.14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: GROUND }}>
      <Audio src={staticFile("music.mp3")} volume={music} loop />
      {cuts.map((cut) => (
        <Sequence key={cut.id} from={cut.start} durationInFrames={cut.frames} name={cut.id}>
          {cut.id === "outro" ? <Outro /> : <Footage cut={cut} />}
          <Caption text={cut.caption} y={cut.captionY} />
          {cut.sfx?.map((s, i) => (
            <Sequence key={i} from={Math.round(s.at * FPS)}>
              <Audio src={staticFile(s.file)} volume={s.volume ?? 1} />
            </Sequence>
          ))}
        </Sequence>
      ))}
      {cuts
        .filter((c) => c.voice)
        .map((c) => (
          <Sequence key={`voice-${c.id}`} from={c.start + Math.round((c.voiceAt ?? 0) * FPS)} name={`voice ${c.voice}`}>
            <Audio src={staticFile(`voice/${c.voice}.wav`)} />
          </Sequence>
        ))}
    </AbsoluteFill>
  );
};
