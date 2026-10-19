# Submission brief — AssemblyAI Hackathon #2 (security / bug-report track)

Paste-ready answers for the submission form: https://forms.gle/NtYDsi3bgqMDK29j9

**Project:** assemblyai-tts-security — a security & reliability review of the
(undocumented) streaming TTS endpoint `wss://streaming-tts.assemblyai.com/v1/ws`.

**Repo:** <add GitHub URL after push>

## One-paragraph pitch

AssemblyAI's streaming TTS endpoint shipped with zero public documentation, so we
reverse-engineered its protocol by probing production with our own key and audited
it for security and reliability. We report 9 issues, 6 of which we could not find
in any of the three other public reverse-engineering efforts: a **billing-integrity
cluster** (`Terminate` bills text you never flushed; `Cancelled` reports `0` seconds
while the session bills the full cancelled audio; the two usage counters can't be
reconciled), a **non-deterministic `WordBoundaries` bug** that silently drops word
timings ~1 in 6 for affected inputs and breaks captioning, **control-character
passthrough** into word tokens (caption-injection), and a **validation asymmetry**
where `voice`/`language` are enforced at connect but silently ignored per-`Generate`.
Every finding ships with a runnable one-file reproduction and captured output.

## Top 3 to highlight

1. **`Terminate` implicitly flushes & bills un-flushed text** (Medium, billing).
2. **Cancelled audio billed but reported as `0` seconds** (Medium, billing accounting).
3. **Non-deterministic `WordBoundaries`** — identical input, timings present 5/6 runs,
   absent 1/6, no error (Medium, reliability; breaks the word-timestamp feature's main use).

## Evidence

- `FINDINGS.md` — full report, severity, repro steps, observed server output, fixes.
- `probes/*.mjs` — one battery per finding; `node --env-file=.env probes/<x>.mjs`.
- `evidence/*.txt` — raw captured runs. `evidence/wav/*.wav` — synthesized normalization samples.

## Links to post (tag AssemblyAI)

- LinkedIn / X draft: *"Spent the AssemblyAI TTS hackathon auditing their new,
  undocumented streaming TTS WebSocket. Found a billing-integrity cluster (you can be
  billed for audio you cancelled or never flushed) and a non-deterministic word-timestamp
  bug that silently breaks captions. 9 findings, all with runnable repros. Report: <repo>"*
