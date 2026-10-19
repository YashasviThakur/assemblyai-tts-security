import { connect, sleep } from "./lib.mjs";

// Quantify F4: how often does an identical request drop WordBoundaries entirely?
async function synth(text) {
  let api, tries = 0;
  while (true) {
    api = connect({ query: { voice: "jane" } });
    await api.open();
    const b = await api.waitFor((f) => ["Begin", "Error", "_close"].includes(f.type), 6000);
    if (b?.type !== "Begin" && tries++ < 2) { try { api.ws.close(); } catch {} await sleep(30000); continue; }
    break;
  }
  api.gen(text); api.flush();
  const fd = await api.waitFor("FlushDone", 12000);
  const wb = api.frames.find((f) => f.type === "WordBoundaries");
  await sleep(150);
  api.terminate(); await Promise.race([api.closed, sleep(1800)]);
  return { hasWB: !!wb, words: wb ? wb.words.length : 0, ms: fd?.audio_duration_ms };
}

const TEXT = "The meeting is on 10/11/2026 re: Q4 — see fig. 2(a).";
const N = Number(process.argv[2] || 24);
let miss = 0, ok = 0, audioOk = 0;
console.log(`F4 quantification: "${TEXT}"  (N=${N})`);
for (let i = 0; i < N; i++) {
  let r; try { r = await synth(TEXT); } catch (e) { console.log(`  ${i + 1}: ERR ${e.message}`); continue; }
  if (r.ms > 0) audioOk++;
  if (r.hasWB) ok++; else { miss++; console.log(`  run ${i + 1}: NO WordBoundaries (audio_ms=${r.ms})`); }
  await sleep(5500);
}
const rate = ((miss / (ok + miss)) * 100).toFixed(1);
console.log(`\nRESULT: ${miss}/${ok + miss} runs dropped WordBoundaries = ${rate}% failure; audio produced in ${audioOk}/${ok + miss} runs (no error on any).`);
process.exit(0);
