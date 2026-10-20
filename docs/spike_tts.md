# Technical Spike: Gnani Timbre Comparison & Intelligibility

## Evidence Classification
- **Pacing & Text Formatting Engine**: `Unit-tested` (5-5 grouped digit spacing with natural pauses).
- **Audio Response & Contract Parsing**: `Route-tested with mocked providers` (Base64/binary stream detection, 44-byte WAV header checks, timeout cleanup).
- **Live Provider Integration**: `Live-provider smoke-tested` (Tested on Timbre v2.5 with Nalini voice).

## Target Profile
- **Active Model**: `timbre-v2.5`
- **Active Voice**: `Nalini`
- **Target Utterances**: 10 synthetic mobile read-backs, 10 synthetic service tags.

## Findings on Intelligibility
1. **Pacing & Grouping**:
   - Monotone digit streams ("9876543210") caused listener fatigue and mishearing.
   - 5-5 grouped pacing with natural comma pauses ("9 8 7 6 5, pause, 4 3 2 1 0") produced maximum clarity in human auditory tests.
2. **Version Pinning & Request Contract**:
   - `timbre-v2.5` is stable and verified on the published inference endpoint `https://api.vachana.ai/api/v1/tts/inference`.
   - Sends strictly canonical fields (`text`, `language`, `voice`, `audio_format`, optional `model`), avoiding duplicate or guessed parameters.
