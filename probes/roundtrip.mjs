// Round-trip proof: synthesize text with the TTS endpoint, then transcribe the
// resulting audio with AssemblyAI's OWN speech-to-text and compare. Divergence
// is objective evidence that the TTS did not say what was written — no listening
// required. Raw STT (punctuate/format off) so we see the words actually spoken.
import { connect, sleep } from "./lib.mjs";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
const KEY = process.env.ASSEMBLYAI_API_KEY;
const API = "https://api.assemblyai.com/v2";
const H = { Authorization: KEY };
mkdirSync(new URL("../evidence/wav/", import.meta.url), { recursive: true });

function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function synthToWav(text, path) {
  const api = connect({ query: { voice: "jane" } });
  await api.open(); await api.waitFor("Begin");
  const pcm = [];
  const grab = api.ws.onmessage;
  api.ws.onmessage = (e) => { if (typeof e.data === "string") { try { const m = JSON.parse(e.data); if (m.type === "Audio" && m.audio) pcm.push(Buffer.from(m.audio, "base64")); } catch {} } grab(e); };
  api.gen(text); api.flush();
  await api.waitFor("FlushDone", 15000);
  await sleep(300);
  api.terminate(); await Promise.race([api.closed, sleep(2000)]);
  writeFileSync(path, wav(Buffer.concat(pcm)));
}

async function transcribe(wavPath) {
  const up = await fetch(`${API}/upload`, { method: "POST", headers: { ...H, "content-type": "application/octet-stream" }, body: readFileSync(wavPath) });
  if (!up.ok) throw new Error(`upload ${up.status}: ${await up.text()}`);
  const { upload_url } = await up.json();
  const cr = await fetch(`${API}/transcript`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ audio_url: upload_url, punctuate: false, format_text: false }) });
  if (!cr.ok) throw new Error(`transcript ${cr.status}: ${await cr.text()}`);
  const { id } = await cr.json();
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const r = await (await fetch(`${API}/transcript/${id}`, { headers: H })).json();
    if (r.status === "completed") return r.text ?? "";
    if (r.status === "error") throw new Error("stt error: " + r.error);
  }
  throw new Error("stt timeout");
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const CASES = [
  ["control_prose", "The quick brown fox jumps over the lazy dog near the river bank."],
  ["otp_currency", "Your OTP is 4096 and your balance is $1,234.56."],
  ["email_time", "Email me at test.user+tag@sub.example.co.uk by 5:30 PM."],
  ["phone_url", "Call +1 (415) 555-0137 or visit https://assemblyai.com/docs."],
  ["date_abbrev", "The meeting is on 10/11/2026 re: Q4 — see fig. 2(a)."],
  ["indian_units", "He paid Rs 2,00,000 for 3kg at 25 degrees C."],
  ["symbols", "AI/ML & R&D cost ~50%, didn't it? Section 3.1(b)."],
];

const rows = [];
for (const [id, text] of CASES) {
  const path = new URL(`../evidence/wav/${id}.wav`, import.meta.url);
  if (!existsSync(path)) { try { await synthToWav(text, path); await sleep(4000); } catch (e) { console.log(id, "synth failed", e.message); continue; } }
  let stt; try { stt = await transcribe(path); } catch (e) { stt = "<" + e.message + ">"; }
  rows.push([id, text, stt]);
  console.log(`\n[${id}]`);
  console.log(`  TEXT : ${text}`);
  console.log(`  STT  : ${stt}`);
}

// Markdown evidence table.
let md = "# Round-trip evidence (TTS → AssemblyAI STT)\n\n";
md += "Raw STT (`punctuate:false, format_text:false`) of the TTS output. A faithful\n";
md += "TTS makes the control transcribe cleanly; structured tokens below are where\n";
md += "the spoken form diverges from the text.\n\n";
md += "| case | input text | what AssemblyAI STT heard in the TTS audio |\n|---|---|---|\n";
for (const [id, text, stt] of rows) md += `| \`${id}\` | ${text.replace(/\|/g, "\\|")} | ${String(stt).replace(/\|/g, "\\|")} |\n`;
writeFileSync(new URL("../evidence/roundtrip.md", import.meta.url), md);
console.log("\nwrote evidence/roundtrip.md");
process.exit(0);
