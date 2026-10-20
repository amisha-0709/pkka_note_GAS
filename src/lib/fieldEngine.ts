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
 * Standard Luhn Algorithm for IMEI and Credit Card checksum validation
 */
export function luhnCheck(numStr: string): boolean {
  const clean = numStr.replace(/\D/g, '');
  if (!clean || clean.length < 2) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean[i], 10);
    if (isNaN(digit)) return false;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * Validates Device ID (IMEI): exactly 15 digits validated against Luhn algorithm
 */
export function validateIMEI(rawTranscript: string): FieldValidationResult {
  const steps: NormalizationStep[] = [];
  const warnings: string[] = [
    'Format validity does NOT verify device ownership, blacklist status, or network connectivity.',
  ];

  if (!rawTranscript || !rawTranscript.trim()) {
    return {
      field: 'imei',
      rawTranscript,
      normalizedCandidate: '',
      valid: false,
      status: 'invalid_candidate',
      validationMessage: 'Empty speech input. No IMEI digits detected.',
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
    description: 'Extracted digits for 15-digit IMEI profile',
  });

  if (digits.length !== 15) {
    return {
      field: 'imei',
      rawTranscript,
      normalizedCandidate: digits,
      valid: false,
      status: 'invalid_candidate',
      validationMessage: `Invalid length: Expected exactly 15 digits for IMEI, but got ${digits.length} (${digits || 'none'}).`,
      normalizationSteps: steps,
      warnings,
    };
  }

  const isLuhnValid = luhnCheck(digits);
  steps.push({
    step: 'luhn_checksum',
    before: digits,
    after: isLuhnValid ? 'LUHN_PASS' : 'LUHN_FAIL',
    description: 'Computed standard Luhn modulo 10 checksum over 15 digits',
  });

  if (!isLuhnValid) {
    return {
      field: 'imei',
      rawTranscript,
      normalizedCandidate: digits,
      valid: false,
      status: 'invalid_candidate',
      validationMessage: 'IMEI failed Luhn checksum validation. The 15th check digit does not match.',
      normalizationSteps: steps,
      warnings: [...warnings, 'Luhn check failed - likely digit transcription error.'],
    };
  }

  return {
    field: 'imei',
    rawTranscript,
    normalizedCandidate: digits,
    valid: true,
    status: 'valid_candidate',
    validationMessage: 'Valid 15-digit IMEI with verified Luhn checksum.',
    normalizationSteps: steps,
    warnings,
  };
}

/**
 * Validates Device ID (Serial Number): 8-20 alphanumeric characters, flags ambiguous characters
 */
export function validateSerial(rawTranscript: string): FieldValidationResult {
  const steps: NormalizationStep[] = [];
  const warnings: string[] = [];

  if (!rawTranscript || !rawTranscript.trim()) {
    return {
      field: 'serial',
      rawTranscript,
      normalizedCandidate: '',
      valid: false,
      status: 'invalid_candidate',
      validationMessage: 'Empty input. No serial number characters detected.',
      normalizationSteps: steps,
      warnings,
    };
  }

  let text = rawTranscript.trim();

  // Normalize NATO phonetics and spoken digits
  const tokens = text.toLowerCase().split(/[\s,.-]+/);
  const resolved: string[] = [];
  for (const t of tokens) {
    if (!t) continue;
    if (NATO_PHONETIC_MAP[t]) {
      resolved.push(NATO_PHONETIC_MAP[t]);
    } else if (SPOKEN_DIGIT_MAP[t] !== undefined) {
      resolved.push(SPOKEN_DIGIT_MAP[t]);
    } else {
      resolved.push(t);
    }
  }

  const cleaned = resolved.join('').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  steps.push({
    step: 'alphanumeric_clean',
    before: text,
    after: cleaned,
    description: 'Cleaned and uppercased alphanumeric serial string',
  });

  // Flag ambiguous characters per specification
  if (cleaned.includes('0') || cleaned.includes('O')) {
    warnings.push("Contains '0' or 'O' which may be ambiguous in spoken audio.");
  }
  if (cleaned.includes('1') || cleaned.includes('I')) {
    warnings.push("Contains '1' or 'I' which may be ambiguous in spoken audio.");
  }
  if (cleaned.includes('5') || cleaned.includes('S')) {
    warnings.push("Contains '5' or 'S' which may be ambiguous in spoken audio.");
  }
  if (cleaned.includes('8') || cleaned.includes('B')) {
    warnings.push("Contains '8' or 'B' which may be ambiguous in spoken audio.");
  }

  if (cleaned.length >= 8 && cleaned.length <= 20) {
    return {
      field: 'serial',
      rawTranscript,
      normalizedCandidate: cleaned,
      valid: true,
      status: warnings.length > 0 ? 'needs_review' : 'valid_candidate',
      validationMessage: `Valid ${cleaned.length}-character serial number.`,
      normalizationSteps: steps,
      warnings,
    };
  }

  return {
    field: 'serial',
    rawTranscript,
    normalizedCandidate: cleaned,
    valid: false,
    status: 'invalid_candidate',
    validationMessage: `Serial number must be 8 to 20 alphanumeric characters (got ${cleaned.length}).`,
    normalizationSteps: steps,
    warnings,
  };
}

