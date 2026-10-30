/**
 * The narration spoken by Kokoro (kokoro-js, the 82M ONNX model fetched from
 * Hugging Face on first use, run on the CPU): one WAV per line of script.ts
 * in public/voice/, and their durations in src/voice.json, which the
 * timeline is cut to.
 *
 *   npx tsx voice/say.ts
 */
import { KokoroTTS } from "kokoro-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LINES, VOICE } from "../script";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "voice");

await mkdir(OUT, { recursive: true });
const t0 = Date.now();
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
console.log(`model loaded in ${Date.now() - t0} ms`);
const durations: Record<string, number> = {};
for (const line of LINES) {
  const t1 = Date.now();
  const audio = await tts.generate(line.text, { voice: VOICE });
  await audio.save(path.join(OUT, `${line.id}.wav`));
  durations[line.id] = audio.audio.length / audio.sampling_rate;
  console.log(`${line.id}: ${durations[line.id].toFixed(2)} s (${Date.now() - t1} ms)`);
}
await writeFile(path.join(ROOT, "src", "voice.json"), JSON.stringify(durations, null, 2) + "\n");
console.log("src/voice.json written");
