import { connect, fmt, sleep } from "./lib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync(new URL("../evidence/wav/", import.meta.url), { recursive: true });

// C5: confirm voice cloning session OPENS (voice_clone=true, no voice). We send
// NO reference clip — this only maps the surface, it does not clone any voice.
async function c5() {
  const api = connect({ query: { voice_clone: "true" } });
  await api.open();
  const b = await api.waitFor((f) => ["Begin", "Error", "_close"].includes(f.type), 6000);
  console.log("\n--- C5 voice_clone=true (no voice, no clip) ---");
  console.log("  " + fmt(b ?? { t: 0, type: "none" }));
  api.terminate(); await Promise.race([api.closed, sleep(2000)]);
}

// Wrap mono 16-bit PCM @ rate into a .wav container.
function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const CASES = [
  ["otp_currency", "Your OTP is 4096 and your balance is $1,234.56."],
  ["email_time", "Email me at test.user+tag@sub.example.co.uk by 5:30 PM."],
  ["phone_url", "Call +1 (415) 555-0137 or visit https://assemblyai.com/docs."],
  ["date_abbrev", "The meeting is on 10/11/2026 re: Q4 — see fig. 2(a)."],
  ["indian_units", "He paid Rs 2,00,000 for 3kg at 25 degrees C."],
  ["symbols", "AI/ML & R&D cost ~50%, didn't it? Section 3.1(b)."],
];

async function synth(id, text) {
  const api = connect({ query: { voice: "jane" } });
  await api.open(); await api.waitFor("Begin");
  const pcm = [];
  const grab = api.ws.onmessage;
  api.ws.onmessage = (e) => { if (typeof e.data === "string") { try { const m = JSON.parse(e.data); if (m.type === "Audio" && m.audio) pcm.push(Buffer.from(m.audio, "base64")); } catch {} } grab(e); };
  api.gen(text); api.flush();
  const fd = await api.waitFor("FlushDone", 12000);
  const wb = api.frames.find((f) => f.type === "WordBoundaries");
  await sleep(300);
  api.terminate(); await Promise.race([api.closed, sleep(2000)]);
  const buf = Buffer.concat(pcm);
  const path = new URL(`../evidence/wav/${id}.wav`, import.meta.url);
  writeFileSync(path, wav(buf));
  const words = (wb?.words || []).map((w) => w.word);
  const minConf = Math.min(1, ...(wb?.words || []).map((w) => w.confidence ?? 1));
  console.log(`\n[${id}] "${text}"`);
  console.log(`  audio_ms=${fd?.audio_duration_ms}  pcm=${buf.length}B (${(buf.length / 48000).toFixed(2)}s)  min_word_conf=${minConf.toFixed(2)}`);
  console.log(`  WordBoundaries tokens: ${JSON.stringify(words)}`);
}

await c5();
await sleep(6000);
console.log("\n######## BATTERY E — normalization / 'does it say what's written' ########");
for (const [id, text] of CASES) {
  try { await synth(id, text); } catch (e) { console.log(id, "THREW", e.message); }
  await sleep(6000);
}
console.log("\nWAVs written to evidence/wav/ — listen to confirm spoken form vs text.");
process.exit(0);
