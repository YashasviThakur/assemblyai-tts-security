import { connect, sleep } from "./lib.mjs";

// Same input, repeated, to show WordBoundaries emission is non-deterministic:
// identical requests sometimes return full word timings and sometimes none,
// while audio is always produced and no error is raised either way.
async function synth(text) {
  const api = connect({ query: { voice: "jane" } });
  await api.open(); await api.waitFor("Begin");
  api.gen(text); api.flush();
  const fd = await api.waitFor("FlushDone", 12000);
  const wb = api.frames.find((f) => f.type === "WordBoundaries");
  await sleep(200);
  api.terminate(); await Promise.race([api.closed, sleep(2000)]);
  return { words: wb ? wb.words.length : null, ms: fd?.audio_duration_ms };
}

async function repeat(label, text, n = 6) {
  console.log(`\n${label}: "${text}"`);
  const tally = {};
  for (let i = 0; i < n; i++) {
    let r; try { r = await synth(text); } catch (e) { r = { words: "ERR:" + e.message }; }
    const key = r.words === null ? "NO-WordBoundaries" : `${r.words} words`;
    tally[key] = (tally[key] || 0) + 1;
    console.log(`  run ${i + 1}: ${key.padEnd(18)} audio_ms=${r.ms}`);
    await sleep(6000);
  }
  console.log(`  TALLY ${label}: ${JSON.stringify(tally)}`);
}

await repeat("comma-variant", "The meeting is on 10/11/2026 re: Q4 , see fig. 2(a).");
await repeat("emdash-variant", "The meeting is on 10/11/2026 re: Q4 — see fig. 2(a).");
process.exit(0);
