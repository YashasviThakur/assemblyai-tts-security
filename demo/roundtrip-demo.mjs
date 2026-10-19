// Offline, instant replay of the round-trip proof — prints the recorded
// TTS -> AssemblyAI-STT results as a scoreboard. No key or network needed.
// To reproduce live against the API, run:  node --env-file=.env probes/roundtrip.mjs
const c = (n, s) => `\x1b[${n}m${s}\x1b[0m`;
const red = (s) => c(31, s), grn = (s) => c(32, s), dim = (s) => c(90, s), ylw = (s) => c(33, s), bold = (s) => c(1, s);

// Verbatim from evidence/roundtrip.md + evidence/roundtrip_numbers.md.
const ROWS = [
  ["num_indian_lakh", "He paid 2,00,000 rupees.", "he paid two zero rupees", false, "₹200,000 → 'two zero'"],
  ["num_indian_crore", "He paid 1,50,00,000 rupees.", "he paid one fifty zero rupees", false, "₹1.5cr → 'one fifty zero'"],
  ["num_western", "He paid 200,000 rupees.", "he paid two hundred thousand rupees", true, "Western grouping OK"],
  ["num_plain", "He paid 200000 rupees.", "he paid two hundred thousand rupees", true, "ungrouped OK"],
  ["phone_url", "...https://assemblyai.com/docs", "...assemblyi dot com...", false, "own domain mangled"],
  ["otp_currency", "Your OTP is 4096 ... $1,234.56", "four thousand ninety six ... fifty six cents", true, "numbers/currency OK"],
  ["email_time", "test.user+tag@sub.example.co.uk 5:30 PM", "...plus tag at sub dot example dot co dot uk ... five thirty p m", true, "email/time OK"],
  ["control_prose", "The quick brown fox ... river bank.", "the quick brown fox ... riverbank", true, "plain prose OK"],
];

console.log("\n" + bold("  Round-trip proof") + dim("  — synthesize text, transcribe the audio with AssemblyAI's own STT\n"));
console.log(dim("  case               verdict  input → what STT heard"));
console.log(dim("  ─────────────────────────────────────────────────────────────────────────"));
for (const [id, text, stt, ok, note] of ROWS) {
  const mark = ok ? grn("✓ PASS") : red("✗ FAIL");
  const line = ok ? dim(note) : red(note);
  console.log(`  ${id.padEnd(17)} ${mark}   ${line}`);
  if (!ok) console.log(dim(`                              text: `) + ylw(`"${text}"`) + dim("  →  stt: ") + red(`"${stt}"`));
}
const fails = ROWS.filter((r) => !r[3]).length;
console.log(dim("  ─────────────────────────────────────────────────────────────────────────"));
console.log(`  ${bold(String(fails) + " correctness failures")} confirmed by the API's own STT; the passing rows prove the test is fair.`);
console.log(dim("  Full report: FINDINGS.md   ·   live repro: node --env-file=.env probes/roundtrip.mjs\n"));
