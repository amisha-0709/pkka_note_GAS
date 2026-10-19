/**
 * Pakka Note - Field Engine & Normalization Pipeline
 * Pure, decoupled validation logic with explicit step tracking
 */

import type {
  FieldType,
  FieldValidationResult,
  NormalizationStep,
} from '../types/index.ts';

// Spoken digit dictionary (English & Hindi)
const SPOKEN_DIGIT_MAP: Record<string, string> = {
  // English
  zero: '0',
  oh: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',

  // Hindi (transliterated)
  shunya: '0',
  ek: '1',
  do: '2',
  teen: '3',
  char: '4',
  chaar: '4',
  paanch: '5',
  panch: '5',
  chheh: '6',
  chhe: '6',
  saat: '7',
  aath: '8',
  ath: '8',
  nau: '9',
};

// NATO Phonetic mapping
const NATO_PHONETIC_MAP: Record<string, string> = {
  alpha: 'A',
  alfa: 'A',
  bravo: 'B',
  charlie: 'C',
  delta: 'D',
  echo: 'E',
  foxtrot: 'F',
  golf: 'G',
  hotel: 'H',
  india: 'I',
  juliet: 'J',
  juliett: 'J',
  kilo: 'K',
  lima: 'L',
  mike: 'M',
  november: 'N',
  oscar: 'O',
  papa: 'P',
  quebec: 'Q',
  romeo: 'R',
  sierra: 'S',
  tango: 'T',
  uniform: 'U',
  victor: 'V',
  whiskey: 'W',
  xray: 'X',
  'x-ray': 'X',
  yankee: 'Y',
  zulu: 'Z',
};

/**
 * Normalizes spoken digit expressions like "double nine", "triple five"
 */
function expandSpokenMultipliers(text: string): string {
  let expanded = text;
  
  // Double <word/digit>
  expanded = expanded.replace(/\bdouble\s+([a-zA-Z0-9]+)\b/gi, (_, val) => {
    return `${val} ${val}`;
  });

  // Triple <word/digit>
  expanded = expanded.replace(/\btriple\s+([a-zA-Z0-9]+)\b/gi, (_, val) => {
    return `${val} ${val} ${val}`;
  });

  return expanded;
}

/**
 * Normalizes spoken English/Hindi digit words to numeric digits
 */
export function normalizeSpokenDigits(raw: string, steps: NormalizationStep[]): string {
  const step1 = expandSpokenMultipliers(raw);
  if (step1 !== raw) {
    steps.push({
      step: 'expand_multipliers',
      before: raw,
      after: step1,
      description: 'Expanded spoken multipliers (e.g., "double" or "triple")',
    });
  }

  // Tokenize words, punctuation, and digits
  const tokens = step1.toLowerCase().split(/[\s,.-]+/);
  const normalizedTokens: string[] = [];

  for (const token of tokens) {
    if (!token) continue;
    if (SPOKEN_DIGIT_MAP[token] !== undefined) {
      normalizedTokens.push(SPOKEN_DIGIT_MAP[token]);
    } else {
      normalizedTokens.push(token);
    }
  }

  const result = normalizedTokens.join(' ');
  if (result !== step1) {
    steps.push({
      step: 'spoken_words_to_digits',
      before: step1,
      after: result,
      description: 'Converted spoken number words into numeric characters',
    });
  }

  return result;
}

/**
 * Extracts digits from text, discarding whitespace and punctuation
 */
export function extractDigitsOnly(text: string): string {
  return text.replace(/\D/g, '');
}

/**
 * Validates Mobile Number profile
 */
