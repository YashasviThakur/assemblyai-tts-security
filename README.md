# assemblyai-tts-security

A security & reliability review of AssemblyAI's **undocumented** streaming
text-to-speech endpoint `wss://streaming-tts.assemblyai.com/v1/ws`, built for
**AssemblyAI online Hackathon #2** (Oct 15–23 2026), bug-report / security track.

The endpoint shipped with no public docs. We probed it black-box with our own
hackathon key and found **9 issues** — a billing-integrity cluster, a
non-deterministic word-timestamp bug, input-sanitization and validation gaps —
plus a set of negative (robust) results. Full writeup: **[FINDINGS.md](FINDINGS.md)**.

## Headline findings

1. **`Terminate` bills un-flushed text** — buffer text, never `Flush`, `Terminate`:
   you're still billed for synthesized audio you never requested. Only `Cancel`
   discards a buffer.
2. **Cancelled audio is billed but reported as `0` s** — `Cancelled.audio_duration_seconds`
   is always `0` while the session bills the full cancelled utterance (19.84 s in our repro).
3. **Non-deterministic `WordBoundaries`** — the *same* input intermittently returns no word
   timings (~1/6) with audio and no error, silently breaking captions.
4. **Validation asymmetry** — `voice`/`language` are rejected as connection params but
   silently ignored as per-`Generate` overrides (English voice reads French, no error).
5. **Control-char passthrough** — NUL / ANSI-escape / BEL flow verbatim into `WordBoundaries`
   tokens (caption-injection risk).
6. **Segment gluing, misleading `voice_clone` error, version/parser info disclosure** — see report.

## Run it

Requires Node 22+ (built-in `WebSocket`). No dependencies.

```bash
printf 'ASSEMBLYAI_API_KEY=%s\n' "$YOUR_KEY" > .env
node --env-file=.env probes/a_billing.mjs    # billing cluster (F1–F3)
node --env-file=.env probes/e3_flaky.mjs     # non-deterministic WordBoundaries (F4)
node --env-file=.env probes/bcd_fuzz.mjs     # validation + state machine (F6, F7, F9, negatives)
node --env-file=.env probes/c_info.mjs       # validation asymmetry + clone ordering (F5, F8)
node --env-file=.env probes/e_pronounce.mjs  # normalization WAVs -> evidence/wav/
```

## Layout

```
probes/      reproduction scripts (one battery per file) + lib.mjs harness
evidence/    captured raw output (*.txt) and synthesized audio (wav/*.wav)
FINDINGS.md  the report: per-finding severity, repro, observed output, suggested fix
```

## Scope & ethics

Testing was black-box against the production endpoint with **our own** hackathon
API key, at low request volume, with no denial-of-service and **no other accounts
accessed**. We mapped the voice-cloning surface by confirming it is *disabled* on
this deployment; we did not submit any reference clip or attempt to clone a voice.
Findings are shared for AssemblyAI to fix. The API key lives only in a gitignored
`.env` and never appears in code or evidence.
