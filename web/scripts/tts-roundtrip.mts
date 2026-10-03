/**
 * Generate spoken sample lines (one MP3 per language) with ElevenLabs TTS, then
 * transcribe each file back with Scribe to check the ASR hears it the way the
 * agent would. Samples come from ../agents/tts-samples.json; MP3s land next to it.
 *
 *   npm run tts-roundtrip            # all samples
 *   npm run tts-roundtrip -- <id>    # one sample
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// { "voiceId": "...", "samples": [{ "id": "...", "texts": { "en": "...", "de": "..." } }] }
type Samples = { voiceId: string; samples: { id: string; texts: Record<string, string> }[] };

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const samplesPath = resolve(webDir, "..", "agents", "tts-samples.json");
const outDir = resolve(dirname(samplesPath), "tts-out");
const envPath = join(webDir, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

if (!existsSync(samplesPath)) {
  console.error(`Missing ${samplesPath} (copy tts-samples.example.json)`);
  process.exit(1);
}
const { voiceId, samples }: Samples = JSON.parse(readFileSync(samplesPath, "utf8"));
const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });
const only = process.argv[2];

mkdirSync(outDir, { recursive: true });

for (const s of samples) {
  if (only && s.id !== only) continue;
  console.log(`\n▸ ${s.id}`);
  for (const [lang, text] of Object.entries(s.texts)) {
    const file = join(outDir, `${s.id}.${lang}.mp3`);
    // flash v2.5 + explicit languageCode: multilingual_v2 guessed some languages'
    // pronunciation badly enough that Scribe misheard it (round-trip check below)
    const stream = await client.textToSpeech.convert(voiceId, {
      text,
      modelId: "eleven_flash_v2_5",
      languageCode: lang,
      outputFormat: "mp3_44100_128",
    });
    const audio = Buffer.from(await new Response(stream).arrayBuffer());
    writeFileSync(file, audio);

    const stt = await client.speechToText.convert({
      modelId: "scribe_v2",
      file: new File([audio], `${s.id}.${lang}.mp3`, { type: "audio/mpeg" }),
    });
    const heard = "text" in stt ? stt.text : "(no transcript)";
    const detected =
      "languageCode" in stt ? `${stt.languageCode} ${(stt.languageProbability * 100).toFixed(0)}%` : "?";
    console.log(`  ${lang}  ${(audio.length / 1024).toFixed(0)} KB  ${file.replace(outDir + "/", "")}`);
    console.log(`      said:  ${text}`);
    console.log(`      heard: ${heard}   [${detected}]`);
  }
}
