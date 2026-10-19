# Technical Spike: Gnani Timbre Comparison & Intelligibility

- **Status**: Tested on Timbre v2.5 (v3.0 Comparison Pending Multi-Model Quota)
- **Active Model**: `timbre-v2.5`
- **Active Voice**: `Nalini`
- **Target Utterances**: 10 synthetic mobile read-backs, 10 synthetic service tags

## Findings on Intelligibility
1. **Pacing & Grouping**:
   - Monotone digit streams ("9876543210") caused listener fatigue and mishearing.
   - 5-5 grouped pacing with natural comma pauses ("9 8 7 6 5, pause, 4 3 2 1 0") produced maximum clarity in human auditory tests.
2. **Version Pinning**:
   - `timbre-v2.5` is stable and verified on the published inference endpoint.
   - v3.0 model availability will be evaluated as new enterprise credentials become accessible.
