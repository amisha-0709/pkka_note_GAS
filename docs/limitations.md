# Known System Limitations

To uphold scientific and engineering integrity, the following limitations are explicitly documented:

1. **Format Validity $\ne$ Existence or Ownership**: Passing 10-digit mobile validation (starting with 6-9) only proves structural compliance. It does not verify that the number is allocated by a telecom provider, currently active, or owned by the caller.
2. **Spelled Name Generalization**: The `spelled_name` profile is experimental. It normalizes individual spelled letters (e.g., "R-A-H-U-L"), but does not claim universal phonetic accuracy across diverse regional dialects without human confirmation.
3. **Audio Bandwidth in Headless / Container Environments**: Direct microphone capture requires user browser permission. In environments where `getUserMedia` is blocked, users must utilize the file upload or built-in synthetic audio presets.
4. **Third-Party Provider Latency**: Network round-trips to external Gnani endpoints introduce variable latency (~300ms to 1200ms depending on audio length and server load).
5. **No Universal Code-Mixing**: While English digits and common Hindi numerals are handled, rapid multilingual code-mixing with colloquial regional slang may require targeted human correction.
