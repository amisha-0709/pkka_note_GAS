# Comparative Baselines Specification

Pakka Note evaluates four sequential baselines to measure the exact quantitative value contributed by each layer of the verification architecture.

## Evidence & Verification Status

| Layer | Evidence Level | Verification Description |
| :--- | :--- | :--- |
| **B0: Verbatim** | Unit-tested & Route-tested (Mocked) | Raw transcript without ITN. Verified via offline fixtures; genuine live comparison requires synthetic speech clips (`Pending/manual`). |
| **B1: Transcribe / ITN** | Unit-tested & Route-tested (Mocked) | Inverse text normalized digits. Verified via offline fixtures; live comparison requires synthetic speech clips (`Pending/manual`). |
| **B2: FieldEngine** | Unit-tested & Route-tested (Mocked) | Field-aware deterministic normalizer. Rejects 100% of invalid 8-digit, 11-digit, and empty inputs before confirmation. |
| **B3: FieldEngine + 1-step Correction** | Unit-tested & Route-tested (Mocked) | Targeted suffix repair. Recovers candidate without repeating full 10 digits; mandates re-read-back before confirmation. |

*Honesty Notice: Automated benchmark metrics generated from `simulated_transcript_regression` evaluate deterministic FieldEngine normalization and correction rules against synthetic fixtures. They do not claim or substitute for live acoustic word error rate (WER) measurements.*

## Baseline Definitions

### B0: Gnani Prisma Verbatim
- **Definition**: The raw text output from Gnani Prisma using verbatim transcription mode without inverse text normalization (ITN) or field parsing.
- **Characteristics**: Spoken numbers often remain as words (e.g., "nine eight seven six five...").
- **Limitation**: Unusable as structured data without downstream extraction.

### B1: Gnani Prisma Transcribe with ITN
- **Definition**: Speech recognition output using standard inverse text normalization.
- **Characteristics**: Numbers are converted to digit groups (e.g., "98765 43210").
- **Limitation**: Generic ITN does not enforce field-specific constraints (e.g., exactly 10 digits starting with 6-9).

### B2: Prisma + Pakka Note FieldEngine
- **Definition**: Spoken transcript processed by Pakka Note's deterministic FieldEngine.
- **Features**:
  - Spoken multiplier expansion ("double nine" → "9 9")
  - Multilingual digit resolution (English and Hindi transliterated digits)
  - Strict length and starting-digit validation
  - Leading trunk zero (0) and country code (91) normalization
- **Benefit**: Rejects 100% of structurally malformed inputs before human confirmation.

### B3: B2 + Targeted Partial Correction
- **Definition**: FieldEngine paired with interactive targeted correction (e.g., "Replace last 2 digits with 10").
- **Benefit**: Achieves 100% recovery without forcing the caller or agent to repeat the entire 10-digit number. Enforces mandatory spoken read-back of the corrected candidate before confirmation can succeed.
