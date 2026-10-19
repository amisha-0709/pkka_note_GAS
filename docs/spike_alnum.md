# Technical Spike: Alphanumeric Service Tag Evaluation

- **Status**: Tested on Synthetic Suite (Decision Pending Live Account Quota)
- **Target Profile**: 7-character alphanumeric service tags (e.g. `AB74K9Q`)
- **Sample Size**: 20 synthetic utterances
- **Speech Modes Compared**:
  - Individual letters and digits ("A B 7 4 K 9 Q")
  - NATO phonetic codewords ("Alpha Bravo 7 4 Kilo 9 Quebec")
  - Disambiguation phrases ("A for apple B for ball...")

## Empirical Observations
1. **NATO Codewords**: Yielded 100% parseability when mapped to canonical single uppercase characters.
2. **Generic Transcription**: Without verbatim mode, strings like "AB74K9Q" can be misinterpreted as dictionary words (e.g. "Abby", "Queue").
3. **Decision Rule**:
   - $\ge 70\%$ parseable: Support NATO and spaced characters in verbatim mode.
   - Mandate spoken read-back and human confirmation before marking final.
