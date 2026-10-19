# Round-trip evidence (TTS → AssemblyAI STT)

Raw STT (`punctuate:false, format_text:false`) of the TTS output. A faithful
TTS makes the control transcribe cleanly; structured tokens below are where
the spoken form diverges from the text.

| case | input text | what AssemblyAI STT heard in the TTS audio |
|---|---|---|
| `control_prose` | The quick brown fox jumps over the lazy dog near the river bank. | the quick brown fox jumps over the lazy dog near the riverbank |
| `otp_currency` | Your OTP is 4096 and your balance is $1,234.56. | your otp is four thousand ninety six and your balance is one thousand two hundred thirty four dollars and fifty six cents |
| `email_time` | Email me at test.user+tag@sub.example.co.uk by 5:30 PM. | email me at test dot user plus tag at sub dot example dot co dot uk by five thirty p m |
| `phone_url` | Call +1 (415) 555-0137 or visit https://assemblyai.com/docs. | call plus one four one five five five five zero one three seven or visit https colon slash slash assemblyi dot com slash docs dot |
| `date_abbrev` | The meeting is on 10/11/2026 re: Q4 — see fig. 2(a). | the meeting is on october eleventh twenty twenty six re q four see fig two |
| `indian_units` | He paid Rs 2,00,000 for 3kg at 25 degrees C. | he paid rs two zero for three kilograms at twenty five degrees c |
| `symbols` | AI/ML & R&D cost ~50%, didn't it? Section 3.1(b). | ai ml and r and d cost fifty percent didn't it section three point one b |