export function validateMobileNumber(rawTranscript: string): FieldValidationResult {
  const steps: NormalizationStep[] = [];
  const warnings: string[] = [
    'Synthetic check: Format validity does NOT prove active status, SIM assignment, or person identity.',
  ];

  if (!rawTranscript || !rawTranscript.trim()) {
    return {
      field: 'mobile_number',
      rawTranscript,
      normalizedCandidate: '',
      valid: false,
      status: 'invalid_candidate',
      validationMessage: 'Empty speech input. No speech or audio transcript detected.',
      normalizationSteps: steps,
      warnings,
    };
  }

  const normalizedWords = normalizeSpokenDigits(rawTranscript, steps);
  const digits = extractDigitsOnly(normalizedWords);

  steps.push({
    step: 'extract_digits',
    before: normalizedWords,
    after: digits,
    description: 'Extracted raw digit sequence',
  });

  // Handling 10-digit mobile number rules
  if (digits.length === 10) {
    const firstDigit = digits[0];
    if (['6', '7', '8', '9'].includes(firstDigit)) {
      return {
        field: 'mobile_number',
        rawTranscript,
        normalizedCandidate: digits,
        valid: true,
        status: 'valid_candidate',
        validationMessage: `Valid 10-digit Indian mobile format (starts with ${firstDigit}).`,
        normalizationSteps: steps,
        warnings,
      };
    } else {
      return {
        field: 'mobile_number',
        rawTranscript,
        normalizedCandidate: digits,
        valid: false,
        status: 'invalid_candidate',
        validationMessage: `Invalid starting digit "${firstDigit}". Indian mobile numbers must start with 6, 7, 8, or 9.`,
        normalizationSteps: steps,
        warnings,
      };
    }
  }

  if (digits.length === 8) {
    return {
      field: 'mobile_number',
      rawTranscript,
      normalizedCandidate: digits,
      valid: false,
      status: 'invalid_candidate',
      validationMessage: 'Incomplete mobile candidate: exactly 8 digits detected. Indian mobile numbers require 10 digits (2 digits missing).',
      normalizationSteps: steps,
      warnings,
    };
  }

  if (digits.length === 11) {
    // Check if leading 0
    if (digits.startsWith('0')) {
      const trimmed = digits.substring(1);
      steps.push({
        step: 'trim_leading_zero',
        before: digits,
        after: trimmed,
        description: 'Stripped single leading trunk prefix zero (0)',
      });
      if (['6', '7', '8', '9'].includes(trimmed[0])) {
        return {
          field: 'mobile_number',
          rawTranscript,
          normalizedCandidate: trimmed,
          valid: true,
          status: 'valid_candidate',
          validationMessage: 'Valid 10-digit mobile number after stripping leading trunk prefix 0.',
          normalizationSteps: steps,
          warnings,
        };
      }
    }

    return {
      field: 'mobile_number',
      rawTranscript,
      normalizedCandidate: digits,
      valid: false,
      status: 'invalid_candidate',
      validationMessage: `Invalid length: 11 digits detected (${digits}). Indian mobile numbers require exactly 10 digits.`,
      normalizationSteps: steps,
      warnings,
    };
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    const trimmed = digits.substring(2);
    steps.push({
      step: 'trim_country_code',
      before: digits,
      after: trimmed,
      description: 'Stripped leading country code prefix 91',
    });
    if (['6', '7', '8', '9'].includes(trimmed[0])) {
      return {
        field: 'mobile_number',
        rawTranscript,
        normalizedCandidate: trimmed,
        valid: true,
        status: 'valid_candidate',
        validationMessage: 'Valid 10-digit mobile number after stripping country code 91.',
        normalizationSteps: steps,
        warnings,
      };
    }
  }

  return {
    field: 'mobile_number',
    rawTranscript,
    normalizedCandidate: digits,
    valid: false,
    status: digits.length > 0 ? 'invalid_candidate' : 'uncertain',
    validationMessage: `Expected 10 digits, but found ${digits.length} digits (${digits || 'none'}).`,
    normalizationSteps: steps,
    warnings,
  };
}

/**
 * Validates Postal PIN profile
 */
