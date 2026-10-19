# Privacy, Security & Threat Modeling

## 1. Threat Matrix & Mitigations

| Threat ID | Threat Description | Severity | Architectural Mitigation in Pakka Note |
| :--- | :--- | :--- | :--- |
| **T-01** | **Acoustic Misrecognition**: 1 wrong digit transcribed in a 10-digit number. | High | Field-aware validation catches length/prefix issues; spoken read-back via Gnani Timbre allows human ear verification. |
| **T-02** | **False Acceptance**: Caller agrees to wrong number due to automation bias. | Critical | Grouped digit read-back ("98765, 43210") prevents monotone blur; explicit confirmation button required; format validity != real existence notice. |
| **T-03** | **API Key Leakage**: Exposure of `GNANI_API_KEY` in client source or logs. | Critical | Zero client exposure; key injected via AI Studio Secrets server-side; masked in all diagnostics; excluded from audit JSON. |
| **T-04** | **Audio / PII Leakage**: Permanent retention of customer voice recordings. | High | Audio buffers processed in-memory and discarded; persistent database stores only session IDs, state transitions, and synthetic candidates. |
| **T-05** | **Provider Rate Limits / Outages**: Gnani STT/TTS endpoint timeout or 429. | Medium | Bounded 15s request timeouts with AbortController; explicit graceful degradation; no silent fallback to Google TTS. |
| **T-06** | **Ambiguous Voice Confirmation**: Background speech mistaken for "Yes". | High | Confirmation classifier tests for negation first ("not correct" != "yes"); ambiguous utterances classify as "unclear" and never auto-confirm. |

## 2. Synthetic Data Protocol
Pakka Note is an experimental prototype prepared for the Great Indian AI Internship Challenge 2026. Under no circumstances should real personal identifiers (Aadhaar, PAN, actual customer phone numbers, or confidential financial credentials) be processed by this prototype.
