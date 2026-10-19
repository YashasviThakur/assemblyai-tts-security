import { connect, sleep } from "./lib.mjs";

// Isolate which token makes the server emit audio but NO WordBoundaries.
async function synth(text) {
  const api = connect({ query: { voice: "jane" } });
  await api.open(); await api.waitFor("Begin");
  api.gen(text); api.flush();
  const fd = await api.waitFor("FlushDone", 12000);
  const wb = api.frames.find((f) => f.type === "WordBoundaries");
  await sleep(200);
  api.terminate(); await Promise.race([api.closed, sleep(2000)]);
  const n = wb ? wb.words.length : "NO-WB-FRAME";
  console.log(`  words=${String(n).padEnd(12)} audio_ms=${String(fd?.audio_duration_ms).padEnd(6)} "${text}"`);
}

const CASES = [
  "The meeting is on October eleventh.",            // control, should have WB
  "The meeting is on 10/11/2026.",                  // slash date
  "re: Q4.",                                         // colon abbrev
  "Q4 — see fig.",                                   // em dash
  "see fig. 2(a).",                                  // paren index
  "a — b.",                                          // em dash alone
  "a - b.",                                          // hyphen alone (control)
  "The meeting is on 10/11/2026 re: Q4 — see fig. 2(a).", // full repro
  "The meeting is on 10/11/2026 re: Q4 , see fig. 2(a).", // full, em dash -> comma
];

console.log("WordBoundaries bisection (words count per utterance):");
for (const t of CASES) { try { await synth(t); } catch (e) { console.log("  THREW", e.message, t); } await sleep(6000); }
process.exit(0);
