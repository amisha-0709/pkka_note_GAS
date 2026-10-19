# Pakka Note

> **Capture. Validate. Read back. Confirm.**
> Voice-to-structured-data verification framework built for the Great Indian AI Internship Challenge 2026.

---

## 1. Project Overview

Pakka Note turns spoken identifiers (mobile numbers, postal PINs, service tags, and spelled names) into structured, validated values. It addresses the fundamental reality of speech recognition: **speech recognition models produce candidates, not guaranteed ground truth**.

Pakka Note enforces the 7-step verification workflow:
```
CAPTURE → TRANSCRIBE → PARSE → VALIDATE → READ BACK → CONFIRM OR CORRECT → AUDIT
```

The system strictly distinguishes:
1. What the user said.
2. What the speech recognition model transcribed.
3. What value the FieldEngine extracted.
4. Whether the value passes structural format validation.
5. Whether the user or agent explicitly confirmed it.
6. Whether any targeted correction was performed.

*Notice: Format validity does not prove that an identifier is active, real-world assigned, or owned by any specific individual.*

---

## 2. Real Gnani AI Integrations

- **Gnani Prisma Speech-to-Text (STT)**:
  - Endpoint: `https://api.vachana.ai/stt/v3`
  - Auth Header: `X-API-Key-ID: <GNANI_API_KEY>`
  - Modes: `transcribe` and `verbatim`
  - Supported Languages: English (`en-IN`), Hindi (`hi-IN`)
- **Gnani Timbre Text-to-Speech (TTS)**:
  - Inference Endpoint: `https://api.vachana.ai/api/v1/tts/inference`
  - Model: `timbre-v2.5`
  - Voice: `Nalini`
  - Phonation Pacing: Formats digit sequences into 5-5 grouped segments with natural pauses for clear acoustic verification.

---

## 3. Google AI Studio Secrets Configuration

Pakka Note handles secrets entirely server-side. The API key is never exposed to browser bundles or client storage.

1. In the Google AI Studio interface, open the **Secrets panel**.
2. Add a new secret named:
   ```
   GNANI_API_KEY
   ```
3. Value: Your Gnani AI API Key.
4. The backend automatically injects this key into requests to `api.vachana.ai`.
5. If the key is not set, the application runs gracefully in diagnostic/offline regression mode with pre-packaged synthetic challenge audio fixtures.

---

## 4. Running the Project & Tests

### Start Development Server
```bash
npm run dev
```
Runs full-stack Express server with Vite middleware on port 3000.

### Run Pure Logic Unit Tests
```bash
npm test
```
Executes native Node.js 22 test runner (`node:test`, `node:assert/strict`) verifying field profiles, digit normalizers, Hindi/English numerals, state transitions, negations, and targeted partial corrections.

### Build for Production
```bash
npm run build
```
Builds the Vite client bundle and compiles `server.ts` via esbuild.

---

## 5. Supported Field Profiles

| Field | Format Specification | Key Rules & Normalizations |
| :--- | :--- | :--- |
| **Mobile Number** | 10 digits (e.g. `9876543210`) | Starts with 6, 7, 8, 9; handles "double nine", Hindi numerals; strips single trunk `0` or country code `91`. |
| **Postal PIN** | 6 digits (e.g. `560001`) | Starts with 1–9; strictly synthetic only; never collect banking PINs. |
| **Service Tag** | 7 alphanumeric characters (e.g. `AB74K9Q`) | Uppercase normalized; resolves NATO phonetic codewords ("Alpha Bravo 7 4 Kilo 9 Quebec"). |
| **Spelled Name** | 2–30 characters (e.g. `RAHUL`) | Letter-by-letter spelling assembly; marked experimental. |

---

## 6. Audit & Persistence

All captures, state transitions (`valid_candidate`, `read_back`, `confirmed`, `rejected`, `corrected`), and latency metrics are persisted in a relational file-backed store at `data/pakka_note_audit.json`.
- Zero secrets logged.
- Zero customer PII retained.
- Chronological timeline inspection available in the **Session History** tab.

---

## 7. Submission Checklist & References

- **Challenge**: [Great Indian AI Internship Challenge 2026 Registration](https://www.gnani.ai/great-indian-ai-internship-registration-form)
- **Deadline**: 10 November 2026 at 11:59 PM IST
- **Prisma STT**: https://www.gnani.ai/speech-to-text-api
- **Timbre TTS**: https://www.gnani.ai/text-to-speech-api
- **Privacy Policy**: https://www.gnani.ai/privacy
