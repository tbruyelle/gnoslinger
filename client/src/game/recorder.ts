import Phaser from "phaser";
import { ArrayBufferTarget, Muxer } from "webm-muxer";

/** A part of the game canvas, in the game's coordinates. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A recording in progress: stop gives the video (WebM). */
export interface Recording {
  stop(): Promise<Blob>;
  /** Drops the recording. */
  cancel(): void;
}

const FPS = 30;
const VIDEO_BITRATE = 4_000_000;
const KEYFRAME_MS = 2000;
const SAMPLE_RATE = 48000;
const AUDIO_BITRATE = 128_000;
/** Frames waiting in the encoder past which a frame is skipped rather than queued. */
const MAX_QUEUE = 5;

/** Whether this browser can record the board (WebCodecs and an offline audio context). */
export function canRecord(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof AudioEncoder !== "undefined" && typeof OfflineAudioContext !== "undefined";
}

/** A sound played while recording, at its time from the start. */
interface Cue {
  key: string;
  volume: number;
  ms: number;
}

/**
 * Records a part of the game canvas (the board's cell, rect, read again on
 * every frame) with the game's sounds, in the browser, on one clock: each
 * frame Phaser renders is encoded with the time it was rendered (WebCodecs),
 * each sound played is noted with the time it was played, and once stopped
 * the sounds are mixed at those times (OfflineAudioContext) and both are
 * written to a WebM file. MediaRecorder timed the picture and the sound
 * apart, which drifted by hundreds of milliseconds whenever the page was
 * busy.
 */
export async function startRecording(game: Phaser.Game, rect: () => Rect): Promise<Recording> {
  const src = game.canvas;
  // The game's coordinates are CSS pixels; the canvas may have more.
  const scale = () => src.width / (src.clientWidth || src.width);
  const r0 = rect();
  const even = (n: number) => Math.max(2, Math.round((n * scale()) / 2) * 2);
  const out = document.createElement("canvas");
  out.width = even(r0.w);
  out.height = even(r0.h);
  const ctx = out.getContext("2d")!;

  const base = { width: out.width, height: out.height, bitrate: VIDEO_BITRATE, framerate: FPS };
  const vp9 = { ...base, codec: "vp09.00.10.08" };
  const useVp9 = (await VideoEncoder.isConfigSupported(vp9)).supported;
  const videoConfig = useVp9 ? vp9 : { ...base, codec: "vp8" };
  if (!useVp9 && !(await VideoEncoder.isConfigSupported(videoConfig)).supported) throw new Error("this browser cannot encode VP8 or VP9 video");
  const audioConfig = { codec: "opus", sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: AUDIO_BITRATE };
  if (!(await AudioEncoder.isConfigSupported(audioConfig)).supported) throw new Error("this browser cannot encode Opus audio");

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: useVp9 ? "V_VP9" : "V_VP8", width: out.width, height: out.height, frameRate: FPS },
    audio: { codec: "A_OPUS", numberOfChannels: 2, sampleRate: SAMPLE_RATE },
    firstTimestampBehavior: "offset",
  });
  let failure: unknown = null;
  const video = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure ??= e) });
  video.configure(videoConfig);

  const t0 = performance.now();
  let lastFrame = -Infinity;
  let lastKey = -Infinity;
  const frame = () => {
    const ms = performance.now() - t0;
    // At most FPS frames a second, and none while the encoder lags behind.
    if (ms - lastFrame < 1000 / FPS - 2 || video.encodeQueueSize > MAX_QUEUE || video.state !== "configured") return;
    lastFrame = ms;
    const r = rect();
    const k = scale();
    ctx.fillStyle = "#1a1008";
    ctx.fillRect(0, 0, out.width, out.height);
    // Fitted in the frame, keeping its proportions, should the window change size.
    const fit = Math.min(out.width / (r.w * k), out.height / (r.h * k));
    const w = r.w * k * fit;
    const h = r.h * k * fit;
    // Right after rendering: a WebGL canvas still holds the frame.
    ctx.drawImage(src, r.x * k, r.y * k, r.w * k, r.h * k, (out.width - w) / 2, (out.height - h) / 2, w, h);
    const f = new VideoFrame(out, { timestamp: Math.round(ms * 1000) });
    const key = ms - lastKey >= KEYFRAME_MS;
    if (key) lastKey = ms;
    video.encode(f, { keyFrame: key });
    f.close();
  };
  game.events.on(Phaser.Core.Events.POST_RENDER, frame);

  // The sounds: every play of the sound manager is noted, on the frames' clock.
  const cues: Cue[] = [];
  const sound = game.sound;
  const play = sound.play;
  sound.play = function (this: Phaser.Sound.BaseSoundManager, key: string, extra?: Phaser.Types.Sound.SoundConfig | Phaser.Types.Sound.SoundMarker) {
    cues.push({ key, volume: (extra as Phaser.Types.Sound.SoundConfig | undefined)?.volume ?? 1, ms: performance.now() - t0 });
    return play.call(this, key, extra);
  };

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    game.events.off(Phaser.Core.Events.POST_RENDER, frame);
    sound.play = play;
  };

  return {
    async stop() {
      const end = performance.now() - t0;
      release();
      await video.flush();
      video.close();
      await encodeAudio(game, cues, end, audioConfig, muxer, (e) => (failure ??= e));
      if (failure) throw failure;
      muxer.finalize();
      return new Blob([muxer.target.buffer], { type: "video/webm" });
    },
    cancel() {
      release();
      if (video.state !== "closed") video.close();
    },
  };
}

/** Mixes the sounds at their times over the video's length and adds them to the file, encoded in Opus. */
async function encodeAudio(game: Phaser.Game, cues: Cue[], endMs: number, config: AudioEncoderConfig, muxer: Muxer<ArrayBufferTarget>, onError: (e: unknown) => void) {
  const length = Math.max(1, Math.ceil((endMs / 1000) * SAMPLE_RATE));
  const mix = new OfflineAudioContext(2, length, SAMPLE_RATE);
  for (const cue of cues) {
    const buffer = game.cache.audio.get(cue.key);
    if (!(buffer instanceof AudioBuffer)) continue;
    const source = mix.createBufferSource();
    source.buffer = buffer;
    const gain = mix.createGain();
    gain.gain.value = cue.volume;
    source.connect(gain).connect(mix.destination);
    source.start(cue.ms / 1000);
  }
  const rendered = await mix.startRendering();

  const encoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: onError });
  encoder.configure(config);
  const left = rendered.getChannelData(0);
  const right = rendered.getChannelData(1);
  const block = SAMPLE_RATE / 10;
  for (let i = 0; i < length; i += block) {
    const n = Math.min(block, length - i);
    const data = new Float32Array(n * 2);
    data.set(left.subarray(i, i + n), 0);
    data.set(right.subarray(i, i + n), n);
    const a = new AudioData({ format: "f32-planar", sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SAMPLE_RATE) * 1e6), data });
    encoder.encode(a);
    a.close();
  }
  await encoder.flush();
  encoder.close();
}

/** Hands the browser a file to save. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
