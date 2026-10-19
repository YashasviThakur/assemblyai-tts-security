// Isolate the number-reading data-loss: is Indian lakh/crore grouping (2,00,000)
// the trigger vs Western grouping / no grouping? Round-trip each through STT.
import { connect, sleep } from "./lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const KEY = process.env.ASSEMBLYAI_API_KEY;
const API = "https://api.assemblyai.com/v2";
const H = { Authorization: KEY };

function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function synth(text, path) {
  let api, tries = 0;
  while (true) {
    api = connect({ query: { voice: "jane" } }); await api.open();
    const b = await api.waitFor((f) => ["Begin", "Error", "_close"].includes(f.type), 6000);
    if (b?.type !== "Begin" && tries++ < 2) { try { api.ws.close(); } catch {} await sleep(30000); continue; }
    break;
  }
  const pcm = []; const grab = api.ws.onmessage;
  api.ws.onmessage = (e) => { if (typeof e.data === "string") { try { const m = JSON.parse(e.data); if (m.type === "Audio" && m.audio) pcm.push(Buffer.from(m.audio, "base64")); } catch {} } grab(e); };
  api.gen(text); api.flush(); await api.waitFor("FlushDone", 15000); await sleep(300);
  api.terminate(); await Promise.race([api.closed, sleep(2000)]);
  writeFileSync(path, wav(Buffer.concat(pcm)));
}
async function stt(path) {
  const up = await fetch(`${API}/upload`, { method: "POST", headers: { ...H, "content-type": "application/octet-stream" }, body: readFileSync(path) });
  const { upload_url } = await up.json();
  const { id } = await (await fetch(`${API}/transcript`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ audio_url: upload_url, punctuate: false, format_text: false }) })).json();
  for (let i = 0; i < 40; i++) { await sleep(1500); const r = await (await fetch(`${API}/transcript/${id}`, { headers: H })).json(); if (r.status === "completed") return r.text; if (r.status === "error") return "<err:" + r.error + ">"; }
  return "<timeout>";
}

const CASES = [
  ["num_indian_lakh", "He paid 2,00,000 rupees."],       // Indian grouping, 200000
  ["num_western", "He paid 200,000 rupees."],            // Western grouping, 200000
  ["num_plain", "He paid 200000 rupees."],               // no grouping, 200000
  ["num_indian_crore", "He paid 1,50,00,000 rupees."],   // Indian crore grouping, 15000000
  ["num_western_big", "He paid 15,000,000 rupees."],     // Western grouping, 15000000
];
const rows = [];
for (const [id, text] of CASES) {
  const path = new URL(`../evidence/wav/${id}.wav`, import.meta.url);
  try { await synth(text, path); await sleep(3000); } catch (e) { console.log(id, "synth fail", e.message); continue; }
  let t; try { t = await stt(path); } catch (e) { t = "<" + e.message + ">"; }
  rows.push([id, text, t]);
  console.log(`[${id}] TEXT: ${text}\n         STT : ${t}`);
  await sleep(2500);
}
let md = "\n## Number-grouping isolation (round-trip)\n\n| case | input | STT heard |\n|---|---|---|\n";
for (const [id, text, t] of rows) md += `| \`${id}\` | ${text} | ${t} |\n`;
writeFileSync(new URL("../evidence/roundtrip_numbers.md", import.meta.url), md);
console.log("\nwrote evidence/roundtrip_numbers.md");
process.exit(0);