/**
 * Validates spoken or typed email addresses
 * Always marks status as 'needs_review' per specification due to spoken audio ambiguity.
 */
export function validateEmail(rawTranscript: string): FieldValidationResult {
  const steps: NormalizationStep[] = [];
  const warnings: string[] = [
    'Low STT reliability for spoken email addresses. Human agent review required before confirmation.',
  ];

  if (!rawTranscript || !rawTranscript.trim()) {
    return {
      field: 'email',
      rawTranscript,
      normalizedCandidate: '',
      valid: false,
      status: 'invalid_candidate',
      validationMessage: 'Empty input. No email address detected.',
      normalizationSteps: steps,
      warnings,
    };
  }

  let text = rawTranscript.toLowerCase().trim();

  // Replace common spoken email phrases
  text = text
    .replace(/\bat\s+the\s+rate\b/g, '@')
    .replace(/\bat\b/g, '@')
    .replace(/\bdot\b/g, '.')
    .replace(/\bunderscore\b/g, '_')
    .replace(/\b(dash|hyphen)\b/g, '-')
    .replace(/\bgmail\s+dot\s+com\b/g, 'gmail.com')
    .replace(/\byahoo\s+dot\s+com\b/g, 'yahoo.com')
    .replace(/\boutlook\s+dot\s+com\b/g, 'outlook.com')
    .replace(/\bhotmail\s+dot\s+com\b/g, 'hotmail.com');

  // Remove spaces around @ and .
  text = text.replace(/\s*@\s*/g, '@').replace(/\s*\.\s*/g, '.');
  // Remove remaining spaces
  const noSpaces = text.replace(/\s+/g, '');

  steps.push({
    step: 'normalize_email_tokens',
    before: rawTranscript,
    after: noSpaces,
    description: 'Normalized spoken email symbols ("at the rate", "dot", "dash", etc.)',
  });

  // RFC-lite regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const isValid = emailRegex.test(noSpaces);

  if (isValid) {
    return {
      field: 'email',
      rawTranscript,
      normalizedCandidate: noSpaces,
      valid: true,
      status: 'needs_review', // Per spec: Always needs_review
      validationMessage: `Syntactically valid email format: ${noSpaces}. Verified RFC-lite regex.`,
      normalizationSteps: steps,
      warnings,
    };
  }

  return {
    field: 'email',
    rawTranscript,
    normalizedCandidate: noSpaces,
    valid: false,
    status: 'invalid_candidate',
    validationMessage: `Invalid email address format: "${noSpaces}". Expected standard user@domain.tld.`,
    normalizationSteps: steps,
    warnings,
  };
}

/**
 * Validates Order / Ticket IDs based on configurable pattern
 */
export function validateOrderId(rawTranscript: string, pattern?: string): FieldValidationResult {
  const steps: NormalizationStep[] = [];
  const warnings: string[] = [];

  if (!rawTranscript || !rawTranscript.trim()) {
    return {
      field: 'order_id',
      rawTranscript,
      normalizedCandidate: '',
      valid: false,
      status: 'invalid_candidate',
      validationMessage: 'Empty input. No order or ticket ID detected.',
      normalizationSteps: steps,
      warnings,
    };
  }

  const normalizedWords = normalizeSpokenDigits(rawTranscript, steps);
  const clean = normalizedWords.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  steps.push({
    step: 'clean_order_id',
    before: rawTranscript,
    after: clean,
    description: 'Cleaned and uppercased order identifier',
  });

  const regex = pattern ? new RegExp(pattern, 'i') : /^(ORD|TKT|INC|REQ)[0-9]{6,10}$/i;
  const matches = regex.test(clean);

  if (matches) {
    return {
      field: 'order_id',
      rawTranscript,
      normalizedCandidate: clean,
      valid: true,
      status: 'valid_candidate',
      validationMessage: `Valid order/ticket identifier format: ${clean}.`,
      normalizationSteps: steps,
      warnings,
    };
  }

  // Also accept standard ORD + 8 digits if no custom pattern
  if (/^ORD[0-9]{8}$/i.test(clean)) {
    return {
      field: 'order_id',
      rawTranscript,
      normalizedCandidate: clean,
      valid: true,
      status: 'valid_candidate',
      validationMessage: `Valid order identifier: ${clean}.`,
      normalizationSteps: steps,
      warnings,
    };
  }

  return {
    field: 'order_id',
    rawTranscript,
    normalizedCandidate: clean,
    valid: false,
    status: 'invalid_candidate',
    validationMessage: `Order ID "${clean}" does not match expected pattern (${pattern || 'ORD followed by 6-10 digits'}).`,
    normalizationSteps: steps,
    warnings,
  };
}

