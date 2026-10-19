# Comparative Baselines Specification

Pakka Note evaluates four sequential baselines to measure the exact quantitative value contributed by each layer of the verification architecture.

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
- **Benefit**: Achieves 100% recovery without forcing the caller or agent to repeat the entire 10-digit number.
