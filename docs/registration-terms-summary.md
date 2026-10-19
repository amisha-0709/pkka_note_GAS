# Registration Terms & Competition Compliance Summary

## 1. Challenge Identification
- **Initiative**: Great Indian AI Internship Challenge 2026
- **Host**: Gnani AI (gnani.ai)
- **Official Portal**: https://www.gnani.ai/great-indian-ai-internship-registration-form
- **Recorded Submission Deadline**: 10 November 2026 at 11:59 PM IST (subject to live verification)

## 2. Technical Compliance
- **Prisma Speech-to-Text**: Mandatory integration. Implemented via server-side multipart API at `https://api.vachana.ai/stt/v3`.
- **Timbre Text-to-Speech**: Mandatory integration. Implemented via inference API at `https://api.vachana.ai/api/v1/tts/inference` using model `timbre-v2.5` and voice `Nalini`.
- **Award Categorization**:
  - Primary: *Noise Canceller* (supported by clean-vs-degraded telephony audio robustness testing).
  - Secondary: *Solo Ninja* (supported by complete, independently runnable full-stack application and empirical evidence).

## 3. Privacy & Intellectual Property Notice
- Uses synthetic test data only.
- Audio sent to Gnani endpoints is subject to Gnani's published privacy policy (https://www.gnani.ai/privacy).
- Benchmark confidentiality clauses in separate enterprise EULAs remain flagged for review prior to public external publication.
