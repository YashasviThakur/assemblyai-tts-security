# AssemblyAI Streaming TTS — findings report

**Endpoint:** `wss://streaming-tts.assemblyai.com/v1/ws`
**Event:** AssemblyAI online Hackathon #2 (Oct 15–23 2026) — security / bug-report track
**Method:** black-box protocol probing against the production endpoint with our own
hackathon API key, low request volume, no denial-of-service, no other accounts touched.
All findings are reproducible with the scripts in [`probes/`](probes/); raw captured
output is in [`evidence/`](evidence/). Correctness findings are proven by **round-trip**:
we synthesize text, then transcribe the resulting audio with AssemblyAI's *own*
speech-to-text — if the API hears something different from what was written, that is
objective evidence, no listening required ([`evidence/roundtrip.md`](evidence/roundtrip.md)).

The endpoint ships with **no public documentation** (the public FAQ even states AssemblyAI
"does not offer standalone text-to-speech as a separate service"), so a protocol sketch is
in [§ Protocol](#protocol-as-observed) at the end. Three other teams have published partial
reverse-engineering (babel, frontdesk-voice, rohan911438). Where a finding overlaps theirs
we say so; the first six findings below we did not find reported anywhere.

## How to reproduce

```bash
cd assemblyai-tts-security
printf 'ASSEMBLYAI_API_KEY=%s\n' "$YOUR_KEY" > .env   # Node 22+/26 (built-in WebSocket)
node --env-file=.env probes/a_billing.mjs     # F1, F2, F3
node --env-file=.env probes/a_billing2.mjs    # F1, F3  (Terminate-flush vs Cancel)
node --env-file=.env probes/e3_flaky.mjs      # F4      (non-deterministic WordBoundaries)
node --env-file=.env probes/c_info.mjs        # F5, F8  (validation asymmetry, clone order)
node --env-file=.env probes/bcd_fuzz.mjs      # F6, F7, F9 + negative results
node --env-file=.env probes/e_pronounce.mjs   # normalization WAVs -> evidence/wav/
node --env-file=.env probes/roundtrip.mjs     # F10, F11 (TTS -> STT round-trip proof)
node --env-file=.env probes/roundtrip2.mjs    # F10 isolation (Indian vs Western grouping)
node --env-file=.env probes/e4_quant.mjs 24   # F4 failure-rate measurement
```

---

## Severity summary

| # | Severity | Area | Finding | Novel? |
|---|----------|------|---------|--------|
| **F10** | **Medium** | Correctness | **Indian lakh/crore digit grouping (`2,00,000`) is spoken as "two zero"** — magnitude destroyed; round-trip-proven | yes |
| F11 | Low–Med | Correctness | Named entities mangled: `assemblyai.com` → "assemblyi dot com" (own domain); round-trip-proven | yes |
| F1 | **Medium** | Billing | `Terminate` implicitly flushes **and bills** text that was never flushed | yes |
| F2 | **Medium** | Billing | `Cancelled.audio_duration_seconds` is always `0` while the session bills the full cancelled audio | yes¹ |
| F3 | Low | Billing | `total_input_char_length` counts characters that produce no audio; the two usage counters can't be reconciled | yes |
| F4 | **Medium** | Reliability | `WordBoundaries` emission is **non-deterministic** — identical input intermittently returns none, no error | yes |
| F5 | Low–Med | Correctness | `voice`/`language` validated as connection params but **silently ignored** as per-`Generate` overrides | yes |
| F6 | Low | Correctness | Consecutive `Generate` segments are concatenated with **no separator** | yes |
| F7 | Low | Sanitization | Control chars (NUL, ANSI `ESC`, BEL) pass through into `WordBoundaries` tokens verbatim | yes |
| F8 | Low | Error quality | `voice_clone` validation-ordering returns a message advertising a **disabled** feature | yes² |
| F9 | Info | Disclosure | Python parser exception strings + `Server:` version banner surfaced to clients | partial³ |

¹ frontdesk-voice noted the `0` as cosmetic; the billing-reconciliation impact below is new.
² frontdesk-voice reported cloning as "refused"; the misleading **error ordering** is the bug.
³ babel noted the pre-auth upgrade; the echoed `json` exception text is additional.

---

## F1 — `Terminate` implicitly flushes and BILLS unflushed text  ·  Medium

The protocol buffers text on `Generate` and only synthesizes on `Flush`. We found that
`Terminate` does **not** discard the pending buffer — it force-synthesizes it, streams the
audio, and bills it, *after* the client asked to end the session.

**Repro** (`probes/a_billing2.mjs` → `evidence/a_billing2.txt`): one `Generate`, no `Flush`,
idle 1.8 s (zero audio), then `Terminate`:

```
A1b> audio chunks BEFORE Terminate=0; AFTER=44; billed_seconds=3.52; billed_chars=55
  FlushDone {"flush_id":0,"audio_duration_ms":3520}
  Termination {"session_duration_seconds":2,"total_input_char_length":55,"audio_duration_seconds":3.52}
```

All 44 audio chunks arrive **after** `Terminate`, and `Termination` bills 3.52 s.

The only way to abandon a buffer without paying is to send `Cancel` first:

```
A1c  Generate(no Flush) -> Cancel -> Terminate
A1c> audio chunks after Cancel=0; total=0; billed_seconds=0; billed_chars=75
  Cancelled {"audio_duration_seconds":0}
  Termination {"total_input_char_length":75,"audio_duration_seconds":0}
```

**Impact.** Apps that speculatively buffer (e.g. pre-synthesize an LLM reply, then abandon
it because the user barged in) and tear down by closing/terminating are billed for audio
nobody heard. The safe-discard path (`Cancel` before `Terminate`) is undocumented.
**Suggested fix.** Discard the unflushed buffer on `Terminate`, or document that `Terminate`
flushes and that `Cancel` is the discard primitive.

## F2 — cancelled audio is billed but reported as `0` seconds  ·  Medium

`Cancel` does not stop a flush already being synthesized (also observed by frontdesk-voice).
The new part: the `Cancelled` frame reports `audio_duration_seconds: 0`, but the session's
`Termination` bills the **entire** cancelled flush.

**Repro** (`probes/a_billing.mjs` → `evidence/a_billing.txt`, case A3): long `Generate` +
`Flush`, `Cancel` 400 ms after audio starts:

```
A3> input chars=382. audio chunks streamed=248 bytes=952320.
  FlushDone  {"flush_id":0,"audio_duration_ms":19840}
  Cancelled  {"audio_duration_seconds":0}
  Termination{"total_input_char_length":382,"audio_duration_seconds":19.84}
A3> derived audio seconds from bytes @48000B/s = 19.840
```

952 320 bytes ÷ (24 kHz × 2 B) = **19.84 s** actually streamed and billed, while `Cancelled`
says `0`.

**Impact.** A client that tracks spend from `Cancelled.audio_duration_seconds` (the obvious
signal) under-counts by the full cancelled utterance on every barge-in. This is a
usage-accounting integrity problem, not a cosmetic one.
**Suggested fix.** Report the audio actually delivered for the cancelled flush in
`Cancelled.audio_duration_seconds`.

## F3 — the two usage counters cannot be reconciled  ·  Low

`total_input_char_length` counts submitted characters that generate no audio:

- whitespace-only text — `"     "` → `total_input_char_length=5`, `audio_duration_seconds=0`
  (`probes/bcd_fuzz.mjs`, B5).
- Cancel-discarded buffers — F1/A1c: 75 chars counted, 0 audio.

So neither counter alone is a faithful billing basis, and they diverge from each other.
**Suggested fix.** Document precisely what each counter meters (characters submitted vs
characters synthesized vs audio seconds billed).

## F4 — non-deterministic `WordBoundaries`  ·  Medium

For some inputs the server **intermittently** omits the `WordBoundaries` frame entirely
while still returning audio and raising no error. Word-level timestamps are an advertised,
separately-shipped feature (2026-07-23) whose headline use is captioning/karaoke; a client
cannot rely on it.

**Repro** (`probes/e3_flaky.mjs` → `evidence/e3_flaky.txt`): the *same* input synthesized 6×:

```
emdash-variant: "The meeting is on 10/11/2026 re: Q4 — see fig. 2(a)."
  run 1: 10 words            audio_ms=6480
  run 2: NO-WordBoundaries   audio_ms=5760
  run 3: 10 words            audio_ms=6000
  ...
  TALLY emdash-variant: {"10 words":5,"NO-WordBoundaries":1}
```

Identical request, same session parameters: WordBoundaries present 5/6, absent 1/6. The
destabilising token here is the em-dash `—`; `e2_wb.mjs` shows the same string yielding full
boundaries on one pass and none on another.

**Impact.** ~1-in-6 utterances (for affected text) ship with no word timings and no error, so
captions silently desync. **Suggested fix.** Always emit `WordBoundaries` when
`word_boundaries` is enabled (empty list if truly none), and make emission deterministic.

## F5 — `voice`/`language` validated at connect, silently ignored per-`Generate`  ·  Low–Medium

As connection query params, an unknown or cross-language `voice`/`language` is rejected (and
the error even enumerates valid voices). As a **per-`Generate` override** the same bad values
are silently dropped and the session default is used — no error, no signal that the requested
voice was not honored.

**Repro** (`probes/c_info.mjs` → `evidence/c_info.txt`):

- C1 — `Generate{voice:"zzz_not_a_voice"}` → audio produced in the default voice (`jane`), no error.
- C2 — `Generate{voice:"jane", language:"french"}` on `"Bonjour tout le monde"` → English voice
  speaks French at word confidence **0.38 / 0.33**, no error (the connection path rejects this
  pairing).
- B11 (`bcd_fuzz.mjs`) — `Generate{voice:42}` → ignored, default voice, audio produced.

**Impact.** A bilingual/multi-voice app that sets voice per turn and typos one gets silently
wrong-voice or wrong-language audio to the caller. **Suggested fix.** Validate per-`Generate`
`voice`/`language` with the same rules as the connection params and return an error on mismatch.

## F6 — consecutive `Generate` segments concatenated with no separator  ·  Low

Buffered segments are joined with no whitespace before synthesis, so the last token of one
segment fuses with the first of the next.

**Repro** (`probes/a_billing.mjs`, A1): three `Generate`s — `"Alpha buffered."`,
`"Beta buffered."`, `"Gamma buffered."` — produced `WordBoundaries` tokens:

```
["Alpha", "buffered.Beta", "buffered.Gamma"]   (confidence 0.50 / 0.62 on the fused tokens)
```

**Impact.** Sentence-at-a-time streaming (the natural pattern for piping LLM output into TTS)
glues sentence boundaries together. **Suggested fix.** Insert a space between buffered
segments, or document that the client must include trailing whitespace.

## F7 — control characters pass through into audio and `WordBoundaries`  ·  Low (security-adjacent)

Raw C0 control characters are neither stripped nor rejected; they are fed to the model and
**echoed verbatim** in `WordBoundaries` word tokens.

**Repro** (`probes/bcd_fuzz.mjs` → `evidence/bcd_fuzz.txt`):

- B8 — `"alpha\u0000omega"` → `WordBoundaries` word `"alpha\u0000omega"` (NUL preserved), conf 0.47.
- B9 — `"red\u001b[31mtext\u0007bell\ttab"` → word `"red\u001b[31mtext\u0007bell"` (ANSI `ESC`,
  BEL preserved).

**Impact.** A client that renders `WordBoundaries` tokens into HTML captions or a terminal
inherits NUL / ANSI-escape injection straight from untrusted upstream text (e.g. an LLM or a
user). **Suggested fix.** Strip or reject C0 control characters (except `\t`/`\n`) server-side.

## F8 — `voice_clone` error advertises a disabled feature  ·  Low

Voice cloning is **disabled** on this deployment, but the parameter-conflict check runs before
the feature-enabled check, so one input path claims the feature exists.

**Repro** (`probes/c_info.mjs`, C3/C5):

```
?voice_clone=true&voice=jane  -> Error 3006 "voice: must not be set together with voice_clone=true
                                 — the session's voice comes from the VoiceReference clip"
?voice_clone=true             -> Error 3006 "Voice cloning is not enabled on this deployment."
```

The first message implies a working clone path that does not exist here. (Same bug class as
rohan911438's STT `sample_rate`-guard-before-allowlist ordering.) **Suggested fix.** Check
feature-enabled first.

## F9 — information disclosure  ·  Info

- Non-JSON frame → the Python `json` exception string is echoed verbatim:
  `"Invalid JSON: Expecting value: line 1 column 1 (char 0)"` (`bcd_fuzz.mjs`, D8).
- Handshake banner on the `426`: `Server: Python/3.13 websockets/15.0.1`
  (`curl -D - https://streaming-tts.assemblyai.com/v1/ws`) — library + runtime version disclosure.
- The WebSocket upgrade returns `101` **before** the auth check (unauth clients get the banner,
  then a JSON `Error`, then close). Independently confirmed; also noted by babel.
- Error frames are sometimes emitted **twice** before close (C3).

**Suggested fix.** Return generic parse errors; suppress the server version banner.

## F10 — Indian lakh/crore digit grouping is read as gibberish  ·  Medium

Numbers written with Indian digit grouping (lakh/crore: `2,00,000`, `1,50,00,000`) are
synthesized with their magnitude destroyed, while the identical value in Western grouping
or with no grouping reads correctly. Proven by round-trip: AssemblyAI's own STT transcribes
the TTS audio and the number comes back wrong.

**Repro** (`probes/roundtrip2.mjs` → `evidence/roundtrip_numbers.md`), raw STT of the TTS audio:

| input text | STT heard in the TTS audio | correct? |
|---|---|---|
| `He paid 2,00,000 rupees.` (Indian, = 200000) | "he paid **two zero** rupees" | ❌ |
| `He paid 1,50,00,000 rupees.` (Indian crore, = 15000000) | "he paid **one fifty zero** rupees" | ❌ |
| `He paid 200,000 rupees.` (Western) | "he paid two hundred thousand rupees" | ✅ |
| `He paid 200000 rupees.` (no grouping) | "he paid two hundred thousand rupees" | ✅ |
| `He paid 15,000,000 rupees.` (Western) | "he paid fifteen million rupees" | ✅ |

The original torture sentence shows the same collapse: `Rs 2,00,000` → `"rs two zero"`
(`evidence/roundtrip.md`), and this is the token that scored word confidence **0.00** in
`evidence/e_pronounce.txt`.

**Impact.** Any India-facing voice product — fintech balances, billing, order totals,
OTP-adjacent amounts — will speak a catastrophically wrong figure (₹200,000 → "two zero")
with no error and no low-level signal other than a confidence score most clients never read.
This is squarely in scope for TTS-1's stated goal of reading numbers accurately.
**Suggested fix.** Normalize Indian digit grouping (and ideally support lakh/crore wording).

## F11 — named entities (incl. AssemblyAI's own domain) are mangled  ·  Low–Medium

**Repro** (`probes/roundtrip.mjs` → `evidence/roundtrip.md`):

```
TEXT : Call +1 (415) 555-0137 or visit https://assemblyai.com/docs.
STT  : ...or visit https colon slash slash assemblyi dot com slash docs
```

`assemblyai` is spoken as **"assemblyi"** — the TTS drops a syllable from a domain name
(its own). The phone digits round-trip correctly, so this is specifically an entity/URL
pronunciation gap, again the exact class TTS-1 targets.
**Suggested fix.** Add a spelling/spell-out path (or pronunciation dictionary) for URLs,
domains, and unknown tokens.

---

## Tested and robust (no vulnerability)

These are negative results — surfaces we probed and found sound. Reported for completeness.

- **No injection via `text`.** A JSON control payload in `text` (`{"type":"Terminate"}`) is
  spoken literally, not interpreted (`bcd_fuzz.mjs`, B13).
- **`flush_id` cannot be spoofed.** A client-supplied `flush_id:999` is ignored; the server
  uses its own counter (`FlushDone flush_id:0`) (D3).
- **Wrong-typed known fields → clean `3006`.** `text` as number/array/object all return
  `"Generate.text: Input should be a valid string"` (B1–B3). Unknown fields are safely ignored
  (B10). Over-limit text (2001 chars) returns a clear, actionable error (B7).
- **State machine is safe.** Empty `Flush`, triple empty `Flush`, missing `type`, unknown
  `type`, non-JSON, `Generate`-after-`Terminate`, and double `Terminate` are all handled
  without a crash and with clear errors or no-ops (B4, D1–D8).

---

## Protocol (as observed)

Auth: `Authorization: <API_KEY>` header **or** `?token=<API_KEY>` (not `Bearer`). On connect
the server sends `Begin {id, expires_at, configuration}`. Client → server (JSON text):
`Generate {text ≤2000}`, `Flush`, `Cancel`, `KeepAlive`, `Terminate`, `VoiceReference`
(cloning, disabled here). Server → client: `Audio {audio: base64 PCM}`,
`FlushDone {flush_id, audio_duration_ms}`,
`WordBoundaries {flush_id, audio_start_ms, words[{word,start,end,confidence}]}`, `Cancelled`,
`Termination {session_duration_seconds, total_input_char_length, audio_duration_seconds}`,
`Error {error_code, error}`. Default audio: PCM S16LE mono @ 24 kHz in **text** frames
(base64). Voices: en `alba anna charles eve george iris jane jean mary michael paul reid vera`;
`estelle` fr, `juergen` de, `giovanni` it, `rafael` pt, `lola` es. Output languages: English,
French, German, Italian, Portuguese, Spanish.
