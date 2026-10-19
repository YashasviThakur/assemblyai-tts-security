import { connect, fmt, sleep } from "./lib.mjs";

const quiet = (api) => api.frames.filter((f) => f.type !== "Audio" && f.type !== "BinaryAudio").map(fmt);

// A1b: ONE Generate, no Flush. Confirm zero audio while idle, then Terminate and
// see whether Terminate forces synthesis+billing of the unflushed buffer.
async function a1b() {
  const api = connect({ query: { voice: "jane" } });
  await api.open(); await api.waitFor("Begin");
  api.gen("This text was buffered but never flushed by the client.");
  await sleep(1800);
  const audioBeforeTerm = api.audio.chunks;
  api.terminate();
  const term = await api.waitFor("Termination", 5000);
  await Promise.race([api.closed, sleep(1500)]);
  console.log("\n=== A1b Generate(no Flush) then Terminate ===");
  quiet(api).forEach((l) => console.log("  " + l));
  console.log(`A1b> audio chunks BEFORE Terminate=${audioBeforeTerm}; AFTER=${api.audio.chunks}; billed_seconds=${term?.audio_duration_seconds}; billed_chars=${term?.total_input_char_length}`);
}

// A1c: Generate (no Flush) -> Cancel -> wait -> Terminate.
// Does Cancel discard the unflushed buffer so Terminate bills 0?
async function a1c() {
  const api = connect({ query: { voice: "jane" } });
  await api.open(); await api.waitFor("Begin");
  api.gen("Buffered text that the client then cancels before any flush happens at all.");
  await sleep(300);
  api.send({ type: "Cancel" });
  await sleep(1500);
  const audioAfterCancel = api.audio.chunks;
  api.terminate();
  const term = await api.waitFor("Termination", 5000);
  await Promise.race([api.closed, sleep(1500)]);
  console.log("\n=== A1c Generate(no Flush) -> Cancel -> Terminate ===");
  quiet(api).forEach((l) => console.log("  " + l));
  console.log(`A1c> audio chunks after Cancel=${audioAfterCancel}; total=${api.audio.chunks}; billed_seconds=${term?.audio_duration_seconds}; billed_chars=${term?.total_input_char_length}`);
}

for (const [n, f] of [["a1b", a1b], ["a1c", a1c]]) {
  try { await f(); } catch (e) { console.log(n, "THREW", e.message); }
  await sleep(2500);
}
process.exit(0);
