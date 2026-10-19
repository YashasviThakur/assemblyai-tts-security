# Submission brief — AssemblyAI Hackathon #2 (security / bug-report track)

Paste-ready answers for the submission form: https://forms.gle/NtYDsi3bgqMDK29j9

**Project:** assemblyai-tts-security — a security & reliability review of the
(undocumented) streaming TTS endpoint `wss://streaming-tts.assemblyai.com/v1/ws`.

**Repo:** <add GitHub URL after push>

## One-paragraph pitch

AssemblyAI's streaming TTS endpoint shipped with zero public documentation, so we
reverse-engineered its protocol by probing production with our own key and audited it for
security and reliability — then **proved the correctness bugs by round-trip**: we transcribe
the TTS audio with AssemblyAI's *own* STT, so the evidence is the API contradicting itself,
not our ears. We report 11 issues, most of which we could not find in any of the three other
public reverse-engineering efforts: the TTS **speaks Indian ₹ amounts as gibberish**
(`2,00,000` → "two zero", `1,50,00,000` → "one fifty zero", while Western grouping is fine);
a **billing-integrity cluster** (`Terminate` bills text you never flushed; `Cancelled` reports
`0` seconds while the session bills the full cancelled audio); a **non-deterministic
`WordBoundaries` bug** that silently drops word timings and breaks captioning; plus
control-char passthrough, validation asymmetry, and info disclosure. Every finding ships with
a runnable one-file reproduction and captured output.

## Top 3 to highlight

1. **Indian lakh/crore amounts read as gibberish** (Medium, correctness; round-trip-proven,
   isolated with a 5-case controlled comparison; huge India-market impact).
2. **`Terminate` bills un-flushed text + `Cancelled` under-reports billed audio by the whole
   cancelled utterance** (Medium, billing integrity).
3. **Non-deterministic `WordBoundaries`** — identical input, word timings sometimes absent,
   no error; measured failure rate in `evidence/e4_quant.txt` (Medium, reliability).

## Evidence

- `FINDINGS.md` — full report, severity, repro steps, observed server output, fixes.
- `probes/*.mjs` — one battery per finding; `node --env-file=.env probes/<x>.mjs`.
- `evidence/*.txt` — raw captured runs. `evidence/wav/*.wav` — synthesized normalization samples.

## Links to post (tag AssemblyAI)

> Finalized, ready-to-paste LinkedIn + X posts are in [POSTS.md](POSTS.md).

- LinkedIn / X draft: *"For the @AssemblyAI TTS hackathon I audited their new, undocumented
  streaming TTS WebSocket — and proved the bugs by round-trip (synthesize text, then transcribe
  it back with AssemblyAI's own STT). The API speaks Indian ₹ amounts as gibberish: 2,00,000
  comes out 'two zero', 1,50,00,000 'one fifty zero' — while Western grouping is fine. Plus a
  billing-integrity cluster (you're billed for audio you cancelled or never flushed) and a
  non-deterministic word-timestamp bug. 11 findings, all with runnable repros. Report: <repo>"*