export function validatePin(rawTranscript: string): FieldValidationResult {
  const steps: NormalizationStep[] = [];
  const warnings: string[] = [
    'Synthetic check only: Never collect or transmit real banking, debit card, or security authentication PINs.',
  ];

  if (!rawTranscript || !rawTranscript.trim()) {
    return {
      field: 'pin',
      rawTranscript,
      normalizedCandidate: '',
      valid: false,
      status: 'invalid_candidate',
      validationMessage: 'Empty speech input. No digits detected for PIN.',
      normalizationSteps: steps,
      warnings,
    };
  }

  const normalizedWords = normalizeSpokenDigits(rawTranscript, steps);
  const digits = extractDigitsOnly(normalizedWords);

  steps.push({
    step: 'extract_digits',
    before: normalizedWords,
    after: digits,
    description: 'Extracted digits for 6-digit PIN profile',
  });

  if (digits.length === 6) {
    const firstDigit = digits[0];
    if (firstDigit !== '0') {
      return {
        field: 'pin',
        rawTranscript,
        normalizedCandidate: digits,
        valid: true,
        status: 'valid_candidate',
        validationMessage: `Valid 6-digit PIN (${digits}) starting with ${firstDigit}.`,
        normalizationSteps: steps,
        warnings,
      };
    } else {
      return {
        field: 'pin',
        rawTranscript,
        normalizedCandidate: digits,
        valid: false,
        status: 'invalid_candidate',
        validationMessage: `Invalid starting digit "${firstDigit}". Standard Indian PINs cannot start with 0.`,
        normalizationSteps: steps,
        warnings,
      };
    }
  }

  return {
    field: 'pin',
    rawTranscript,
    normalizedCandidate: digits,
    valid: false,
    status: 'invalid_candidate',
    validationMessage: `Expected exactly 6 digits for PIN, but detected ${digits.length} digits (${digits || 'none'}).`,
    normalizationSteps: steps,
    warnings,
  };
}

/**
 * Validates Alphanumeric Service Tag profile (7 characters)
 */
export function validateServiceTag(rawTranscript: string): FieldValidationResult {
  const steps: NormalizationStep[] = [];
  const warnings: string[] = [
    'Prototype Alphanumeric Parser: Verbatim mode recommended for individual character speech.',
  ];

  if (!rawTranscript || !rawTranscript.trim()) {
    return {
      field: 'service_tag',
      rawTranscript,
      normalizedCandidate: '',
      valid: false,
      status: 'invalid_candidate',
      validationMessage: 'Empty speech input. No alphanumeric characters detected.',
      normalizationSteps: steps,
      warnings,
    };
  }

  let text = rawTranscript.trim();

  // 1. Expand "X for [word]" (e.g., "A for apple", "B for bravo")
  const xForRegex = /\b([a-zA-Z])\s+for\s+[a-zA-Z]+\b/gi;
  const replacedXFor = text.replace(xForRegex, (_, letter) => letter);
  if (replacedXFor !== text) {
    steps.push({
      step: 'x_for_word_normalization',
      before: text,
      after: replacedXFor,
      description: 'Normalized "X for [word]" disambiguation phrases into single letters',
    });
    text = replacedXFor;
  }

  // 2. Expand NATO phonetics
  const tokens = text.toLowerCase().split(/[\s,.-]+/);
  const natoResolved: string[] = [];
  for (const t of tokens) {
    if (!t) continue;
    if (NATO_PHONETIC_MAP[t]) {
      natoResolved.push(NATO_PHONETIC_MAP[t]);
    } else if (SPOKEN_DIGIT_MAP[t] !== undefined) {
      natoResolved.push(SPOKEN_DIGIT_MAP[t]);
    } else {
      natoResolved.push(t);
    }
  }

  const natoText = natoResolved.join('');
  if (natoText !== text) {
    steps.push({
      step: 'nato_phonetic_resolution',
      before: text,
      after: natoText,
      description: 'Resolved NATO phonetic codewords and digit words',
    });
    text = natoText;
  }

  // 3. Keep only alphanumeric characters and uppercase
  const alphanumeric = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  steps.push({
    step: 'alphanumeric_clean_and_uppercase',
    before: text,
    after: alphanumeric,
    description: 'Stripped punctuation, removed non-alphanumeric symbols, converted to uppercase',
  });

  if (alphanumeric.length === 7) {
    return {
      field: 'service_tag',
      rawTranscript,
      normalizedCandidate: alphanumeric,
      valid: true,
      status: 'valid_candidate',
      validationMessage: `Valid 7-character service tag: ${alphanumeric}.`,
      normalizationSteps: steps,
      warnings,
    };
  }

  return {
    field: 'service_tag',
    rawTranscript,
    normalizedCandidate: alphanumeric,
    valid: false,
    status: 'invalid_candidate',
    validationMessage: `Expected exactly 7 alphanumeric characters, but got ${alphanumeric.length} characters (${alphanumeric || 'none'}).`,
    normalizationSteps: steps,
    warnings,
  };
}

/**
 * Validates Spelled Name profile
 */
