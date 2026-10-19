import { connect, dump, sleep } from "./lib.mjs";

// Does the account's billed usage (Termination counters) match what was
// actually synthesized? Probe buffered-but-unflushed text and cancelled flushes.

async function termStats(api) {
  const term = await api.waitFor("Termination", 5000);
  await Promise.race([api.closed, sleep(2000)]);
  return term;
}

// A1: Generate 3 times, NEVER Flush, then Terminate. Should bill ~0 audio.
// Question: does total_input_char_length count the unsynthesized buffer?
async function a1() {
  const api = connect({ query: { voice: "jane" } });
  await api.open();
  await api.waitFor("Begin");
  const texts = ["Alpha buffered.", "Beta buffered.", "Gamma buffered."];
  const chars = texts.join("").length;
  for (const t of texts) api.gen(t);
  await sleep(1200); // give server time to emit any audio (should be none)
  api.terminate();
  const term = await termStats(api);
  dump("A1 buffered-never-flushed (3 Generate, no Flush)", api);
  console.log(`A1> sent ${chars} chars across 3 Generate, 0 Flush. audio chunks=${api.audio.chunks}.`);
  console.log(`A1> Termination: total_input_char_length=${term?.total_input_char_length} audio_duration_seconds=${term?.audio_duration_seconds}`);
}

// A2: baseline — one Generate+Flush, compare FlushDone ms vs Termination seconds, chars.
async function a2() {
  const api = connect({ query: { voice: "jane" } });
  await api.open();
  await api.waitFor("Begin");
  const text = "The quick brown fox jumps over the lazy dog, twice in a row.";
  api.gen(text); api.flush();
  const fd = await api.waitFor("FlushDone", 8000);
  await sleep(300);
  api.terminate();
  const term = await termStats(api);
  dump("A2 baseline Generate+Flush", api);
  console.log(`A2> input chars=${text.length}. FlushDone.audio_duration_ms=${fd?.audio_duration_ms}.`);
  console.log(`A2> Termination: total_input_char_length=${term?.total_input_char_length} audio_duration_seconds=${term?.audio_duration_seconds}`);
}

// A3: Generate long + Flush, then Cancel ~400ms later, then Terminate.
// Others report Cancelled.audio_duration_seconds=0. Does the SESSION billing
// counter (Termination) also say 0, or does it bill the audio actually streamed?
async function a3() {
  const api = connect({ query: { voice: "jane" } });
  await api.open();
  await api.waitFor("Begin");
  const text = "This is a deliberately long utterance meant to still be synthesizing when the cancel arrives, so we can compare the cancelled flush's reported duration against the session's billed duration. " .repeat(2);
  api.gen(text); api.flush();
  await api.waitFor("Audio", 8000); // wait until audio actually starts
  await sleep(400);
  api.send({ type: "Cancel" });
  const cancelled = await api.waitFor((f) => f.type === "Cancelled" || f.type === "FlushDone", 8000);
  await sleep(300);
  api.terminate();
  const term = await termStats(api);
  dump("A3 cancel-after-audio-started", api);
  console.log(`A3> input chars=${text.length}. audio chunks streamed=${api.audio.chunks} bytes=${api.audio.bytes}.`);
  console.log(`A3> Cancelled/FlushDone frame: ${JSON.stringify(cancelled)}`);
  console.log(`A3> Termination: total_input_char_length=${term?.total_input_char_length} audio_duration_seconds=${term?.audio_duration_seconds}`);
  // 24kHz mono s16le => 48000 bytes/sec. Derive actual audio seconds from bytes.
  console.log(`A3> derived audio seconds from bytes @48000B/s = ${(api.audio.bytes / 48000).toFixed(3)}`);
}

for (const [name, fn] of [["a1", a1], ["a2", a2], ["a3", a3]]) {
  try { await fn(); } catch (e) { console.log(name, "THREW", e.message); }
  await sleep(2500); // respect lingering-session cap
}
process.exit(0);