/**
 * Validates Person Name with spoken spelling support
 */
export function validateName(rawTranscript: string): FieldValidationResult {
  const steps: NormalizationStep[] = [];
  const warnings: string[] = [];

  if (!rawTranscript || !rawTranscript.trim()) {
    return {
      field: 'name',
      rawTranscript,
      normalizedCandidate: '',
      valid: false,
      status: 'invalid_candidate',
      validationMessage: 'Empty input. No person name detected.',
      normalizationSteps: steps,
      warnings,
    };
  }

  let text = rawTranscript.trim();

  // Check if there is an explicit spelling indicator (e.g. "R as in Romeo", "spelled R A H U L")
  const spellingMatch = text.match(/(?:spelled|spelt|spelling is|spelled as)\s+([a-zA-Z\s\-]+)/i);
  if (spellingMatch && spellingMatch[1]) {
    const spelledPart = spellingMatch[1];
    const spelledResult = validateSpelledName(spelledPart);
    if (spelledResult.valid) {
      steps.push({
        step: 'prioritize_spelled_name',
        before: text,
        after: spelledResult.normalizedCandidate,
        description: 'Prioritized letter-by-letter spelled name sequence',
      });
      return {
        field: 'name',
        rawTranscript,
        normalizedCandidate: spelledResult.normalizedCandidate,
        valid: true,
        status: 'valid_candidate',
        validationMessage: `Spelled name captured: ${spelledResult.normalizedCandidate}.`,
        normalizationSteps: steps,
        warnings,
      };
    }
  }

  // Clean conversational prefixes: "my name is Rahul Sharma", "this is Priya Patel"
  const cleanName = text
    .replace(/^(?:my name is|this is|i am|speaking is|name is|caller is)\s+/i, '')
    .replace(/[^a-zA-Z\s'-]/g, '')
    .trim();

  steps.push({
    step: 'clean_name_string',
    before: text,
    after: cleanName,
    description: 'Cleaned conversational prefixes and non-alphabetic symbols',
  });

  if (cleanName.length >= 2 && cleanName.length <= 40) {
    // Title case
    const formatted = cleanName
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    return {
      field: 'name',
      rawTranscript,
      normalizedCandidate: formatted,
      valid: true,
      status: 'valid_candidate',
      validationMessage: `Valid name candidate: ${formatted}.`,
      normalizationSteps: steps,
      warnings,
    };
  }

  return {
    field: 'name',
    rawTranscript,
    normalizedCandidate: cleanName,
    valid: false,
    status: 'invalid_candidate',
    validationMessage: `Name must contain 2 to 40 letters (got "${cleanName}").`,
    normalizationSteps: steps,
    warnings,
  };
}

/**
 * Sensitive Data Guard:
 * Detects card numbers (Luhn 13-19 digits), Aadhaar (12 digits), PAN ([A-Z]{5}[0-9]{4}[A-Z]),
 * OTP and banking PIN phrases.
 * Returns masked text and detection metadata.
 * SENSITIVE DATA IS MASKED AND NEVER STORED IN RAW FORM.
 */
export interface SensitiveDetection {
  type: 'card_luhn' | 'aadhaar' | 'pan' | 'otp' | 'banking_pin';
  label: string;
  maskedSnippet: string;
}

export function scanSensitiveData(rawText: string): {
  sanitizedText: string;
  detections: SensitiveDetection[];
} {
  let text = rawText;
  const detections: SensitiveDetection[] = [];

  // 1. Credit / Debit Card Numbers (13-19 digits with Luhn verification)
  const digitGroups = text.match(/\b(?:\d[ -]?){12,18}\d\b/g);
  if (digitGroups) {
    for (const group of digitGroups) {
      const cleanDigits = group.replace(/\D/g, '');
      if (cleanDigits.length >= 13 && cleanDigits.length <= 19 && luhnCheck(cleanDigits)) {
        const last4 = cleanDigits.slice(-4);
        const masked = `[CARD DETECTED: •••• •••• •••• ${last4} - MASKED AND NEVER STORED]`;
        text = text.replace(group, masked);
        detections.push({
          type: 'card_luhn',
          label: 'Card number detected (Luhn-verified), masked, not stored',
          maskedSnippet: `•••• •••• •••• ${last4}`,
        });
      }
    }
  }

  // 2. Aadhaar Numbers (12 digits, often 4-4-4, or preceded by "aadhaar")
  const aadhaarRegex = /\b(?:aadhaar\s*(?:card|number|no)?\s*(?:is)?\s*)?([0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4})\b/gi;
  text = text.replace(aadhaarRegex, (match, digitsOnly) => {
    const cleanDigits = digitsOnly.replace(/\D/g, '');
    if (cleanDigits.length === 12) {
      const last4 = cleanDigits.slice(-4);
      detections.push({
        type: 'aadhaar',
        label: 'Aadhaar 12-digit number detected, masked, not stored',
        maskedSnippet: `•••• •••• ${last4}`,
      });
      return `[AADHAAR DETECTED: •••• •••• ${last4} - MASKED AND NEVER STORED]`;
    }
    return match;
  });

  // 3. Indian PAN Card ([A-Z]{5}[0-9]{4}[A-Z])
  const panRegex = /\b([A-Z]{5}[0-9]{4}[A-Z])\b/gi;
  text = text.replace(panRegex, (match, panCode) => {
    const upper = panCode.toUpperCase();
    const last2 = upper.slice(-2);
    detections.push({
      type: 'pan',
      label: 'PAN card identifier detected, masked, not stored',
      maskedSnippet: `••••••••${last2}`,
    });
    return `[PAN DETECTED: ••••••••${last2} - MASKED AND NEVER STORED]`;
  });

  // 4. OTP and Banking PIN phrases
  const otpRegex = /\b(?:my\s+)?(?:otp|one[- ]time[- ]password|atm pin|banking pin|card pin|cvv|cvv2|security code)\s+(?:is\s+)?([0-9]{3,8})\b/gi;
  text = text.replace(otpRegex, (match) => {
    detections.push({
      type: 'otp',
      label: 'One-time password or security PIN detected, masked, not stored',
      maskedSnippet: '••••',
    });
    return `[SENSITIVE AUTH CODE DETECTED: •••• - MASKED AND NEVER STORED]`;
  });

  return {
    sanitizedText: text,
    detections,
  };
}

/**
 * Auto-Entity Detector for Continuous Call Listening:
 * Scans a transcript chunk/window without requiring user field selection.
 * Handles collision rules (e.g. 10-digit number could be mobile, or IMEI fragment, or order ID)
 * and assigns primary and alternative types with context hints.
 */
export interface DetectedCandidate {
  type: FieldType;
  value: string;
  displayValue: string;
  quote: string;
  confidence: number;
  alternativeType?: FieldType;
  validation: {
    passed: boolean;
    checks: string[];
    warnings: string[];
  };
}

export function detectEntitiesFromTranscript(
  text: string,
  options?: { context?: string; orderPattern?: string }
): DetectedCandidate[] {
  const results: DetectedCandidate[] = [];
  if (!text || !text.trim()) return results;

  const lower = text.toLowerCase();
  const context = (options?.context || '').toLowerCase();
  const fullContext = `${context} ${lower}`;

  // 1. Email detection
  const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  const emailMatches = text.match(emailRegex);
  if (emailMatches) {
    for (const email of emailMatches) {
      const v = validateEmail(email);
      if (v.valid) {
        results.push({
          type: 'email',
          value: v.normalizedCandidate,
          displayValue: v.normalizedCandidate,
          quote: email,
          confidence: 0.85,
          validation: {
            passed: v.valid,
            checks: ['rfc_regex_match', 'valid_tld'],
            warnings: v.warnings,
          },
        });
      }
    }
  }

  // Spoken email search: "john dot doe at gmail dot com"
  if (lower.includes('@') || lower.includes('at the rate') || (lower.includes(' at ') && lower.includes('dot com'))) {
    const emailCandidate = validateEmail(text);
    if (emailCandidate.valid && !results.some((r) => r.type === 'email')) {
      results.push({
        type: 'email',
        value: emailCandidate.normalizedCandidate,
        displayValue: emailCandidate.normalizedCandidate,
        quote: text.slice(0, 60),
        confidence: 0.8,
        validation: {
          passed: emailCandidate.valid,
          checks: ['spoken_email_normalized'],
          warnings: emailCandidate.warnings,
        },
      });
    }
  }

  // 2. Order ID detection
  const orderRegex = /\b(?:ORD|TKT|INC|REQ)[0-9]{6,10}\b/gi;
  const orderMatches = text.match(orderRegex);
  if (orderMatches) {
    for (const match of orderMatches) {
      const v = validateOrderId(match, options?.orderPattern);
      if (v.valid) {
        results.push({
          type: 'order_id',
          value: v.normalizedCandidate,
          displayValue: v.normalizedCandidate,
          quote: match,
          confidence: 0.95,
          validation: {
            passed: v.valid,
            checks: ['pattern_match'],
            warnings: v.warnings,
          },
        });
      }
    }
  }

  // 3. IMEI detection (15 digits with Luhn)
  const imeiCandidate = validateIMEI(text);
  if (imeiCandidate.valid) {
    results.push({
      type: 'imei',
      value: imeiCandidate.normalizedCandidate,
      displayValue: imeiCandidate.normalizedCandidate,
      quote: text.slice(0, 50),
      confidence: 0.98,
      validation: {
        passed: true,
        checks: ['15_digits', 'luhn_modulo10_pass'],
        warnings: imeiCandidate.warnings,
      },
    });
  }

  // 4. Mobile number detection
  const mobileCandidate = validateMobileNumber(text);
  if (mobileCandidate.valid && !imeiCandidate.valid) {
    // Collision check: Is this 10-digit sequence a mobile or part of something else?
    const hasMobileContext =
      fullContext.includes('mobile') ||
      fullContext.includes('phone') ||
      fullContext.includes('number') ||
      fullContext.includes('call') ||
      fullContext.includes('contact');

    const alternativeType: FieldType | undefined = hasMobileContext ? undefined : 'order_id';

    results.push({
      type: 'mobile',
      value: mobileCandidate.normalizedCandidate,
      displayValue: mobileCandidate.normalizedCandidate,
      quote: text.slice(0, 50),
      confidence: hasMobileContext ? 0.95 : 0.85,
      alternativeType,
      validation: {
        passed: true,
        checks: ['10_digits_indian_series', 'leading_digit_6_to_9'],
        warnings: mobileCandidate.warnings,
      },
    });
  }

  // 5. Postal PIN detection (6 digits, not starting with 0)
  const pinCandidate = validatePin(text);
  if (
    pinCandidate.valid &&
    !mobileCandidate.valid &&
    !imeiCandidate.valid &&
    (fullContext.includes('pin') ||
      fullContext.includes('postal') ||
      fullContext.includes('zip') ||
      fullContext.includes('code') ||
      fullContext.includes('address'))
  ) {
    results.push({
      type: 'postal_pin',
      value: pinCandidate.normalizedCandidate,
      displayValue: pinCandidate.normalizedCandidate,
      quote: text.slice(0, 40),
      confidence: 0.92,
      validation: {
        passed: true,
        checks: ['6_digits', 'non_zero_start'],
        warnings: pinCandidate.warnings,
      },
    });
  }

  // 6. Service tag / Serial detection
  const serviceTagCandidate = validateServiceTag(text);
  if (
    serviceTagCandidate.valid &&
    (fullContext.includes('tag') ||
      fullContext.includes('service') ||
      fullContext.includes('device') ||
      fullContext.includes('asset'))
  ) {
    results.push({
      type: 'service_tag',
      value: serviceTagCandidate.normalizedCandidate,
      displayValue: serviceTagCandidate.normalizedCandidate,
      quote: text.slice(0, 40),
      confidence: 0.9,
      validation: {
        passed: true,
        checks: ['7_alphanumeric_nato_resolved'],
        warnings: serviceTagCandidate.warnings,
      },
    });
  }

  // 7. Person name detection (if name phrases or spelled indicators present)
  if (
    fullContext.includes('my name is') ||
    fullContext.includes('this is') ||
    fullContext.includes('speaking is') ||
    fullContext.includes('spelled')
  ) {
    const nameCandidate = validateName(text);
    if (nameCandidate.valid) {
      results.push({
        type: 'name',
        value: nameCandidate.normalizedCandidate,
        displayValue: nameCandidate.normalizedCandidate,
        quote: text.slice(0, 40),
        confidence: 0.88,
        validation: {
          passed: true,
          checks: ['alphabetic_name_length_2_40'],
          warnings: nameCandidate.warnings,
        },
      });
    }
  }

  return results;
}

/**
 * Master validation dispatcher for all field profiles
 */
export function validateFieldCandidate(field: FieldType, rawTranscript: string): FieldValidationResult {
  switch (field) {
    case 'mobile_number':
    case 'mobile':
      return validateMobileNumber(rawTranscript);
    case 'pin':
    case 'postal_pin':
      return validatePin(rawTranscript);
    case 'service_tag':
      return validateServiceTag(rawTranscript);
    case 'spelled_name':
      return validateSpelledName(rawTranscript);
    case 'name':
      return validateName(rawTranscript);
    case 'email':
      return validateEmail(rawTranscript);
    case 'imei':
      return validateIMEI(rawTranscript);
    case 'serial':
      return validateSerial(rawTranscript);
    case 'order_id':
      return validateOrderId(rawTranscript);
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
 * Formats a copy-ready read-back text line for the agent's screen (Section 6, Item 7)
 * "Each card shows a pre-formatted read-back line such as '98765 43210' with a Copy button,
 * so the agent can say it to the customer."
 */
export function formatReadBackLine(candidate: { type: string; value: string }): string {
  const { type, value } = candidate;
  if (!value) return '';

  if (type === 'mobile' || type === 'mobile_number') {
    const clean = value.replace(/\D/g, '');
    if (clean.length === 10) {
      return `${clean.slice(0, 5)} ${clean.slice(5, 10)}`;
    }
    return clean;
  }

  if (type === 'postal_pin' || type === 'pin') {
    const clean = value.replace(/\D/g, '');
    if (clean.length === 6) {
      return `${clean.slice(0, 3)} ${clean.slice(3, 6)}`;
    }
    return clean;
  }

  if (type === 'imei') {
    const clean = value.replace(/\D/g, '');
    if (clean.length === 15) {
      // Group as 2-6-6-1 or 4-4-4-3
      return `${clean.slice(0, 4)} ${clean.slice(4, 8)} ${clean.slice(8, 12)} ${clean.slice(12, 15)}`;
    }
    return clean;
  }

  if (type === 'email') {
    // Spoken helper: e.g. "john dot doe at gmail dot com"
    return value.replace(/\./g, ' dot ').replace(/@/g, ' at ');
  }

  if (type === 'service_tag' || type === 'serial') {
    return value.split('').join(' ');
  }

  return value;
}

/**
 * Formats a normalized candidate into speech text (for optional private whisper or legacy tests)
 */
export function formatReadBackText(candidate: string, field: FieldType): string {
  if (!candidate) return '';

  if (field === 'mobile_number' || field === 'mobile') {
    const clean = candidate.replace(/\D/g, '');
    if (clean.length === 10) {
      const part1 = clean.substring(0, 5).split('').join(' ');
      const part2 = clean.substring(5, 10).split('').join(' ');
      return `The mobile number captured is, ${part1}, pause, ${part2}. Please confirm if this is correct.`;
    }
    return `The captured digits are: ${clean.split('').join(' ')}. Please confirm.`;
  }

  if (field === 'pin' || field === 'postal_pin') {
    const clean = candidate.replace(/\D/g, '');
    if (clean.length === 6) {
      const part1 = clean.substring(0, 3).split('').join(' ');
      const part2 = clean.substring(3, 6).split('').join(' ');
      return `The PIN captured is, ${part1}, ${part2}. Please confirm if this is correct.`;
    }
    return `The captured PIN digits are: ${clean.split('').join(' ')}. Please confirm.`;
  }

  if (field === 'service_tag' || field === 'serial') {
    const chars = candidate.split('').join(' ');
    return `The code captured is, ${chars}. Please confirm if this is correct.`;
  }

  if (field === 'spelled_name' || field === 'name') {
    const chars = candidate.split('').join(' ');
    return `The name spelled is, ${chars}. Please confirm if this is correct.`;
  }

  if (field === 'imei') {
    const chars = candidate.split('').join(' ');
    return `The IMEI digits are: ${chars}. Please confirm.`;
  }

  if (field === 'email') {
    return `The email address is: ${candidate}. Please confirm.`;
  }

  return `The captured value is ${candidate}. Please confirm.`;
}

