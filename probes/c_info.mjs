import { connect, fmt, sleep } from "./lib.mjs";
const quiet = (api) => api.frames.filter((f) => f.type !== "Audio").map(fmt);

// C1: unknown-string voice override -> confirm silent no-op (no audio, no error),
// to contrast with B11 (wrong-TYPE voice -> ignored, default voice, audio produced).
async function c1() {
  const api = connect({ query: { voice: "jane" } });
  await api.open(); await api.waitFor("Begin");
  api.send({ type: "Generate", text: "unknown voice string test", voice: "zzz_not_a_voice" });
  api.flush();
  await sleep(3000);
  api.terminate(); await Promise.race([api.closed, sleep(2000)]);
  console.log("\n--- C1 unknown-STRING voice override ---");
  quiet(api).forEach((l) => console.log("  " + l));
  console.log(`  [audio ${api.audio.chunks} chunks]`);
}

// C2: cross-language voice override (voice bound to one language) — what error?
async function c2() {
  const api = connect({ query: { voice: "jane", language: "english" } });
  await api.open(); await api.waitFor("Begin");
  api.send({ type: "Generate", text: "Bonjour tout le monde", voice: "jane", language: "french" });
  api.flush();
  await sleep(3500);
  api.terminate(); await Promise.race([api.closed, sleep(2000)]);
  console.log("\n--- C2 english voice on french turn ---");
  quiet(api).forEach((l) => console.log("  " + l));
  console.log(`  [audio ${api.audio.chunks} chunks]`);
}

// C3: voice_clone flag + VoiceReference surface mapping (do NOT upload real clone audio).
async function c3() {
  const api = connect({ query: { voice: "jane", voice_clone: "true" } });
  await api.open();
  const begin = await api.waitFor((f) => f.type === "Begin" || f.type === "Error" || f.type === "_close", 6000);
  console.log("\n--- C3 voice_clone=true handshake ---");
  console.log("  Begin/err: " + fmt(begin ?? { t: 0, type: "none" }));
  if (begin?.type === "Begin") {
    // Probe what VoiceReference expects, with an obviously-empty payload (no real audio).
    api.send({ type: "VoiceReference" });
    await sleep(1500);
  }
  quiet(api).forEach((l) => console.log("  " + l));
  api.terminate(); await Promise.race([api.closed, sleep(2000)]);
}

// C4: KeepAlive reply behavior + whether a lone KeepAlive is acknowledged.
async function c4() {
  const api = connect({ query: { voice: "jane" } });
  await api.open(); await api.waitFor("Begin");
  api.send({ type: "KeepAlive" });
  await sleep(1500);
  console.log("\n--- C4 lone KeepAlive ---");
  quiet(api).forEach((l) => console.log("  " + l));
  api.terminate(); await Promise.race([api.closed, sleep(2000)]);
}

for (const [n, f] of [["c1", c1], ["c2", c2], ["c3", c3], ["c4", c4]]) {
  try { await f(); } catch (e) { console.log(n, "THREW", e.message); }
  await sleep(6000); // generous gap to avoid the concurrent-session cap
}
process.exit(0);
