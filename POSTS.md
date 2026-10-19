# Ready-to-paste posts

Repo: https://github.com/YashasviThakur/assemblyai-tts-security
Handles: X → `@AssemblyAI` · LinkedIn → **AssemblyAI**

---

## X / Twitter — primary (single post)

> Audited @AssemblyAI's new, undocumented streaming TTS API for their hackathon —
> and proved the bugs by round-trip: synthesize text, then transcribe it back with
> AssemblyAI's *own* STT.
>
> It reads Indian ₹ amounts as gibberish: 2,00,000 → "two zero".
>
> 11 findings, all with runnable repros 👇
> github.com/YashasviThakur/assemblyai-tts-security

## X / Twitter — optional thread (post the primary above as 1/, then:)

**2/**
> Why round-trip? No "trust my ears." If the API's own speech-to-text transcribes
> the TTS output differently from the text, that's the API contradicting itself.
> The control cases (plain prose, $1,234.56, emails, phone digits) all pass — so
> the failures are real, not noise.

**3/**
> The number bug is isolated: 2,00,000 (Indian lakh) → "two zero", 1,50,00,000
> (crore) → "one fifty zero", while 200,000 and 15,000,000 (Western grouping) read
> correctly. Any India-facing voice agent reading rupee amounts speaks the wrong figure.

**4/**
> Beyond that: a billing-integrity cluster (you're billed for audio you cancelled or
> never flushed, while the Cancelled event reports 0s), non-deterministic word
> timestamps (~7% silently dropped), and control-char passthrough into captions.
> Full report + one-file repros: github.com/YashasviThakur/assemblyai-tts-security

---

## LinkedIn

> For AssemblyAI's online hackathon #2 I took the security / bug-report track and
> audited their new **streaming text-to-speech API** — which shipped with no public
> documentation. I reverse-engineered the protocol by probing it with my own key,
> then proved the correctness bugs by **round-trip**: synthesize text with the TTS,
> then transcribe the audio back with AssemblyAI's *own* speech-to-text. If the API
> hears something different from what was written, that's objective evidence — no
> "trust my ears."
>
> The flagship finding: the TTS reads **Indian ₹ amounts as gibberish**.
> • 2,00,000 (two lakh) → "two zero"
> • 1,50,00,000 (1.5 crore) → "one fifty zero"
> • 200,000 and 15,000,000 (Western grouping) read correctly
> Any India-facing voice product reading rupee balances or totals would speak a
> catastrophically wrong number — with no error.
>
> 11 findings in total, each with a runnable one-file reproduction and captured
> evidence, including:
> • a billing-integrity cluster — you're billed for audio you cancelled or never
>   flushed, while the "Cancelled" event reports 0 seconds
> • non-deterministic word-level timestamps (~7% of affected utterances silently
>   return none), which breaks captioning
> • control characters (NUL / ANSI escapes) passing straight through into the word
>   tokens a caption renderer would display
> Plus a "tested-and-robust" section (no text-field injection, no ID spoofing) so the
> report shows what's solid, not just what's broken.
>
> Repo (report + repros + a short demo clip): https://github.com/YashasviThakur/assemblyai-tts-security
>
> Thanks to the AssemblyAI team for a genuinely fun endpoint to pull apart.
>
> #AssemblyAI #VoiceAI #TextToSpeech #SpeechAI #BugBounty #Hackathon

---

*Tip: LinkedIn shows a link preview card for the repo URL — you can delete the raw
URL line after pasting if you prefer the card alone. On X, the primary post keeps the
link clickable; attach the demo clip (`demo/roundtrip.svg` exported to GIF/MP4, or a
screen recording) for more reach.*
