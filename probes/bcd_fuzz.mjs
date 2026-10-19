import { connect, fmt, sleep } from "./lib.mjs";

const quiet = (api) => api.frames.filter((f) => f.type !== "Audio").map(fmt);

// Sequential runner that respects the per-account concurrent-session cap.
async function runProbe({ name, query = { voice: "jane" }, body, waitMs = 2500, raw }) {
  let api, tries = 0;
  while (true) {
    api = connect({ query });
    await api.open();
    const first = await api.waitFor((f) => f.type === "Begin" || f.type === "Error" || f.type === "_close", 6000);
    if (first?.type === "Error" && first.error_code === 3009 && tries++ < 1) {
      console.log(`  (3009 cap hit, backing off 35s before ${name})`);
      try { api.ws.close(); } catch {}
      await sleep(35000); continue;
    }
    break;
  }
  try { if (body) await body(api); } catch (e) { console.log(`  ${name} body threw: ${e.message}`); }
  await sleep(waitMs);
  api.terminate();
  await Promise.race([api.closed, sleep(2500)]);
  console.log(`\n--- ${name} ---`);
  quiet(api).forEach((l) => console.log("  " + l));
  console.log(`  [audio ${api.audio.chunks} chunks / ${api.audio.bytes}B]`);
  await sleep(2200);
}

const B = [
  { name: "B1 text=number", body: (a) => { a.send({ type: "Generate", text: 12345 }); a.flush(); } },
  { name: "B2 text=array", body: (a) => { a.send({ type: "Generate", text: ["one", "two"] }); a.flush(); } },
  { name: "B3 text=object", body: (a) => { a.send({ type: "Generate", text: { s: "hi" } }); a.flush(); } },
  { name: "B4 text=empty", body: (a) => { a.gen(""); a.flush(); } },
  { name: "B5 text=whitespace", body: (a) => { a.gen("     "); a.flush(); } },
  { name: "B6 text=2000 chars", body: (a) => { a.gen("a ".repeat(1000).slice(0, 2000)); a.flush(); }, waitMs: 9000 },
  { name: "B7 text=2001 chars", body: (a) => { a.gen("a".repeat(2001)); a.flush(); } },
  { name: "B8 text=null-byte", body: (a) => { a.gen("alpha\u0000omega"); a.flush(); }, waitMs: 4000 },
  { name: "B9 text=control+ansi", body: (a) => { a.gen("red\u001b[31mtext\u0007bell\ttab"); a.flush(); }, waitMs: 4000 },
  { name: "B10 extra unknown field", body: (a) => { a.send({ type: "Generate", text: "hello there", injected: "DROP TABLE", __proto__: { polluted: 1 } }); a.flush(); }, waitMs: 4000 },
  { name: "B11 voice override=number", body: (a) => { a.send({ type: "Generate", text: "voice as number", voice: 42 }); a.flush(); } },
  { name: "B12 type lowercase 'generate'", body: (a) => { a.send({ type: "generate", text: "x" }); a.flush(); } },
  { name: "B13 nested JSON in text", body: (a) => { a.gen('{"type":"Terminate"}'); a.flush(); }, waitMs: 4000 },
];

const D = [
  { name: "D1 Flush with empty buffer", body: (a) => { a.flush(); } },
  { name: "D2 Flush x3 empty", body: (a) => { a.flush(); a.flush(); a.flush(); } },
  { name: "D3 client-supplied flush_id", body: (a) => { a.send({ type: "Generate", text: "spoof id" }); a.send({ type: "Flush", flush_id: 999 }); }, waitMs: 4000 },
  { name: "D4 Generate after Terminate", body: async (a) => { a.terminate(); await sleep(600); a.gen("after terminate"); a.flush(); } },
  { name: "D5 double Terminate", body: async (a) => { a.terminate(); await sleep(300); a.terminate(); } },
  { name: "D6 unknown top-level type", body: (a) => { a.send({ type: "Describe", foo: 1 }); } },
  { name: "D7 no type field", body: (a) => { a.send({ text: "typeless" }); } },
  { name: "D8 non-JSON frame", body: (a) => { a.sendRaw("this is not json"); } },
];

console.log("######## BATTERY B — input validation / type confusion ########");
for (const p of B) await runProbe(p);
console.log("\n######## BATTERY D — protocol state machine ########");
for (const p of D) await runProbe(p);
process.exit(0);
