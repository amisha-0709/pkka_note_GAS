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
  - Response Handling: 2xx responses with missing, unrecognized, or empty transcripts return strict failure.
- **Gnani Timbre Text-to-Speech (TTS)**:
  - Inference Endpoint: `https://api.vachana.ai/api/v1/tts/inference`
  - Model: `timbre-v2.5`
  - Voice: `Nalini`
  - Phonation Pacing: Formats digit sequences into 5-5 grouped segments with natural pauses for clear acoustic verification.
  - Contract: Sends canonical payload (`text`, `language`, `voice`, `audio_format`, `model`), detects audio stream vs JSON responses, validates audio payload size >= 44 bytes.

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

## 4. Verification & Evidence Matrix

All components are strictly categorized by their verified evidence tier:

| Component / Feature | Evidence Level | Verification Details |
| :--- | :--- | :--- |
| **FieldEngine Normalization** | **Unit-tested** | 100% rejection of 8-digit, 11-digit, and empty inputs; NATO phonetics; Hindi numerals (`src/lib/fieldEngine.test.ts`). |
| **Confirmation State Machine** | **Unit-tested** | Valid state jumps, affirmation/rejection classification, negation handling ("not correct" $\to$ reject). |
| **HTTP Confirmation Routes** | **Route-tested with mocked providers** | Real HTTP requests against localhost: blocks confirm before read-back, blocks stale/invalid candidates, blocks wrong-session capture IDs, enforces re-readback after correction (`src/server/confirmation_routes.test.ts`). |
| **Audit Persistence Failure Handling** | **Route-tested with mocked providers** | Observable flush failure returns HTTP 500 `AUDIT_PERSISTENCE_FAILED`, rolls back in-memory state, and refuses to finalize confirmation. |
| **Prisma & Timbre Error Contracts** | **Route-tested with mocked providers** | Empty transcripts, invalid JSON, truncated audio, auth failure credential masking, and upstream 500 errors. |
| **Provider Connectivity Smoke Test** | **Live-provider smoke-tested** | 1.5s 440 Hz synthetic tone verifies network latency, API key headers, and endpoint health without claiming speech accuracy. |
| **Live Speech Accuracy Benchmark** | **Pending/manual** | Requires pre-recorded synthetic speech WAV clips with known ground truth and active account quota. |

---

## 5. Running the Project & Tests

### Start Development Server
```bash
npm run dev
```
Runs full-stack Express server with Vite middleware on port 3000.

### Run Automated Test Suite
```bash
npm test
```
Executes native Node.js 22 test runner (`node:test`) verifying pure logic, route-level HTTP contracts, mocked provider responses, and benchmark mode distinctions.

### Type Check & Lint
```bash
npm run lint
```
Executes TypeScript type checker without emitting code.

### Build for Production
```bash
npm run build
```
Builds the Vite client bundle and compiles `server.ts` via esbuild.

---

## 6. Supported Field Profiles

| Field | Format Specification | Key Rules & Normalizations |
| :--- | :--- | :--- |
| **Mobile Number** | 10 digits (e.g. `9876543210`) | Starts with 6, 7, 8, 9; handles "double nine", Hindi numerals; strips single trunk `0` or country code `91`. |
| **Postal PIN** | 6 digits (e.g. `560001`) | Starts with 1–9; strictly synthetic only; never collect banking PINs. |
| **Service Tag** | 7 alphanumeric characters (e.g. `AB74K9Q`) | Uppercase normalized; resolves NATO phonetic codewords ("Alpha Bravo 7 4 Kilo 9 Quebec"). |
| **Spelled Name** | 2–30 characters (e.g. `RAHUL`) | Letter-by-letter spelling assembly; marked experimental. |

---

## 7. Audit & Persistence

All captures, state transitions (`valid_candidate`, `read_back`, `confirmed`, `rejected`, `corrected`), and latency metrics are persisted in a container-local JSON store at `data/pakka_note_audit.json`.
- **Concurrency & Atomicity**: Atomic file rename prevents corruption under concurrent requests.
- **Observable Persistence**: State finalization operations explicitly await disk write completion. If writing fails, mutations are rolled back in memory and an HTTP 500 error is returned.
- **Runtime Durability Limitation**: Container-local storage is ephemeral in container runtimes (Cloud Run / AI Studio preview). In a multi-instance production deployment, Google Cloud SQL (PostgreSQL via Drizzle) or Cloud Firestore is the recommended persistent store.
- Zero secrets logged.
- Zero customer PII retained.

---

## 8. Manual Smoke-Test Procedure for Live Gnani APIs

When your `GNANI_API_KEY` is configured in the Secrets panel, verify the live integration manually using the following procedure:

### Step 1: Prisma STT Verification (Spoken Identifier)
1. Open the **Capture** tab (`http://localhost:3000/`).
2. Select **Mobile Number** and **English (en-IN)**.
3. Choose the pre-packaged synthetic audio preset **Clean 10-Digit Mobile** (or speak "nine eight seven six five four three two one zero" into the microphone).
4. Click **Transcribe & Normalize**.
5. Verify in the 4-Way Diagnostic view:
   - **What User Said**: Spoken sequence.
   - **What Prisma Heard**: Raw transcript received from live Gnani Prisma v3 endpoint.
   - **What FieldEngine Parsed**: Normalized 10-digit candidate `9876543210`.
   - **Field Validation**: Marked **VALID CANDIDATE** (green badge).

### Step 2: Timbre TTS Verification (Spoken Read-Back)
1. In the **Spoken Read-Back** card, observe the formatted read-back text: `"9 8 7 6 5, pause, 4 3 2 1 0"`.
2. Click **Synthesize Read-Back** (or wait for auto read-back).
3. Verify that the network request to `/api/readback` succeeds with HTTP 200.

### Step 3: Audio Playback in the UI
1. Click the **Play Audio** button in the read-back card.
2. Confirm audible speech synthesized by Gnani Timbre (Nalini voice) reciting the 10 digits with a natural pause between the two 5-digit groups.
3. Click **Confirm Value** to complete the verification workflow and finalize the audit record.

---

## 9. Submission Checklist & References

- **Challenge**: [Great Indian AI Internship Challenge 2026 Registration](https://www.gnani.ai/great-indian-ai-internship-registration-form)
- **Deadline**: 10 November 2026 at 11:59 PM IST
- **Prisma STT**: https://www.gnani.ai/speech-to-text-api
- **Timbre TTS**: https://www.gnani.ai/text-to-speech-api
- **Privacy Policy**: https://www.gnani.ai/privacy