export function validateSpelledName(rawTranscript: string): FieldValidationResult {
  const steps: NormalizationStep[] = [];
  const warnings: string[] = [
    'Experimental Profile: Letter-by-letter spelling does not guarantee name existence or correct real-world spelling.',
  ];

  if (!rawTranscript || !rawTranscript.trim()) {
    return {
      field: 'spelled_name',
      rawTranscript,
      normalizedCandidate: '',
      valid: false,
      status: 'invalid_candidate',
      validationMessage: 'Empty speech input. No spelled name letters detected.',
      normalizationSteps: steps,
      warnings,
    };
  }

  // Tokenize and resolve NATO or individual letters
  const tokens = rawTranscript.toLowerCase().split(/[\s,.-]+/);
  const letters: string[] = [];

  for (const t of tokens) {
    if (!t) continue;
    if (NATO_PHONETIC_MAP[t]) {
      letters.push(NATO_PHONETIC_MAP[t]);
    } else {
      const clean = t.replace(/[^a-zA-Z]/g, '');
      if (clean.length === 1) {
        letters.push(clean.toUpperCase());
      } else if (clean.length > 1) {
        // e.g. "Amit" or multiple letters spoken together
        letters.push(...clean.toUpperCase().split(''));
      }
    }
  }

  const result = letters.join('');
  steps.push({
    step: 'assemble_letters',
    before: rawTranscript,
    after: result,
    description: 'Extracted spelled alphabet characters into unified string',
  });

  if (result.length >= 2 && result.length <= 30) {
    return {
      field: 'spelled_name',
      rawTranscript,
      normalizedCandidate: result,
      valid: true,
      status: 'valid_candidate',
      validationMessage: `Spelled name assembled: ${result} (${result.length} characters). Explicit read-back and human confirmation required.`,
      normalizationSteps: steps,
      warnings,
    };
  }

  return {
    field: 'spelled_name',
    rawTranscript,
    normalizedCandidate: result,
    valid: false,
    status: 'invalid_candidate',
    validationMessage: `Spelled name must contain between 2 and 30 alphabetic characters (got ${result.length}).`,
    normalizationSteps: steps,
    warnings,
  };
}

/**
 * Master validation dispatcher for all field profiles
 */
export function validateFieldCandidate(field: FieldType, rawTranscript: string): FieldValidationResult {
  switch (field) {
    case 'mobile_number':
      return validateMobileNumber(rawTranscript);
    case 'pin':
      return validatePin(rawTranscript);
    case 'service_tag':
      return validateServiceTag(rawTranscript);
    case 'spelled_name':
      return validateSpelledName(rawTranscript);
    default:
      return {
        field,
        rawTranscript,
        normalizedCandidate: rawTranscript,
        valid: false,
        status: 'invalid_candidate',
        validationMessage: `Unknown field type: ${field}`,
        normalizationSteps: [],
        warnings: ['Unrecognized field identifier'],
      };
  }
}

/**
 * Formats a normalized candidate into optimized read-back text for Gnani Timbre TTS
 */
export function formatReadBackText(candidate: string, field: FieldType): string {
  if (!candidate) return '';

  if (field === 'mobile_number') {
    // Group into 5 and 5 digits with a gentle pause
    const clean = candidate.replace(/\D/g, '');
    if (clean.length === 10) {
      const part1 = clean.substring(0, 5).split('').join(' ');
      const part2 = clean.substring(5, 10).split('').join(' ');
      return `The mobile number captured is, ${part1}, pause, ${part2}. Please confirm if this is correct.`;
    }
    return `The captured digits are: ${clean.split('').join(' ')}. Please confirm.`;
  }

  if (field === 'pin') {
    const clean = candidate.replace(/\D/g, '');
    if (clean.length === 6) {
      const part1 = clean.substring(0, 3).split('').join(' ');
      const part2 = clean.substring(3, 6).split('').join(' ');
      return `The PIN captured is, ${part1}, ${part2}. Please confirm if this is correct.`;
    }
    return `The captured PIN digits are: ${clean.split('').join(' ')}. Please confirm.`;
  }

  if (field === 'service_tag') {
    const chars = candidate.split('').join(' ');
    return `The service tag captured is, ${chars}. Please confirm if this is correct.`;
  }

  if (field === 'spelled_name') {
    const chars = candidate.split('').join(' ');
    return `The name spelled is, ${chars}. Please confirm if this is correct.`;
  }

  return `The captured value is ${candidate}. Please confirm.`;
}
