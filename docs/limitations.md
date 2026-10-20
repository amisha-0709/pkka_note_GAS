# Known System Limitations

To uphold scientific and engineering integrity, the following limitations are explicitly documented:

1. **Format Validity $\ne$ Existence or Ownership**: Passing 10-digit mobile validation (starting with 6-9) only proves structural compliance. It does not verify that the number is allocated by a telecom provider, currently active, or owned by the caller.
2. **Container-Local Audit Persistence**: The audit store operates on local JSON files (`data/pakka_note_audit.json`). In containerized deployments (Google Cloud Run or AI Studio container environments), local container storage is ephemeral and is not guaranteed durable across redeployments, container rebuilds, or multi-instance scaling. For production durability, Google Cloud SQL (PostgreSQL via Drizzle) or Cloud Firestore is required.
3. **Benchmark Validity & Evaluation Distinction**: Automated regression benchmark metrics represent deterministic FieldEngine logic and simulated transcripts. They do NOT evaluate live acoustic Speech-to-Text word error rate (WER). Genuine live acoustic evaluation requires pre-rendered synthetic speech clips with verified ground truth; synthetic tone audio is strictly limited to provider connectivity testing.
4. **Spelled Name Generalization**: The `spelled_name` profile is experimental. It normalizes individual spelled letters (e.g., "R-A-H-U-L"), but does not claim universal phonetic accuracy across diverse regional dialects without human confirmation.
5. **Audio Bandwidth in Headless / Container Environments**: Direct microphone capture requires user browser permission. In environments where `getUserMedia` is blocked, users must utilize file upload or synthetic audio presets.
6. **Third-Party Provider Latency**: Network round-trips to external Gnani endpoints introduce variable latency (~300ms to 1200ms depending on audio length and server load).
7. **No Universal Code-Mixing**: While English digits and common Hindi numerals are handled, rapid multilingual code-mixing with colloquial regional slang may require targeted human correction.
