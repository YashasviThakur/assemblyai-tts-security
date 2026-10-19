// Shared harness for probing wss://streaming-tts.assemblyai.com/v1/ws
// Sanctioned testing for AssemblyAI Voice Hackathon #2 (Oct 2026) using the
// account's own API key. Keep request volume low; always Terminate to free the
// per-account concurrent-session slot.
const KEY = process.env.ASSEMBLYAI_API_KEY;
export const HOST = "wss://streaming-tts.assemblyai.com/v1/ws";
if (!KEY) { console.error("no ASSEMBLYAI_API_KEY"); process.exit(1); }

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Open a session. auth: "header" (default) | "query" | "none" | custom string header.
// query: extra URL params (voice, language, sample_rate, encoding, ...).
export function connect({ query = {}, auth = "header", token = null } = {}) {
  const qs = new URLSearchParams(query);
  if (auth === "query") qs.set("token", token ?? KEY);
  const url = HOST + (qs.toString() ? `?${qs}` : "");
  const opts = {};
  if (auth === "header") opts.headers = { Authorization: token ?? KEY };
  else if (auth !== "query" && auth !== "none") opts.headers = { Authorization: auth };

  const t0 = Date.now();
  const ws = new WebSocket(url, opts);
  const frames = [];
  const audio = { chunks: 0, bytes: 0 };
  const waiters = [];

  const pushFrame = (f) => {
    frames.push(f);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(f)) { waiters[i].resolve(f); waiters.splice(i, 1); }
    }
  };

  ws.onmessage = (e) => {
    const t = Date.now() - t0;
    if (typeof e.data !== "string") { audio.chunks++; audio.bytes += e.data.byteLength ?? e.data.size ?? 0; pushFrame({ t, type: "BinaryAudio", bytes: e.data.byteLength }); return; }
    let m; try { m = JSON.parse(e.data); } catch { pushFrame({ t, type: "RawText", raw: e.data.slice(0, 300) }); return; }
    if (m.type === "Audio") {
      const b = m.audio ? Buffer.from(m.audio, "base64").length : 0;
      audio.chunks++; audio.bytes += b;
      pushFrame({ t, type: "Audio", flush_id: m.flush_id, bytes: b });
    } else {
      pushFrame({ t, ...m });
    }
  };
  const closed = new Promise((resolve) => {
    ws.onclose = (e) => { const f = { t: Date.now() - t0, type: "_close", code: e.code, reason: e.reason }; pushFrame(f); resolve({ code: e.code, reason: e.reason }); };
    ws.onerror = () => {}; // close carries the detail
  });

  const api = {
    url, ws, frames, audio, closed,
    send: (o) => ws.send(JSON.stringify(o)),
    sendRaw: (s) => ws.send(s),
    gen: (text, extra = {}) => ws.send(JSON.stringify({ type: "Generate", text, ...extra })),
    flush: () => ws.send(JSON.stringify({ type: "Flush" })),
    terminate: () => { try { ws.send(JSON.stringify({ type: "Terminate" })); } catch {} },
    open: () => new Promise((res) => { if (ws.readyState === 1) return res(); ws.addEventListener("open", () => res(), { once: true }); }),
    // wait for a frame matching pred (type string or fn); resolves null on timeout
    waitFor: (pred, ms = 6000) => new Promise((resolve) => {
      const fn = typeof pred === "string" ? (f) => f.type === pred : pred;
      const hit = frames.find(fn); if (hit) return resolve(hit);
      const w = { pred: fn, resolve }; waiters.push(w);
      setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); resolve(null); } }, ms);
    }),
    // terminate, wait for close, resolve
    end: async (ms = 4000) => { api.terminate(); await Promise.race([closed, sleep(ms)]); },
  };
  return api;
}

// Compact one-line summary of a frame for logs.
export function fmt(f) {
  if (f.type === "Audio" || f.type === "BinaryAudio") return `${f.t}ms Audio#${f.flush_id ?? "?"} ${f.bytes}B`;
  const { t, type, ...rest } = f;
  const r = JSON.stringify(rest);
  return `${t}ms ${type} ${r.length > 220 ? r.slice(0, 220) + "…" : r}`;
}

export function dump(label, api) {
  console.log(`\n=== ${label} ===`);
  console.log(`url: ${api.url.replace(/(token=)[^&]+/, "$1<tok>")}`);
  for (const f of api.frames) console.log("  " + fmt(f));
  console.log(`  audio: ${api.audio.chunks} chunks / ${api.audio.bytes} bytes`);
}
