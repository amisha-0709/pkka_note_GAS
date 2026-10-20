# Pakka Note: Architecture Specification

## 1. System Overview

Pakka Note is a full-stack voice-to-structured-data verification framework designed to solve the fundamental problem of acoustic ambiguity in speech recognition for high-stakes identifiers (mobile numbers, PINs, service tags, spelled names).

Its core architecture is governed by the 7-step pipeline:
```
CAPTURE → TRANSCRIBE → PARSE → VALIDATE → READ BACK → CONFIRM OR CORRECT → AUDIT
```

## 2. Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + TS)                   │
│  - MediaRecorder / Web Audio (16kHz PCM WAV encoder)        │
│  - Field Profile Selector (Mobile, PIN, Tag, Spelled Name)  │
│  - 4-Way Diagnostic Pipeline View (Said, Heard, Parsed, OK) │
│  - Gnani Timbre Read-back Player (Spaced digits & audio)   │
│  - Explicit Confirmation & Targeted Correction State Machine │
└──────────────────────────────▲──────────────────────────────┘
                               │ HTTP / JSON
┌──────────────────────────────▼──────────────────────────────┐
│                  Backend (Node.js Express + TS)             │
│  - /api/capture (Multer audio receiver + Gnani Prisma STT)  │
│  - /api/readback (Pacing formatter + Gnani Timbre TTS)     │
│  - /api/confirmation (Strict affirmative / negative parser) │
│  - /api/correction (Targeted partial / full replacer)       │
│  - /api/records (Session chronological state events)        │
│  - /api/benchmark (Simulated regression & smoke testing)    │
└──────────────▲──────────────────────────────▲───────────────┘
               │                              │
    ┌──────────▼──────────┐        ┌──────────▼──────────┐
    │   Gnani Prisma STT   │        │   Gnani Timbre TTS  │
    │  - api.vachana.ai   │        │  - api.vachana.ai   │
    │  - v3 STT Endpoint  │        │  - v1 TTS Inference │
    │  - en-IN / hi-IN    │        │  - Timbre v2.5      │
    └─────────────────────┘        └─────────────────────┘
```

## 3. Data Flow & Security Discipline

1. **Zero Secret Leakage**: `GNANI_API_KEY` is read strictly from `process.env.GNANI_API_KEY` server-side. It is never transmitted to the browser, never written to audit files, and never logged in error traces.
2. **Audio Minimization**: In standard operation, audio buffers are processed in memory and released immediately after transcription. No raw customer audio is stored on disk.
3. **Synthetic Policy**: The application operates under a strict synthetic data protocol for challenge evaluation and testing.

## 4. Audit Persistence Architecture

- **Storage Engine**: Container-local file-backed JSON store at `data/pakka_note_audit.json`.
- **Concurrency & Atomicity**: Write requests are serialized via an internal Promise queue and committed to disk via atomic temporary file renaming.
- **Observable Persistence**: State finalization operations explicitly await `auditDb.flush()`. If disk write fails, changes are rolled back in memory and an HTTP 500 error is returned, preventing phantom confirmations.
- **Production Durability Road-map**: In ephemeral container runtimes (such as Google Cloud Run or AI Studio preview instances), container-local files do not persist across restarts or redeployments. For production multi-instance durability, Cloud SQL (PostgreSQL with Drizzle ORM) or Google Cloud Firestore is the recommended target.
