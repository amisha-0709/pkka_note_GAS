# Benchmark Methodology & Metric Definitions

## 1. Test Manifest Structure
The standardized evaluation suite contains 10 categorical test cases:
1. `valid_mobile`: Standard clean 10-digit Indian mobile.
2. `degraded_telephony`: 8kHz simulated bandwidth with ambient acoustic noise.
3. `eight_digit_mobile`: Truncated speech capturing only 8 digits (expected: REJECT).
4. `eleven_digit_mobile`: Extra trailing digit (expected: REJECT).
5. `yes_confirmation`: Explicit affirmative utterance ("yes that is correct").
6. `no_confirmation`: Explicit negative utterance ("no that is wrong").
7. `unclear_confirmation`: Ambiguous utterance ("maybe nine"). Must NOT confirm!
8. `correction_case`: Typo in suffix repaired via targeted correction.
9. `silence_case`: Audio with ambient silence or no speech.
10. `service_tag_nato`: Alphanumeric string with NATO phonetics.

## 2. Metric Formulations

### Exact-Match Accuracy
$$\text{Accuracy} = \frac{\text{Cases where Candidate} == \text{Expected Value}}{\text{Eligible Exact-Match Cases}} \times 100\%$$

### Invalid-Format Rejection Rate
$$\text{Rejection Rate} = \frac{\text{Malformed Cases Correctly Rejected}}{\text{Total Malformed Test Cases}} \times 100\%$$

### False-Acceptance Rate
$$\text{False Acceptance} = \frac{\text{Malformed Cases Incorrectly Marked Valid}}{\text{Total Malformed Test Cases}} \times 100\%$$

### Correction Success Rate
$$\text{Correction Success} = \frac{\text{Repaired Cases Matching Expected Value}}{\text{Total Correction Cases Attempted}} \times 100\%$$

## 3. Reporting Honesty
All runs clearly distinguish whether they executed against live Gnani endpoints or standardized offline regression fixtures.
